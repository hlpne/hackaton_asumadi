import { useId, useMemo, useState, type ReactNode } from "react";
import { ChartBarIcon, TramIcon, TrophyIcon } from "@phosphor-icons/react";
import type { ForecastResponse, MapForecastPoint, MapForecastResponse, Route } from "../../types";
import { NetworkMap } from "../map/NetworkMap";
import type { Theme } from "../../theme";
import { WheelPicker } from "../layout/WheelPicker";
import type { SplitEdge } from "../map/EdgeSplitHandles";
import { FloatingPanelControls, useFloatingPanel } from "../layout/FloatingPanelControls";
import { downloadNetworkValidationsCsv } from "../../forecastCsv";

interface RankingsPanelProps {
  routes: Route[];
  selectedRouteId: string;
  selectedStop: MapForecastPoint | null;
  networkData: MapForecastResponse | null;
  routeForecasts: ForecastResponse[];
  networkBusy: boolean;
  networkError: string;
  onSelectRoute: (routeId: string) => void;
  onSelectStop: (point: MapForecastPoint) => void;
  onRetry: () => void;
  theme: Theme;
  controls: ReactNode;
  onSplit?: (edge: SplitEdge) => void;
}
const timestampFormatter = new Intl.DateTimeFormat("ru-RU", {
  timeZone: "Europe/Moscow", day: "2-digit", month: "long", year: "numeric",
});
const valueFormatter = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 });

export function RankingsPanel({ routes: catalogRoutes, selectedRouteId, selectedStop, networkData, routeForecasts,
  networkBusy, networkError, onSelectRoute, onRetry, theme, controls, onSplit }: RankingsPanelProps) {
  const panel = useFloatingPanel();
  const titleId = useId();
  const [rankedRoute, setRankedRoute] = useState("");
  const routes = useMemo(() => routeForecasts.map((forecast) => {
    const id = forecast.series_key.route_id;
    return { id, name: catalogRoutes.find((route) => route.id === id)?.name.replace(" · демопрогноз", "") ?? id,
      total: forecast.points.reduce((sum, point) => sum + point.predicted_load, 0) };
  }).sort((left, right) => right.total - left.total || left.id.localeCompare(right.id, "ru", { numeric: true })), [routeForecasts, catalogRoutes]);
  const total = routes.reduce((sum, route) => sum + route.total, 0);
  const routeChoice = routes.find((route) => route.id === rankedRoute) ?? routes[0];

  if (networkBusy && !networkData) return <p className="network-status" role="status">Загружаем аналитику сети…</p>;
  if (!networkBusy && networkError) return <div className="top-panel-error network-error" role="alert">
    <p>Не удалось получить данные сети: {networkError}</p><button type="button" onClick={onRetry}>Повторить</button>
  </div>;
  if (!networkData) return <p className="network-status">Для выбранного периода пока нет данных.</p>;

  return <div className="network-analytics" aria-busy={networkBusy}>
    <div ref={panel.containerRef} className={`network-workspace${panel.hidden ? " floating-panel-hidden" : ""}`} style={panel.style}>
      <NetworkMap routes={catalogRoutes} snapshot={networkData} theme={theme} onSelectRoute={onSelectRoute}
        selectedRouteId={selectedRouteId} selectedStop={selectedStop} onSplit={onSplit} />
      <FloatingPanelControls panel={panel} />
      <aside className="network-side-panel" aria-label="Параметры и прогноз сети">
        {controls}
        <div className="network-heading">
          <div><p className="eyebrow">ПРОГНОЗ МОДЕЛИ · ВСЕ МАРШРУТЫ</p><h2>Сводка сети</h2></div>
          <time dateTime={networkData.timestamp}>{timestampFormatter.format(new Date(networkData.timestamp))}</time>
        </div>
        <div className="network-metrics">
          <article><div className="network-metric-heading"><TramIcon weight="bold" aria-hidden="true" /><span>Маршрутов</span></div><strong>{routes.length}</strong></article>
          <article><div className="network-metric-heading"><ChartBarIcon weight="bold" aria-hidden="true" /><span>Валидаций за период</span></div><strong>{valueFormatter.format(total)}</strong></article>
          <article><div className="network-metric-heading"><TrophyIcon weight="bold" aria-hidden="true" /><span>Больше всего валидаций</span></div><strong className="network-metric-name">{routes[0]?.name ?? "—"}</strong></article>
          <article><div className="network-metric-heading"><ChartBarIcon weight="bold" aria-hidden="true" /><span>Валидаций на лидере</span></div><strong>{routes[0] ? valueFormatter.format(routes[0].total) : "—"}</strong></article>
        </div>
        <section className="top-panel rankings-panel" aria-labelledby={titleId}>
          <div className="top-panel-heading"><div><p className="eyebrow">ВАЛИДАЦИИ ПО МАРШРУТАМ</p><h2 id={titleId}>Маршруты · {routes.length}</h2></div></div>
          <div className="ranking-content" aria-live="polite">
            <p className="ranking-description">Рейтинг по сумме прогнозных валидаций всего маршрута за выбранный период. Это не заполняемость вагонов и не прогноз по остановкам.</p>
            {routes.length > 0 && <div className="ranking-wheel-layout">
              <WheelPicker inline label="Рейтинг маршрутов" value={routeChoice?.id ?? ""} onChange={setRankedRoute}
                options={routes.map((route, index) => ({ value: route.id, label: `${index + 1}. ${route.name}`,
                  meta: `${valueFormatter.format(route.total)} валидаций`, color: catalogRoutes.find((item) => item.id === route.id)?.color }))} />
            </div>}
            <button type="button" className="network-download" disabled={!routeForecasts.length}
              title="CSV с реальными прогнозами валидаций по маршрутам"
              onClick={() => downloadNetworkValidationsCsv(routeForecasts)}>↓ Скачать прогноз сети CSV</button>
          </div>
          <p className="top-panel-note">Источник: архив модели {routeForecasts[0]?.model_version ?? "—"}. Карта показывает геометрию маршрутов, цвет линии не обозначает нагрузку.</p>
        </section>
      </aside>
    </div>
  </div>;
}
