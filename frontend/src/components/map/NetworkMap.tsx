import { useEffect, useId, useMemo, useRef, useState } from "react";
import { MapTrifoldIcon } from "@phosphor-icons/react";
import { getRouteGeometry } from "../../api";
import type { ForecastPoint, MapForecastPoint, MapForecastResponse, Route, RouteGeometry } from "../../types";
import { loadYandex, type LngLat, type MapChild, type YMapInstance, type YMaps3 } from "./YandexMap";
import { buildNetworkLines } from "./networkMapLines";
import { buildSchematic, VIEW_HEIGHT, VIEW_WIDTH, type SchematicRun } from "./networkSchematic";
import type { Theme } from "../../theme";
import { routesNearPoint } from "./routeIntersections";
import { EdgeSplitHandles, type SplitEdge } from "./EdgeSplitHandles";
import { ValidationLegend } from "./ValidationLegend";
import { ForecastTimeControl } from "./ForecastTimeControl";

const geometryCache = new Map<string, RouteGeometry>();

interface NetworkMapProps {
  routes: Route[];
  snapshot: MapForecastResponse;
  theme: Theme;
  onSelectRoute: (routeId: string) => void;
  selectedRouteId: string;
  selectedStop: MapForecastPoint | null;
  validationColors?: Map<string, string>;
  currentValuesByRoute: Map<string, number>;
  forecastPoints: ForecastPoint[];
  selectedTimeIndex: number;
  onTimeIndexChange: (index: number) => void;
  selectedValidations: number;
  onSplit?: (edge: SplitEdge) => void;
}

const STROKE = 3.4;
const CASING = STROKE + 2.4;
const validationNumber = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 });

function runColor(run: SchematicRun, routeColor: string | undefined): string {
  if (run.level === "route") return routeColor ?? "var(--status-neutral)";
  if (run.level === "neutral") return "var(--status-neutral)";
  return `var(--status-${run.level === "low" ? "normal" : run.level === "medium" ? "attention" : "critical"})`;
}

export function NetworkMap({ routes, snapshot, theme, onSelectRoute, selectedRouteId, selectedStop, validationColors,
  currentValuesByRoute, forecastPoints, selectedTimeIndex, onTimeIndexChange, selectedValidations, onSplit }: NetworkMapProps) {
  const titleId = useId();
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<YMapInstance | null>(null);
  const apiRef = useRef<YMaps3 | null>(null);
  const overlays = useRef<MapChild[]>([]);
  const fittedGeometries = useRef<RouteGeometry[] | null>(null);
  const selectRouteRef = useRef(onSelectRoute);
  const [ready, setReady] = useState(false);
  const [mapGeneration, setMapGeneration] = useState(0);
  const [geometries, setGeometries] = useState<RouteGeometry[]>([]);
  const [geometryError, setGeometryError] = useState("");
  const [mapError, setMapError] = useState("");
  const [loading, setLoading] = useState(true);
  const [hoveredRoute, setHoveredRoute] = useState<{ routeIds: string[]; x: number; y: number } | null>(null);
  const dismissHoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const apiKey = import.meta.env.VITE_YANDEX_MAPS_API_KEY?.trim() ?? "";
  const showFallback = !apiKey || Boolean(mapError);
  const routeIds = routes.map((route) => route.id).join("|");
  const coloredLines = useMemo(() => buildNetworkLines(geometries, routes, snapshot, validationColors), [geometries, routes, snapshot, validationColors]);
  const routeById = useMemo(() => new Map(routes.map((route) => [route.id, route])), [routes]);
  const routeNumbers = useMemo(() => new Map(routes.map((route) => [
    route.id, route.name.split("·")[0].replace(/^Трамвай\s+/i, "").trim(),
  ])), [routes]);
  const cancelDismiss = () => {
    if (dismissHoverTimer.current) clearTimeout(dismissHoverTimer.current);
    dismissHoverTimer.current = null;
  };
  const scheduleDismiss = () => {
    cancelDismiss();
    dismissHoverTimer.current = setTimeout(() => setHoveredRoute(null), 220);
  };
  const showHover = (id: string, event: MouseEvent, nearbyRouteIds: string[]) => {
    const bounds = container.current?.getBoundingClientRect();
    if (!bounds) return;
    cancelDismiss();
    const routeIds = [...new Set([id, ...nearbyRouteIds])].sort((a, b) =>
      (routeById.get(a)?.name ?? a).localeCompare(routeById.get(b)?.name ?? b, "ru", { numeric: true }));
    const x = Math.max(8, Math.min(event.clientX - bounds.left + 14, bounds.width - 240));
    const y = Math.max(8, Math.min(event.clientY - bounds.top + 14, bounds.height - 54 - routeIds.length * 39));
    setHoveredRoute({ routeIds, x, y });
  };

  useEffect(() => () => cancelDismiss(), []);

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
        mode: "raster",
        showScaleInCopyrights: true,
        theme,
      });
      map.addChild(new api.YMapDefaultSchemeLayer({}));
      map.addChild(new api.YMapDefaultFeaturesLayer({}));
      mapRef.current = map;
      apiRef.current = api;
      setMapGeneration((generation) => generation + 1);
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
      fittedGeometries.current = null;
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
        onMouseEnter: (event: MouseEvent, mapEvent: { coordinates?: LngLat }) => {
          const coordinate = mapEvent?.coordinates;
          const nearby = coordinate ? routesNearPoint(geometries, [0, 0], (lon, lat) => [
            (lon - coordinate[0]) * Math.cos(coordinate[1] * Math.PI / 180) * 111320,
            (lat - coordinate[1]) * 111320,
          ], 60) : [];
          showHover(group.routeId, event, nearby);
        },
        onMouseLeave: scheduleDismiss,
        onClick: () => selectRouteRef.current(group.routeId),
      });
      map.addChild(feature);
      overlays.current.push(feature);
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
    if (Number.isFinite(minLon) && fittedGeometries.current !== geometries) {
      fittedGeometries.current = geometries;
      map.update({ location: { bounds: [[minLon, minLat], [maxLon, maxLat]] as [LngLat, LngLat] } });
    }
  }, [ready, mapGeneration, coloredLines, geometries, selectedRouteId, selectedStop]);

  useEffect(() => {
    if (ready && selectedStop) mapRef.current?.update({ location: { center: [selectedStop.lon, selectedStop.lat], zoom: 14 } });
  }, [ready, mapGeneration, selectedStop]);

  const schematic = useMemo(() => {
    if (!showFallback) return { routes: [], marker: null, project: null };
    const built = buildSchematic(geometries, routes.map((route) => route.id), null);
    if (!built) return { routes: [], marker: null, project: null };
    const byRoute = new Map<string, typeof built.tracks>();
    built.tracks.forEach((track) => byRoute.set(track.routeId, [...(byRoute.get(track.routeId) ?? []), track]));
    // The selected route is drawn last so it stays on top where lines cross.
    const ordered = [...byRoute].sort(([a], [b]) => Number(a === selectedRouteId) - Number(b === selectedRouteId));
    const marker = selectedStop ? built.project(selectedStop.lon, selectedStop.lat) : null;
    return { routes: ordered.map(([routeId, tracks]) => ({ routeId, tracks })), marker, project: built.project };
  }, [showFallback, geometries, routes, snapshot, selectedRouteId, selectedStop]);

  return <section className="map-wrapper network-map" aria-labelledby={titleId}>
    <div className="map-heading"><div>
      <h2 id={titleId}><MapTrifoldIcon weight="bold" aria-hidden="true" />Карта всей трамвайной сети</h2>
      <p>Цвет сравнивает выбранный час или день с другими часами или днями этого же маршрута. Нажмите линию, чтобы открыть маршрут.</p>
    </div></div>
    <div className="map-stage">
      {showFallback ? <div ref={container} className="map-container network-map-fallback">
        {schematic.routes.length > 0 && <svg viewBox={`0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`} role="img" aria-label="Схема всех трамвайных маршрутов Москвы" preserveAspectRatio="xMidYMid meet">
          {schematic.routes.map(({ routeId, tracks }) => {
            const dimmed = Boolean(selectedRouteId && selectedRouteId !== routeId);
            const selected = selectedRouteId === routeId;
            return <g key={routeId} className={`network-route${selected ? " network-route--selected" : ""}`}
              opacity={dimmed ? .23 : 1} role="button" tabIndex={0}
              aria-label={`Маршрут ${routeNumbers.get(routeId) ?? routeId}`}
              onClick={() => onSelectRoute(routeId)}
              onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") onSelectRoute(routeId); }}
              onMouseMove={(event) => {
                const svg = event.currentTarget.ownerSVGElement;
                const matrix = svg?.getScreenCTM();
                if (!svg || !matrix || !schematic.project) return;
                const cursor = svg.createSVGPoint();
                cursor.x = event.clientX;
                cursor.y = event.clientY;
                const point = cursor.matrixTransform(matrix.inverse());
                const nearby = routesNearPoint(geometries, [point.x, point.y], schematic.project, 8);
                showHover(routeId, event.nativeEvent, nearby);
              }}
              onMouseLeave={scheduleDismiss}>
              <title>Маршрут {routeNumbers.get(routeId) ?? routeId}</title>
              {tracks.map((track, index) => <path key={`c${index}`} className="network-route-casing" d={track.d}
                style={{ strokeWidth: selected ? CASING + 1 : CASING }} />)}
              {tracks.map((track, index) => track.runs.map((run, runIndex) => <path key={`l${index}-${runIndex}`}
                className="network-route-line" d={run.d}
                style={{ stroke: runColor(run, validationColors?.get(routeId) ?? routeById.get(routeId)?.color), strokeWidth: selected ? STROKE + 1 : STROKE }} />))}
            </g>;
          })}
          {schematic.marker && <circle cx={schematic.marker[0]} cy={schematic.marker[1]} r="9" fill="#4f9bff" stroke="white" strokeWidth="3">
            <title>{selectedStop?.stop_name}</title></circle>}
        </svg>}
        {!loading && !schematic.routes.length && <p>Нет линий маршрутов для отображения.</p>}
      </div> : <div ref={container} className="map-container" aria-label="Карта Яндекса со всеми трамвайными маршрутами" />}
      {hoveredRoute && <div className="map-route-tooltip" style={{ left: hoveredRoute.x, top: hoveredRoute.y }}
        onMouseEnter={cancelDismiss} onMouseLeave={scheduleDismiss}>
        <strong>{hoveredRoute.routeIds.length > 1 ? "Маршруты на этом участке" : "Маршрут на этом участке"}</strong>
        <div className="map-route-tooltip-list">{hoveredRoute.routeIds.map((id) => <button key={id} type="button"
          onClick={() => { cancelDismiss(); setHoveredRoute(null); onSelectRoute(id); }}>
          <i style={{ background: validationColors?.get(id) ?? routeById.get(id)?.color }} aria-hidden="true" />
          <span>{routeById.get(id)?.name.replace(" · демопрогноз", "") ?? `Маршрут ${routeNumbers.get(id) ?? id}`}</span>
          {currentValuesByRoute.has(id) && <small>{validationNumber.format(currentValuesByRoute.get(id)!)} вал.</small>}
        </button>)}</div>
      </div>}
      {selectedStop && <div className="network-selected-caption">Выбрана остановка · {selectedStop.stop_name}</div>}
      <a className="map-attribution" href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">© OpenStreetMap</a>
      {onSplit && <EdgeSplitHandles onSplit={onSplit} />}
    </div>
    {loading && <p className="map-empty" role="status">Загружаем линии маршрутов…</p>}
    <ForecastTimeControl points={forecastPoints} selectedIndex={selectedTimeIndex} onChange={onTimeIndexChange}
      horizon={snapshot.horizon} validations={selectedValidations} scope="вся сеть" />
    {validationColors?.size ? <ValidationLegend /> : null}
    {!loading && geometryError && <p className="map-empty" role="alert">{geometryError}</p>}
  </section>;
}
