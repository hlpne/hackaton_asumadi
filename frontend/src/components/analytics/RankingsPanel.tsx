import { useMemo, useState } from "react";
import type { MapForecastPoint, MapForecastResponse, TopOverloadResponse } from "../../types";
import { snapshotPeriod } from "../../constants";
import { rankNetwork } from "../../networkRanking";

type RankingView = "route-stops" | "network-routes" | "network-stops";
type RankedStop = MapForecastPoint & { rank: number };

interface RankingsPanelProps {
  routeData: TopOverloadResponse | null;
  routeBusy: boolean;
  routeError: string;
  networkData: MapForecastResponse | null;
  networkBusy: boolean;
  networkError: string;
  routeName: string;
  selectedRouteId: string;
  selectedPoint: MapForecastPoint | null;
  onSelectRoute: (routeId: string) => void;
  onSelectStop: (point: MapForecastPoint) => void;
  onRetry: () => void;
}

const views: Array<{ id: RankingView; label: string }> = [
  { id: "route-stops", label: "Остановки маршрута" },
  { id: "network-routes", label: "Все маршруты" },
  { id: "network-stops", label: "Остановки всей сети" },
];

const timestampFormatter = new Intl.DateTimeFormat("ru-RU", {
  timeZone: "Europe/Moscow", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
});
const valueFormatter = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2 });

function StopRow({ point, selected, onSelect }: { point: RankedStop; selected: boolean; onSelect: (point: MapForecastPoint) => void }) {
  return <li>
    <button type="button" className={`top-item${selected ? " top-item--selected" : ""}`}
      aria-pressed={selected}
      aria-label={`Показать на карте: ${point.stop_name}, ${point.route_name}, место ${point.rank}, индекс ${valueFormatter.format(point.predicted_load)}`}
      onClick={() => onSelect(point)}>
      <span className="top-rank">{point.rank}</span>
      <span className="top-place"><strong>{point.stop_name}</strong><small>{point.route_name} · направление {point.direction_id + 1}</small></span>
      <span className="top-load"><small>Индекс</small>{valueFormatter.format(point.predicted_load)}</span>
    </button>
  </li>;
}

export function RankingsPanel({
  routeData, routeBusy, routeError, networkData, networkBusy, networkError,
  routeName, selectedRouteId, selectedPoint, onSelectRoute, onSelectStop, onRetry,
}: RankingsPanelProps) {
  const [view, setView] = useState<RankingView>("route-stops");
  const network = useMemo(() => networkData ? rankNetwork(networkData) : null, [networkData]);
  const isRouteView = view === "route-stops";
  const data = isRouteView ? routeData : networkData;
  const busy = isRouteView ? routeBusy : networkBusy;
  const error = isRouteView ? routeError : networkError;
  const stops = isRouteView ? routeData?.items : network?.stops;
  const empty = view === "network-routes" ? !network?.routes.length : !stops?.length;
  const period = snapshotPeriod[data?.horizon ?? "day"];
  const title = view === "route-stops" ? `Остановки маршрута${routeName ? ` · ${routeName}` : ""}`
    : view === "network-routes" ? `Все маршруты${network ? ` · ${network.routes.length}` : ""}`
    : "Остановки всей сети · Топ-10";
  const description = view === "route-stops"
    ? `До пяти остановок с самым высоким ${routeData?.is_mock === false ? "прогнозом" : "демонстрационным прогнозом"} ${period}. Нажмите остановку, чтобы найти её на карте.`
    : view === "network-routes"
      ? `Маршруты по среднему индексу их остановок в обоих направлениях ${period}. Прокрутите список, чтобы увидеть все маршруты.`
      : `Остановки с самым высоким индексом среди всех маршрутов ${period}. Нажмите остановку, чтобы найти её на карте.`;

  return <section className="top-panel rankings-panel" aria-labelledby="rankings-title" aria-busy={busy}>
    <div className="top-panel-heading">
      <div>
        <p className="eyebrow">ПРОГНОЗ ЗАГРУЗКИ</p>
        <h2 id="rankings-title">Рейтинги</h2>
      </div>
      {data && <span className="top-panel-time">{timestampFormatter.format(new Date(data.timestamp))} МСК</span>}
    </div>

    <div className="ranking-views" role="group" aria-label="Выберите вид рейтинга">
      {views.map((item) => <button key={item.id} type="button"
        className={`ranking-view${view === item.id ? " ranking-view--active" : ""}`}
        aria-pressed={view === item.id} onClick={() => setView(item.id)}>{item.label}</button>)}
    </div>

    <div className="ranking-content" aria-live="polite">
      <div className="ranking-intro">
        <h3>{title}</h3>
        <p>{description}</p>
      </div>
      {busy && <p className="top-panel-status" role="status">Загружаем рейтинг…</p>}
      {!busy && error && <div className="top-panel-error" role="alert">
        <p>Не удалось получить рейтинг: {error}</p>
        <button type="button" onClick={onRetry}>Повторить</button>
      </div>}
      {!busy && !error && data && empty && <p className="top-panel-status" role="status">
        {view === "network-routes" ? "Маршруты не найдены." : "Для выбранного времени нет остановок с положительным прогнозом."}
      </p>}
      {!busy && !error && data && !empty && <div className="ranking-scroll" role="region" aria-label={title} tabIndex={0}>
        <ol className="top-list">
          {view === "network-routes" ? network?.routes.map((route) => <li key={route.id}>
            <button type="button" className={`top-item${selectedRouteId === route.id ? " top-item--selected" : ""}`}
              aria-pressed={selectedRouteId === route.id}
              aria-label={`Выбрать ${route.name}, место ${route.rank}, средний индекс ${valueFormatter.format(route.averageLoad)}`}
              onClick={() => onSelectRoute(route.id)}>
              <span className="top-rank">{route.rank}</span>
              <span className="top-place"><strong>{route.name}</strong><small>{route.stopCount} остановок по двум направлениям</small></span>
              <span className="top-load"><small>Средний индекс</small>{valueFormatter.format(route.averageLoad)}</span>
            </button>
          </li>) : stops?.map((point) => <StopRow key={`${point.route_id}/${point.direction_id}/${point.stop_id}`}
            point={point}
            selected={selectedPoint?.route_id === point.route_id && selectedPoint.stop_id === point.stop_id &&
              selectedPoint.direction_id === point.direction_id}
            onSelect={onSelectStop} />)}
        </ol>
      </div>}
    </div>
    {data && !error && <p className="top-panel-note">
      {data.is_mock ? "Демонстрационные данные; рейтинг не показывает фактическую перегрузку." : "Порог перегрузки не задан."}
      {" "}Источник: {isRouteView ? "/forecast/top-overload" : "/forecast/map"} · {data.model_version}.
    </p>}
  </section>;
}
