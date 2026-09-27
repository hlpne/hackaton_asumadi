import type {
  ForecastRequest,
  ForecastResponse,
  MapForecastResponse,
  ModelMetadata,
  Route,
  RouteGeometry,
  RouteStop,
  SnapshotRequest,
  TopOverloadResponse,
} from "./types";

async function read<T>(path: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(`/api${path}`, { signal });
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    const message = body?.error?.message || `Сервис вернул ошибку ${response.status}`;
    throw new Error(message);
  }
  return response.json() as Promise<T>;
}

function queryString(request: Record<string, unknown>): string {
  const parameters = new URLSearchParams();
  Object.entries(request).forEach(([key, value]) => {
    if (value !== undefined) parameters.set(key, String(value));
  });
  return parameters.toString();
}

export async function getRoutes(signal?: AbortSignal): Promise<Route[]> {
  return read<Route[]>("/routes", signal);
}

export async function getStops(
  route: string,
  signal?: AbortSignal
): Promise<RouteStop[]> {
  return read<RouteStop[]>(`/routes/${encodeURIComponent(route)}/stops`, signal);
}

export async function getRouteGeometry(route: string, directionId: 0 | 1, signal?: AbortSignal): Promise<RouteGeometry> {
  return read<RouteGeometry>(`/routes/${encodeURIComponent(route)}/geometry?direction_id=${directionId}`, signal);
}

export async function getForecast(
  request: ForecastRequest,
  signal?: AbortSignal
): Promise<ForecastResponse> {
  const parameters = queryString(request as unknown as Record<string, unknown>);
  return read<ForecastResponse>(`/forecast?${parameters}`, signal);
}


export function getMapForecast(
  request: SnapshotRequest = {},
  signal?: AbortSignal
): Promise<MapForecastResponse> {
  return read<MapForecastResponse>(
    `/forecast/map?${queryString(request as Record<string, unknown>)}`,
    signal
  );
}


export function getTopOverload(
  request: SnapshotRequest & { limit?: number } = {},
  signal?: AbortSignal
): Promise<TopOverloadResponse> {
  return read<TopOverloadResponse>(
    `/forecast/top-overload?${queryString(request as Record<string, unknown>)}`,
    signal
  );
}

export function getModelMetadata(signal?: AbortSignal): Promise<ModelMetadata> {
  return read<ModelMetadata>("/model/metadata", signal);
}
