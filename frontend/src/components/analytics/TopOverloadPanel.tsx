import type { ForecastPoint } from "../../types";

interface TopOverloadPanelProps {
  points: ForecastPoint[];
}

interface RankedPoint {
  rank: number;
  timestamp: string;
  load: number;
  level: "high" | "medium" | "low";
}

const formatter = new Intl.DateTimeFormat("ru-RU", {
  timeZone: "Europe/Moscow",
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

function classify(load: number, maxLoad: number): RankedPoint["level"] {
  const ratio = load / maxLoad;
  if (ratio >= 0.85) return "high";
  if (ratio >= 0.6) return "medium";
  return "low";
}

export function TopOverloadPanel({ points }: TopOverloadPanelProps) {
  if (points.length === 0) return null;

  const activePoints = points.filter((point) => point.predicted_load > 0);
  if (!activePoints.length) return <div className="top-panel"><h3 className="chart-title">Top-5 перегруженных интервалов</h3><p>Нет интервалов с положительной загрузкой.</p></div>;
  const maxLoad = Math.max(...activePoints.map((p) => p.predicted_load));

  const ranked: RankedPoint[] = activePoints
    .map((p) => ({
      rank: 0,
      timestamp: p.timestamp,
      load: p.predicted_load,
      level: classify(p.predicted_load, maxLoad),
    }))
    .sort((a, b) => b.load - a.load)
    .slice(0, 5)
    .map((item, index) => ({ ...item, rank: index + 1 }));

  return (
    <div className="top-panel">
      <h3 className="chart-title">Top-5 перегруженных интервалов</h3>
      <ul className="top-list">
        {ranked.map((item) => (
          <li key={item.timestamp} className={`top-item top-item--${item.level}`}>
            <span className="top-rank">#{item.rank}</span>
            <span className="top-time">{formatter.format(new Date(item.timestamp))}</span>
            <span className="top-load">
              {item.load.toFixed(1)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
