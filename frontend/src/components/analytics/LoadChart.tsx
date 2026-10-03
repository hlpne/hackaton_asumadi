import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ResponsiveContainer,
  ReferenceDot,
} from "recharts";
import type { ForecastResponse, Horizon } from "../../types";
import type { Theme } from "../../theme";
import { applyScenarioToForecast, formatSignedNumber, formatSignedPercent, isNeutralScenario,
  type ScenarioAdjustments } from "../../scenario";

interface LoadChartProps {
  forecast: ForecastResponse;
  theme: Theme;
  selectedIndex?: number;
  /** Пользовательский сценарий: рисуется отдельной линией, базовый прогноз модели не меняется. */
  scenario?: ScenarioAdjustments;
}

const chartNumber = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 });

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

export function LoadChart({ forecast, theme, selectedIndex, scenario }: LoadChartProps) {
  const css = getComputedStyle(document.documentElement);
  const color = (token: string) => css.getPropertyValue(token).trim();
  const colors = {
    grid: color("--chart-grid"),
    muted: color("--text-muted"),
    text: color("--text-primary"),
    predicted: color("--status-critical"),
    scenario: color("--link"),
  };
  const scenarioActive = scenario !== undefined && !isNeutralScenario(scenario);
  const scenarioPoints = scenarioActive ? applyScenarioToForecast(forecast, scenario) : [];
  const data = forecast.points.map((p, index) => ({
    timestamp: new Date(p.timestamp).getTime(),
    label: formatTick(p.timestamp, forecast.horizon),
    predicted_load: p.predicted_load,
    scenario_load: scenarioActive ? scenarioPoints[index].scenario : undefined,
  }));
  const hourlyTicks = forecast.horizon === "day" && data.length
    ? Array.from(
      { length: Math.max(0, Math.floor((data.at(-1)!.timestamp - Math.ceil(data[0].timestamp / 3_600_000) * 3_600_000) / 3_600_000) + 1) },
      (_, index) => Math.ceil(data[0].timestamp / 3_600_000) * 3_600_000 + index * 3_600_000,
    )
    : [];
  const chartMax = Math.ceil(Math.max(1, ...forecast.points.map((point) => point.predicted_load),
    ...scenarioPoints.map((point) => point.scenario)) / 10) * 10;
  const baseLabel = forecast.value_unit === "validations" ? "Базовый прогноз модели" : "Прогноз нагрузки";

  return (
    <div className="chart-wrapper" data-chart-theme={theme}>
      {scenarioActive && <div className="chart-legend" aria-label="Линии графика">
        <span><i style={{ background: colors.predicted }} aria-hidden="true" />{baseLabel}</span>
        <span><i className="chart-legend-dashed" style={{ color: colors.scenario }} aria-hidden="true" />Сценарный расчёт</span>
      </div>}
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
            label={{ value: forecast.value_unit === "validations" ? "Валидаций" : "Прогноз нагрузки", angle: -90, position: "insideLeft", fill: colors.muted }} />
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
            formatter={(value, name, item) => {
              const num = typeof value === "number" ? chartNumber.format(value) : String(value);
              if (String(name) === "scenario_load") {
                const base = Number((item?.payload as { predicted_load?: number } | undefined)?.predicted_load ?? 0);
                const delta = Number(value) - base;
                return [`${num} (${formatSignedNumber(delta)}, ${base ? formatSignedPercent(delta / base * 100, 1) : "0\u202f%"})`, "Сценарный расчёт"];
              }
              const label = String(name) === "predicted_load"
                ? scenarioActive ? baseLabel : forecast.value_unit === "validations" ? "Валидации маршрута" : "Прогноз нагрузки" : String(name);
              return [num, label];
            }}
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
          {scenarioActive && <Line
            type="monotone"
            isAnimationActive={false}
            dataKey="scenario_load"
            stroke={colors.scenario}
            strokeWidth={2.25}
            strokeDasharray="6 5"
            dot={false}
            name="scenario_load"
          />}
          {selectedIndex !== undefined && data[selectedIndex] && <ReferenceDot
            x={forecast.horizon === "day" ? data[selectedIndex].timestamp : data[selectedIndex].label}
            y={data[selectedIndex].predicted_load} r={6} fill={colors.predicted}
            stroke={colors.text} strokeWidth={2} />}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
