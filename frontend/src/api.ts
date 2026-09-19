import type { ForecastRequest, ForecastResponse, Route, RouteStop } from "./types";
import { mockForecast, mockRoutes, mockStopsForRoute } from "./mock/mockData";

async function read<T>(path: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(`/api${path}`, { signal });
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    const message = body?.error?.message || `Сервис вернул ошибку ${response.status}`;
    throw new Error(message);
  }
  return response.json() as Promise<T>;
}

export async function getRoutes(signal?: AbortSignal): Promise<Route[]> {
  try {
    return await read<Route[]>("/routes", signal);
  } catch (error) {
    if (signal?.aborted) throw error;
    console.warn("[api] backend недоступен, используем mock routes", error);
    return mockRoutes;
  }
}

export async function getStops(
  route: string,
  signal?: AbortSignal
): Promise<RouteStop[]> {
  try {
    return await read<RouteStop[]>(
      `/routes/${encodeURIComponent(route)}/stops`,
      signal
    );
  } catch (error) {
    if (signal?.aborted) throw error;
    console.warn("[api] backend недоступен, используем mock stops", error);
    return mockStopsForRoute(route);
  }
}

export async function getForecast(
  request: ForecastRequest,
  signal?: AbortSignal
): Promise<ForecastResponse> {
  const parameters = new URLSearchParams();
  Object.entries(request).forEach(([key, value]) => {
    if (value !== undefined) parameters.set(key, String(value));
  });
  try {
    return await read<ForecastResponse>(`/forecast?${parameters}`, signal);
  } catch (error) {
    if (signal?.aborted) throw error;
    console.warn("[api] backend недоступен, используем mock forecast", error);
    return mockForecast(
      request.route_id,
      request.stop_id,
      request.horizon,
      request.from,
      request.to
    );
  }
}