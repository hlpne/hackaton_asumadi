import { useId, useMemo, useState, type ReactNode } from "react";
import { ChartBarIcon, MapPinIcon, TramIcon, TrophyIcon } from "@phosphor-icons/react";
import type { MapForecastPoint, MapForecastResponse, Route } from "../../types";
import { snapshotPeriod } from "../../constants";
import { rankNetwork } from "../../networkRanking";
import { NetworkMap } from "../map/NetworkMap";
import type { Theme } from "../../theme";
import { WheelPicker } from "../layout/WheelPicker";
import type { SplitEdge } from "../map/EdgeSplitHandles";
import { FloatingPanelControls, useFloatingPanel } from "../layout/FloatingPanelControls";
import { downloadNetworkSnapshotCsv } from "../../forecastCsv";

type RankingView = "routes" | "stops";

interface RankingsPanelProps {
  routes: Route[];
  selectedRouteId: string;
  selectedStop: MapForecastPoint | null;
  networkData: MapForecastResponse | null;
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
const valueFormatter = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2 });

export function RankingsPanel({ routes: catalogRoutes, selectedRouteId, selectedStop, networkData, networkBusy, networkError,
  onSelectRoute, onSelectStop, onRetry, theme, controls, onSplit }: RankingsPanelProps) {
  const [view, setView] = useState<RankingView>("routes");
  const panel = useFloatingPanel();
  const titleId = useId();
  const [rankedRoute, setRankedRoute] = useState("");
  const [rankedStop, setRankedStop] = useState("");
  const network = useMemo(() => networkData ? rankNetwork(networkData) : null, [networkData]);
  const routes = network?.routes ?? [];
  const stops = network?.stops ?? [];
  const average = routes.length ? routes.reduce((sum, route) => sum + route.averageLoad, 0) / routes.length : null;
  const topAverage = routes[0]?.averageLoad ?? 0;
  const hasPositiveLoad = topAverage > 0;
  const period = snapshotPeriod[networkData?.horizon ?? "day"];
  const title = view === "routes" ? `Маршруты · ${routes.length}` : "Остановки · Топ-10";
  const routeChoice = routes.find((route) => route.id === rankedRoute) ?? routes[0];
  const stopKey = (point: MapForecastPoint) => `${point.route_id}/${point.direction_id}/${point.stop_id}`;
  const stopChoice = stops.find((point) => stopKey(point) === rankedStop) ?? stops[0];

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

      <aside className="network-side-panel" aria-label="Параметры и зоны внимания сети">
        {controls}
        <div className="network-heading">
          <div><p className="eyebrow">ВСЯ ТРАМВАЙНАЯ СЕТЬ</p><h2>Зоны внимания</h2></div>
          <time dateTime={networkData.timestamp}>{timestampFormatter.format(new Date(networkData.timestamp))}</time>
        </div>

        <div className="network-metrics">
          <article><div className="network-metric-heading"><TramIcon weight="bold" aria-hidden="true" /><span>Маршрутов</span></div><strong>{routes.length}</strong></article>
          <article><div className="network-metric-heading"><MapPinIcon weight="fill" aria-hidden="true" /><span>Остановок</span></div><strong>{networkData.points.length}</strong></article>
          <article><div className="network-metric-heading"><ChartBarIcon weight="bold" aria-hidden="true" /><span>Средний индекс</span></div><strong>{average === null ? "—" : valueFormatter.format(average)}</strong></article>
          <article><div className="network-metric-heading"><TrophyIcon weight="bold" aria-hidden="true" /><span>Самый загруженный</span></div><strong className="network-metric-name">{hasPositiveLoad ? routes[0]?.name.replace(" · демопрогноз", "") : "Нет нагрузки"}</strong></article>
        </div>

        <section className="top-panel rankings-panel" aria-labelledby={titleId}>
          <div className="top-panel-heading"><div><p className="eyebrow">ПРОГНОЗ ЗАГРУЗКИ</p><h2 id={titleId}>{title}</h2></div></div>
          <div className="ranking-views" role="group" aria-label="Выберите вид списка">
            <button type="button" className={`ranking-view${view === "routes" ? " ranking-view--active" : ""}`}
              aria-pressed={view === "routes"} onClick={() => setView("routes")}>Маршруты</button>
            <button type="button" className={`ranking-view${view === "stops" ? " ranking-view--active" : ""}`}
              aria-pressed={view === "stops"} onClick={() => setView("stops")}>Остановки</button>
          </div>
          <div className="ranking-content" aria-live="polite">
            <p className="ranking-description">{view === "routes"
              ? `Средний индекс остановок каждого маршрута ${period}.`
              : `Остановки с самым высоким индексом ${period}.`}</p>
            {!hasPositiveLoad && <p className="top-panel-status">Для выбранной даты нет положительного прогноза.</p>}
            {hasPositiveLoad && (view === "routes" ? routes.length > 0 : stops.length > 0) && <div className="ranking-wheel-layout">
              {view === "routes" ? <WheelPicker inline label="Рейтинг маршрутов" value={routeChoice?.id ?? ""} onChange={setRankedRoute}
                options={routes.map((route) => ({ value: route.id, label: `${route.rank}. ${route.name.replace(" · демопрогноз", "")}`,
                  meta: valueFormatter.format(route.averageLoad), color: catalogRoutes.find((item) => item.id === route.id)?.color }))} />
                : <WheelPicker inline label="Рейтинг остановок" value={stopChoice ? stopKey(stopChoice) : ""} onChange={setRankedStop}
                  options={stops.map((point) => ({ value: stopKey(point), label: `${point.rank}. ${point.stop_name}`,
                    meta: valueFormatter.format(point.predicted_load) }))} />}
            </div>}
            <button type="button" className="network-download" disabled={!networkData.points.length}
              title="CSV с прогнозом по всем остановкам всех маршрутов за выбранный срез"
              onClick={() => downloadNetworkSnapshotCsv(networkData)}>↓ Скачать сводку по всем маршрутам</button>
          </div>
          <p className="top-panel-note">{networkData.is_mock ? "Демонстрационные данные; индекс не равен заполненности салона." : "Порог перегрузки не задан."}
            {" "}Источник: /forecast/map · {networkData.model_version}.</p>
        </section>
      </aside>
    </div>
  </div>;
}
