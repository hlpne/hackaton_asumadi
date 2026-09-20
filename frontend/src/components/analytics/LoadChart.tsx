import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  ReferenceArea,
} from "recharts";
import type { ForecastResponse, Horizon } from "../../types";

interface LoadChartProps {
  forecast: ForecastResponse;
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

export function LoadChart({ forecast }: LoadChartProps) {
  const data = forecast.points.map((p) => ({
    label: formatTick(p.timestamp, forecast.horizon),
    predicted_load: p.predicted_load,
    lower_bound: p.lower_bound,
    upper_bound: p.upper_bound,
  }));
  const chartMax = Math.ceil(Math.max(70, ...forecast.points.map((point) => point.upper_bound ?? point.predicted_load)) / 10) * 10;

  return (
    <div className="chart-wrapper">
      {forecast.value_unit === "demo_index" && (
        <p className="chart-subtitle">Демонстрационный индекс: низкая нагрузка до 35, средняя 35–54, высокая от 55.</p>
      )}
      <ResponsiveContainer width="100%" height={320}>
        <LineChart data={data} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e0e6ef" />
          {forecast.value_unit === "demo_index" && (
            <>
              <ReferenceArea y1={0} y2={35} fill="#27825d" fillOpacity={0.08} stroke="none" />
              <ReferenceArea y1={35} y2={55} fill="#d28a1e" fillOpacity={0.08} stroke="none" />
              <ReferenceArea y1={55} y2={chartMax} fill="#d9444b" fillOpacity={0.08} stroke="none" />
            </>
          )}
          <XAxis dataKey="label" stroke="#536177" fontSize={12} tickMargin={8}
            interval={forecast.horizon === "year" ? 1 : forecast.horizon === "month" ? 3 : 2} />
          <YAxis stroke="#536177" fontSize={12} tickMargin={4} domain={[0, chartMax]} />
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
