import { useCallback, useEffect, useMemo, useState } from "react";
import { TramIcon } from "@phosphor-icons/react";
import { getRouteGeometry } from "../../api";
import type { MapForecastPoint, MapForecastResponse, Route, RouteGeometry, RouteStop } from "../../types";
import { YandexMap } from "./YandexMap";
import { clipRouteLines, type RouteSegment } from "../../routeSegment";
import { loadColor, loadColors } from "../../loadLevel";

const liveClockFormatter = new Intl.DateTimeFormat("ru-RU", {
  timeZone: "Europe/Moscow",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

const selectedTimeFormatter = new Intl.DateTimeFormat("ru-RU", {
  timeZone: "Europe/Moscow",
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

interface MapViewProps {
  route?: Route;
  snapshot: MapForecastResponse | null;
  stops: RouteStop[];
  segment: RouteSegment | null;
  directionId: 0 | 1;
  selectedStopId: string;
  focusedPoint: MapForecastPoint | null;
  busy: boolean;
  onStopSelect: (stopId: string) => void;
}

export function MapView({ route, snapshot, stops, segment, directionId, selectedStopId, focusedPoint, busy, onStopSelect }: MapViewProps) {
  const [geometry, setGeometry] = useState<RouteGeometry | null>(null);
  const [geometryError, setGeometryError] = useState("");
  const [yandexError, setYandexError] = useState("");
  const [now, setNow] = useState(() => new Date());
  const onYandexError = useCallback((message: string) => setYandexError(message), []);
  const yandexKey = import.meta.env.VITE_YANDEX_MAPS_API_KEY?.trim() ?? "";

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    setGeometry(null);
    setGeometryError("");
    if (!route) return;
    const controller = new AbortController();
    getRouteGeometry(route.id, focusedPoint?.direction_id ?? segment?.directionId ?? directionId, controller.signal)
      .then((data) => { if (!controller.signal.aborted) setGeometry(data); })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) setGeometryError(error instanceof Error ? error.message : "Не удалось загрузить геометрию");
      });
    return () => controller.abort();
  }, [route, segment?.directionId, focusedPoint?.direction_id, directionId]);

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
  const forward = points.filter((point) => point.direction_id === (focusedPoint?.direction_id ?? segment?.directionId ?? directionId));
  const ordered = (segment
    ? forward.filter((point) => point.sequence >= segment.from.sequence && point.sequence <= segment.to.sequence)
    : forward.length ? forward : points).slice().sort((a, b) => a.sequence - b.sequence);
  const markers = [...new Map(ordered.map((point) => [point.stop_id, point])).values()];
  return (
    <section className="map-wrapper" aria-label="Карта маршрута и загрузки">
      <div className="map-heading">
        <div>
          <h2><TramIcon weight="bold" aria-hidden="true" />Карта маршрута{route ? ` · ${route.name}` : ""}</h2>
          <p>{segment ? `Участок: ${segment.from.name} → ${segment.to.name}. ` : ""}Выберите остановку на карте или в списке справа, чтобы выделить её.</p>
        </div>
        <div className="map-clock">
          <span>Сейчас в Москве</span>
          <time dateTime={now.toISOString()}>{liveClockFormatter.format(now)} МСК</time>
          {snapshot && <span className="map-time">
            Выбранное время: {selectedTimeFormatter.format(new Date(snapshot.timestamp))} МСК
          </span>}
        </div>
      </div>
      {yandexKey && !yandexError ? <YandexMap
        apiKey={yandexKey}
        geometry={displayGeometry}
        route={route}
        snapshot={snapshot}
        visibleStopIds={markers.map((point) => point.stop_id).join("|")}
        selectedStopId={selectedStopId}
        focusedPoint={focusedPoint}
        colorForValue={loadColor}
        onStopSelect={onStopSelect}
        onError={onYandexError}
      /> : <div className="map-container map-unavailable" role="alert">
        {yandexError || "Для карты не задан VITE_YANDEX_MAPS_API_KEY."} Подложка OpenStreetMap отключена.
      </div>}
      {geometryError && <p className="map-empty" role="alert">Не удалось получить линии маршрута: {geometryError}</p>}
      {segment && geometry && displayGeometry?.lines.length === 0 &&
        <p className="map-empty" role="alert">Для выбранного участка не удалось выделить путь из геометрии OSM.</p>}
      {noDemoService && <p className="map-empty" role="status">В выбранный момент демонстрационный прогноз на карте равен нулю.</p>}
      {!snapshot?.points.length && <p className="map-empty" role="status">
        {busy ? "Загружаем остановки и прогноз…" : "Для выбранных фильтров нет данных карты."}
      </p>}
      <div className="map-legend" aria-label="Уровни загрузки">
        <span><i style={{ background: loadColors.low }} /> Низкая{snapshot?.value_unit === "demo_index" ? " (< 35)" : ""}</span>
        <span><i style={{ background: loadColors.medium }} /> Средняя{snapshot?.value_unit === "demo_index" ? " (35–54)" : ""}</span>
        <span><i style={{ background: loadColors.high }} /> Высокая{snapshot?.value_unit === "demo_index" ? " (≥ 55)" : ""}</span>
      </div>
      <p className="map-note">Цвет отражает {snapshot?.value_unit === "demo_index" ? "условный индекс, не число пассажиров" : "относительный уровень прогноза"}. Геоданные © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap contributors (ODbL)</a>.</p>
    </section>
  );
}
