import { lazy, Suspense, useEffect, useId, useState, type ReactNode } from "react";
import { ArrowRightIcon, ChartBarIcon, ClockIcon, MapPinIcon, TramIcon, UsersThreeIcon } from "@phosphor-icons/react";
import type { ForecastResponse, Horizon, MapForecastPoint, MapForecastResponse, Route, RouteStop } from "../../types";
import type { RouteSegment } from "../../routeSegment";
import { MapView } from "../map/MapView";
import { StopsModal } from "./StopsModal";
import type { Theme } from "../../theme";
import type { SplitEdge } from "../map/EdgeSplitHandles";
import { FloatingPanelControls, useFloatingPanel } from "../layout/FloatingPanelControls";
import { downloadRouteValidationsCsv } from "../../forecastCsv";
import { forecastValidationLevel, validationColor } from "../../loadLevel";

const LoadChart = lazy(() => import("./LoadChart").then((module) => ({ default: module.LoadChart })));

interface RouteDetailsDashboardProps {
  route?: Route;
  stops: RouteStop[];
  snapshot: MapForecastResponse | null;
  segment: RouteSegment | null;
  directionId: 0 | 1;
  startStopId: string;
  focusedPoint: MapForecastPoint | null;
  selectedStopId: string;
  busy: boolean;
  forecast: ForecastResponse | null;
  forecastBusy: boolean;
  forecastError: string;
  forecastLabel?: string;
  horizon: Horizon;
  sharedTimeIndex?: number;
  onSharedTimeIndexChange?: (index: number) => void;
  onSelectStop: (point: MapForecastPoint) => void;
  onRetryForecast: () => void;
  theme: Theme;
  controls: ReactNode;
  onSplit?: (edge: SplitEdge) => void;
}

const number = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 1 });
const date = new Intl.DateTimeFormat("ru-RU", { timeZone: "Europe/Moscow", day: "2-digit", month: "2-digit", year: "numeric" });

export function RouteDetailsDashboard({ route, stops, snapshot, segment, directionId, startStopId, focusedPoint, selectedStopId, busy,
  forecast, forecastBusy, forecastError, forecastLabel, horizon, sharedTimeIndex, onSharedTimeIndexChange,
  onSelectStop, onRetryForecast, theme, controls, onSplit }: RouteDetailsDashboardProps) {
  const [allStopsOpen, setAllStopsOpen] = useState(false);
  const [selectedTimeIndex, setSelectedTimeIndex] = useState(12);
  const panel = useFloatingPanel();
  const forecastId = useId();
  const summaryId = useId();
  const direction = focusedPoint?.direction_id ?? segment?.directionId ?? directionId;
  const points = snapshot?.points.filter((point) => point.direction_id === direction) ?? [];
  const orderedStops = [...points].sort((a, b) => a.sequence - b.sequence);
  const modelPoints = !forecastBusy && forecast?.value_unit === "validations" && !forecast.is_mock ? forecast.points : [];
  useEffect(() => { setSelectedTimeIndex(horizon === "day" ? 12 : 0); }, [forecast, horizon]);
  const activeTimeIndex = Math.min(sharedTimeIndex ?? selectedTimeIndex, Math.max(0, modelPoints.length - 1));
  const activePoint = modelPoints[activeTimeIndex] ?? null;
  const activeLevel = activePoint && forecast ? forecastValidationLevel(forecast, activePoint.timestamp) : null;
  const activeColor = activeLevel ? validationColor(activeLevel) : undefined;
  const modelTotal = modelPoints.length ? modelPoints.reduce((sum, point) => sum + point.predicted_load, 0) : null;
  const modelPeak = modelPoints.length ? Math.max(...modelPoints.map((point) => point.predicted_load)) : null;
  const visibleStopCount = segment?.stops.length ?? stops.filter((stop) => stop.direction_id === direction).length;
  const peakPoint = modelPoints.reduce<(typeof modelPoints)[number] | null>((peak, point) =>
    !peak || point.predicted_load > peak.predicted_load ? point : peak, null);
  const firstForecastDate = forecast?.points[0]?.timestamp;
  const lastForecastDate = forecast?.points.at(-1)?.timestamp;
  const firstForecastDay = firstForecastDate ? date.format(new Date(firstForecastDate)) : "";
  const lastForecastDay = lastForecastDate ? date.format(new Date(lastForecastDate)) : "";
  const periodLabel = firstForecastDate && lastForecastDate
    ? firstForecastDay === lastForecastDay ? firstForecastDay
      : `с ${firstForecastDay} по ${lastForecastDay}`
    : horizon === "day" ? "за выбранный день" : horizon === "month" ? "за выбранный месяц" : "за 12 месяцев";

  return <div className="detail-dashboard">
    <div ref={panel.containerRef} className={`detail-main-grid${panel.hidden ? " floating-panel-hidden" : ""}`} style={panel.style}>
      <MapView route={route} snapshot={snapshot} stops={stops} segment={segment} directionId={direction}
        startStopId={startStopId} selectedStopId={selectedStopId} focusedPoint={focusedPoint} busy={busy}
        forecastPoints={modelPoints} selectedTimeIndex={activeTimeIndex}
        onTimeIndexChange={onSharedTimeIndexChange ?? setSelectedTimeIndex}
        horizon={horizon} validationColor={activeColor}
        theme={theme} onSplit={onSplit}
        onStopSelect={(stopId) => {
          const point = points.find((item) => item.stop_id === stopId);
          if (point) onSelectStop(point);
        }} />

      <FloatingPanelControls panel={panel} />

      <aside className="route-insight-panel" aria-label="Параметры и аналитика выбранного маршрута">
      {controls}
      <div className="detail-metrics" aria-live="polite">
      <article className="detail-metric"><span className="detail-metric-icon"><UsersThreeIcon weight="fill" aria-hidden="true" /></span><div className="detail-metric-content"><span>Всего валидаций</span><strong>{modelTotal === null ? "—" : number.format(modelTotal)}</strong>
        <small>Модель · весь маршрут · {horizon === "day" ? "за сутки" : "за период"}</small></div></article>
      <article className="detail-metric"><span className="detail-metric-icon"><ClockIcon weight="bold" aria-hidden="true" /></span><div className="detail-metric-content"><span>Пик валидаций</span><strong>{modelPeak === null ? "—" : number.format(modelPeak)}</strong>
        <small>Модель · {horizon === "day" ? "за час" : "за день"}</small></div></article>
      <article className="detail-metric"><span className="detail-metric-icon"><MapPinIcon weight="fill" aria-hidden="true" /></span><div className="detail-metric-content"><span>Пиковый интервал</span><strong className="detail-metric-name">{peakPoint ? new Date(peakPoint.timestamp).toLocaleString("ru-RU", { timeZone: "Europe/Moscow", day: "2-digit", month: "2-digit", hour: horizon === "day" ? "2-digit" : undefined, minute: horizon === "day" ? "2-digit" : undefined }) : "—"}</strong>
        <small>По всему маршруту · {horizon === "day" ? "час" : "день"}</small></div></article>
      <article className="detail-metric"><span className="detail-metric-icon"><ChartBarIcon weight="bold" aria-hidden="true" /></span><div className="detail-metric-content"><span>Остановок</span><strong>{visibleStopCount || "—"}</strong>
        <small>{segment ? "На выбранном участке" : `Весь маршрут · направление ${direction + 1}`}</small></div></article>
    </div>

      <section className="detail-forecast" aria-labelledby={forecastId} aria-busy={forecastBusy}>
      <div className="detail-forecast-heading">
        <span className="detail-forecast-icon"><ChartBarIcon weight="bold" aria-hidden="true" /></span>
        <div>
          <p className="eyebrow">МАРШРУТ {route?.name.replace(" · демопрогноз", "") ?? "—"}</p>
          <h2 id={forecastId}>Прогноз валидаций маршрута</h2>
          <p>Весь маршрут · {periodLabel}. Число успешных валидаций, а не заполненность вагонов.</p>
        </div>
      </div>
      {forecastBusy && <p className="detail-forecast-status" role="status">Загружаем прогноз…</p>}
      {!forecastBusy && forecastError && <div className="top-panel-error" role="alert"><p>Не удалось получить прогноз: {forecastError}</p>
        <button type="button" onClick={onRetryForecast}>Повторить</button></div>}
      {!forecastBusy && !forecastError && forecast && (forecast.points.length
        ? <Suspense fallback={<p className="detail-forecast-status" role="status">Открываем график…</p>}><LoadChart forecast={forecast} theme={theme} selectedIndex={activeTimeIndex} /></Suspense>
        : <p className="detail-forecast-status">Для выбранного периода нет точек прогноза.</p>)}
      <p className="detail-forecast-status">Модель прогнозирует валидации по всему маршруту. Остановки на карте показаны для навигации; прогнозов по ним нет.</p>
      </section>

      <section className="route-summary" aria-labelledby={summaryId}>
        <div className="route-summary-heading">
          <div className="route-summary-title"><TramIcon weight="bold" aria-hidden="true" /><div><p className="eyebrow">СВОДКА ПО МАРШРУТУ</p><h2 id={summaryId}>{route?.name.replace(" · демопрогноз", "") ?? "Маршрут"}</h2></div></div>
          <button type="button" className="route-summary-download" disabled={!forecast || forecast.is_mock || !forecast.points.length}
            title="Скачать прогноз валидаций всего маршрута"
            onClick={() => { if (forecast) downloadRouteValidationsCsv(forecast); }}>
            ↓ Скачать CSV
          </button>
        </div>
        <div className="route-summary-stats">
          <div><strong>{stops.length || "—"}</strong><span>остановок</span></div>
          <div><strong>{stops.length ? new Set(stops.map((stop) => stop.direction_id)).size : "—"}</strong><span>направления</span></div>
          <div><strong>{snapshot ? date.format(new Date(snapshot.timestamp)) : "—"}</strong><span>дата прогноза</span></div>
        </div>
        <div className="route-summary-list-heading">
          <h3>Остановки маршрута</h3>
          <button type="button" className="text-button" onClick={() => setAllStopsOpen(true)} disabled={!stops.length}>Все остановки <ArrowRightIcon weight="bold" aria-hidden="true" /></button>
        </div>
        {orderedStops.length ? <ol className="route-summary-list">
          {orderedStops.slice(0, 5).map((point) => <li key={`${point.direction_id}/${point.stop_id}`}>
            <button type="button" className={`route-summary-row${selectedStopId === point.stop_id ? " route-summary-row--selected" : ""}`}
              onClick={() => onSelectStop(point)} aria-pressed={selectedStopId === point.stop_id}>
              <span className="route-summary-name">{point.stop_name}</span>
              <span className="route-summary-position">№ {point.sequence + 1}</span>
            </button>
          </li>)}
        </ol> : <p className="route-summary-empty">{busy ? "Загружаем остановки…" : "Нет остановок для выбранного маршрута."}</p>}
        {orderedStops.length > 0 && <p className="route-summary-note">Нажмите остановку, чтобы найти её на карте. Числа валидаций доступны только для маршрута целиком.</p>}
      </section>
      </aside>
    </div>
    {allStopsOpen && <StopsModal stops={stops} snapshot={snapshot} selectedStopId={selectedStopId}
      onSelect={onSelectStop} onClose={() => setAllStopsOpen(false)} />}
  </div>;
}
