interface HeaderProps {
  stage?: string;
}

export function Header({ stage = "Прототип команды · v0.1" }: HeaderProps) {
  return (
    <header className="topbar">
      <span className="wordmark">
        ТРАМВАЙ<span className="accent"> / </span>ПРОГНОЗ
      </span>
      <span className="stage">{stage}</span>
    </header>
  );
}