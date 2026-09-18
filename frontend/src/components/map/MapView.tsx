import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CircleMarker, MapContainer, TileLayer, Popup, Polyline, useMap } from "react-leaflet";
import { latLngBounds } from "leaflet";
import "leaflet/dist/leaflet.css";
import { getRouteGeometry } from "../../api";
import type { MapForecastPoint, MapForecastResponse, Route, RouteGeometry, RouteStop } from "../../types";
import { YandexMap } from "./YandexMap";
import { clipRouteLines, type RouteSegment } from "../../routeSegment";

type Position = [number, number];

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

function FitToStops({ points }: { points: MapForecastPoint[] }) {
  const map = useMap();
  const lastCoordinates = useRef("");

  useEffect(() => {
    const coordinates = points.map((point) => `${point.lat},${point.lon}`).join("|");
    if (!coordinates || coordinates === lastCoordinates.current) return;
    lastCoordinates.current = coordinates;
    const positions: Position[] = points.map((point) => [point.lat, point.lon]);
    if (positions.length === 1) map.setView(positions[0], 13);
    else map.fitBounds(latLngBounds(positions), { padding: [32, 32], maxZoom: 13 });
  }, [map, points]);

  return null;
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
  const [yandexFailed, setYandexFailed] = useState(false);
  const onYandexError = useCallback(() => setYandexFailed(true), []);
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
  const lineColor = (line: Array<[number, number]>) => {
    if (noDemoService) return "#8b98a8";
    if (!snapshot || !ordered.length) return route?.color ?? "#24528a";
    const center = line[Math.floor(line.length / 2)];
    const nearest = ordered.reduce((best, point) => {
      const distance = (point.lon - center[0]) ** 2 + (point.lat - center[1]) ** 2;
      return distance < best.distance ? { point, distance } : best;
    }, { point: ordered[0], distance: Infinity }).point;
    return loadColor(nearest.predicted_load, snapshot);
  };

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
      {yandexKey && !yandexFailed ? <YandexMap
        apiKey={yandexKey}
        geometry={displayGeometry}
        route={route}
        snapshot={snapshot}
        visibleStopIds={markers.map((point) => point.stop_id).join("|")}
        selectedStopId={selectedStopId}
        colorForValue={loadColor}
        onStopSelect={onStopSelect}
        onError={onYandexError}
      /> : <MapContainer center={[55.75, 37.65]} zoom={11} className="map-container" scrollWheelZoom={false}>
        <TileLayer
          url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        />
        <FitToStops points={markers} />
        {displayGeometry?.lines.map((line, index) => (
          <Polyline
            key={`${displayGeometry.osm_relation_id}-${index}`}
            positions={line.map(([lon, lat]) => [lat, lon] as Position)}
            color={lineColor(line)}
            weight={5}
          />
        ))}
        {snapshot && markers.map((point) => (
          <CircleMarker
            key={point.stop_id}
            center={[point.lat, point.lon]}
            radius={selectedStopId === point.stop_id ? 8 : 5}
            pathOptions={{
              color: selectedStopId === point.stop_id ? "#14243b" : "#fff",
              fillColor: loadColor(point.predicted_load, snapshot),
              fillOpacity: 1,
              weight: selectedStopId === point.stop_id ? 3 : 2,
            }}
            eventHandlers={{ click: () => onStopSelect(point.stop_id) }}
          >
            <Popup>
              <strong>{point.stop_name}</strong><br />
              Индекс загрузки: {point.predicted_load.toLocaleString("ru-RU", { maximumFractionDigits: 2 })}<br />
              Нажмите на маркер, чтобы выбрать остановку.
            </Popup>
          </CircleMarker>
        ))}
      </MapContainer>}
      {geometryError && <p className="map-empty" role="alert">Не удалось получить линии маршрута: {geometryError}</p>}
      {segment && geometry && displayGeometry?.lines.length === 0 &&
        <p className="map-empty" role="alert">Для выбранного участка не удалось выделить путь из геометрии OSM.</p>}
      {yandexFailed && <p className="map-note">Яндекс Карты недоступны с этим ключом или доменом; показана подложка OpenStreetMap.</p>}
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
