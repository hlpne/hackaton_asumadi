import { MapContainer, TileLayer, Marker, Popup, Polyline } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { Route, RouteStop } from "../../types";

// Фикс для иконок Leaflet в Vite (иначе маркеры не отображаются)
import markerIcon2x from "leaflet/dist/images/marker-icon-2x.png";
import markerIcon from "leaflet/dist/images/marker-icon.png";
import markerShadow from "leaflet/dist/images/marker-shadow.png";

delete (L.Icon.Default.prototype as unknown as { _getIconUrl?: unknown })._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
});

interface MapViewProps {
  route?: Route;
  stops: RouteStop[];
  selectedStopId: string;
}

export function MapView({ route, stops, selectedStopId }: MapViewProps) {
  const positions = stops.map((s) => [s.lat, s.lon] as [number, number]);

  const center: [number, number] =
    positions.length > 0
      ? positions[Math.floor(positions.length / 2)]
      : [55.75, 37.65];

  return (
    <div className="map-wrapper">
      <MapContainer
        center={center}
        zoom={12}
        className="map-container"
        scrollWheelZoom={false}
      >
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        />

        {route && positions.length > 1 && (
          <Polyline positions={positions} color={route.color} weight={4} />
        )}

        {stops.map((stop) => (
          <Marker
            key={stop.id}
            position={[stop.lat, stop.lon]}
            opacity={selectedStopId && stop.id !== selectedStopId ? 0.5 : 1}
          >
            <Popup>
              <strong>{stop.name}</strong>
              <br />
              Остановка №{stop.sequence} · ID {stop.id}
            </Popup>
          </Marker>
        ))}
      </MapContainer>
    </div>
  );
}