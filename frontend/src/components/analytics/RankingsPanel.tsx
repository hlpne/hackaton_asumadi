import { useMemo, useState } from "react";
import { ChartBarIcon, MapPinIcon, TramIcon, TrophyIcon } from "@phosphor-icons/react";
import type { MapForecastPoint, MapForecastResponse } from "../../types";
import { snapshotPeriod } from "../../constants";
import { rankNetwork } from "../../networkRanking";

type RankingView = "routes" | "stops";

interface RankingsPanelProps {
  networkData: MapForecastResponse | null;
  networkBusy: boolean;
  networkError: string;
  onSelectRoute: (routeId: string) => void;
  onSelectStop: (point: MapForecastPoint) => void;
  onRetry: () => void;
}

const timestampFormatter = new Intl.DateTimeFormat("ru-RU", {
  timeZone: "Europe/Moscow", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
});
const valueFormatter = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2 });

export function RankingsPanel({ networkData, networkBusy, networkError, onSelectRoute, onSelectStop, onRetry }: RankingsPanelProps) {
  const [view, setView] = useState<RankingView>("routes");
  const network = useMemo(() => networkData ? rankNetwork(networkData) : null, [networkData]);
  const routes = network?.routes ?? [];
  const stops = network?.stops ?? [];
  const average = routes.length ? routes.reduce((sum, route) => sum + route.averageLoad, 0) / routes.length : null;
  const topAverage = routes[0]?.averageLoad ?? 0;
  const hasPositiveLoad = topAverage > 0;
  const period = snapshotPeriod[networkData?.horizon ?? "day"];
  const title = view === "routes" ? `Рейтинг маршрутов · ${routes.length}` : "Рейтинг остановок · Топ-10";

  return <div className="network-analytics" aria-busy={networkBusy}>
    {networkBusy && <p className="network-status" role="status">Загружаем аналитику всей сети…</p>}
    {!networkBusy && networkError && <div className="top-panel-error" role="alert">
      <p>Не удалось получить данные сети: {networkError}</p>
      <button type="button" onClick={onRetry}>Повторить</button>
    </div>}
    {!networkBusy && !networkError && networkData && <>
      <div className="network-heading">
        <div><p className="eyebrow">ВСЯ ТРАМВАЙНАЯ СЕТЬ</p><h2>Общая картина</h2></div>
        <time dateTime={networkData.timestamp}>{timestampFormatter.format(new Date(networkData.timestamp))} МСК</time>
      </div>
      <div className="network-metrics">
        <article><div className="network-metric-heading"><TramIcon weight="bold" aria-hidden="true" /><span>Маршрутов</span></div><strong>{routes.length}</strong></article>
        <article><div className="network-metric-heading"><MapPinIcon weight="fill" aria-hidden="true" /><span>Остановок по направлениям</span></div><strong>{networkData.points.length}</strong></article>
        <article><div className="network-metric-heading"><ChartBarIcon weight="bold" aria-hidden="true" /><span>Средний индекс маршрута</span></div><strong>{average === null ? "—" : valueFormatter.format(average)}</strong></article>
        <article><div className="network-metric-heading"><TrophyIcon weight="bold" aria-hidden="true" /><span>Первый в рейтинге</span></div><strong className="network-metric-name">{hasPositiveLoad ? routes[0]?.name : "Нет нагрузки в срезе"}</strong></article>
      </div>

      <section className="network-comparison" aria-labelledby="network-comparison-title">
        <div className="network-section-heading"><div><h2 id="network-comparison-title">Сравнение маршрутов</h2>
          <p>Средний индекс остановок маршрута по двум направлениям {period}.</p></div>
          {hasPositiveLoad && <span>Топ-{Math.min(8, routes.length)}</span>}</div>
        {hasPositiveLoad ? <ol className="network-bars">
          {routes.slice(0, 8).map((route) => <li key={route.id}>
            <button type="button" onClick={() => onSelectRoute(route.id)} aria-label={`Открыть ${route.name}, средний индекс ${valueFormatter.format(route.averageLoad)}`}>
              <span className="network-bar-name">{route.name}</span>
              <span className="network-bar-track"><span style={{ width: `${topAverage ? route.averageLoad / topAverage * 100 : 0}%` }} /></span>
              <strong>{valueFormatter.format(route.averageLoad)}</strong>
            </button>
          </li>)}
        </ol> : <p className="top-panel-status">В выбранное время индекс всех маршрутов равен нулю. Выберите другой момент для сравнения.</p>}
      </section>

      <section className="top-panel rankings-panel" aria-labelledby="rankings-title">
        <div className="top-panel-heading"><div><p className="eyebrow">ПРОГНОЗ ЗАГРУЗКИ</p><h2 id="rankings-title">Рейтинги сети</h2></div></div>
        <div className="ranking-views" role="group" aria-label="Выберите вид рейтинга">
          <button type="button" className={`ranking-view${view === "routes" ? " ranking-view--active" : ""}`}
            aria-pressed={view === "routes"} onClick={() => setView("routes")}>Все маршруты</button>
          <button type="button" className={`ranking-view${view === "stops" ? " ranking-view--active" : ""}`}
            aria-pressed={view === "stops"} onClick={() => setView("stops")}>Остановки всей сети</button>
        </div>
        <div className="ranking-content" aria-live="polite">
          <div className="ranking-intro"><h3>{title}</h3><p>{view === "routes"
            ? "Маршруты по среднему индексу остановок. Прокрутите список, чтобы увидеть всю сеть."
            : `Остановки с самым высоким индексом среди всех маршрутов ${period}. Нажмите остановку, чтобы найти её на карте.`}</p></div>
          {!hasPositiveLoad && <p className="top-panel-status">Для выбранного времени нет положительного прогноза.</p>}
          {hasPositiveLoad && (view === "routes" ? routes.length > 0 : stops.length > 0) && <div className="ranking-scroll" role="region" aria-label={title} tabIndex={0}>
            <ol className="top-list">{view === "routes" ? routes.map((route) => <li key={route.id}>
              <button type="button" className="top-item" onClick={() => onSelectRoute(route.id)}
                aria-label={`Открыть ${route.name}, место ${route.rank}, средний индекс ${valueFormatter.format(route.averageLoad)}`}>
                <span className="top-rank">{route.rank}</span>
                <span className="top-place"><strong>{route.name}</strong><small>{route.stopCount} остановок по двум направлениям</small></span>
                <span className="top-load"><small>Средний индекс</small>{valueFormatter.format(route.averageLoad)}</span>
              </button>
            </li>) : stops.map((point) => <li key={`${point.route_id}/${point.direction_id}/${point.stop_id}`}>
              <button type="button" className="top-item" onClick={() => onSelectStop(point)}
                aria-label={`Показать на карте: ${point.stop_name}, ${point.route_name}, место ${point.rank}, индекс ${valueFormatter.format(point.predicted_load)}`}>
                <span className="top-rank">{point.rank}</span>
                <span className="top-place"><strong>{point.stop_name}</strong><small>{point.route_name} · направление {point.direction_id + 1}</small></span>
                <span className="top-load"><small>Индекс</small>{valueFormatter.format(point.predicted_load)}</span>
              </button>
            </li>)}</ol>
          </div>}
        </div>
        <p className="top-panel-note">{networkData.is_mock ? "Демонстрационные данные; рейтинг не показывает фактическую перегрузку." : "Порог перегрузки не задан."}
          {" "}Источник: /forecast/map · {networkData.model_version}.</p>
      </section>
    </>}
  </div>;
}
