import type { AuthSession } from "./types";

export const STORAGE_KEY = "tram-forecast.session";
const ACTIVITY_KEY = "tram-forecast.last-activity";
// Writing to localStorage on every mouse move is wasteful; 15 s of precision is plenty.
const ACTIVITY_WRITE_INTERVAL_MS = 15_000;

function idleTimeoutMinutes(): number {
  const value = Number(import.meta.env.VITE_IDLE_TIMEOUT_MINUTES);
  return Number.isFinite(value) && value > 0 ? value : 120;
}

export const IDLE_TIMEOUT_MS = idleTimeoutMinutes() * 60 * 1000;
export const IDLE_NOTICE = `Сеанс завершён: вы были неактивны более ${formatMinutes(idleTimeoutMinutes())}. Войдите снова.`;

function formatMinutes(minutes: number): string {
  if (minutes % 60 === 0) {
    const hours = minutes / 60;
    return hours === 1 ? "1 часа" : `${hours} часов`;
  }
  return `${minutes} мин.`;
}

type Listener = (message: string) => void;
let expiredListener: Listener | null = null;
let current: AuthSession | null = null;
let lastWrittenActivity = 0;
let startupNotice = "";

export function loadSession(): AuthSession | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const session = JSON.parse(raw) as AuthSession;
    if (!session.access_token || new Date(session.expires_at).getTime() <= Date.now()) {
      clearSession();
      return null;
    }
    if (isIdle()) {
      clearSession();
      startupNotice = IDLE_NOTICE;
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

/** Last user activity shared by all tabs; null if it was never recorded. */
function lastActivity(): number | null {
  try {
    const stored = Number(localStorage.getItem(ACTIVITY_KEY));
    if (stored > 0) return Math.max(stored, lastWrittenActivity);
  } catch {
    // Fall back to this tab's own record.
  }
  return lastWrittenActivity || null;
}

export function isIdle(now = Date.now()): boolean {
  const last = lastActivity();
  return last !== null && now - last >= IDLE_TIMEOUT_MS;
}

export function markActivity(force = false): void {
  const now = Date.now();
  if (!force && now - lastWrittenActivity < ACTIVITY_WRITE_INTERVAL_MS) return;
  lastWrittenActivity = now;
  try {
    localStorage.setItem(ACTIVITY_KEY, String(now));
  } catch {
    // Private mode: activity is tracked for this tab only.
  }
}

/** Why the stored session was discarded when the page loaded, if it was. */
export function initialNotice(): string {
  return startupNotice;
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
