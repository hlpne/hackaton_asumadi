import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  ReferenceLine,
  ReferenceArea,
} from "recharts";
import type { ForecastResponse, Horizon } from "../../types";

interface LoadChartProps {
  forecast: ForecastResponse;
}

const LABELS: Record<string, string> = {
  predicted_load: "Загрузка",
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
      <div className="chart-header">
        <h3 className="chart-title">Динамика прогноза загрузки</h3>
        <ul className="chart-legend-scale">
          <li>
            <span className="scale-dot scale-dot--critical" />
            <strong>90–100 %</strong> — критическая загрузка, свободных мест нет
          </li>
          <li>
            <span className="scale-dot scale-dot--high" />
            <strong>70–90 %</strong> — высокая загрузка, большинство мест занято
          </li>
          <li>
            <span className="scale-dot scale-dot--medium" />
            <strong>40–70 %</strong> — средняя загрузка, есть свободные места
          </li>
          <li>
            <span className="scale-dot scale-dot--low" />
            <strong>0–40 %</strong> — низкая загрузка, вагон свободен
          </li>
        </ul>
      </div>

      <ResponsiveContainer width="100%" height={340}>
        <LineChart
          data={data}
          margin={{ top: 10, right: 20, left: 10, bottom: 10 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#e0e6ef" />

          <ReferenceArea
            y1={0}
            y2={40}
            fill="#1f8a4c"
            fillOpacity={0.08}
            stroke="none"
          />
          <ReferenceArea
            y1={40}
            y2={70}
            fill="#5a8cc4"
            fillOpacity={0.08}
            stroke="none"
          />
          <ReferenceArea
            y1={70}
            y2={90}
            fill="#e08a2e"
            fillOpacity={0.1}
            stroke="none"
          />
          <ReferenceArea
            y1={90}
            y2={100}
            fill="#e74646"
            fillOpacity={0.12}
            stroke="none"
          />

          <XAxis
            dataKey="label"
            stroke="#536177"
            fontSize={12}
            tickMargin={8}
          />

          <YAxis
            stroke="#536177"
            fontSize={12}
            tickMargin={6}
            domain={[0, 100]}
            ticks={[0, 25, 50, 75, 100]}
            unit="%"
            label={{
              value: "Загрузка, %",
              angle: -90,
              position: "insideLeft",
              style: {
                textAnchor: "middle",
                fill: "#536177",
                fontSize: 12,
              },
              offset: 0,
            }}
          />

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
              return [`${num} %`, label];
            }}
          />

          <Legend
            formatter={(value) => LABELS[String(value)] ?? String(value)}
          />

          <ReferenceLine
            y={100}
            stroke="#e74646"
            strokeDasharray="6 3"
            strokeWidth={1}
            label={{
              value: "Максимум: 100 %",
              position: "insideTopRight",
              fill: "#941f29",
              fontSize: 11,
            }}
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
            stroke="#17263c"
            strokeWidth={2.5}
            dot={false}
            name="predicted_load"
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}