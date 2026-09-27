import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import {
  EyeIcon, EyeSlashIcon, InfoIcon, LockIcon, MoonIcon, ShieldCheckIcon, SignInIcon, SunIcon, TramIcon, UserIcon,
  WarningCircleIcon,
} from "@phosphor-icons/react";
import { login } from "../../api";
import { applyTheme, initialTheme } from "../../theme";
import type { Theme } from "../../theme";
import type { AuthSession } from "../../types";

interface LoginPageProps {
  notice?: string;
  onLogin: (session: AuthSession) => void;
}

export function LoginPage({ notice, onLogin }: LoginPageProps) {
  const [userLogin, setUserLogin] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [capsLock, setCapsLock] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [theme, setTheme] = useState<Theme>(initialTheme);
  const loginInput = useRef<HTMLInputElement>(null);
  const passwordInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    document.title = "Вход · Трамвай / Прогноз";
    loginInput.current?.focus();
  }, []);

  useEffect(() => applyTheme(theme), [theme]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!userLogin.trim() || !password) {
      setError("Введите логин и пароль.");
      (userLogin.trim() ? passwordInput : loginInput).current?.focus();
      return;
    }
    setBusy(true);
    setError("");
    try {
      onLogin(await login({ login: userLogin.trim(), password }));
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Не удалось выполнить вход.");
      setPassword("");
      passwordInput.current?.focus();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login-screen">
      <svg className="login-backdrop" viewBox="0 0 1200 800" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
        <path className="login-line login-line--a" d="M-40 610 C 180 560, 260 420, 430 400 S 700 470, 860 330 S 1100 160, 1260 190" />
        <path className="login-line login-line--b" d="M-60 250 C 140 300, 300 250, 420 330 S 620 610, 820 600 S 1080 520, 1260 640" />
        <path className="login-line login-line--c" d="M240 -40 C 300 140, 250 260, 330 400 S 520 640, 500 860" />
        <path className="login-line login-line--d" d="M980 -40 C 900 120, 960 260, 860 330 S 700 520, 760 860" />
        {[[430, 400], [330, 400], [860, 330], [820, 600], [420, 330]].map(([x, y]) => (
          <circle key={`${x}-${y}`} className="login-stop" cx={x} cy={y} r="6" />
        ))}
      </svg>
      <button type="button" className="theme-toggle login-theme-toggle"
        onClick={() => setTheme((value) => value === "dark" ? "light" : "dark")}
        aria-label={theme === "dark" ? "Включить светлую тему" : "Включить тёмную тему"}
        title={theme === "dark" ? "Светлая тема" : "Тёмная тема"}>
        {theme === "dark" ? <SunIcon weight="bold" aria-hidden="true" /> : <MoonIcon weight="bold" aria-hidden="true" />}
      </button>
      <section className="login-brand" aria-hidden="true">
        <span className="wordmark">
          <TramIcon size={24} weight="bold" />
          <span>ТРАМВАЙ<span className="accent"> / </span>ПРОГНОЗ</span>
        </span>
        <div className="login-brand-copy">
          <p className="login-brand-eyebrow">ДИСПЕТЧЕРСКИЙ ЦЕНТР</p>
          <p className="login-brand-title">Прогноз загруженности трамвайной сети Москвы</p>
        </div>
        <p className="login-brand-foot">Хакатон Московского транспорта · 2026</p>
      </section>

      <main className="login-main">
        <form className="login-card" onSubmit={submit} noValidate aria-labelledby="login-title">
          <p className="eyebrow">АВТОРИЗАЦИЯ</p>
          <h1 id="login-title">Вход для диспетчеров</h1>
          <p className="login-lead">Используйте учётную запись, выданную администратором.</p>

          {notice && !error && <p className="login-notice" role="status"><InfoIcon weight="bold" aria-hidden="true" />{notice}</p>}
          {error && <p className="login-error" role="alert"><WarningCircleIcon weight="bold" aria-hidden="true" />{error}</p>}

          <label>
            Логин
            <span className="login-field">
              <UserIcon aria-hidden="true" />
              <input ref={loginInput} name="username" autoComplete="username" autoCapitalize="none"
                spellCheck={false} value={userLogin} disabled={busy} aria-invalid={Boolean(error) || undefined}
                onChange={(event) => setUserLogin(event.target.value)} />
            </span>
          </label>

          <label>
            Пароль
            <span className="login-field">
              <LockIcon aria-hidden="true" />
              <input ref={passwordInput} name="password" type={showPassword ? "text" : "password"}
                autoComplete="current-password" value={password} disabled={busy}
                aria-invalid={Boolean(error) || undefined} aria-describedby={capsLock ? "caps-lock-hint" : undefined}
                onChange={(event) => setPassword(event.target.value)}
                onKeyUp={(event) => setCapsLock(event.getModifierState("CapsLock"))} />
              <button type="button" className="login-toggle" onClick={() => setShowPassword((value) => !value)}
                aria-label={showPassword ? "Скрыть пароль" : "Показать пароль"} aria-pressed={showPassword}>
                {showPassword ? <EyeSlashIcon aria-hidden="true" /> : <EyeIcon aria-hidden="true" />}
              </button>
            </span>
          </label>
          {capsLock && <p id="caps-lock-hint" className="login-hint">Включён Caps Lock</p>}

          <button type="submit" className="login-submit" disabled={busy}>
            <SignInIcon weight="bold" aria-hidden="true" />
            {busy ? "Выполняем вход…" : "Войти"}
          </button>

          <p className="login-footnote">
            <ShieldCheckIcon aria-hidden="true" />
            Сессия действует в течение смены. Не оставляйте рабочее место с открытой сессией.
          </p>
        </form>
      </main>
    </div>
  );
}
