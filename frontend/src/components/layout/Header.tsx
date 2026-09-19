import { TramIcon } from "@phosphor-icons/react";

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
      <span className="stage">{stage}</span>
    </header>
  );
}
