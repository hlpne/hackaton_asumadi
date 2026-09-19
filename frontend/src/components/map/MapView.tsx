import { YMaps, Map, Placemark, Polyline } from "@pbe/react-yandex-maps";
import type { Route, RouteStop } from "../../types";

const API_KEY = import.meta.env.VITE_YANDEX_MAPS_API_KEY;

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

  if (!API_KEY) {
    return (
      <div className="map-wrapper">
        <div className="map-error">
          Не задан ключ Яндекс.Карт. Проверьте{" "}
          <code>VITE_YANDEX_MAPS_API_KEY</code> в файле <code>.env</code>.
        </div>
      </div>
    );
  }

  return (
    <div className="map-wrapper">
      <YMaps query={{ apikey: API_KEY, lang: "ru_RU", load: "package.full" }}>
        <Map
          defaultState={{ center, zoom: 12 }}
          width="100%"
          height="420px"
          modules={["geoObject.addon.balloon", "geoObject.addon.hint"]}
        >
          {route && positions.length > 1 && (
            <Polyline
              geometry={positions}
              options={{
                strokeColor: route.color,
                strokeWidth: 4,
                strokeOpacity: 0.85,
              }}
            />
          )}

          {stops.map((stop) => {
            const isSelected = stop.id === selectedStopId;
            return (
              <Placemark
                key={stop.id}
                geometry={[stop.lat, stop.lon]}
                options={{
                  preset: isSelected ? "islands#redIcon" : "islands#blueIcon",
                }}
                properties={{
                  hintContent: stop.name,
                  balloonContent: `
                    <strong>${stop.name}</strong><br/>
                    Остановка №${stop.sequence}<br/>
                    ID: ${stop.id}
                  `,
                }}
              />
            );
          })}
        </Map>
      </YMaps>
    </div>
  );
}