import { lazy, Suspense, useId, useState, type ReactNode } from "react";
import { ArrowRightIcon, ChartBarIcon, ClockIcon, MapPinIcon, TramIcon, UsersThreeIcon } from "@phosphor-icons/react";
import { loadColor, loadLabels, loadLevel } from "../../loadLevel";
import type { ForecastResponse, Horizon, MapForecastPoint, MapForecastResponse, Route, RouteStop } from "../../types";
import type { RouteSegment } from "../../routeSegment";
import { MapView } from "../map/MapView";
import { StopsModal } from "./StopsModal";
import type { Theme } from "../../theme";
import type { SplitEdge } from "../map/EdgeSplitHandles";
import { FloatingPanelControls, useFloatingPanel } from "../layout/FloatingPanelControls";
import { downloadForecastSnapshotCsv } from "../../forecastCsv";

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
  onSelectStop: (point: MapForecastPoint) => void;
  onRetryForecast: () => void;
  theme: Theme;
  controls: ReactNode;
  onSplit?: (edge: SplitEdge) => void;
}

const number = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 1 });
const date = new Intl.DateTimeFormat("ru-RU", { timeZone: "Europe/Moscow", day: "2-digit", month: "2-digit", year: "numeric" });

export function RouteDetailsDashboard({ route, stops, snapshot, segment, directionId, startStopId, focusedPoint, selectedStopId, busy,
  forecast, forecastBusy, forecastError, forecastLabel, horizon, onSelectStop, onRetryForecast, theme, controls, onSplit }: RouteDetailsDashboardProps) {
  const [allStopsOpen, setAllStopsOpen] = useState(false);
  const panel = useFloatingPanel();
  const forecastId = useId();
  const summaryId = useId();
  const direction = focusedPoint?.direction_id ?? segment?.directionId ?? directionId;
  const points = snapshot?.points.filter((point) => point.direction_id === direction) ?? [];
  const ranked = points.filter((point) => !snapshot?.is_mock || point.predicted_load > 0)
    .sort((a, b) => b.predicted_load - a.predicted_load || a.sequence - b.sequence);
  const peakStop = ranked[0];
  const average = points.length ? points.reduce((sum, point) => sum + point.predicted_load, 0) / points.length : null;
  const visibleStopCount = segment?.stops.length ?? stops.filter((stop) => stop.direction_id === direction).length;
  const maxLoad = Math.max(1, ...points.map((point) => point.predicted_load));
  const displayedForecastStop = forecastLabel ?? stops.find((stop) => stop.id === forecast?.series_key.stop_id)?.name;
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
        theme={theme} onSplit={onSplit}
        onStopSelect={(stopId) => {
          const point = points.find((item) => item.stop_id === stopId);
          if (point) onSelectStop(point);
        }} />

      <FloatingPanelControls panel={panel} />

      <aside className="route-insight-panel" aria-label="Параметры и аналитика выбранного маршрута">
      {controls}
      <div className="detail-metrics" aria-live="polite">
      <article className="detail-metric"><span className="detail-metric-icon"><UsersThreeIcon weight="fill" aria-hidden="true" /></span><div className="detail-metric-content"><span>Средняя нагрузка</span><strong>{average === null ? "—" : number.format(average)}</strong>
        <small>{snapshot?.is_mock ? "Демонстрационный показатель" : "По остановкам направления"}</small></div></article>
      <article className="detail-metric"><span className="detail-metric-icon"><ClockIcon weight="bold" aria-hidden="true" /></span><div className="detail-metric-content"><span>Пиковая нагрузка</span><strong>{peakStop ? number.format(peakStop.predicted_load) : "—"}</strong>
        <small>{snapshot && peakStop ? `Направление ${direction + 1}` : "Нет данных для среза"}</small></div></article>
      <article className="detail-metric"><span className="detail-metric-icon"><MapPinIcon weight="fill" aria-hidden="true" /></span><div className="detail-metric-content"><span>Пиковая остановка</span><strong className="detail-metric-name">{peakStop?.stop_name ?? "—"}</strong>
        <small>{peakStop ? `Прогноз нагрузки: ${number.format(peakStop.predicted_load)}` : "Нет данных для среза"}</small></div></article>
      <article className="detail-metric"><span className="detail-metric-icon"><ChartBarIcon weight="bold" aria-hidden="true" /></span><div className="detail-metric-content"><span>Остановок</span><strong>{visibleStopCount || "—"}</strong>
        <small>{segment ? "На выбранном участке" : `Весь маршрут · направление ${direction + 1}`}</small></div></article>
    </div>

      <section className="detail-forecast" aria-labelledby={forecastId} aria-busy={forecastBusy}>
      <div className="detail-forecast-heading">
        <span className="detail-forecast-icon"><ChartBarIcon weight="bold" aria-hidden="true" /></span>
        <div>
          <p className="eyebrow">МАРШРУТ {route?.name.replace(" · демопрогноз", "") ?? "—"}</p>
          <h2 id={forecastId}>График прогноза загрузки маршрута</h2>
          <p>{`Направление ${direction + 1}`}{displayedForecastStop ? ` · остановка «${displayedForecastStop}»` : ""}
            {" · "}{periodLabel}</p>
        </div>
      </div>
      {forecastBusy && <p className="detail-forecast-status" role="status">Загружаем прогноз…</p>}
      {!forecastBusy && forecastError && <div className="top-panel-error" role="alert"><p>Не удалось получить прогноз: {forecastError}</p>
        <button type="button" onClick={onRetryForecast}>Повторить</button></div>}
      {!forecastBusy && !forecastError && forecast && (forecast.points.length
        ? <Suspense fallback={<p className="detail-forecast-status" role="status">Открываем график…</p>}><LoadChart forecast={forecast} theme={theme} /></Suspense>
        : <p className="detail-forecast-status">Для выбранного периода нет точек прогноза.</p>)}
      </section>

      <section className="route-summary" aria-labelledby={summaryId}>
        <div className="route-summary-heading">
          <div className="route-summary-title"><TramIcon weight="bold" aria-hidden="true" /><div><p className="eyebrow">СВОДКА ПО МАРШРУТУ</p><h2 id={summaryId}>{route?.name.replace(" · демопрогноз", "") ?? "Маршрут"}</h2></div></div>
          <button type="button" className="route-summary-download" disabled={!snapshot || !route || !points.length}
            title="Скачать расчёт по остановкам текущего направления"
            onClick={() => { if (snapshot && route) downloadForecastSnapshotCsv(snapshot, route.id, direction); }}>
            ↓ Скачать CSV
          </button>
        </div>
        <div className="route-summary-stats">
          <div><strong>{stops.length || "—"}</strong><span>остановок</span></div>
          <div><strong>{stops.length ? new Set(stops.map((stop) => stop.direction_id)).size : "—"}</strong><span>направления</span></div>
          <div><strong>{snapshot ? date.format(new Date(snapshot.timestamp)) : "—"}</strong><span>дата прогноза</span></div>
        </div>
        <div className="route-summary-list-heading">
          <h3>Зоны внимания</h3>
          <button type="button" className="text-button" onClick={() => setAllStopsOpen(true)} disabled={!stops.length}>Все остановки <ArrowRightIcon weight="bold" aria-hidden="true" /></button>
        </div>
        {ranked.length ? <ol className="route-summary-list">
          {ranked.slice(0, 5).map((point) => <li key={`${point.direction_id}/${point.stop_id}`}>
            <button type="button" className={`route-summary-row${selectedStopId === point.stop_id ? " route-summary-row--selected" : ""}`}
              onClick={() => onSelectStop(point)} aria-pressed={selectedStopId === point.stop_id}>
              <span className="route-summary-name">{point.stop_name}</span>
              <span className="route-summary-bar"><i style={{ width: `${Math.max(4, point.predicted_load / maxLoad * 100)}%`, background: snapshot ? loadColor(point.predicted_load, snapshot) : undefined }} /></span>
              <strong>{number.format(point.predicted_load)}</strong>
            </button>
          </li>)}
        </ol> : <p className="route-summary-empty">{busy ? "Загружаем остановки…" : "Нет прогноза для выбранной даты."}</p>}
        {peakStop && snapshot && <p className="route-summary-note">{loadLabels[loadLevel(peakStop.predicted_load, snapshot)]} нагрузка по текущему срезу. Нажмите остановку, чтобы найти её на карте.</p>}
      </section>
      </aside>
    </div>
    {allStopsOpen && <StopsModal stops={stops} snapshot={snapshot} selectedStopId={selectedStopId}
      onSelect={onSelectStop} onClose={() => setAllStopsOpen(false)} />}
  </div>;
}
