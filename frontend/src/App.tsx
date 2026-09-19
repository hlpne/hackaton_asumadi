import { useEffect, useRef, useState, type FormEvent } from "react";
import { getForecast, getRoutes, getStops } from "./api";
import type { ForecastResponse, Horizon, Route, RouteStop } from "./types";
import { Header } from "./components/layout/Header";
import { Sidebar } from "./components/layout/Sidebar";
import { MapView } from "./components/map/MapView";
import { LoadChart } from "./components/analytics/LoadChart";
import { TopOverloadPanel } from "./components/analytics/TopOverloadPanel";
import { ForecastModal } from "./components/analytics/ForecastModal";
import { horizons, resolutions } from "./constants";

const formatter = new Intl.DateTimeFormat("ru-RU", {
  timeZone: "Europe/Moscow",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

function toIso(date: Date): string {
  return `${date.toISOString().slice(0, 10)}T00:00:00+03:00`;
}

function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function addYears(date: string, years: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCFullYear(d.getUTCFullYear() + years);
  return d.toISOString().slice(0, 10);
}

function rangeFor(
  horizon: Horizon,
  date: string,
  dateFrom: string,
  dateTo: string
): { from: string; to: string } {
  if (horizon === "month") {
    return { from: toIso(new Date(dateFrom)), to: toIso(new Date(dateTo)) };
  }
  if (horizon === "day") {
    return {
      from: toIso(new Date(date)),
      to: toIso(new Date(addDays(date, 1))),
    };
  }
  // year
  return {
    from: toIso(new Date(date)),
    to: toIso(new Date(addYears(date, 1))),
  };
}

export default function App() {
  const [routes, setRoutes] = useState<Route[]>([]);
  const [stops, setStops] = useState<RouteStop[]>([]);
  const [routeId, setRouteId] = useState("");
  const [stopId, setStopId] = useState("");
  const [horizon, setHorizon] = useState<Horizon>("day");
  const [date, setDate] = useState("2026-09-26");
  const [dateFrom, setDateFrom] = useState("2026-09-01");
  const [dateTo, setDateTo] = useState("2026-10-01");
  const [forecast, setForecast] = useState<ForecastResponse | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [loadingCatalog, setLoadingCatalog] = useState(true);
  const [loadingStops, setLoadingStops] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
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
    setModalOpen(false);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (horizon === "month" && dateFrom > dateTo) {
      setError("Дата начала не может быть позже даты конца.");
      return;
    }
    pending.current?.abort();
    const controller = new AbortController();
    pending.current = controller;
    setBusy(true);
    setError("");
    setForecast(null);
    try {
      const { from, to } = rangeFor(horizon, date, dateFrom, dateTo);
      const response = await getForecast(
        {
          route_id: routeId,
          stop_id: stopId || undefined,
          horizon,
          from,
          to,
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
          dateFrom={dateFrom}
          dateTo={dateTo}
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
          onDateFromChange={(value) => {
            invalidate();
            setDateFrom(value);
          }}
          onDateToChange={(value) => {
            invalidate();
            setDateTo(value);
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
              <div className="summary">
                <span>
                  Точек: <strong>{forecast.points.length}</strong>
                </span>
                <span>
                  Начало:{" "}
                  <strong>{formatter.format(new Date(forecast.points[0].timestamp))}</strong>
                </span>
              </div>

              <LoadChart forecast={forecast} />
              <TopOverloadPanel points={forecast.points} />

              <div className="result-actions">
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setModalOpen(true)}
                >
                  Показать таблицу
                </button>
              </div>
            </>
          )}
        </section>

        {modalOpen && forecast && (
          <ForecastModal forecast={forecast} onClose={() => setModalOpen(false)} />
        )}

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