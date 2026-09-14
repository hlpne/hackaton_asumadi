import { useEffect, useRef, useState, type FormEvent } from "react";
import { getForecast, getRoutes, getStops } from "./api";
import type { ForecastResponse, Horizon, Route, RouteStop } from "./types";

const horizons: Record<Horizon, string> = { day: "1 день", month: "1 месяц", year: "1 год" };
const resolutions = { PT1H: "1 час", P1D: "1 день", P1M: "1 месяц" };
const formatter = new Intl.DateTimeFormat("ru-RU", { timeZone: "Europe/Moscow", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
const number = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2 });

function dateRange(date: string, horizon: Horizon) {
  const [year, month, day] = date.split("-").map(Number);
  const start = new Date(Date.UTC(year, month - 1, horizon === "day" ? day : 1));
  const end = new Date(start);
  if (horizon === "day") end.setUTCDate(end.getUTCDate() + 1);
  if (horizon === "month") end.setUTCMonth(end.getUTCMonth() + 1);
  if (horizon === "year") end.setUTCFullYear(end.getUTCFullYear() + 1);
  const localMidnight = (value: Date) => `${value.toISOString().slice(0, 10)}T00:00:00+03:00`;
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
    getRoutes(controller.signal).then((items) => {
      setRoutes(items);
      setRouteId(items[0]?.id ?? "");
      if (!items.length) setError("Справочник маршрутов пуст.");
    }).catch((failure: Error) => {
      if (!controller.signal.aborted) setError(failure.message);
    }).finally(() => { if (!controller.signal.aborted) setLoadingCatalog(false); });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!routeId) return;
    const controller = new AbortController();
    setStops([]);
    setLoadingStops(true);
    getStops(routeId, controller.signal).then(setStops).catch((failure: Error) => {
      if (!controller.signal.aborted) setError(failure.message);
    }).finally(() => { if (!controller.signal.aborted) setLoadingStops(false); });
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
      const response = await getForecast({ route_id: routeId, stop_id: stopId || undefined, horizon, ...dateRange(date, horizon) }, controller.signal);
      if (!controller.signal.aborted) setForecast(response);
    } catch (failure) {
      if (!controller.signal.aborted) setError(failure instanceof Error ? failure.message : "Не удалось получить прогноз.");
    } finally {
      if (!controller.signal.aborted) setBusy(false);
    }
  }

  const uniqueStops = [...new Map(stops.map(stop => [stop.id, stop])).values()];
  return (
    <>
      <header className="topbar"><span className="wordmark">ТРАМВАЙ<span className="accent"> / </span>ПРОГНОЗ</span><span className="stage">Прототип команды · v0.1</span></header>
      <main>
        <div className="intro"><p className="eyebrow">ПАССАЖИРОПОТОК</p><h1>Проверка прогноза</h1><p>Выберите маршрут и период. Время указано по Москве.</p></div>
        <form onSubmit={submit} className="filters" aria-label="Параметры прогноза">
          <label>Маршрут<select value={routeId} disabled={loadingCatalog || !routes.length} onChange={event => { invalidate(); setStopId(""); setRouteId(event.target.value); }} required>
            {!routes.length && <option value="">{loadingCatalog ? "Загрузка…" : "Нет маршрутов"}</option>}
            {routes.map(route => <option key={route.id} value={route.id}>{route.name}</option>)}
          </select></label>
          <label>Остановка<select value={stopId} disabled={loadingStops || !routeId} onChange={event => { invalidate(); setStopId(event.target.value); }}>
            <option value="">Весь маршрут</option>{uniqueStops.map(stop => <option key={stop.id} value={stop.id}>{stop.name}</option>)}
          </select></label>
          <label>Горизонт<select value={horizon} onChange={event => { invalidate(); setHorizon(event.target.value as Horizon); }}>
            {Object.entries(horizons).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
          </select></label>
          <label>Дата<input type="date" min="2000-01-01" max="2098-12-31" value={date} onChange={event => { invalidate(); setDate(event.target.value); }} required /></label>
          <button type="submit" disabled={!routeId || !date || busy || loadingStops}>{busy ? "Загрузка…" : "Получить прогноз"}</button>
          <p className="period-note">Для месяца и года период начинается с первого числа выбранного месяца.</p>
        </form>
        {error && <p className="error" role="alert">{error} Проверьте запуск backend и повторите запрос; для справочников обновите страницу.</p>}
        <section className="result" aria-busy={busy} aria-live="polite">
          {!forecast ? <div className="empty"><span className="empty-mark" aria-hidden="true">01</span><h2>{busy ? "Получаем прогноз" : "Прогноз появится здесь"}</h2><p>Стартовый сервис использует синтетические данные для проверки взаимодействия компонентов.</p></div> : <>
            <div className="result-title"><div><p className="eyebrow">{forecast.is_mock ? "ДЕМОНСТРАЦИОННЫЕ ДАННЫЕ" : "ПРОГНОЗ МОДЕЛИ"}</p><h2>{horizons[forecast.horizon]} · шаг {resolutions[forecast.resolution]}</h2></div><span className="version">{forecast.model_version}</span></div>
            <p className="explanation">{forecast.value_unit === "demo_index" ? "Условный индекс: эти значения не являются числом пассажиров или процентом заполнения." : `Единица показателя: ${forecast.value_unit}.`}</p>
            <div className="summary"><span>Точек: <strong>{forecast.points.length}</strong></span><span>Начало: <strong>{formatter.format(new Date(forecast.points[0].timestamp))}</strong></span><span>Границы: <strong>{forecast.points.some(point => point.lower_bound !== null) ? (forecast.interval_level === null ? (forecast.is_mock ? "иллюстративные" : "уровень не указан") : `${forecast.interval_level * 100}%`) : "не переданы"}</strong></span></div>
            <div className="table-wrap"><table><caption>Прогноз по временным интервалам. Время в строке — начало интервала.</caption><thead><tr><th scope="col">Начало интервала, МСК</th><th scope="col">Индекс загрузки</th><th scope="col">Минимальная оценка</th><th scope="col">Максимальная оценка</th></tr></thead><tbody>{forecast.points.map(point => <tr key={point.timestamp}><td>{formatter.format(new Date(point.timestamp))}</td><td>{number.format(point.predicted_load)}</td><td>{point.lower_bound === null ? "—" : number.format(point.lower_bound)}</td><td>{point.upper_bound === null ? "—" : number.format(point.upper_bound)}</td></tr>)}</tbody></table></div>
          </>}
        </section>
        <footer><span>Контракт прогноза v1 · Москва, UTC+3</span><a href="/api/docs" target="_blank" rel="noreferrer">Документация API ↗</a></footer>
      </main>
    </>
  );
}
