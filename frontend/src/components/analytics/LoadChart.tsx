import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
} from "recharts";
import type { ForecastResponse, Horizon } from "../../types";
import type { Theme } from "../../theme";

interface LoadChartProps {
  forecast: ForecastResponse;
  theme: Theme;
}

const LABELS: Record<string, string> = {
  predicted_load: "Индекс загрузки",
  lower_bound: "Минимальная оценка",
  upper_bound: "Максимальная оценка",
};

function formatTick(ts: string, horizon: Horizon): string {
  const d = new Date(ts);
  if (horizon === "day") {
    return d.toLocaleTimeString("ru-RU", { timeZone: "Europe/Moscow", hour: "2-digit", minute: "2-digit" });
  }
  if (horizon === "month") {
    return d.toLocaleDateString("ru-RU", { timeZone: "Europe/Moscow", day: "2-digit", month: "2-digit" });
  }
  return d.toLocaleDateString("ru-RU", { timeZone: "Europe/Moscow", month: "short", year: "2-digit" });
}

function formatHourTick(value: number): string {
  const hour = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Moscow",
    hour: "2-digit",
    hour12: false,
  }).format(new Date(value));
  return hour === "00" ? "00:00" : `${Number(hour)}:00`;
}

export function LoadChart({ forecast, theme }: LoadChartProps) {
  const css = getComputedStyle(document.documentElement);
  const color = (token: string) => css.getPropertyValue(token).trim();
  const colors = {
    grid: color("--chart-grid"),
    muted: color("--text-muted"),
    text: color("--text-primary"),
    interval: color("--chart-interval"),
    predicted: color("--status-critical"),
  };
  const data = forecast.points.map((p) => ({
    timestamp: new Date(p.timestamp).getTime(),
    label: formatTick(p.timestamp, forecast.horizon),
    predicted_load: p.predicted_load,
    lower_bound: p.lower_bound,
    upper_bound: p.upper_bound,
  }));
  const hourlyTicks = forecast.horizon === "day" && data.length
    ? Array.from(
      { length: Math.max(0, Math.floor((data.at(-1)!.timestamp - Math.ceil(data[0].timestamp / 3_600_000) * 3_600_000) / 3_600_000) + 1) },
      (_, index) => Math.ceil(data[0].timestamp / 3_600_000) * 3_600_000 + index * 3_600_000,
    )
    : [];
  const chartMax = Math.ceil(Math.max(70, ...forecast.points.map((point) => point.upper_bound ?? point.predicted_load)) / 10) * 10;

  return (
    <div className="chart-wrapper" data-chart-theme={theme}>
      {forecast.value_unit === "demo_index" && (
        <p className="chart-subtitle">Демонстрационный индекс: низкая нагрузка до 35, средняя 35–54, высокая от 55.</p>
      )}
      <ResponsiveContainer width="100%" height={320}>
        <LineChart data={data} margin={{ top: 10, right: 20, left: 12, bottom: 0 }}>
          <CartesianGrid strokeDasharray="2 6" stroke={colors.grid} strokeOpacity={0.55} />
          {forecast.horizon === "day" ? <XAxis dataKey="timestamp" type="number" scale="time"
            domain={["dataMin", "dataMax"]} ticks={hourlyTicks} minTickGap={24}
            tickFormatter={(value) => formatHourTick(Number(value))}
            stroke={colors.muted} fontSize={12} tickMargin={8} />
            : <XAxis dataKey="label" stroke={colors.muted} fontSize={12} tickMargin={8}
              interval={forecast.horizon === "year" ? 1 : 3} />}
          <YAxis stroke={colors.muted} fontSize={12} tickMargin={4} domain={[0, chartMax]}
            label={{ value: "Индекс загрузки", angle: -90, position: "insideLeft", fill: colors.muted }} />
          <Tooltip
            contentStyle={{
              background: theme === "light" ? "rgba(249, 252, 255, .92)" : "rgba(12, 27, 46, .9)",
              border: theme === "light" ? "1px solid rgba(95, 132, 173, .2)" : "1px solid rgba(169, 197, 229, .17)",
              borderRadius: 12,
              boxShadow: "0 12px 28px rgba(0, 5, 16, .2)",
              backdropFilter: "blur(18px)",
              fontSize: 13,
            }}
            labelStyle={{ color: colors.text, fontWeight: 600 }}
            labelFormatter={(value) => forecast.horizon === "day"
              ? formatTick(new Date(Number(value)).toISOString(), "day")
              : String(value)}
            formatter={(value, name) => {
              const label = LABELS[String(name)] ?? String(name);
              const num =
                typeof value === "number" ? value.toFixed(1) : String(value);
              return [num, label];
            }}
          />
          <Legend
            formatter={(value) => LABELS[String(value)] ?? String(value)}
          />
          <Line
            type="monotone"
            isAnimationActive={false}
            dataKey="lower_bound"
            stroke={colors.interval}
            strokeWidth={1}
            strokeDasharray="4 4"
            dot={false}
            name="lower_bound"
          />
          <Line
            type="monotone"
            isAnimationActive={false}
            dataKey="upper_bound"
            stroke={colors.interval}
            strokeWidth={1}
            strokeDasharray="4 4"
            dot={false}
            name="upper_bound"
          />
          <Line
            type="monotone"
            isAnimationActive={false}
            dataKey="predicted_load"
            stroke={colors.predicted}
            strokeWidth={2.5}
            dot={false}
            name="predicted_load"
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
