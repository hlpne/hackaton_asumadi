export function TransitBackdrop({ className = "" }: { className?: string }) {
  return <svg className={`login-backdrop ${className}`.trim()} viewBox="0 0 1200 800"
    preserveAspectRatio="xMidYMid slice" aria-hidden="true">
    <path className="login-line login-line--a" d="M-40 610 C 180 560, 260 420, 430 400 S 700 470, 860 330 S 1100 160, 1260 190" />
    <path className="login-line login-line--b" d="M-60 250 C 140 300, 300 250, 420 330 S 620 610, 820 600 S 1080 520, 1260 640" />
    <path className="login-line login-line--c" d="M240 -40 C 300 140, 250 260, 330 400 S 520 640, 500 860" />
    <path className="login-line login-line--d" d="M980 -40 C 900 120, 960 260, 860 330 S 700 520, 760 860" />
    {[[430, 400], [330, 400], [860, 330], [820, 600], [420, 330]].map(([x, y]) =>
      <circle key={`${x}-${y}`} className="login-stop" cx={x} cy={y} r="6" />)}
  </svg>;
}
