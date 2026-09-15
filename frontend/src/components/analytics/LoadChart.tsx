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

interface LoadChartProps {
  forecast: ForecastResponse;
}

const LABELS: Record<string, string> = {
  predicted_load: "Прогноз",
  lower_bound: "Нижняя граница",
  upper_bound: "Верхняя граница",
};

function formatTick(ts: string, horizon: Horizon): string {
  const d = new Date(ts);
  if (horizon === "day") {
    return `${d.getHours().toString().padStart(2, "0")}:00`;
  }
  if (horizon === "month") {
    return `${d.getDate().toString().padStart(2, "0")}.${(d.getMonth() + 1)
      .toString()
      .padStart(2, "0")}`;
  }
  return d.toLocaleDateString("ru-RU", { month: "short", year: "2-digit" });
}

export function LoadChart({ forecast }: LoadChartProps) {
  const data = forecast.points.map((p) => ({
    label: formatTick(p.timestamp, forecast.horizon),
    predicted_load: p.predicted_load,
    lower_bound: p.lower_bound,
    upper_bound: p.upper_bound,
  }));

  return (
    <div className="chart-wrapper">
      <h3 className="chart-title">Динамика прогноза</h3>
      <ResponsiveContainer width="100%" height={280}>
        <LineChart data={data} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e0e6ef" />
          <XAxis dataKey="label" stroke="#536177" fontSize={12} tickMargin={8} />
          <YAxis stroke="#536177" fontSize={12} tickMargin={4} />
          <Tooltip
            contentStyle={{
              background: "#fff",
              border: "1px solid #d7dfeb",
              borderRadius: 6,
              fontSize: 13,
            }}
            labelStyle={{ color: "#17263c", fontWeight: 600 }}
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
            dataKey="lower_bound"
            stroke="#8498b2"
            strokeWidth={1}
            strokeDasharray="4 4"
            dot={false}
            name="lower_bound"
          />
          <Line
            type="monotone"
            dataKey="upper_bound"
            stroke="#8498b2"
            strokeWidth={1}
            strokeDasharray="4 4"
            dot={false}
            name="upper_bound"
          />
          <Line
            type="monotone"
            dataKey="predicted_load"
            stroke="#e74646"
            strokeWidth={2.5}
            dot={false}
            name="predicted_load"
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}