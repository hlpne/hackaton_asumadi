import { ArrowsOutIcon, XIcon } from "@phosphor-icons/react";
import { useEffect, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { getForecast, getMapForecast, getStops } from "../../api";
import { periodRequest, snapshotTimestamp } from "../../forecastPeriod";
import type { ForecastResponse, Horizon, MapForecastPoint, MapForecastResponse, Route, RouteStop } from "../../types";
import type { Theme } from "../../theme";
import { PeriodControls } from "../layout/PeriodControls";
import { WheelPicker, type WheelOption } from "../layout/WheelPicker";
import { Sidebar } from "../layout/Sidebar";
import { RankingsPanel } from "../analytics/RankingsPanel";
import { RouteDetailsDashboard } from "../analytics/RouteDetailsDashboard";
import { supportedNetworkSnapshot } from "../../supportedRoutes";
import type { SplitEdge } from "./EdgeSplitHandles";
import { savedLayout, paneIds, insertPane, removePane, resizeBranch, type LayoutNode, type Side } from "./splitLayout";

export interface SplitPaneConfig {
  routeId: string;
  horizon: Horizon;
  date: string;
  directionId: 0 | 1;
  stopId?: string;
}

interface SplitWorkspaceProps {
  routes: Route[];
  theme: Theme;
  initialCount: 2 | 3 | 4;
  initialEdge: SplitEdge;
  initialConfig: SplitPaneConfig;
  onOpenDetails: (config: SplitPaneConfig) => void;
  onClose: (config: SplitPaneConfig) => void;
  mode?: "details" | "analytics";
}

interface SplitMapPaneProps {
  index: number;
  routes: Route[];
  theme: Theme;
  config: SplitPaneConfig;
  onChange: (config: SplitPaneConfig) => void;
  onOpenDetails: (config: SplitPaneConfig) => void;
  onRemove: () => void;
  onSplit?: (edge: SplitEdge) => void;
  mode: "details" | "analytics";
}

function failureMessage(failure: unknown): string {
  return failure instanceof Error ? failure.message : "Не удалось получить данные.";
}

function SplitMapPane({ index, routes, theme, config, onChange, onOpenDetails, onRemove, onSplit, mode }: SplitMapPaneProps) {
  const [stops, setStops] = useState<RouteStop[]>([]);
  const [snapshot, setSnapshot] = useState<MapForecastResponse | null>(null);
  const [forecast, setForecast] = useState<ForecastResponse | null>(null);
  const [forecastBusy, setForecastBusy] = useState(false);
  const [forecastError, setForecastError] = useState("");
  const [selected, setSelected] = useState<MapForecastPoint | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const [settledConfig, setSettledConfig] = useState(config);
  useEffect(() => {
    const timer = window.setTimeout(() => setSettledConfig(config), 420);
    return () => window.clearTimeout(timer);
  }, [config.routeId, config.directionId, config.horizon, config.date, config.stopId]);
  const route = routes.find((item) => item.id === config.routeId);
  const routeOptions: WheelOption[] = routes.map((item) => ({
    value: item.id,
    label: item.name.replace(" · демопрогноз", ""),
    color: item.color,
  }));

  useEffect(() => {
    const controller = new AbortController();
    setStops([]);
    getStops(config.routeId, controller.signal)
      .then((items) => { if (!controller.signal.aborted) setStops(items); })
      .catch((failure: unknown) => { if (!controller.signal.aborted) setError(failureMessage(failure)); });
    return () => controller.abort();
  }, [config.routeId]);

  useEffect(() => {
    if (settledConfig.routeId !== config.routeId || settledConfig.directionId !== config.directionId ||
      settledConfig.horizon !== config.horizon || settledConfig.date !== config.date) {
      setBusy(false);
      return;
    }
    const controller = new AbortController();
    const timestamp = snapshotTimestamp(settledConfig.date, settledConfig.horizon);
    setBusy(true);
    setError("");
    getMapForecast(mode === "details" ? {
      route_id: settledConfig.routeId, direction_id: settledConfig.directionId, horizon: settledConfig.horizon,
      timestamp, forecast_origin: timestamp,
    } : { horizon: settledConfig.horizon, timestamp, forecast_origin: timestamp }, controller.signal)
      .then((data) => { if (!controller.signal.aborted) setSnapshot(mode === "analytics" ? supportedNetworkSnapshot(data) : data); })
      .catch((failure: unknown) => { if (!controller.signal.aborted) setError(failureMessage(failure)); })
      .finally(() => { if (!controller.signal.aborted) setBusy(false); });
    return () => controller.abort();
  }, [config.routeId, config.directionId, config.horizon, config.date,
    settledConfig.routeId, settledConfig.directionId, settledConfig.horizon, settledConfig.date, retry, mode]);

  useEffect(() => {
    if (mode !== "details" || !stops.length) return;
    if (settledConfig.routeId !== config.routeId || settledConfig.directionId !== config.directionId ||
      settledConfig.horizon !== config.horizon || settledConfig.date !== config.date ||
      settledConfig.stopId !== config.stopId) {
      setForecastBusy(false);
      return;
    }
    const controller = new AbortController();
    const range = periodRequest(settledConfig.date, settledConfig.horizon);
    const first = stops.find((item) => item.direction_id === settledConfig.directionId);
    setForecastBusy(true);
    setForecastError("");
    getForecast({ route_id: settledConfig.routeId, stop_id: selected?.stop_id || settledConfig.stopId || first?.id,
      direction_id: settledConfig.directionId, horizon: settledConfig.horizon, resolution: range.resolution,
      from: range.from, to: range.to, forecast_origin: range.from }, controller.signal)
      .then((data) => { if (!controller.signal.aborted) setForecast(data); })
      .catch((failure: unknown) => { if (!controller.signal.aborted) setForecastError(failureMessage(failure)); })
      .finally(() => { if (!controller.signal.aborted) setForecastBusy(false); });
    return () => controller.abort();
  }, [mode, config.routeId, config.directionId, config.horizon, config.date, config.stopId,
    settledConfig.routeId, settledConfig.directionId, settledConfig.horizon, settledConfig.date, settledConfig.stopId,
    selected?.stop_id, stops, retry]);

  const heading = <div className="split-pane-heading"><div><span>ОКНО 0{index + 1}</span><strong>{mode === "analytics" ? "Вся сеть" : route?.name.replace(" · демопрогноз", "") ?? "Маршрут"}</strong></div>
    <div className="split-pane-actions"><button type="button" title="Открыть выбранное окно" aria-label="Открыть выбранное окно"
      onClick={() => onOpenDetails(config)}><ArrowsOutIcon weight="bold" /></button>
      <button type="button" title="Закрыть окно" aria-label={`Закрыть окно ${index + 1}`} onClick={onRemove}><XIcon weight="bold" /></button></div></div>;

  if (mode === "analytics") {
    if (!snapshot || (!busy && error)) return <section className="split-pane split-pane--network" aria-label={`Окно сети ${index + 1}`}>
      <div className="split-network-status">{heading}<p role={error ? "alert" : "status"}>{error || "Загружаем аналитику сети…"}</p>
        {error && <button type="button" onClick={() => setRetry((value) => value + 1)}>Повторить</button>}</div>
    </section>;
    const selectedStop = snapshot?.points.find((point) => point.route_id === config.routeId && point.stop_id === config.stopId) ?? null;
    return <section className="split-pane split-pane--network" aria-label={`Окно сети ${index + 1}`}>
      <RankingsPanel routes={routes} selectedRouteId={config.routeId} selectedStop={selectedStop}
        networkData={snapshot} networkBusy={busy} networkError={error} onRetry={() => setRetry((value) => value + 1)}
        onSelectRoute={(routeId) => { setStops([]); onChange({ ...config, routeId, stopId: "" }); }}
        onSelectStop={(point) => onChange({ ...config, routeId: point.route_id, stopId: point.stop_id })}
        onSplit={onSplit} theme={theme}
        controls={<>{heading}<Sidebar mode="analytics" routes={routes} stops={stops} routeId={config.routeId}
          fromStopId={config.stopId ?? ""} toStopId="" horizon={config.horizon} date={config.date}
          busy={busy} loadingCatalog={false} loadingStops={!stops.length}
          onRouteChange={(routeId) => { setStops([]); onChange({ ...config, routeId, stopId: "" }); }}
          onFromStopChange={(stopId) => onChange({ ...config, stopId })} onToStopChange={() => {}}
          onHorizonChange={(horizon) => onChange({ ...config, horizon })}
          onDateChange={(date) => onChange({ ...config, date })} /></>} />
    </section>;
  }

  return <section className="split-pane" aria-label={`Окно карты ${index + 1}`}>
    <RouteDetailsDashboard route={route} snapshot={snapshot} stops={stops} segment={null}
      directionId={config.directionId} startStopId={config.stopId ?? ""} selectedStopId={selected?.stop_id ?? config.stopId ?? ""}
      focusedPoint={selected} busy={busy} forecast={forecast} forecastBusy={forecastBusy} forecastError={forecastError}
      forecastLabel={selected?.stop_name ?? stops.find((stop) => stop.id === config.stopId)?.name}
      horizon={config.horizon} theme={theme} onSplit={onSplit}
      onSelectStop={(point) => { setSelected(point); onChange({ ...config, stopId: point.stop_id }); }}
      onRetryForecast={() => setRetry((value) => value + 1)} controls={<div className="split-pane-controls">
      {heading}
      <WheelPicker label="Маршрут" value={config.routeId} options={routeOptions}
        onChange={(routeId) => { setSelected(null); setStops([]); onChange({ ...config, routeId, stopId: "" }); }} />
      <fieldset className="direction-switch"><legend>Направление</legend><div>
        {[0, 1].map((direction) => <button key={direction} type="button"
          className={config.directionId === direction ? "direction-option direction-option--active" : "direction-option"}
          aria-pressed={config.directionId === direction}
          onClick={() => { setSelected(null); onChange({ ...config, directionId: direction as 0 | 1, stopId: "" }); }}>{direction + 1}</button>)}
      </div></fieldset>
      <PeriodControls compact horizon={config.horizon} date={config.date}
        onHorizonChange={(horizon) => onChange({ ...config, horizon })}
        onDateChange={(date) => onChange({ ...config, date })} />
      {error && <p className="split-pane-error" role="alert">{error}</p>}
    </div>} />
  </section>;
}

export function SplitWorkspace({ routes, theme, initialCount, initialEdge, initialConfig, onOpenDetails, onClose, mode = "details" }: SplitWorkspaceProps) {
  const key = mode === "analytics" ? "networkSplit" : "split";
  const [layout, setLayout] = useState<LayoutNode>(() => savedLayout(initialCount, initialEdge, `${key}Layout`));
  const [resizing, setResizing] = useState(false);
  const [configs, setConfigs] = useState<SplitPaneConfig[]>(() => {
    const parameters = new URLSearchParams(window.location.search);
    const routeValues = parameters.get(`${key}Routes`)?.split(",") ?? [];
    const dateValues = parameters.get(`${key}Dates`)?.split(",") ?? [];
    const horizonValues = parameters.get(`${key}Horizons`)?.split(",") ?? [];
    const directionValues = parameters.get(`${key}Directions`)?.split(",") ?? [];
    const stopValues = parameters.get(`${key}Stops`)?.split(",") ?? [];
    return Array.from({ length: 4 }, (_, index) => {
      const routeId = routeValues[index];
      const horizon = horizonValues[index];
      return {
        routeId: routes.some((route) => route.id === routeId)
          ? routeId
          : routes[index % Math.max(routes.length, 1)]?.id ?? initialConfig.routeId,
        date: /^\d{4}-\d{2}-\d{2}$/.test(dateValues[index] ?? "") ? dateValues[index] : initialConfig.date,
        horizon: horizon === "day" || horizon === "month" || horizon === "year" ? horizon : initialConfig.horizon,
        directionId: directionValues[index] === "1" ? 1 : 0,
        stopId: stopValues[index] || "",
      };
    });
  });

  useEffect(() => {
    const ids = paneIds(layout);
    const url = new URL(window.location.href);
    url.searchParams.set(key, String(ids.length));
    url.searchParams.set(`${key}Layout`, JSON.stringify(layout));
    url.searchParams.set(`${key}Routes`, configs.map((config) => config.routeId).join(","));
    url.searchParams.set(`${key}Dates`, configs.map((config) => config.date).join(","));
    url.searchParams.set(`${key}Horizons`, configs.map((config) => config.horizon).join(","));
    url.searchParams.set(`${key}Directions`, configs.map((config) => config.directionId).join(","));
    url.searchParams.set(`${key}Stops`, configs.map((config) => config.stopId ?? "").join(","));
    window.history.replaceState(null, "", url);
  }, [configs, layout, key]);

  const updateConfig = (index: number, config: SplitPaneConfig) => setConfigs((current) =>
    current.map((item, itemIndex) => itemIndex === index ? config : item));

  const ids = paneIds(layout);
  const add = (id: number, edge: SplitEdge) => {
    if (ids.length >= 4) return;
    const nextId = [0, 1, 2, 3].find((candidate) => !ids.includes(candidate));
    if (nextId === undefined) return;
    updateConfig(nextId, { ...configs[id], routeId: routes[(ids.length) % routes.length]?.id ?? configs[id].routeId, stopId: "" });
    setLayout((current) => insertPane(current, id, edge, nextId));
  };
  const remove = (id: number) => {
    const next = removePane(layout, id);
    if (next.kind === "pane") onClose(configs[next.id]);
    else setLayout(next);
  };

  const render = (node: LayoutNode, path: Side[] = []): ReactNode => {
    if (node.kind === "pane") return <SplitMapPane key={node.id} index={ids.indexOf(node.id)} routes={routes} mode={mode}
      theme={theme} config={configs[node.id]} onChange={(next) => updateConfig(node.id, next)}
      onOpenDetails={onOpenDetails} onRemove={() => remove(node.id)}
      onSplit={ids.length < 4 ? (edge) => add(node.id, edge) : undefined} />;
    const vertical = node.axis === "column";
    const updateFromPointer = (event: ReactPointerEvent<HTMLButtonElement>) => {
      const bounds = event.currentTarget.parentElement?.getBoundingClientRect();
      if (!bounds) return;
      const value = vertical ? (event.clientX - bounds.left) / bounds.width * 100
        : (event.clientY - bounds.top) / bounds.height * 100;
      setLayout((current) => resizeBranch(current, path, Math.max(25, Math.min(75, value))));
    };
    return <div className={`split-branch split-branch--${node.axis}`}>
      <div className="split-branch-child" style={{ flexBasis: `calc(${node.ratio}% - 2px)` }}>{render(node.first, [...path, "first"])}</div>
      <div className="split-branch-child" style={{ flexBasis: `calc(${100 - node.ratio}% - 2px)` }}>{render(node.second, [...path, "second"])}</div>
      <button type="button" className={`split-divider split-divider--${node.axis}`} role="separator"
        aria-label={vertical ? "Изменить ширину соседних окон" : "Изменить высоту соседних окон"}
        aria-orientation={vertical ? "vertical" : "horizontal"} aria-valuemin={25} aria-valuemax={75}
        aria-valuenow={Math.round(node.ratio)} style={{ [vertical ? "left" : "top"]: `${node.ratio}%` } as CSSProperties}
        onPointerDown={(event) => { event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId); setResizing(true); }}
        onPointerMove={(event) => { if (event.currentTarget.hasPointerCapture(event.pointerId)) updateFromPointer(event); }}
        onPointerUp={() => setResizing(false)} onPointerCancel={() => setResizing(false)}
        onKeyDown={(event) => {
          const step = (vertical ? event.key === "ArrowRight" : event.key === "ArrowDown") ? 2
            : (vertical ? event.key === "ArrowLeft" : event.key === "ArrowUp") ? -2 : 0;
          if (step) { event.preventDefault(); setLayout((current) => resizeBranch(current, path, Math.max(25, Math.min(75, node.ratio + step)))); }
        }} />
    </div>;
  };

  return <div className={`split-workspace-shell${resizing ? " is-resizing-split" : ""}`}>
    <div className="split-workspace">{render(layout)}</div>
  </div>;
}
