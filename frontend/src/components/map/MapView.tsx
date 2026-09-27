import { useCallback, useEffect, useMemo, useState } from "react";
import { TramIcon } from "@phosphor-icons/react";
import { getRouteGeometry } from "../../api";
import type { MapForecastPoint, MapForecastResponse, Route, RouteGeometry, RouteStop } from "../../types";
import { YandexMap } from "./YandexMap";
import { RouteMapFallback } from "./RouteMapFallback";
import { clipRouteLines, type RouteSegment } from "../../routeSegment";
import type { Theme } from "../../theme";
import { EdgeSplitHandles, type SplitEdge } from "./EdgeSplitHandles";

interface MapViewProps {
  route?: Route;
  snapshot: MapForecastResponse | null;
  stops: RouteStop[];
  segment: RouteSegment | null;
  directionId: 0 | 1;
  startStopId: string;
  selectedStopId: string;
  focusedPoint: MapForecastPoint | null;
  busy: boolean;
  onStopSelect: (stopId: string) => void;
  theme: Theme;
  onSplit?: (edge: SplitEdge) => void;
}

const routeGeometryCache = new Map<string, Promise<RouteGeometry>>();

function cachedGeometry(routeId: string, directionId: 0 | 1): Promise<RouteGeometry> {
  const key = `${routeId}/${directionId}`;
  const cached = routeGeometryCache.get(key);
  if (cached) return cached;
  const request = getRouteGeometry(routeId, directionId).catch((error) => {
    routeGeometryCache.delete(key);
    throw error;
  });
  routeGeometryCache.set(key, request);
  return request;
}

export function MapView({ route, snapshot, stops, segment, directionId, startStopId, selectedStopId, focusedPoint, busy, onStopSelect, theme, onSplit }: MapViewProps) {
  const [geometry, setGeometry] = useState<RouteGeometry | null>(null);
  const [geometryError, setGeometryError] = useState("");
  const [yandexError, setYandexError] = useState("");
  const onYandexError = useCallback((message: string) => setYandexError(message), []);
  const yandexKey = import.meta.env.VITE_YANDEX_MAPS_API_KEY?.trim() ?? "";

  useEffect(() => {
    setGeometry(null);
    setGeometryError("");
    if (!route) return;
    let cancelled = false;
    cachedGeometry(route.id, focusedPoint?.direction_id ?? segment?.directionId ?? directionId)
      .then((data) => { if (!cancelled) setGeometry(data); })
      .catch((error: unknown) => {
        if (!cancelled) setGeometryError(error instanceof Error ? error.message : "Не удалось загрузить геометрию");
      });
    return () => { cancelled = true; };
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

  const points = snapshot?.points ?? [];
  const forward = points.filter((point) => point.direction_id === (focusedPoint?.direction_id ?? segment?.directionId ?? directionId));
  const ordered = (segment
    ? forward.filter((point) => point.sequence >= segment.from.sequence && point.sequence <= segment.to.sequence)
    : forward.length ? forward : points).slice().sort((a, b) => a.sequence - b.sequence);
  const markers = [...new Map(ordered.map((point) => [point.stop_id, point])).values()];
  return (
    <section className="map-wrapper" aria-label="Карта маршрута и остановок">
      <div className="map-heading">
        <div>
          <h2><TramIcon weight="bold" aria-hidden="true" />Карта маршрута{route ? ` · ${route.name.replace(" · демопрогноз", "")}` : ""}</h2>
          <p>{segment ? `Участок: ${segment.from.name} → ${segment.to.name}. ` : ""}Выберите остановку на карте или в списке справа. Цвет линии обозначает маршрут, а не нагрузку.</p>
        </div>
      </div>
      <div className="map-stage">
      {yandexKey && !yandexError ? <YandexMap
        apiKey={yandexKey}
        geometry={displayGeometry}
        route={route}
        snapshot={snapshot}
        visibleStopIds={markers.map((point) => point.stop_id).join("|")}
        startStopId={startStopId}
        selectedStopId={selectedStopId}
        focusedPoint={focusedPoint}
        onStopSelect={onStopSelect}
        onError={onYandexError}
        theme={theme}
      /> : <RouteMapFallback geometry={displayGeometry} route={route} snapshot={snapshot}
        markers={markers} selectedStopId={selectedStopId} startStopId={startStopId}
        message={yandexError || "Подложка Яндекс Карт отключена: API key не задан."}
        onStopSelect={onStopSelect} />}
      <a className="map-attribution" href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">© OpenStreetMap</a>
      </div>
      {geometryError && <p className="map-empty" role="alert">Не удалось получить линии маршрута: {geometryError}</p>}
      {segment && geometry && displayGeometry?.lines.length === 0 &&
        <p className="map-empty" role="alert">Для выбранного участка не удалось выделить путь из геометрии OSM.</p>}
      {!snapshot?.points.length && <p className="map-empty" role="status">
        {busy ? "Загружаем остановки и прогноз…" : "Для выбранных фильтров нет данных карты."}
      </p>}
      {onSplit && <EdgeSplitHandles onSplit={onSplit} />}
    </section>
  );
}
