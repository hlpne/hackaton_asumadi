import { useEffect, useRef, useState } from "react";
import { getForecast, getMapForecast, getRoutes, getStops, getTopOverload } from "./api";
import type { ForecastResponse, Horizon, MapForecastPoint, MapForecastResponse, Route, RouteStop, TopOverloadResponse } from "./types";
import { Header } from "./components/layout/Header";
import { Sidebar } from "./components/layout/Sidebar";
import { MapView } from "./components/map/MapView";
import { LoadChart } from "./components/analytics/LoadChart";
import { RankingsPanel } from "./components/analytics/RankingsPanel";
import { ForecastTable } from "./components/analytics/ForecastTable";
import { horizons, resolutions } from "./constants";
import { buildRouteSegment } from "./routeSegment";

const formatter = new Intl.DateTimeFormat("ru-RU", {
  timeZone: "Europe/Moscow",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

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

function dateRange(date: string, horizon: Horizon, startTime: string, endTime: string) {
  if (horizon === "day") {
    return { from: `${date}T${startTime}:00+03:00`, to: `${date}T${endTime}:00+03:00` };
  }
  const [year, month] = date.split("-").map(Number);
  const start = new Date(Date.UTC(year, month - 1, 1));
  const end = new Date(start);
  if (horizon === "month") {
    end.setUTCMonth(end.getUTCMonth() + 1);
  } else {
    end.setUTCFullYear(end.getUTCFullYear() + 1);
  }
  const moscowTime = (value: Date) => `${value.toISOString().slice(0, 13)}:00:00+03:00`;
  return { from: moscowTime(start), to: moscowTime(end) };
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

export default function App() {
  const [routes, setRoutes] = useState<Route[]>([]);
  const [stops, setStops] = useState<RouteStop[]>([]);
  const [routeId, setRouteId] = useState("");
  const [fromStopId, setFromStopId] = useState("");
  const [toStopId, setToStopId] = useState("");
  const [horizon, setHorizon] = useState<Horizon>("day");
  const [date, setDate] = useState(currentMoscowDate);
  const [startTime, setStartTime] = useState(currentMoscowTime);
  const [endTime, setEndTime] = useState("23:59");
  const [retry, setRetry] = useState(0);
  const [forecast, setForecast] = useState<ForecastResponse | null>(null);
  const [mapForecast, setMapForecast] = useState<MapForecastResponse | null>(null);
  const [topOverload, setTopOverload] = useState<TopOverloadResponse | null>(null);
  const [topError, setTopError] = useState("");
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
    if (!routeId || !date || (horizon === "day" &&
      (!validTime(startTime) || !validTime(endTime) || startTime >= endTime))) {
      setForecast(null);
      setMapForecast(null);
      setTopOverload(null);
      setTopError("");
      setBusy(false);
      setError("");
      return;
    }
    const controller = new AbortController();
    const range = dateRange(date, horizon, startTime, endTime);
    setBusy(true);
    setError("");
    setForecast(null);
    setMapForecast(null);
    setTopOverload(null);
    setTopError("");

    void Promise.allSettled([
      getForecast(
        {
          route_id: routeId,
          stop_id: segment?.from.id,
          direction_id: segment?.directionId,
          horizon,
          resolution: horizon === "day" ? "PT1M" : undefined,
          ...range,
        },
        controller.signal,
      ),
      getMapForecast(
        { route_id: routeId, direction_id: segment?.directionId, horizon, timestamp: range.from, forecast_origin: range.from },
        controller.signal,
      ),
      getTopOverload(
        { route_id: routeId, direction_id: segment?.directionId, horizon, timestamp: range.from, forecast_origin: range.from, limit: 5 },
        controller.signal,
      ),
    ]).then(([seriesResult, mapResult, topResult]) => {
      if (controller.signal.aborted) return;
      if (seriesResult.status === "fulfilled") setForecast(seriesResult.value);
      if (mapResult.status === "fulfilled") setMapForecast(mapResult.value);
      if (topResult.status === "fulfilled") setTopOverload(topResult.value);
      else setTopError(failureMessage(topResult.reason));
      const failures = [seriesResult, mapResult]
        .filter((result): result is PromiseRejectedResult => result.status === "rejected")
        .map((result) => failureMessage(result.reason));
      if (failures.length) setError([...new Set(failures)].join(" "));
      setBusy(false);
    });

    return () => controller.abort();
  }, [routeId, fromStopId, toStopId, stops, horizon, date, startTime, endTime, retry]);

  useEffect(() => {
    if (!date || (horizon === "day" &&
      (!validTime(startTime) || !validTime(endTime) || startTime >= endTime))) {
      setNetworkForecast(null);
      setNetworkError("");
      setNetworkBusy(false);
      return;
    }
    const controller = new AbortController();
    const range = dateRange(date, horizon, startTime, endTime);
    setNetworkBusy(true);
    setNetworkError("");
    setNetworkForecast(null);
    getMapForecast({ horizon, timestamp: range.from, forecast_origin: range.from }, controller.signal)
      .then((data) => { if (!controller.signal.aborted) setNetworkForecast(data); })
      .catch((failure: unknown) => { if (!controller.signal.aborted) setNetworkError(failureMessage(failure)); })
      .finally(() => { if (!controller.signal.aborted) setNetworkBusy(false); });
    return () => controller.abort();
  }, [horizon, date, startTime, endTime, retry]);

  return (
    <>
      <Header />
      <main>
        <div className="intro">
          <p className="eyebrow">ПАССАЖИРОПОТОК</p>
          <h1>Карта и прогноз загрузки</h1>
          <p>Выберите маршрут и период. Карта и график получают данные из backend API; время указано по Москве.</p>
        </div>

        <Sidebar
          routes={routes}
          stops={stops}
          routeId={routeId}
          fromStopId={fromStopId}
          toStopId={toStopId}
          horizon={horizon}
          date={date}
          startTime={startTime}
          endTime={endTime}
          busy={busy}
          loadingCatalog={loadingCatalog}
          loadingStops={loadingStops}
          onRouteChange={(id) => {
            setFocusedPoint(null);
            setFromStopId("");
            setToStopId("");
            setRouteId(id);
          }}
          onFromStopChange={(id) => {
            setFocusedPoint(null);
            setFromStopId(id);
            setToStopId("");
          }}
          onToStopChange={(id) => { setFocusedPoint(null); setToStopId(id); }}
          onHorizonChange={(value) => { setFocusedPoint(null); setHorizon(value); }}
          onDateChange={(value) => { setFocusedPoint(null); setDate(value); }}
          onStartTimeChange={(value) => { setFocusedPoint(null); setStartTime(value); }}
          onEndTimeChange={(value) => { setFocusedPoint(null); setEndTime(value); }}
          onRefresh={() => setRetry((value) => value + 1)}
        />

        <div ref={mapAnchor}>
          <MapView
            route={routes.find((r) => r.id === routeId)}
            snapshot={mapForecast}
            stops={stops}
            segment={segment}
            selectedStopId={focusedPoint?.stop_id ?? fromStopId}
            focusedPoint={focusedPoint}
            busy={busy}
            onStopSelect={(id) => {
              setFocusedPoint(null);
              setFromStopId(id);
              setToStopId("");
            }}
          />
        </div>

        {error && (
          <p className="error" role="alert">
            {error} Проверьте backend и нажмите «Повторить».
          </p>
        )}

        <RankingsPanel
          routeData={topOverload}
          routeBusy={busy}
          routeError={topError}
          networkData={networkForecast}
          networkBusy={networkBusy}
          networkError={networkError}
          routeName={routes.find((route) => route.id === routeId)?.name ?? ""}
          selectedRouteId={routeId}
          selectedPoint={focusedPoint}
          onSelectRoute={(id) => {
            setFocusedPoint(null);
            setFromStopId("");
            setToStopId("");
            setRouteId(id);
            mapAnchor.current?.scrollIntoView({ behavior: "smooth", block: "start" });
          }}
          onSelectStop={(point) => {
            setFocusedPoint(point);
            setFromStopId("");
            setToStopId("");
            setRouteId(point.route_id);
            mapAnchor.current?.scrollIntoView({ behavior: "smooth", block: "start" });
          }}
          onRetry={() => setRetry((value) => value + 1)}
        />

        <section className="result" aria-busy={busy} aria-live="polite">
          {!forecast || !forecast.points.length ? (
            <div className="empty">
              <span className="empty-mark" aria-hidden="true">
                01
              </span>
              <h2>{busy ? "Получаем прогноз" : "Нет данных для выбранных фильтров"}</h2>
              <p>Измените маршрут или период либо повторите запрос.</p>
            </div>
          ) : (
            <>
              <div className="result-title">
                <div>
                  <p className="eyebrow">
                    {forecast.is_mock ? "ДЕМОНСТРАЦИОННЫЕ ДАННЫЕ" : "ПРОГНОЗ МОДЕЛИ"}
                  </p>
                  <h2>
                    {horizons[forecast.horizon]} · шаг {resolutions[forecast.resolution]}
                  </h2>
                  {segment && <p>Участок: {segment.from.name} → {segment.to.name}. График показывает загрузку у начальной остановки.</p>}
                </div>
                <span className="version">{forecast.model_version}</span>
              </div>
              <p className="explanation">
                {forecast.value_unit === "demo_index"
                  ? "Условный индекс: эти значения не являются числом пассажиров или процентом заполнения."
                  : `Единица показателя: ${forecast.value_unit}.`}
              </p>
              <div className="summary">
                <span>
                  Точек: <strong>{forecast.points.length}</strong>
                </span>
                <span>
                  Начало:{" "}
                  <strong>{formatter.format(new Date(forecast.points[0].timestamp))}</strong>
                </span>
                <span>
                  Границы:{" "}
                  <strong>
                    {forecast.points.some((point) => point.lower_bound !== null)
                      ? forecast.interval_level === null
                        ? forecast.is_mock
                          ? "иллюстративные"
                          : "уровень не указан"
                        : `${forecast.interval_level * 100}%`
                      : "не переданы"}
                  </strong>
                </span>
              </div>
              <LoadChart forecast={forecast} />
              <ForecastTable forecast={forecast} />
            </>
          )}
        </section>

        <footer>
          <span>Контракт прогноза v1 · Москва, UTC+3</span>
          <a href="/api/docs" target="_blank" rel="noreferrer">
            Документация API ↗
          </a>
        </footer>
      </main>
    </>
  );
}
