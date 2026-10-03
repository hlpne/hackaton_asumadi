import { useEffect, useId, useMemo, useState, type ReactNode } from "react";
import { ChartBarIcon, TramIcon, TrophyIcon } from "@phosphor-icons/react";
import type { ForecastResponse, MapForecastPoint, MapForecastResponse, Route } from "../../types";
import { NetworkMap } from "../map/NetworkMap";
import type { Theme } from "../../theme";
import { WheelPicker } from "../layout/WheelPicker";
import type { SplitEdge } from "../map/EdgeSplitHandles";
import { FloatingPanelControls, useFloatingPanel } from "../layout/FloatingPanelControls";
import { downloadNetworkScenarioCsv, downloadNetworkValidationsCsv } from "../../forecastCsv";
import { forecastValidationLevel, validationColor } from "../../loadLevel";
import { ScenarioPanel } from "./ScenarioPanel";
import { applyScenario, formatSignedPercent, isNeutralScenario, resetScenario, roundValidations,
  type ScenarioAdjustments } from "../../scenario";

interface RankingsPanelProps {
  routes: Route[];
  selectedRouteId: string;
  selectedStop: MapForecastPoint | null;
  networkData: MapForecastResponse | null;
  routeForecasts: ForecastResponse[];
  sharedTimeIndex?: number;
  onSharedTimeIndexChange?: (index: number) => void;
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
const hourFormatter = new Intl.DateTimeFormat("ru-RU", { timeZone: "Europe/Moscow", hour: "2-digit", minute: "2-digit" });
const dayFormatter = new Intl.DateTimeFormat("ru-RU", { timeZone: "Europe/Moscow", day: "2-digit", month: "2-digit" });

export function RankingsPanel({ routes: catalogRoutes, selectedRouteId, selectedStop, networkData, routeForecasts,
  sharedTimeIndex, onSharedTimeIndexChange, networkBusy, networkError, onSelectRoute, onRetry, theme, controls, onSplit }: RankingsPanelProps) {
  const panel = useFloatingPanel();
  const titleId = useId();
  const [rankedRoute, setRankedRoute] = useState("");
  const [selectedTimeIndex, setSelectedTimeIndex] = useState(12);
  // Сценарий сети: одна поправка ко всем маршрутам; базовый прогноз модели не меняется.
  const [scenario, setScenario] = useState<ScenarioAdjustments>(resetScenario);
  const routes = useMemo(() => routeForecasts.map((forecast) => {
    const id = forecast.series_key.route_id;
    return { id, name: catalogRoutes.find((route) => route.id === id)?.name.replace(" · демопрогноз", "") ?? id,
      total: forecast.points.reduce((sum, point) => sum + point.predicted_load, 0) };
  }).sort((left, right) => right.total - left.total || left.id.localeCompare(right.id, "ru", { numeric: true })), [routeForecasts, catalogRoutes]);
  const total = routes.reduce((sum, route) => sum + route.total, 0);
  const forecastSeries = routeForecasts.find((forecast) => forecast.points.length > 0);
  const timePoints = !networkBusy ? forecastSeries?.points ?? [] : [];
  useEffect(() => { setSelectedTimeIndex(forecastSeries?.horizon === "day" ? 12 : 0); }, [routeForecasts, forecastSeries?.horizon]);
  const activeTimeIndex = Math.min(sharedTimeIndex ?? selectedTimeIndex, Math.max(0, timePoints.length - 1));
  const activeTimestamp = timePoints[activeTimeIndex]?.timestamp;
  const currentValidations = useMemo(() => routeForecasts.map((forecast) => ({
    routeId: forecast.series_key.route_id,
    value: forecast.points.find((point) => point.timestamp === activeTimestamp)?.predicted_load ?? 0,
  })), [routeForecasts, activeTimestamp]);
  const networkValidations = currentValidations.reduce((sum, item) => sum + item.value, 0);
  const currentValuesByRoute = useMemo(() => new Map(currentValidations.map((item) => [item.routeId, item.value])), [currentValidations]);
  const validationColors = useMemo(() => {
    if (!activeTimestamp) return new Map<string, string>();
    return new Map(routeForecasts.flatMap((forecast) => {
      const level = forecastValidationLevel(forecast, activeTimestamp);
      return level ? [[forecast.series_key.route_id, validationColor(level)] as const] : [];
    }));
  }, [routeForecasts, activeTimestamp]);
  const routeChoice = routes.find((route) => route.id === rankedRoute) ?? routes[0];
  const scenarioActive = !isNeutralScenario(scenario);
  const scenarioTotal = roundValidations(applyScenario(total, scenario));
  const scenarioLeader = routes[0] ? roundValidations(applyScenario(routes[0].total, scenario)) : null;
  const scenarioFocus = roundValidations(applyScenario(networkValidations, scenario));
  const share = (base: number, value: number) => base ? formatSignedPercent((value - base) / base * 100, 1) : "0\u202f%";
  const focusLabel = activeTimestamp ? (forecastSeries?.horizon === "day"
    ? `${hourFormatter.format(new Date(activeTimestamp))}–${hourFormatter.format(new Date(new Date(activeTimestamp).getTime() + 3_600_000))}`
    : dayFormatter.format(new Date(activeTimestamp))) : "";

  if (networkBusy && !networkData) return <p className="network-status" role="status">Загружаем аналитику сети…</p>;
  if (!networkBusy && networkError) return <div className="top-panel-error network-error" role="alert">
    <p>Не удалось получить данные сети: {networkError}</p><button type="button" onClick={onRetry}>Повторить</button>
  </div>;
  if (!networkData) return <p className="network-status">Для выбранного периода пока нет данных.</p>;

  return <div className="network-analytics" aria-busy={networkBusy}>
    <div ref={panel.containerRef} className={`network-workspace${panel.hidden ? " floating-panel-hidden" : ""}`} style={panel.style}>
      <NetworkMap routes={catalogRoutes} snapshot={networkData} theme={theme} onSelectRoute={onSelectRoute}
        validationColors={validationColors}
        currentValuesByRoute={currentValuesByRoute}
        forecastPoints={timePoints} selectedTimeIndex={activeTimeIndex}
        onTimeIndexChange={onSharedTimeIndexChange ?? setSelectedTimeIndex}
        selectedValidations={networkValidations}
        scenarioValidations={scenarioActive ? scenarioFocus : null}
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
          <article><div className="network-metric-heading"><ChartBarIcon weight="bold" aria-hidden="true" /><span>Валидаций за период</span></div><strong>{valueFormatter.format(total)}</strong>
            {scenarioActive && <small className="network-metric-scenario">Сценарий: <b>{valueFormatter.format(scenarioTotal)}</b> · {share(total, scenarioTotal)}</small>}</article>
          <article><div className="network-metric-heading"><TrophyIcon weight="bold" aria-hidden="true" /><span>Больше всего валидаций</span></div><strong className="network-metric-name">{routes[0]?.name ?? "—"}</strong></article>
          <article><div className="network-metric-heading"><ChartBarIcon weight="bold" aria-hidden="true" /><span>Валидаций на лидере</span></div><strong>{routes[0] ? valueFormatter.format(routes[0].total) : "—"}</strong>
            {scenarioActive && routes[0] && scenarioLeader !== null && <small className="network-metric-scenario">Сценарий: <b>{valueFormatter.format(scenarioLeader)}</b> · {share(routes[0].total, scenarioLeader)}</small>}</article>
        </div>
        {routes.length > 0 && <ScenarioPanel value={scenario} onChange={setScenario} comparisons={[
          { label: "Сеть за период · все маршруты", base: total, scenario: scenarioTotal },
          ...(activeTimestamp ? [{ label: `В фокусе · ${focusLabel}`, base: networkValidations, scenario: scenarioFocus }] : []),
        ]} onDownload={() => downloadNetworkScenarioCsv(routeForecasts, scenario)} downloadLabel="Сценарный CSV сети" />}
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
          <p className="top-panel-note">Источник: прогноз модели {routeForecasts[0]?.model_version ?? "—"}. Рейтинг суммирует период; цвет на карте сравнивает выбранный час или день с прогнозом этого же маршрута за период. Это не заполненность вагонов.</p>
        </section>
      </aside>
    </div>
  </div>;
}
