import { useEffect, useRef, useState, type FormEvent } from "react";
import { getForecast, getRoutes, getStops } from "./api";
import type { ForecastResponse, Horizon, Route, RouteStop } from "./types";
import { Header } from "./components/layout/Header";
import { Sidebar } from "./components/layout/Sidebar";
import { MapView } from "./components/map/MapView";
import { LoadChart } from "./components/analytics/LoadChart";
import { TopOverloadPanel } from "./components/analytics/TopOverloadPanel";
import { ForecastTable } from "./components/analytics/ForecastTable";
import { horizons, resolutions } from "./constants";

const formatter = new Intl.DateTimeFormat("ru-RU", {
  timeZone: "Europe/Moscow",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

function dateRange(date: string, horizon: Horizon) {
  const [year, month, day] = date.split("-").map(Number);
  const start = new Date(Date.UTC(year, month - 1, horizon === "day" ? day : 1));
  const end = new Date(start);
  if (horizon === "day") end.setUTCDate(end.getUTCDate() + 1);
  if (horizon === "month") end.setUTCMonth(end.getUTCMonth() + 1);
  if (horizon === "year") end.setUTCFullYear(end.getUTCFullYear() + 1);
  const localMidnight = (value: Date) =>
    `${value.toISOString().slice(0, 10)}T00:00:00+03:00`;
  return { from: localMidnight(start), to: localMidnight(end) };
}

export default function App() {
  const [routes, setRoutes] = useState<Route[]>([]);
  const [stops, setStops] = useState<RouteStop[]>([]);
  const [routeId, setRouteId] = useState("");
  const [stopId, setStopId] = useState("");
  const [horizon, setHorizon] = useState<Horizon>("day");
  const [date, setDate] = useState("2026-09-26");
  const [forecast, setForecast] = useState<ForecastResponse | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [loadingCatalog, setLoadingCatalog] = useState(true);
  const [loadingStops, setLoadingStops] = useState(false);
  const pending = useRef<AbortController | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    getRoutes(controller.signal)
      .then((items) => {
        setRoutes(items);
        setRouteId(items[0]?.id ?? "");
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
    if (!routeId) return;
    const controller = new AbortController();
    setStops([]);
    setLoadingStops(true);
    getStops(routeId, controller.signal)
      .then(setStops)
      .catch((failure: Error) => {
        if (!controller.signal.aborted) setError(failure.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoadingStops(false);
      });
    return () => controller.abort();
  }, [routeId]);

  useEffect(() => () => pending.current?.abort(), []);

  function invalidate() {
    pending.current?.abort();
    setBusy(false);
    setForecast(null);
    setError("");
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    pending.current?.abort();
    const controller = new AbortController();
    pending.current = controller;
    setBusy(true);
    setError("");
    setForecast(null);
    try {
      const response = await getForecast(
        {
          route_id: routeId,
          stop_id: stopId || undefined,
          horizon,
          ...dateRange(date, horizon),
        },
        controller.signal
      );
      if (!controller.signal.aborted) setForecast(response);
    } catch (failure) {
      if (!controller.signal.aborted)
        setError(
          failure instanceof Error ? failure.message : "Не удалось получить прогноз."
        );
    } finally {
      if (!controller.signal.aborted) setBusy(false);
    }
  }

  return (
    <>
      <Header />
      <main>
        <div className="intro">
          <p className="eyebrow">ПАССАЖИРОПОТОК</p>
          <h1>Проверка прогноза</h1>
          <p>Выберите маршрут и период. Время указано по Москве.</p>
        </div>

        <Sidebar
          routes={routes}
          stops={stops}
          routeId={routeId}
          stopId={stopId}
          horizon={horizon}
          date={date}
          busy={busy}
          loadingCatalog={loadingCatalog}
          loadingStops={loadingStops}
          onRouteChange={(id) => {
            invalidate();
            setStopId("");
            setRouteId(id);
          }}
          onStopChange={(id) => {
            invalidate();
            setStopId(id);
          }}
          onHorizonChange={(value) => {
            invalidate();
            setHorizon(value);
          }}
          onDateChange={(value) => {
            invalidate();
            setDate(value);
          }}
          onSubmit={submit}
        />

        <MapView
          route={routes.find((r) => r.id === routeId)}
          stops={stops}
          selectedStopId={stopId}
        />

        {error && (
          <p className="error" role="alert">
            {error} Проверьте запуск backend и повторите запрос; для справочников
            обновите страницу.
          </p>
        )}

        <section className="result" aria-busy={busy} aria-live="polite">
          {!forecast ? (
            <div className="empty">
              <span className="empty-mark" aria-hidden="true">
                01
              </span>
              <h2>{busy ? "Получаем прогноз" : "Прогноз появится здесь"}</h2>
              <p>
                Стартовый сервис использует синтетические данные для проверки
                взаимодействия компонентов.
              </p>
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
              <TopOverloadPanel points={forecast.points} />
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
