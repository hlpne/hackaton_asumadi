import { SignOutIcon, TramIcon, UserCircleIcon } from "@phosphor-icons/react";
import { useAuth } from "../auth/AuthGate";

export type Page = "home" | "details" | "analytics";

interface HeaderProps {
  page: Page;
  onNavigate: (page: Page) => void;
  stage?: string;
}

const links: Array<{ page: Page; label: string }> = [
  { page: "home", label: "Главная" },
  { page: "details", label: "Детализация" },
  { page: "analytics", label: "Аналитика" },
];

export function Header({ page, onNavigate, stage = "Прототип команды · v0.1" }: HeaderProps) {
  const auth = useAuth();
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
      <div className="topbar-end">
        <span className="stage">{stage}</span>
        {auth && <div className="user-menu">
          <span className="user-name" title={`Логин: ${auth.user.login}`}>
            <UserCircleIcon size={20} aria-hidden="true" />
            <span>{auth.user.full_name}</span>
          </span>
          <button type="button" className="logout-button" onClick={auth.logout}>
            <SignOutIcon size={18} weight="bold" aria-hidden="true" />
            Выйти
          </button>
        </div>}
      </div>
    </header>
  );
}
