import { createContext, useContext, useEffect, useState } from "react";
import type { ReactNode } from "react";
import { getCurrentDispatcher } from "../../api";
import {
  IDLE_NOTICE, STORAGE_KEY, clearSession, initialNotice, isIdle, loadSession, markActivity, onSessionExpired, saveSession,
} from "../../session";
import type { AuthSession, DispatcherProfile } from "../../types";
import { LoginPage } from "./LoginPage";

interface AuthContextValue {
  user: DispatcherProfile;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);
const ACTIVITY_EVENTS = ["pointerdown", "pointermove", "keydown", "wheel", "touchstart"] as const;
const IDLE_CHECK_INTERVAL_MS = 30_000;

export function useAuth(): AuthContextValue | null {
  return useContext(AuthContext);
}

export function AuthGate({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<AuthSession | null>(loadSession);
  const [checking, setChecking] = useState(() => session !== null);
  const [notice, setNotice] = useState(initialNotice);

  useEffect(() => onSessionExpired((message) => {
    setSession(null);
    setNotice(message || "Сессия завершена. Войдите снова.");
  }), []);

  useEffect(() => {
    if (!checking) return;
    const controller = new AbortController();
    getCurrentDispatcher(controller.signal)
      .then((user) => {
        if (controller.signal.aborted) return;
        setSession((previous) => {
          if (!previous) return previous;
          const next = { ...previous, user };
          saveSession(next);
          return next;
        });
      })
      // A 401 is handled by onSessionExpired; other failures keep the stored session.
      .catch(() => undefined)
      .finally(() => { if (!controller.signal.aborted) setChecking(false); });
    return () => controller.abort();
  }, [checking]);

  useEffect(() => {
    if (!session) return;
    // Sign out exactly when the token expires, even if the dispatcher is idle.
    const timeout = new Date(session.expires_at).getTime() - Date.now();
    const timer = window.setTimeout(() => {
      clearSession();
      setSession(null);
      setNotice("Смена завершена: срок действия сессии истёк. Войдите снова.");
    }, Math.min(Math.max(timeout, 0), 2 ** 31 - 1));
    return () => window.clearTimeout(timer);
  }, [session]);

  useEffect(() => {
    if (!session) return;
    const end = (message: string) => {
      clearSession();
      setSession(null);
      setNotice(message);
    };
    // Check before recording: after sleep or a long absence the first mouse move must not revive the session.
    const onActivity = () => (isIdle() ? end(IDLE_NOTICE) : markActivity());
    const check = () => { if (isIdle()) end(IDLE_NOTICE); };
    const onStorage = (event: StorageEvent) => {
      if (event.key !== STORAGE_KEY || event.newValue !== null) return;
      end(isIdle() ? IDLE_NOTICE : "Вы вышли из системы в другой вкладке.");
    };
    markActivity(true);
    ACTIVITY_EVENTS.forEach((name) => window.addEventListener(name, onActivity, { passive: true, capture: true }));
    document.addEventListener("visibilitychange", check);
    window.addEventListener("focus", check);
    window.addEventListener("storage", onStorage);
    const timer = window.setInterval(check, IDLE_CHECK_INTERVAL_MS);
    return () => {
      ACTIVITY_EVENTS.forEach((name) => window.removeEventListener(name, onActivity, { capture: true }));
      document.removeEventListener("visibilitychange", check);
      window.removeEventListener("focus", check);
      window.removeEventListener("storage", onStorage);
      window.clearInterval(timer);
    };
  }, [session]);

  if (checking) {
    return <div className="auth-checking" role="status">Проверяем сессию…</div>;
  }

  if (!session) {
    return <LoginPage notice={notice} onLogin={(next) => {
      saveSession(next);
      setNotice("");
      setSession(next);
    }} />;
  }

  const logout = () => {
    clearSession();
    setNotice("Вы вышли из системы.");
    setSession(null);
  };

  return <AuthContext.Provider value={{ user: session.user, logout }}>{children}</AuthContext.Provider>;
}
