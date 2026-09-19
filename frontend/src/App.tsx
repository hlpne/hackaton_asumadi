import { useEffect, useRef, useState } from "react";
import { getMapForecast, getRoutes, getStops } from "./api";
import type { Horizon, MapForecastPoint, MapForecastResponse, Route, RouteStop } from "./types";
import { Header } from "./components/layout/Header";
import type { Page } from "./components/layout/Header";
import { HomePage } from "./components/layout/HomePage";
import { Sidebar } from "./components/layout/Sidebar";
import { RankingsPanel } from "./components/analytics/RankingsPanel";
import { RouteDetailsDashboard } from "./components/analytics/RouteDetailsDashboard";
import { buildRouteSegment } from "./routeSegment";

function currentMoscowDate(): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Moscow",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const part = (type: string) => parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function currentMoscowTime(): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Moscow",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date());
  const part = (type: string) => parts.find((item) => item.type === type)?.value ?? "00";
  return `${part("hour")}:${part("minute")}`;
}

function nextMonth(date: string): string {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCMonth(value.getUTCMonth() + 1);
  return value.toISOString().slice(0, 10);
}

function snapshotTimestamp(
  date: string,
  horizon: Horizon,
  startTime: string,
  dateFrom: string,
) : string {
  if (horizon === "day") {
    return `${date}T${startTime}:00+03:00`;
  }
  if (horizon === "month") {
    return `${dateFrom}T00:00:00+03:00`;
  }
  const [year, month] = date.split("-").map(Number);
  const start = new Date(Date.UTC(year, month - 1, 1));
  return `${start.toISOString().slice(0, 13)}:00:00+03:00`;
}

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

function validTime(value: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

function failureMessage(failure: unknown): string {
  return failure instanceof Error ? failure.message : "Не удалось получить данные от backend.";
}

function pageFromHash(): Page {
  const hash = window.location.hash.slice(1);
  return hash === "details" || hash === "analytics" ? hash : "home";
}

export default function App() {
  const [page, setPage] = useState<Page>(pageFromHash);
  const [scrollToMap, setScrollToMap] = useState(false);
  const [routes, setRoutes] = useState<Route[]>([]);
  const [stops, setStops] = useState<RouteStop[]>([]);
  const [routeId, setRouteId] = useState("");
  const [directionId, setDirectionId] = useState<0 | 1>(0);
  const [fromStopId, setFromStopId] = useState("");
  const [toStopId, setToStopId] = useState("");
  const [forecastStopId, setForecastStopId] = useState("");
  const [horizon, setHorizon] = useState<Horizon>("day");
  const [date, setDate] = useState(currentMoscowDate);
  const [dateFrom, setDateFrom] = useState(() => `${currentMoscowDate().slice(0, 7)}-01`);
  const [dateTo, setDateTo] = useState(() => nextMonth(`${currentMoscowDate().slice(0, 7)}-01`));
  const [startTime, setStartTime] = useState(currentMoscowTime);
  const [retry, setRetry] = useState(0);
  const [mapForecast, setMapForecast] = useState<MapForecastResponse | null>(null);
  const [networkForecast, setNetworkForecast] = useState<MapForecastResponse | null>(null);
  const [networkError, setNetworkError] = useState("");
  const [networkBusy, setNetworkBusy] = useState(false);
  const [focusedPoint, setFocusedPoint] = useState<MapForecastPoint | null>(null);
  const mapAnchor = useRef<HTMLDivElement>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [loadingCatalog, setLoadingCatalog] = useState(true);
  const [loadingStops, setLoadingStops] = useState(false);
  const segment = buildRouteSegment(stops, fromStopId, toStopId);

  function navigate(nextPage: Page) {
    setPage(nextPage);
    if (window.location.hash !== `#${nextPage}`) window.location.hash = nextPage;
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  useEffect(() => {
    const handleHashChange = () => {
      setPage(pageFromHash());
    };
    window.addEventListener("hashchange", handleHashChange);
    return () => window.removeEventListener("hashchange", handleHashChange);
  }, []);

  useEffect(() => {
    document.title = `${page === "home" ? "Главная" : page === "details" ? "Детализация" : "Аналитика"} · Трамвай / Прогноз`;
    if (page === "details" && scrollToMap) {
      mapAnchor.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      setScrollToMap(false);
    }
  }, [page, scrollToMap]);

  useEffect(() => {
    const controller = new AbortController();
    getRoutes(controller.signal)
      .then((items) => {
        const sorted = [...items].sort(compareRoutes);
        setRoutes(sorted);
        setRouteId(sorted[0]?.id ?? "");
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
    if (!routeId) return;
    const controller = new AbortController();
    setLoadingStops(true);
    getStops(routeId, controller.signal)
      .then((items) => {
        if (!controller.signal.aborted) setStops(items);
      })
      .catch((failure: unknown) => {
        if (!controller.signal.aborted) setError(failureMessage(failure));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoadingStops(false);
      });
    return () => controller.abort();
  }, [routeId]);

  useEffect(() => {
    if (!routeId || !date || (horizon === "month" && (!dateFrom || !dateTo || dateFrom >= dateTo)) || (horizon === "day" &&
      !validTime(startTime))) {
      setMapForecast(null);
      setBusy(false);
      setError("");
      return;
    }
    const controller = new AbortController();
    const timestamp = snapshotTimestamp(date, horizon, startTime, dateFrom);
    setBusy(true);
    setError("");
    setMapForecast(null);
    getMapForecast({ route_id: routeId, horizon, timestamp, forecast_origin: timestamp }, controller.signal)
      .then((data) => { if (!controller.signal.aborted) setMapForecast(data); })
      .catch((failure: unknown) => { if (!controller.signal.aborted) setError(failureMessage(failure)); })
      .finally(() => { if (!controller.signal.aborted) setBusy(false); });

    return () => controller.abort();
  }, [routeId, horizon, date, dateFrom, dateTo, startTime, retry]);

  useEffect(() => {
    if (page !== "analytics") return;
    if (!date || (horizon === "month" && (!dateFrom || !dateTo || dateFrom >= dateTo)) || (horizon === "day" &&
      !validTime(startTime))) {
      setNetworkForecast(null);
      setNetworkError("");
      setNetworkBusy(false);
      return;
    }
    const controller = new AbortController();
    const timestamp = snapshotTimestamp(date, horizon, startTime, dateFrom);
    setNetworkBusy(true);
    setNetworkError("");
    setNetworkForecast(null);
    getMapForecast({ horizon, timestamp, forecast_origin: timestamp }, controller.signal)
      .then((data) => { if (!controller.signal.aborted) setNetworkForecast(data); })
      .catch((failure: unknown) => { if (!controller.signal.aborted) setNetworkError(failureMessage(failure)); })
      .finally(() => { if (!controller.signal.aborted) setNetworkBusy(false); });
    return () => controller.abort();
  }, [page, horizon, date, dateFrom, dateTo, startTime, retry]);

  return (
    <>
      <Header page={page} onNavigate={navigate} />
      <main>
        {page === "home" ? <HomePage onNavigate={navigate} /> : <>
        {page === "details" ? <h1 className="sr-only">Детализация маршрута</h1> : <div className="intro">
          <p className="eyebrow">ПАССАЖИРОПОТОК</p>
          <h1>Аналитика трамвайной сети</h1>
          <p>Сравните маршруты и остановки по ожидаемой нагрузке. Выберите период и вид рейтинга.</p>
        </div>}

        <Sidebar
          mode={page === "analytics" ? "analytics" : "details"}
          routes={routes}
          stops={stops}
          routeId={routeId}
          directionId={directionId}
          fromStopId={fromStopId}
          toStopId={toStopId}
          horizon={horizon}
          date={date}
          dateFrom={dateFrom}
          dateTo={dateTo}
          startTime={startTime}
          busy={page === "analytics" ? networkBusy : busy}
          loadingCatalog={loadingCatalog}
          loadingStops={loadingStops}
          onRouteChange={(id) => {
            setFocusedPoint(null);
            setDirectionId(0);
            setFromStopId("");
            setToStopId("");
            setForecastStopId("");
            setMapForecast(null);
            setRouteId(id);
          }}
          onDirectionChange={(id) => {
            setFocusedPoint(null);
            setDirectionId(id);
            setFromStopId("");
            setToStopId("");
            setForecastStopId("");
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
          onDateFromChange={(value) => { setFocusedPoint(null); setDateFrom(value); }}
          onDateToChange={(value) => { setFocusedPoint(null); setDateTo(value); }}
          onStartTimeChange={(value) => { setFocusedPoint(null); setStartTime(value); }}
          onRefresh={() => setRetry((value) => value + 1)}
        />

        {page === "details" && <div ref={mapAnchor}>
          <RouteDetailsDashboard
            route={routes.find((r) => r.id === routeId)}
            snapshot={mapForecast}
            stops={stops}
            segment={segment}
            directionId={directionId}
            selectedStopId={focusedPoint?.stop_id ?? forecastStopId}
            focusedPoint={focusedPoint}
            busy={busy}
            onSelectStop={(point) => {
              setFocusedPoint(point);
              setDirectionId(point.direction_id);
              setForecastStopId(point.stop_id);
            }}
          />
        </div>}

        {page === "details" && error && (
          <p className="error" role="alert">
            {error} Проверьте backend и нажмите «Повторить».
          </p>
        )}

        {page === "analytics" && <RankingsPanel
          networkData={networkForecast}
          networkBusy={networkBusy}
          networkError={networkError}
          onSelectRoute={(id) => {
            setFocusedPoint(null);
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
            setFromStopId("");
            setToStopId("");
            setForecastStopId(point.stop_id);
            setRouteId(point.route_id);
            setDirectionId(point.direction_id);
            setScrollToMap(true);
            navigate("details");
          }}
          onRetry={() => setRetry((value) => value + 1)}
        />}

        </>}

        <footer className="site-footer">
          <div><strong>Трамвай / Прогноз</strong><span>Командный проект для Хакатона Московского транспорта · 2026</span></div>
          <div><span>Контракт прогноза v1 · Москва, UTC+3</span><a href="/api/docs" target="_blank" rel="noreferrer">Документация API ↗</a></div>
        </footer>
      </main>
    </>
  );
}
