import { useMemo, useState } from "react";
import type { MapForecastPoint, MapForecastResponse } from "../../types";
import { rankNetwork } from "../../networkRanking";
import { snapshotPeriod } from "../../constants";

interface NetworkOverviewProps {
  data: MapForecastResponse | null;
  busy: boolean;
  error: string;
  selectedRouteId: string;
  selectedPoint: MapForecastPoint | null;
  onSelectRoute: (routeId: string) => void;
  onSelectStop: (point: MapForecastPoint) => void;
  onRetry: () => void;
}

const timestampFormatter = new Intl.DateTimeFormat("ru-RU", {
  timeZone: "Europe/Moscow", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
});
const valueFormatter = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2 });

export function NetworkOverview({ data, busy, error, selectedRouteId, selectedPoint, onSelectRoute, onSelectStop, onRetry }: NetworkOverviewProps) {
  const [showAllRoutes, setShowAllRoutes] = useState(false);
  const ranking = useMemo(() => data ? rankNetwork(data) : null, [data]);
  const visibleRoutes = showAllRoutes ? ranking?.routes : ranking?.routes.slice(0, 5);

  return (
    <section className="top-panel network-overview" aria-labelledby="network-overview-title" aria-busy={busy}>
      <div className="top-panel-heading">
        <div>
          <p className="eyebrow">ВСЯ ТРАМВАЙНАЯ СЕТЬ</p>
          <h2 id="network-overview-title">Сравнение маршрутов и остановок</h2>
          <p>Сравниваем все маршруты {snapshotPeriod[data?.horizon ?? "day"]}.</p>
        </div>
        {data && <span className="top-panel-time">{timestampFormatter.format(new Date(data.timestamp))} МСК</span>}
      </div>

      {busy && <p className="top-panel-status" role="status">Считаем показатели по всем маршрутам…</p>}
      {!busy && error && <div className="top-panel-error" role="alert">
        <p>Не удалось получить общий обзор: {error}</p>
        <button type="button" onClick={onRetry}>Повторить</button>
      </div>}
      {!busy && !error && ranking && <div className="network-columns">
        <div>
          <h3>Маршруты · {ranking.routes.length}</h3>
          <p className="network-explanation">Для каждого маршрута берём средний индекс его остановок в обоих направлениях.</p>
          <ol className="top-list">
            {visibleRoutes?.map((route) => <li key={route.id}>
              <button type="button" className={`top-item${selectedRouteId === route.id ? " top-item--selected" : ""}`}
                onClick={() => onSelectRoute(route.id)} aria-label={`Выбрать ${route.name}, место ${route.rank}, средний индекс ${valueFormatter.format(route.averageLoad)}`}>
                <span className="top-rank">#{route.rank}</span>
                <span className="top-place"><strong>{route.name}</strong><small>{route.stopCount} остановок по двум направлениям</small></span>
                <span className="top-load"><small>Средний индекс</small>{valueFormatter.format(route.averageLoad)}</span>
              </button>
            </li>)}
          </ol>
          {ranking.routes.length > 5 && <button type="button" className="network-expand" onClick={() => setShowAllRoutes((value) => !value)}>
            {showAllRoutes ? "Свернуть список" : `Показать все ${ranking.routes.length} маршрутов`}
          </button>}
        </div>
        <div>
          <h3>Остановки · Топ-10</h3>
          <p className="network-explanation">Отдельные остановки с наибольшим индексом среди всех маршрутов. Нажмите строку, чтобы найти точку на карте.</p>
          {!ranking.stops.length && <p className="top-panel-status">На выбранное время положительных значений нет.</p>}
          <ol className="top-list">
            {ranking.stops.map((point) => {
              const selected = selectedPoint?.route_id === point.route_id && selectedPoint.stop_id === point.stop_id &&
                selectedPoint.direction_id === point.direction_id;
              return <li key={`${point.route_id}/${point.direction_id}/${point.stop_id}`}>
                <button type="button" className={`top-item${selected ? " top-item--selected" : ""}`}
                  onClick={() => onSelectStop(point)} aria-label={`Показать на карте ${point.stop_name}, ${point.route_name}, место ${point.rank}, индекс ${valueFormatter.format(point.predicted_load)}`}>
                  <span className="top-rank">#{point.rank}</span>
                  <span className="top-place"><strong>{point.stop_name}</strong><small>{point.route_name} · направление {point.direction_id + 1}</small></span>
                  <span className="top-load"><small>Индекс</small>{valueFormatter.format(point.predicted_load)}</span>
                </button>
              </li>;
            })}
          </ol>
        </div>
      </div>}
      {data && !error && <p className="top-panel-note">{data.is_mock
        ? "Демонстрационный прогноз: рейтинг не показывает фактическую перегрузку или превышение вместимости."
        : "Порог перегрузки не задан; показано сравнение прогнозных значений."} Источник: /forecast/map · {data.model_version}.</p>}
    </section>
  );
}
