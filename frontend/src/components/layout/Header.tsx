import { MoonIcon, SunIcon, TramIcon } from "@phosphor-icons/react";
import type { Theme } from "../../theme";

export type Page = "home" | "details" | "analytics" | "model";

interface HeaderProps {
  page: Page;
  onNavigate: (page: Page) => void;
  theme: Theme;
  onThemeToggle: () => void;
  stage?: string;
}

const links: Array<{ page: Page; label: string }> = [
  { page: "home", label: "Главное" },
  { page: "details", label: "Мониторинг" },
  { page: "analytics", label: "Сеть" },
  { page: "model", label: "О модели" },
];

export function Header({ page, onNavigate, theme, onThemeToggle, stage = "Dispatcher workspace · v0.2" }: HeaderProps) {
  return (
    <header className="topbar">
      <a href="#home" className="wordmark" aria-label="Трамвай / Прогноз — на главную"
        onClick={(event) => { event.preventDefault(); onNavigate("home"); }}>
        <TramIcon size={22} weight="bold" aria-hidden="true" />
        <span>ТРАМВАЙ<span className="accent"> / </span>ПРОГНОЗ</span>
      </a>
      <nav className="main-nav" aria-label="Разделы приложения">
        {links.map((link) => (
          <a key={link.page} href={`#${link.page}`}
            className={page === link.page ? "main-nav-link main-nav-link--active" : "main-nav-link"}
            aria-current={page === link.page ? "page" : undefined}
            onClick={(event) => { event.preventDefault(); onNavigate(link.page); }}>
            {link.label}
          </a>
        ))}
      </nav>
      <div className="topbar-actions">
        <span className="stage">{stage}</span>
        <button type="button" className="theme-toggle" onClick={onThemeToggle}
          aria-label={theme === "dark" ? "Включить светлую тему" : "Включить тёмную тему"}
          title={theme === "dark" ? "Светлая тема" : "Тёмная тема"}>
          {theme === "dark" ? <SunIcon weight="bold" aria-hidden="true" /> : <MoonIcon weight="bold" aria-hidden="true" />}
        </button>
      </div>
    </header>
  );
}
