import { useMemo } from "react";
import type { KeyboardEvent } from "react";
import type { MapForecastPoint, MapForecastResponse, Route, RouteGeometry } from "../../types";
import { neutralMapColor } from "../../loadLevel";

interface RouteMapFallbackProps {
  geometry: RouteGeometry | null;
  route?: Route;
  snapshot: MapForecastResponse | null;
  markers: MapForecastPoint[];
  selectedStopId: string;
  startStopId: string;
  message: string;
  onStopSelect: (stopId: string) => void;
}

const VIEW_WIDTH = 1000;
const VIEW_HEIGHT = 700;
const PADDING = 70;

export function RouteMapFallback({ geometry, route, snapshot, markers, selectedStopId,
  startStopId, message, onStopSelect }: RouteMapFallbackProps) {
  const projection = useMemo(() => {
    const lines = geometry?.lines.filter((line) => line.length > 1) ?? [];
    const coordinates = lines.flatMap((line) => line);
    if (!coordinates.length) return null;
    const lonValues = coordinates.map(([lon]) => lon);
    const latValues = coordinates.map(([, lat]) => lat);
    const minLon = Math.min(...lonValues), maxLon = Math.max(...lonValues);
    const minLat = Math.min(...latValues), maxLat = Math.max(...latValues);
    const cosine = Math.cos((minLat + maxLat) / 2 * Math.PI / 180);
    const geoWidth = Math.max((maxLon - minLon) * cosine, .0001);
    const geoHeight = Math.max(maxLat - minLat, .0001);
    const scale = Math.min((VIEW_WIDTH - PADDING * 2) / geoWidth, (VIEW_HEIGHT - PADDING * 2) / geoHeight);
    const offsetX = (VIEW_WIDTH - geoWidth * scale) / 2;
    const offsetY = (VIEW_HEIGHT - geoHeight * scale) / 2;
    const point = ([lon, lat]: [number, number]) => ({
      x: (lon - minLon) * cosine * scale + offsetX,
      y: (maxLat - lat) * scale + offsetY,
    });
    const paths = lines.map((line, lineIndex) => {
      const color = route?.color ?? neutralMapColor();
      const path = line.map((position, index) => {
        const projected = point(position);
        return `${index ? "L" : "M"}${projected.x.toFixed(1)} ${projected.y.toFixed(1)}`;
      }).join(" ");
      return { key: lineIndex, path, color };
    });
    return { paths, point };
  }, [geometry, markers, route?.color, snapshot]);

  const activate = (event: KeyboardEvent<SVGGElement>, stopId: string) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onStopSelect(stopId);
    }
  };

  return <div className="map-container route-map-fallback">
    {projection ? <svg viewBox={`0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`} role="img"
      aria-label={`Схема ${route?.name ?? "выбранного маршрута"}`} preserveAspectRatio="xMidYMid meet">
      {projection.paths.map((line) => <path key={line.key} d={line.path} fill="none"
        stroke={line.color} strokeWidth="8" strokeLinecap="round" strokeLinejoin="round" />)}
      {markers.map((marker) => {
        const position = projection.point([marker.lon, marker.lat]);
        const selected = marker.stop_id === selectedStopId;
        const start = marker.stop_id === startStopId;
        const label = marker.stop_name;
        return <g key={marker.stop_id} className={`fallback-stop${selected ? " selected" : ""}${start ? " segment-start" : ""}`}
          transform={`translate(${position.x.toFixed(1)} ${position.y.toFixed(1)})`}
          role="button" tabIndex={0} aria-label={label} onClick={() => onStopSelect(marker.stop_id)}
          onKeyDown={(event) => activate(event, marker.stop_id)}>
          {selected && <circle r="13" className="fallback-stop-ring" />}
          <circle r={start ? 9 : 6} className="fallback-stop-dot"><title>{label}</title></circle>
        </g>;
      })}
    </svg> : <p className="fallback-map-empty">Загружаем геометрию маршрута…</p>}
    <p className="fallback-map-note" role={message.startsWith("Не удалось") ? "alert" : "status"}>
      <strong>Схематичный режим</strong><span>{message}</span>
    </p>
  </div>;
}
