import { useEffect, useRef, useState } from "react";
import type { MapForecastPoint, MapForecastResponse, Route, RouteGeometry } from "../../types";
import type { Theme } from "../../theme";
import { neutralMapColor } from "../../loadLevel";

export type LngLat = [number, number];
export type MapChild = object;

export interface YMapInstance {
  addChild(child: MapChild): void;
  removeChild(child: MapChild): void;
  update(props: { location: { bounds: [LngLat, LngLat] } | { center: LngLat; zoom: number } }): void;
  destroy(): void;
}

export interface YMaps3 {
  ready: Promise<void>;
  YMap: new (element: HTMLElement, props: object) => YMapInstance;
  YMapDefaultSchemeLayer: new (props: object) => MapChild;
  YMapDefaultFeaturesLayer: new (props: object) => MapChild;
  YMapFeature: new (props: object) => MapChild;
  YMapMarker: new (props: object, element: HTMLElement) => MapChild;
}

declare global {
  interface Window { ymaps3?: YMaps3 }
}

let loading: Promise<YMaps3> | null = null;

export function loadYandex(apiKey: string): Promise<YMaps3> {
  if (loading) return loading;
  loading = new Promise<YMaps3>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = `https://api-maps.yandex.ru/v3/?apikey=${encodeURIComponent(apiKey)}&lang=ru_RU`;
    script.async = true;
    script.onload = () => {
      if (!window.ymaps3) {
        reject(new Error("API Яндекс Карт не загрузился"));
        return;
      }
      window.ymaps3.ready.then(() => resolve(window.ymaps3!), reject);
    };
    script.onerror = () => reject(new Error("Не удалось загрузить Яндекс Карты"));
    document.head.appendChild(script);
  }).catch((error: unknown) => {
    loading = null;
    throw error;
  });
  return loading;
}

interface YandexMapProps {
  apiKey: string;
  geometry: RouteGeometry | null;
  route?: Route;
  snapshot: MapForecastResponse | null;
  visibleStopIds: string;
  startStopId: string;
  selectedStopId: string;
  focusedPoint: MapForecastPoint | null;
  colorForValue: (value: number, snapshot: MapForecastResponse) => string;
  onStopSelect: (stopId: string) => void;
  onError: (message: string) => void;
  theme: Theme;
}

export function YandexMap({ apiKey, geometry, route, snapshot, visibleStopIds, startStopId, selectedStopId, focusedPoint, colorForValue, onStopSelect, onError, theme }: YandexMapProps) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<YMapInstance | null>(null);
  const apiRef = useRef<YMaps3 | null>(null);
  const overlays = useRef<MapChild[]>([]);
  const lastGeometry = useRef("");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    loadYandex(apiKey).then((api) => {
      if (cancelled || !container.current) return;
      const map = new api.YMap(container.current, {
        location: { center: [37.62, 55.75], zoom: 10 },
        showScaleInCopyrights: true,
      });
      map.addChild(new api.YMapDefaultSchemeLayer({ theme }));
      map.addChild(new api.YMapDefaultFeaturesLayer({}));
      mapRef.current = map;
      apiRef.current = api;
      setReady(true);
    }).catch((error: unknown) => {
      if (!cancelled) {
        onError(error instanceof Error ? error.message : "Не удалось загрузить Яндекс Карты");
      }
    });
    return () => {
      cancelled = true;
      mapRef.current?.destroy();
      mapRef.current = null;
      apiRef.current = null;
      overlays.current = [];
      setReady(false);
    };
  }, [apiKey, onError, theme]);

  useEffect(() => {
    const map = mapRef.current;
    const api = apiRef.current;
    if (!ready || !map || !api) return;
    overlays.current.forEach((child) => map.removeChild(child));
    overlays.current = [];
    if (!geometry || !route) return;

    const noDemoService = Boolean(snapshot?.is_mock && snapshot.horizon === "day" &&
      snapshot.points.length && snapshot.points.every((point) => point.predicted_load === 0));
    const visible = new Set(visibleStopIds.split("|"));
    const points = snapshot?.points.filter((point) =>
      visible.has(point.stop_id) && point.direction_id === geometry.direction_id) ?? [];
    const add = (child: MapChild) => { map.addChild(child); overlays.current.push(child); };
    const allCoordinates: LngLat[] = [];
    geometry.lines.forEach((coordinates) => {
      if (coordinates.length < 2) return;
      allCoordinates.push(...coordinates);
      const middle = coordinates[Math.floor(coordinates.length / 2)];
      const closest = points.length ? points.reduce((best, point) => {
        const distance = (point.lon - middle[0]) ** 2 + (point.lat - middle[1]) ** 2;
        return distance < best.distance ? { point, distance } : best;
      }, { point: points[0], distance: Infinity }).point : null;
      const color = noDemoService ? neutralMapColor() : closest && snapshot
        ? colorForValue(closest.predicted_load, snapshot) : route.color;
      add(new api.YMapFeature({
        geometry: { type: "LineString", coordinates },
        style: { stroke: [{ width: 7, color, opacity: .96 }] },
      }));
    });

    points.forEach((point) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = `yandex-stop-marker${point.stop_id === startStopId ? " segment-start" : ""}${point.stop_id === selectedStopId ? " selected" : ""}`;
      button.style.background = noDemoService ? neutralMapColor() : snapshot
        ? colorForValue(point.predicted_load, snapshot) : route.color;
      button.title = `${point.stop_id === startStopId ? "Начальная остановка · " : ""}${point.stop_name} · индекс ${point.predicted_load.toLocaleString("ru-RU")}`;
      button.setAttribute("aria-label", button.title);
      button.addEventListener("click", () => onStopSelect(point.stop_id));
      add(new api.YMapMarker({ coordinates: [point.lon, point.lat] }, button));
    });

    const geometryKey = `${route.id}/${geometry.direction_id}/${allCoordinates[0]}/${allCoordinates[allCoordinates.length - 1]}`;
    if (allCoordinates.length && lastGeometry.current !== geometryKey) {
      lastGeometry.current = geometryKey;
      const lon = allCoordinates.map((point) => point[0]);
      const lat = allCoordinates.map((point) => point[1]);
      map.update({ location: { bounds: [[Math.min(...lon), Math.min(...lat)], [Math.max(...lon), Math.max(...lat)]] } });
    }
  }, [ready, geometry, route, snapshot, visibleStopIds, startStopId, selectedStopId, colorForValue, onStopSelect]);

  useEffect(() => {
    if (!ready || !mapRef.current || !focusedPoint || focusedPoint.route_id !== route?.id ||
      focusedPoint.direction_id !== geometry?.direction_id) return;
    mapRef.current.update({ location: { center: [focusedPoint.lon, focusedPoint.lat], zoom: 15 } });
  }, [ready, route?.id, geometry?.direction_id, focusedPoint]);

  return <div ref={container} className="map-container" aria-label="Карта Яндекса с маршрутами и остановками OSM" />;
}
