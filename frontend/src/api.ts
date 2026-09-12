import type { ForecastRequest, ForecastResponse, Route, RouteStop } from "./types";

async function read<T>(path: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(`/api${path}`, { signal });
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    const message = body?.error?.message || `Сервис вернул ошибку ${response.status}`;
    throw new Error(message);
  }
  return response.json() as Promise<T>;
}

export const getRoutes = (signal?: AbortSignal) => read<Route[]>("/routes", signal);
export const getStops = (route: string, signal?: AbortSignal) => read<RouteStop[]>(`/routes/${encodeURIComponent(route)}/stops`, signal);
export const getForecast = (request: ForecastRequest, signal?: AbortSignal) => {
  const parameters = new URLSearchParams();
  Object.entries(request).forEach(([key, value]) => {
    if (value !== undefined) parameters.set(key, String(value));
  });
  return read<ForecastResponse>(`/forecast?${parameters}`, signal);
};
