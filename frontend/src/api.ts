import { accessToken, notifySessionExpired } from "./session";
import type {
  AuthSession,
  DispatcherProfile,
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

async function errorMessage(response: Response): Promise<string> {
  const body = await response.json().catch(() => null);
  return body?.error?.message || `Сервис вернул ошибку ${response.status}`;
}

async function read<T>(path: string, signal?: AbortSignal): Promise<T> {
  const token = accessToken();
  const headers: HeadersInit = token ? { Authorization: `Bearer ${token}` } : {};
  const response = await fetch(`/api${path}`, { signal, headers });
  if (!response.ok) {
    const message = await errorMessage(response);
    if (response.status === 401) notifySessionExpired(message);
    throw new Error(message);
  }
  return response.json() as Promise<T>;
}

export async function login(credentials: { login: string; password: string }): Promise<AuthSession> {
  const response = await fetch("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(credentials),
  });
  if (!response.ok) {
    if (response.status >= 500) throw new Error("Сервер авторизации недоступен. Попробуйте позже.");
    throw new Error(await errorMessage(response));
  }
  const body = await response.json();
  return { access_token: body.access_token, expires_at: body.expires_at, user: body.user };
}

export async function getCurrentDispatcher(signal?: AbortSignal): Promise<DispatcherProfile> {
  const session = await read<{ user: DispatcherProfile }>("/auth/me", signal);
  return session.user;
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
