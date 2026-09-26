import type { AuthSession } from "./types";

const STORAGE_KEY = "tram-forecast.session";

type Listener = (message: string) => void;
let expiredListener: Listener | null = null;
let current: AuthSession | null = null;

export function loadSession(): AuthSession | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const session = JSON.parse(raw) as AuthSession;
    if (!session.access_token || new Date(session.expires_at).getTime() <= Date.now()) {
      clearSession();
      return null;
    }
    return session;
  } catch {
    return null;
  }
}

export function saveSession(session: AuthSession): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  } catch {
    // Private mode: the session still works until the tab is closed.
  }
  current = session;
}

export function clearSession(): void {
  current = null;
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Nothing to clean up.
  }
}

current = loadSession();

export function accessToken(): string | undefined {
  return current?.access_token;
}

/** Called by the API client when the backend rejects the token. */
export function notifySessionExpired(message: string): void {
  clearSession();
  expiredListener?.(message);
}

export function onSessionExpired(listener: Listener): () => void {
  expiredListener = listener;
  return () => {
    if (expiredListener === listener) expiredListener = null;
  };
}
