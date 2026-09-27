import { useEffect, useRef, useState } from "react";
import { getForecast, getMapForecast, getRoutes, getStops } from "./api";
import type { ForecastResponse, Horizon, MapForecastPoint, MapForecastResponse, Route, RouteStop } from "./types";
import { Header } from "./components/layout/Header";
import type { Page } from "./components/layout/Header";
import { HomePage } from "./components/layout/HomePage";
import { Sidebar } from "./components/layout/Sidebar";
import { TransitBackdrop } from "./components/layout/TransitBackdrop";
import { RankingsPanel } from "./components/analytics/RankingsPanel";
import { RouteDetailsDashboard } from "./components/analytics/RouteDetailsDashboard";
import { ModelPage } from "./components/model/ModelPage";
import { buildRouteSegment } from "./routeSegment";
import { applyTheme, initialTheme } from "./theme";
import { modelDate, modelPeriodRequest, snapshotTimestamp } from "./forecastPeriod";
import { supportedNetworkSnapshot, supportedRoutes } from "./supportedRoutes";
import { SplitWorkspace, type SplitPaneConfig } from "./components/map/SplitWorkspace";
import type { SplitEdge } from "./components/map/EdgeSplitHandles";

function compareRoutes(a: Route, b: Route): number {
  const first = a.id.replace(/^demo-/, "");
  const second = b.id.replace(/^demo-/, "");
  const firstNumber = first.match(/^(\d+)(.*)$/);
  const secondNumber = second.match(/^(\d+)(.*)$/);
  if (firstNumber && secondNumber) {
    const difference = Number(firstNumber[1]) - Number(secondNumber[1]);
    return difference || firstNumber[2].localeCompare(secondNumber[2], "ru");
  }
  if (firstNumber) return -1;
  if (secondNumber) return 1;
  return a.name.localeCompare(b.name, "ru", { numeric: true });
}

function failureMessage(failure: unknown): string {
  return failure instanceof Error ? failure.message : "Не удалось получить данные от backend.";
}

function pageFromHash(): Page {
  const hash = window.location.hash.slice(1).split("?")[0];
  if (hash === "home" || hash === "analytics" || hash === "model") return hash;
  return "details";
}

function queryValue(name: string): string {
  return new URLSearchParams(window.location.search).get(name) ?? "";
}

function initialHorizon(): Horizon {
  const value = queryValue("horizon");
  return value === "month" ? value : "day";
}

function initialDirection(): 0 | 1 {
  return queryValue("direction") === "1" ? 1 : 0;
}

function initialSplitCount(key = "split"): 1 | 2 | 3 | 4 {
  const value = Number(queryValue(key));
  return value === 2 || value === 3 || value === 4 ? value : 1;
}

export default function App() {
  const [page, setPage] = useState<Page>(pageFromHash);
  const [theme, setTheme] = useState(initialTheme);
  const [scrollToMap, setScrollToMap] = useState(false);
  const [routes, setRoutes] = useState<Route[]>([]);
  const [stops, setStops] = useState<RouteStop[]>([]);
  const [routeId, setRouteId] = useState(() => queryValue("route"));
  const [directionId, setDirectionId] = useState<0 | 1>(initialDirection);
  const [fromStopId, setFromStopId] = useState(() => queryValue("from"));
  const [toStopId, setToStopId] = useState(() => queryValue("to"));
  const [forecastStopId, setForecastStopId] = useState(() => queryValue("stop"));
  const [horizon, setHorizon] = useState<Horizon>(initialHorizon);
  const [date, setDate] = useState(() => modelDate(queryValue("date") || queryValue("dateFrom"), initialHorizon()));
  const [settledFilters, setSettledFilters] = useState(() => ({ routeId, horizon, date }));
  const [splitCount, setSplitCount] = useState<1 | 2 | 3 | 4>(initialSplitCount);
  const [splitEdge, setSplitEdge] = useState<SplitEdge>("right");
  const [retry, setRetry] = useState(0);
  const [mapForecast, setMapForecast] = useState<MapForecastResponse | null>(null);
  const [routeForecast, setRouteForecast] = useState<ForecastResponse | null>(null);
  const [forecastError, setForecastError] = useState("");
  const [forecastBusy, setForecastBusy] = useState(false);
  const [networkForecast, setNetworkForecast] = useState<MapForecastResponse | null>(null);
  const [networkRouteForecasts, setNetworkRouteForecasts] = useState<ForecastResponse[]>([]);
  const [networkError, setNetworkError] = useState("");
  const [networkBusy, setNetworkBusy] = useState(false);
  const [networkRouteFocused, setNetworkRouteFocused] = useState(false);
  const [focusedPoint, setFocusedPoint] = useState<MapForecastPoint | null>(null);
  const mapAnchor = useRef<HTMLDivElement>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [loadingCatalog, setLoadingCatalog] = useState(true);
  const [loadingStops, setLoadingStops] = useState(false);
  const fromStop = stops.find((stop) => stop.id === fromStopId);
  const segment = buildRouteSegment(stops, fromStopId, toStopId);

  function closeSplit(config: SplitPaneConfig) {
    setRouteId(config.routeId);
    setHorizon(config.horizon);
    setDate(modelDate(config.date, config.horizon));
    setDirectionId(config.directionId);
    setFromStopId("");
    setToStopId("");
    setForecastStopId("");
    setFocusedPoint(null);
    setSplitCount(1);
    const url = new URL(window.location.href);
    ["split", "splitRoutes", "splitDates", "splitHorizons", "splitDirections", "splitStops", "splitLayout"].forEach((key) => url.searchParams.delete(key));
    window.history.replaceState(null, "", url);
  }

  function navigate(nextPage: Page) {
    setPage(nextPage);
    if (window.location.hash !== `#${nextPage}`) window.location.hash = nextPage;
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  useEffect(() => applyTheme(theme), [theme]);

  useEffect(() => {
    const timer = window.setTimeout(() => setSettledFilters({ routeId, horizon, date }), 420);
    return () => window.clearTimeout(timer);
  }, [routeId, horizon, date]);

  useEffect(() => {
    const handleHashChange = () => {
      setPage(pageFromHash());
    };
    window.addEventListener("hashchange", handleHashChange);
    return () => window.removeEventListener("hashchange", handleHashChange);
  }, []);

  useEffect(() => {
    const label = page === "home" ? "Главная" : page === "details" ? "Мониторинг" : page === "analytics" ? "Сеть" : "О модели";
    document.title = `${label} · Трамвай / Прогноз`;
    document.body.dataset.page = page;
    if (page === "details" && scrollToMap) {
      mapAnchor.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      setScrollToMap(false);
    }
  }, [page, scrollToMap]);

  useEffect(() => {
    if (!routeId || page === "home" || page === "model") return;
    const url = new URL(window.location.href);
    const params = url.searchParams;
    params.set("route", routeId);
    params.set("direction", String(directionId));
    params.set("horizon", horizon);
    params.set("date", date);
    params.delete("dateFrom");
    params.delete("dateTo");
    const optional = { from: fromStopId, to: toStopId, stop: forecastStopId };
    Object.entries(optional).forEach(([key, value]) => value ? params.set(key, value) : params.delete(key));
    window.history.replaceState(null, "", `${url.pathname}?${params.toString()}#${page}`);
  }, [page, routeId, directionId, horizon, date, fromStopId, toStopId, forecastStopId]);

  useEffect(() => {
    const controller = new AbortController();
    getRoutes(controller.signal)
      .then((items) => {
        const sorted = supportedRoutes(items).sort(compareRoutes);
        setRoutes(sorted);
        setRouteId((current) => sorted.some((route) => route.id === current) ? current : (sorted[0]?.id ?? ""));
        if (!items.length) setError("Справочник маршрутов пуст.");
      })
      .catch((failure: Error) => {
        if (!controller.signal.aborted) setError(failure.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoadingCatalog(false);
      });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    setStops([]);
    if (page === "home" || page === "model" || (page === "details" && splitCount > 1) || !routeId) return;
    const controller = new AbortController();
    setLoadingStops(true);
    getStops(routeId, controller.signal)
      .then((items) => {
        if (!controller.signal.aborted) {
          setStops(items);
          setFromStopId((current) => items.some((stop) => stop.id === current) ? current : "");
          setToStopId((current) => items.some((stop) => stop.id === current) ? current : "");
          setForecastStopId((current) => items.some((stop) => stop.id === current) ? current : "");
        }
      })
      .catch((failure: unknown) => {
        if (!controller.signal.aborted) setError(failureMessage(failure));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoadingStops(false);
      });
    return () => controller.abort();
  }, [routeId, splitCount, page]);

  useEffect(() => {
    if (page !== "details") return;
    if (settledFilters.routeId !== routeId || settledFilters.horizon !== horizon || settledFilters.date !== date) {
      setBusy(false);
      return;
    }
    if (splitCount > 1 || !settledFilters.routeId || !settledFilters.date) {
      setMapForecast(null);
      setBusy(false);
      setError("");
      return;
    }
    const controller = new AbortController();
    const timestamp = snapshotTimestamp(settledFilters.date, settledFilters.horizon);
    setBusy(true);
    setError("");
    getMapForecast({ route_id: settledFilters.routeId, horizon: settledFilters.horizon, timestamp, forecast_origin: timestamp }, controller.signal)
      .then((data) => { if (!controller.signal.aborted) setMapForecast(data); })
      .catch((failure: unknown) => { if (!controller.signal.aborted) setError(failureMessage(failure)); })
      .finally(() => { if (!controller.signal.aborted) setBusy(false); });

    return () => controller.abort();
  }, [page, settledFilters.routeId, settledFilters.horizon, settledFilters.date, routeId, horizon, date, retry, splitCount]);

  useEffect(() => {
    if (page !== "details" || splitCount > 1) return;
    if (settledFilters.routeId !== routeId || settledFilters.horizon !== horizon || settledFilters.date !== date) {
      setForecastBusy(false);
      return;
    }
    if (!settledFilters.routeId || !settledFilters.date) {
      setRouteForecast(null);
      setForecastError("");
      setForecastBusy(false);
      return;
    }
    const controller = new AbortController();
    const range = modelPeriodRequest(settledFilters.date, settledFilters.horizon);
    setForecastError("");
    setForecastBusy(true);
    getForecast({ route_id: settledFilters.routeId, horizon: settledFilters.horizon,
      resolution: range.resolution, from: range.from, to: range.to, forecast_origin: range.from }, controller.signal)
      .then((data) => { if (!controller.signal.aborted) setRouteForecast(data); })
      .catch((failure: unknown) => { if (!controller.signal.aborted) setForecastError(failureMessage(failure)); })
      .finally(() => { if (!controller.signal.aborted) setForecastBusy(false); });
    return () => controller.abort();
  }, [page, splitCount, settledFilters.routeId, settledFilters.horizon, settledFilters.date, routeId, horizon, date, retry]);

  useEffect(() => {
    if (page !== "analytics" || !routes.length) return;
    if (settledFilters.horizon !== horizon || settledFilters.date !== date) {
      setNetworkBusy(false);
      return;
    }
    if (!settledFilters.date) {
      setNetworkForecast(null);
      setNetworkRouteForecasts([]);
      setNetworkError("");
      setNetworkBusy(false);
      return;
    }
    const controller = new AbortController();
    const timestamp = snapshotTimestamp(settledFilters.date, settledFilters.horizon);
    const range = modelPeriodRequest(settledFilters.date, settledFilters.horizon);
    setNetworkBusy(true);
    setNetworkError("");
    Promise.all([
      getMapForecast({ horizon: settledFilters.horizon, timestamp, forecast_origin: timestamp }, controller.signal),
      Promise.all(routes.map((route) => getForecast({ route_id: route.id, horizon: settledFilters.horizon,
        resolution: range.resolution, from: range.from, to: range.to, forecast_origin: range.from }, controller.signal))),
    ])
      .then(([mapData, forecasts]) => { if (!controller.signal.aborted) {
        setNetworkForecast(supportedNetworkSnapshot(mapData));
        setNetworkRouteForecasts(forecasts);
      } })
      .catch((failure: unknown) => { if (!controller.signal.aborted) setNetworkError(failureMessage(failure)); })
      .finally(() => { if (!controller.signal.aborted) setNetworkBusy(false); });
    return () => controller.abort();
  }, [page, settledFilters.horizon, settledFilters.date, horizon, date, retry, routes]);

  return (
    <>
      <Header page={page} onNavigate={navigate} theme={theme}
        onThemeToggle={() => setTheme((value) => value === "dark" ? "light" : "dark")} />
      <main className={`app-main app-main--${page}`}>
        {(page === "home" || page === "model") && <TransitBackdrop className="page-backdrop" />}
        {page === "home" ? <HomePage onNavigate={navigate} /> : page === "model" ? <ModelPage /> : <div className={page === "details" ? "workspace-page" : "analytics-page"}>
        <h1 className="sr-only">{page === "details" ? "Мониторинг маршрута" : "Трамвайная сеть"}</h1>

        {page === "details" && splitCount > 1 && (routes.length
          ? <SplitWorkspace routes={routes} theme={theme}
            initialCount={splitCount as 2 | 3 | 4} initialEdge={splitEdge} initialConfig={{ routeId, horizon, date, directionId }}
            onOpenDetails={closeSplit} onClose={closeSplit} />
          : <p className="network-status" role="status">Загружаем маршруты для Split View…</p>)}

        {page === "details" && splitCount === 1 && <div ref={mapAnchor}>
          <RouteDetailsDashboard
            route={routes.find((r) => r.id === routeId)}
            snapshot={mapForecast}
            stops={stops}
            segment={segment}
            directionId={fromStop?.direction_id ?? directionId}
            startStopId={segment?.from.id ?? forecastStopId}
            selectedStopId={focusedPoint?.stop_id ?? forecastStopId}
            focusedPoint={focusedPoint}
            busy={busy}
            forecast={routeForecast}
            forecastBusy={forecastBusy}
            forecastError={forecastError}
            forecastLabel={undefined}
            horizon={settledFilters.horizon}
            onSelectStop={(point) => {
              setFocusedPoint(point);
              setFromStopId(point.stop_id);
              setToStopId("");
              setDirectionId(point.direction_id);
              setForecastStopId(point.stop_id);
            }}
            onRetryForecast={() => setRetry((value) => value + 1)}
            onSplit={(edge) => { setSplitEdge(edge); setSplitCount(2); }}
            theme={theme}
            controls={<Sidebar
              routes={routes}
              stops={stops}
              routeId={routeId}
              fromStopId={fromStopId}
              toStopId={toStopId}
              horizon={horizon}
              date={date}
              busy={busy}
              loadingCatalog={loadingCatalog}
              loadingStops={loadingStops}
              onRouteChange={(id) => {
                setFocusedPoint(null);
                setStops([]);
                setDirectionId(0);
                setFromStopId("");
                setToStopId("");
                setForecastStopId("");
                setMapForecast(null);
                setRouteForecast(null);
                setRouteId(id);
              }}
              onFromStopChange={(id) => {
                setFocusedPoint(null);
                setFromStopId(id);
                setToStopId("");
                setForecastStopId(id);
              }}
              onToStopChange={(id) => { setFocusedPoint(null); setToStopId(id); }}
              onHorizonChange={(value) => { setFocusedPoint(null); setHorizon(value); }}
              onDateChange={(value) => { setFocusedPoint(null); setDate(value); }}
            />}
          />
        </div>}

        {page === "details" && splitCount === 1 && error && (
          <p className="error" role="alert">
            {error} Проверьте backend и нажмите «Повторить».
          </p>
        )}

        {page === "analytics" && <RankingsPanel
          routes={routes}
          selectedRouteId={networkRouteFocused ? routeId : ""}
          // The network view has no stop filter; a stop chosen in Monitoring must not carry over.
          selectedStop={null}
          networkData={networkForecast}
          routeForecasts={networkRouteForecasts}
          networkBusy={networkBusy}
          networkError={networkError}
          onSelectRoute={(id) => {
            setFocusedPoint(null);
            setStops([]);
            setFromStopId("");
            setToStopId("");
            setForecastStopId("");
            setRouteId(id);
            setDirectionId(0);
            setScrollToMap(true);
            navigate("details");
          }}
          onSelectStop={(point) => {
            setFocusedPoint(point);
            setStops([]);
            setFromStopId("");
            setToStopId("");
            setForecastStopId(point.stop_id);
            setRouteId(point.route_id);
            setDirectionId(point.direction_id);
            setScrollToMap(true);
            navigate("details");
          }}
          onRetry={() => setRetry((value) => value + 1)}
          theme={theme}
          controls={<Sidebar
            mode="analytics"
            routes={routes}
            stops={stops}
            routeId={routeId}
            fromStopId={fromStopId}
            toStopId={toStopId}
            horizon={horizon}
            date={date}
            busy={networkBusy}
            loadingCatalog={loadingCatalog}
            loadingStops={loadingStops}
            onRouteChange={(id) => { setStops([]); setRouteId(id); setFromStopId(""); setNetworkRouteFocused(true); }}
            onFromStopChange={(id) => { setFromStopId(id); setNetworkRouteFocused(true); }}
            onToStopChange={setToStopId}
            onHorizonChange={setHorizon}
            onDateChange={setDate}
          />}
        />}

        </div>}

        <footer className="site-footer">
          <div><strong>Трамвай / Прогноз</strong><span>Командный проект для Хакатона Московского транспорта · 2026</span></div>
          <div><span>Контракт прогноза v1 · Москва, UTC+3</span><a href="/api/docs" target="_blank" rel="noreferrer">Документация API ↗</a></div>
        </footer>
      </main>
    </>
  );
}
