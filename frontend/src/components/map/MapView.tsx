import { useCallback, useEffect, useMemo, useState } from "react";
import { getRouteGeometry } from "../../api";
import type { MapForecastResponse, Route, RouteGeometry, RouteStop } from "../../types";
import { YandexMap } from "./YandexMap";
import { clipRouteLines, type RouteSegment } from "../../routeSegment";

const LOAD_COLORS = {
  low: "#27825d",
  medium: "#d28a1e",
  high: "#d9444b",
};

function loadColor(value: number, snapshot: MapForecastResponse): string {
  if (snapshot.value_unit === "demo_index") {
    return value < 35 ? LOAD_COLORS.low : value < 55 ? LOAD_COLORS.medium : LOAD_COLORS.high;
  }
  const values = snapshot.points.map((point) => point.predicted_load);
  const min = Math.min(...values);
  const max = Math.max(...values);
  if (min === max) return LOAD_COLORS.medium;
  const relative = (value - min) / (max - min);
  return relative < 1 / 3 ? LOAD_COLORS.low : relative < 2 / 3 ? LOAD_COLORS.medium : LOAD_COLORS.high;
}

interface MapViewProps {
  route?: Route;
  snapshot: MapForecastResponse | null;
  stops: RouteStop[];
  segment: RouteSegment | null;
  selectedStopId: string;
  busy: boolean;
  onStopSelect: (stopId: string) => void;
}

export function MapView({ route, snapshot, stops, segment, selectedStopId, busy, onStopSelect }: MapViewProps) {
  const [geometry, setGeometry] = useState<RouteGeometry | null>(null);
  const [geometryError, setGeometryError] = useState("");
  const [yandexError, setYandexError] = useState("");
  const onYandexError = useCallback((message: string) => setYandexError(message), []);
  const yandexKey = import.meta.env.VITE_YANDEX_MAPS_API_KEY?.trim() ?? "";

  useEffect(() => {
    setGeometry(null);
    setGeometryError("");
    if (!route) return;
    const controller = new AbortController();
    getRouteGeometry(route.id, segment?.directionId ?? 0, controller.signal)
      .then((data) => { if (!controller.signal.aborted) setGeometry(data); })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) setGeometryError(error instanceof Error ? error.message : "Не удалось загрузить геометрию");
      });
    return () => controller.abort();
  }, [route, segment?.directionId]);

  const displayGeometry = useMemo(() => {
    if (!geometry) return null;
    if (!segment) return geometry;
    if (geometry.direction_id !== segment.directionId) return null;
    const clipped = clipRouteLines(
      geometry.lines,
      stops.filter((stop) => stop.direction_id === segment.directionId),
      segment,
    );
    return { ...geometry, lines: clipped ?? [] };
  }, [geometry, stops, segment?.from.id, segment?.to.id]);

  const noDemoService = Boolean(snapshot?.is_mock && snapshot.horizon === "day" &&
    snapshot.points.length && snapshot.points.every((point) => point.predicted_load === 0));
  const points = snapshot?.is_mock && snapshot.horizon === "day"
    ? snapshot.points.filter((point) => point.predicted_load > 0)
    : snapshot?.points ?? [];
  const forward = points.filter((point) => point.direction_id === (segment?.directionId ?? 0));
  const ordered = (segment
    ? forward.filter((point) => point.sequence >= segment.from.sequence && point.sequence <= segment.to.sequence)
    : forward.length ? forward : points).slice().sort((a, b) => a.sequence - b.sequence);
  const markers = [...new Map(ordered.map((point) => [point.stop_id, point])).values()];
  return (
    <section className="map-wrapper" aria-label="Карта маршрута и загрузки">
      <div className="map-heading">
        <div>
          <h2>Карта маршрута{route ? ` · ${route.name}` : ""}</h2>
          <p>{segment ? `Участок: ${segment.from.name} → ${segment.to.name}. ` : ""}Пути и остановки — геоданные OpenStreetMap; прогноз загрузки остаётся демонстрационным.</p>
        </div>
        {snapshot && <span className="map-time">{new Intl.DateTimeFormat("ru-RU", {
          timeZone: "Europe/Moscow", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit",
        }).format(new Date(snapshot.timestamp))} МСК</span>}
      </div>
      {yandexKey ? <YandexMap
        apiKey={yandexKey}
        geometry={displayGeometry}
        route={route}
        snapshot={snapshot}
        visibleStopIds={markers.map((point) => point.stop_id).join("|")}
        selectedStopId={selectedStopId}
        colorForValue={loadColor}
        onStopSelect={onStopSelect}
        onError={onYandexError}
      /> : <div className="map-container map-unavailable" role="alert">
        Для карты не задан VITE_YANDEX_MAPS_API_KEY. Подложка OpenStreetMap отключена.
      </div>}
      {geometryError && <p className="map-empty" role="alert">Не удалось получить линии маршрута: {geometryError}</p>}
      {segment && geometry && displayGeometry?.lines.length === 0 &&
        <p className="map-empty" role="alert">Для выбранного участка не удалось выделить путь из геометрии OSM.</p>}
      {yandexError && <p className="map-empty" role="alert">{yandexError} Подложка OpenStreetMap отключена.</p>}
      {noDemoService && <p className="map-empty" role="status">В это время рейсов нет по демонстрационному графику (примерно с 5:00 до 1:00 МСК). Точное расписание не подключено.</p>}
      {!snapshot?.points.length && <p className="map-empty" role="status">
        {busy ? "Загружаем остановки и прогноз…" : "Для выбранных фильтров нет данных карты."}
      </p>}
      <div className="map-legend" aria-label="Уровни загрузки">
        <span><i style={{ background: LOAD_COLORS.low }} /> Низкая{snapshot?.value_unit === "demo_index" ? " (< 35)" : ""}</span>
        <span><i style={{ background: LOAD_COLORS.medium }} /> Средняя{snapshot?.value_unit === "demo_index" ? " (35–54)" : ""}</span>
        <span><i style={{ background: LOAD_COLORS.high }} /> Высокая{snapshot?.value_unit === "demo_index" ? " (≥ 55)" : ""}</span>
      </div>
      <p className="map-note">Цвет отражает {snapshot?.value_unit === "demo_index" ? "условный индекс, не число пассажиров" : "относительный уровень прогноза"}. Геоданные © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap contributors (ODbL)</a>.</p>
    </section>
  );
}
