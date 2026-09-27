import { useEffect, useId, useMemo, useRef, useState } from "react";
import { MapTrifoldIcon } from "@phosphor-icons/react";
import { getRouteGeometry } from "../../api";
import type { MapForecastPoint, MapForecastResponse, Route, RouteGeometry } from "../../types";
import { loadYandex, type LngLat, type MapChild, type YMapInstance, type YMaps3 } from "./YandexMap";
import { buildNetworkLines } from "./networkMapLines";
import type { Theme } from "../../theme";
import { findRouteIntersections, type RouteIntersection } from "./routeIntersections";
import { EdgeSplitHandles, type SplitEdge } from "./EdgeSplitHandles";

const geometryCache = new Map<string, RouteGeometry>();

interface NetworkMapProps {
  routes: Route[];
  snapshot: MapForecastResponse;
  theme: Theme;
  onSelectRoute: (routeId: string) => void;
  selectedRouteId: string;
  selectedStop: MapForecastPoint | null;
  onSplit?: (edge: SplitEdge) => void;
}

export function NetworkMap({ routes, snapshot, theme, onSelectRoute, selectedRouteId, selectedStop, onSplit }: NetworkMapProps) {
  const titleId = useId();
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<YMapInstance | null>(null);
  const apiRef = useRef<YMaps3 | null>(null);
  const overlays = useRef<MapChild[]>([]);
  const selectRouteRef = useRef(onSelectRoute);
  const [ready, setReady] = useState(false);
  const [geometries, setGeometries] = useState<RouteGeometry[]>([]);
  const [geometryError, setGeometryError] = useState("");
  const [mapError, setMapError] = useState("");
  const [loading, setLoading] = useState(true);
  const [hoveredRoute, setHoveredRoute] = useState<{ id: string; x: number; y: number } | null>(null);
  const [intersectionChoice, setIntersectionChoice] = useState<RouteIntersection | null>(null);
  const apiKey = import.meta.env.VITE_YANDEX_MAPS_API_KEY?.trim() ?? "";
  const routeIds = routes.map((route) => route.id).join("|");
  const coloredLines = useMemo(() => buildNetworkLines(geometries, routes, snapshot), [geometries, routes, snapshot]);
  const intersections = useMemo(() => findRouteIntersections(geometries), [geometries]);
  const routeById = useMemo(() => new Map(routes.map((route) => [route.id, route])), [routes]);
  const routeNumbers = useMemo(() => new Map(routes.map((route) => [
    route.id, route.name.split("·")[0].replace(/^Трамвай\s+/i, "").trim(),
  ])), [routes]);
  const showHover = (id: string, event: MouseEvent) => {
    const bounds = container.current?.getBoundingClientRect();
    if (!bounds) return;
    setHoveredRoute({ id, x: Math.min(event.clientX - bounds.left + 12, bounds.width - 70),
      y: Math.max(event.clientY - bounds.top - 36, 8) });
  };

  useEffect(() => { selectRouteRef.current = onSelectRoute; }, [onSelectRoute]);

  useEffect(() => {
    if (!routeIds) return;
    const controller = new AbortController();
    const load = async () => {
      setLoading(true);
      setGeometryError("");
      const ids = routeIds.split("|");
      const requests = ids.flatMap((id) => [0, 1].map((direction) => ({ id, direction: direction as 0 | 1 })));
      const loaded: RouteGeometry[] = [];
      for (let index = 0; index < requests.length; index += 8) {
        const batch = await Promise.allSettled(requests.slice(index, index + 8).map(async ({ id, direction }) => {
          const key = `${id}/${direction}`;
          if (geometryCache.has(key)) return geometryCache.get(key)!;
          const geometry = await getRouteGeometry(id, direction, controller.signal);
          geometryCache.set(key, geometry);
          return geometry;
        }));
        if (controller.signal.aborted) return;
        loaded.push(...batch.filter((result): result is PromiseFulfilledResult<RouteGeometry> => result.status === "fulfilled")
          .map((result) => result.value));
      }
      if (controller.signal.aborted) return;
      setGeometries(loaded);
      if (!loaded.length) setGeometryError("Не удалось загрузить линии маршрутов.");
      setLoading(false);
    };
    void load();
    return () => controller.abort();
  }, [routeIds]);

  useEffect(() => {
    if (!apiKey) return;
    let cancelled = false;
    loadYandex(apiKey).then((api) => {
      if (cancelled || !container.current) return;
      const map = new api.YMap(container.current, {
        location: { center: [37.62, 55.75], zoom: 10 },
        showScaleInCopyrights: true,
        theme,
      });
      map.addChild(new api.YMapDefaultSchemeLayer({}));
      map.addChild(new api.YMapDefaultFeaturesLayer({}));
      mapRef.current = map;
      apiRef.current = api;
      setReady(true);
    }).catch((failure: unknown) => {
      if (!cancelled) setMapError(failure instanceof Error ? failure.message : "Не удалось загрузить карту");
    });
    return () => {
      cancelled = true;
      mapRef.current?.destroy();
      mapRef.current = null;
      apiRef.current = null;
      overlays.current = [];
      setReady(false);
    };
  }, [apiKey, theme]);

  useEffect(() => {
    const map = mapRef.current;
    const api = apiRef.current;
    if (!ready || !map || !api || !coloredLines.length) return;
    overlays.current.forEach((child) => map.removeChild(child));
    overlays.current = [];
    let minLon = Infinity, minLat = Infinity, maxLon = -Infinity, maxLat = -Infinity;
    coloredLines.forEach((group) => {
      group.lines.forEach((coordinates) => coordinates.forEach(([lon, lat]) => {
        minLon = Math.min(minLon, lon);
        minLat = Math.min(minLat, lat);
        maxLon = Math.max(maxLon, lon);
        maxLat = Math.max(maxLat, lat);
      }));
      const feature = new api.YMapFeature({
        geometry: { type: "MultiLineString", coordinates: group.lines },
        style: { stroke: [{ width: selectedRouteId === group.routeId ? 5.5 : 4,
          color: group.color, opacity: selectedRouteId && selectedRouteId !== group.routeId ? .23 : .9 }] },
        onMouseEnter: (event: MouseEvent) => showHover(group.routeId, event),
        onMouseLeave: () => setHoveredRoute(null),
        onClick: () => selectRouteRef.current(group.routeId),
      });
      map.addChild(feature);
      overlays.current.push(feature);
    });
    intersections.forEach((intersection) => {
      const marker = document.createElement("button");
      marker.type = "button";
      marker.className = "network-intersection-marker";
      marker.textContent = String(intersection.routeIds.length);
      marker.title = `Выбрать один из ${intersection.routeIds.length} маршрутов`;
      marker.setAttribute("aria-label", marker.title);
      marker.addEventListener("click", () => setIntersectionChoice(intersection));
      const child = new api.YMapMarker({ coordinates: intersection.coordinate }, marker);
      map.addChild(child);
      overlays.current.push(child);
    });
    if (selectedStop) {
      const marker = document.createElement("button");
      marker.type = "button";
      marker.className = "network-selected-stop";
      marker.title = selectedStop.stop_name;
      marker.setAttribute("aria-label", `Выбрана остановка ${selectedStop.stop_name}`);
      marker.addEventListener("click", () => selectRouteRef.current(selectedStop.route_id));
      const child = new api.YMapMarker({ coordinates: [selectedStop.lon, selectedStop.lat] }, marker);
      map.addChild(child);
      overlays.current.push(child);
    }
    if (Number.isFinite(minLon)) {
      map.update({ location: { bounds: [[minLon, minLat], [maxLon, maxLat]] as [LngLat, LngLat] } });
    }
  }, [ready, coloredLines, intersections, selectedRouteId, selectedStop]);

  useEffect(() => {
    if (ready && selectedStop) mapRef.current?.update({ location: { center: [selectedStop.lon, selectedStop.lat], zoom: 14 } });
  }, [ready, selectedStop]);

  const svgLines = useMemo(() => {
    const lines = coloredLines.flatMap((group) => group.lines
      .filter((coordinates) => coordinates.length > 1)
      .map((coordinates) => ({ routeId: group.routeId, coordinates })));
    if (!lines.length) return { paths: [], marker: null };
    let minLon = Infinity, maxLon = -Infinity, minLat = Infinity, maxLat = -Infinity;
    lines.forEach((line) => line.coordinates.forEach(([lon, lat]) => {
      minLon = Math.min(minLon, lon);
      maxLon = Math.max(maxLon, lon);
      minLat = Math.min(minLat, lat);
      maxLat = Math.max(maxLat, lat);
    }));
    const width = Math.max((maxLon - minLon) * Math.cos((minLat + maxLat) / 2 * Math.PI / 180), .001);
    const height = Math.max(maxLat - minLat, .001);
    const scale = Math.min(920 / width, 400 / height);
    const offsetX = (1000 - width * scale) / 2;
    const offsetY = (480 - height * scale) / 2;
    const cosine = Math.cos((minLat + maxLat) / 2 * Math.PI / 180);
    const paths = coloredLines.map((group) => ({
      routeId: group.routeId,
      color: group.color,
      path: group.lines.filter((coordinates) => coordinates.length > 1).map((coordinates) =>
        coordinates.map(([lon, lat], index) =>
          `${index === 0 ? "M" : "L"}${((lon - minLon) * cosine * scale + offsetX).toFixed(1)} ${((maxLat - lat) * scale + offsetY).toFixed(1)}`).join(" ")
      ).join(" "),
    })).filter((line) => line.path);
    const marker = selectedStop ? {
      x: (selectedStop.lon - minLon) * cosine * scale + offsetX,
      y: (maxLat - selectedStop.lat) * scale + offsetY,
    } : null;
    return { paths, marker };
  }, [coloredLines, selectedStop]);

  const showFallback = !apiKey || Boolean(mapError);

  return <section className="map-wrapper network-map" aria-labelledby={titleId}>
    <div className="map-heading"><div>
      <h2 id={titleId}><MapTrifoldIcon weight="bold" aria-hidden="true" />Карта всей трамвайной сети</h2>
      <p>Выберите маршрут и остановку справа. Нажмите линию или маршрут в рейтинге, чтобы открыть подробности.</p>
    </div></div>
    <div className="map-stage">
      {showFallback ? <div ref={container} className="map-container network-map-fallback">
        {svgLines.paths.length > 0 && <svg viewBox="0 0 1000 480" role="img" aria-label="Схема всех трамвайных маршрутов Москвы" preserveAspectRatio="xMidYMid meet">
          {svgLines.paths.map((line, index) => <path key={`${line.routeId}/${index}`} d={line.path}
            fill="none" stroke={line.color} strokeWidth={selectedRouteId === line.routeId ? "5.5" : "3.8"}
            strokeOpacity={selectedRouteId && selectedRouteId !== line.routeId ? ".23" : ".9"}
            strokeLinecap="round" strokeLinejoin="round"
            role="button" tabIndex={0}
            onClick={() => onSelectRoute(line.routeId)}
            onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") onSelectRoute(line.routeId); }}
            onMouseMove={(event) => showHover(line.routeId, event.nativeEvent)}
            onMouseLeave={() => setHoveredRoute(null)}><title>Маршрут {routeNumbers.get(line.routeId) ?? line.routeId}</title></path>)}
          {svgLines.marker && <circle cx={svgLines.marker.x} cy={svgLines.marker.y} r="9" fill="#4f9bff" stroke="white" strokeWidth="3">
            <title>{selectedStop?.stop_name}</title></circle>}
        </svg>}
        {!loading && !svgLines.paths.length && <p>Нет линий маршрутов для отображения.</p>}
      </div> : <div ref={container} className="map-container" aria-label="Карта Яндекса со всеми трамвайными маршрутами" />}
      {hoveredRoute && <div className="map-route-tooltip" style={{ left: hoveredRoute.x, top: hoveredRoute.y }} role="status">
        Маршрут {routeNumbers.get(hoveredRoute.id) ?? hoveredRoute.id} · открыть
      </div>}
      {selectedStop && <div className="network-selected-caption">Выбрана остановка · {selectedStop.stop_name}</div>}
      {intersectionChoice && <div className="network-route-choice" role="dialog" aria-label="Выберите маршрут в точке пересечения">
        <div><strong>Маршруты в этой точке</strong><button type="button" aria-label="Закрыть" onClick={() => setIntersectionChoice(null)}>×</button></div>
        <p>Линии проходят рядом. Уточните, какой маршрут открыть.</p>
        <div>{intersectionChoice.routeIds.map((id) => <button key={id} type="button" onClick={() => onSelectRoute(id)}>
          <i style={{ background: routeById.get(id)?.color }} aria-hidden="true" />
          {routeById.get(id)?.name.replace(" · демопрогноз", "") ?? id}
        </button>)}</div>
      </div>}
      <a className="map-attribution" href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">© OpenStreetMap</a>
      {onSplit && <EdgeSplitHandles onSplit={onSplit} />}
    </div>
    {loading && <p className="map-empty" role="status">Загружаем линии маршрутов…</p>}
    {!loading && geometryError && <p className="map-empty" role="alert">{geometryError}</p>}
  </section>;
}
