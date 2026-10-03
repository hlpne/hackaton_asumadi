import { useMemo, useState } from "react";
import type { ForecastResponse } from "../../types";
import { applyScenarioToForecast, formatSignedNumber, formatSignedPercent, isNeutralScenario, roundValidations, scenarioResult,
  type ScenarioAdjustments } from "../../scenario";

const formatter = new Intl.DateTimeFormat("ru-RU", {
  timeZone: "Europe/Moscow",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

const number = new Intl.NumberFormat("ru-RU", {
  maximumFractionDigits: 2,
});

interface ForecastTableProps {
  forecast: ForecastResponse;
  /** Сценарий «что если?»: при активном сценарии добавляются колонки сценарного расчёта. */
  scenario?: ScenarioAdjustments;
}

type SortKey = "timestamp" | "predicted_load" | "scenario";
type SortDirection = "asc" | "desc";

export function ForecastTable({ forecast, scenario }: ForecastTableProps) {
  const [sortKey, setSortKey] = useState<SortKey>("timestamp");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");
  const scenarioActive = scenario !== undefined && !isNeutralScenario(scenario);
  const deltaLabel = scenarioActive ? formatSignedPercent(scenarioResult(scenario).deltaPercent, 1) : "";
  const rows = useMemo(() => {
    const points = applyScenarioToForecast(forecast, scenario ?? { weather: 0, event: 0, season: 0 });
    const value = (point: (typeof points)[number]) => sortKey === "timestamp" ? new Date(point.timestamp).getTime()
      : sortKey === "scenario" ? point.scenario : point.base;
    return [...points].sort((left, right) => {
      const comparison = value(left) - value(right);
      return sortDirection === "asc" ? comparison : -comparison;
    });
  }, [forecast, scenario, sortKey, sortDirection]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDirection((value) => value === "asc" ? "desc" : "asc");
    else {
      setSortKey(key);
      setSortDirection(key === "timestamp" ? "asc" : "desc");
    }
  }

  const arrow = (key: SortKey) => sortKey !== key ? "↕" : sortDirection === "asc" ? "↑" : "↓";

  return (
    <div className="table-wrap">
      <table>
        <caption>
          {forecast.resolution === "schedule" ? "Прогноз в моменты прибытия по расписанию." : "Прогноз по временным интервалам."}
          {scenarioActive && " Сценарный расчёт — пользовательская поправка поверх базового прогноза модели."}
          {" "}Нажмите на заголовок для сортировки.
        </caption>
        <thead>
          <tr>
            <th scope="col" className="sortable" onClick={() => toggleSort("timestamp")}>
              {forecast.resolution === "schedule" ? "Прибытие, МСК" : "Начало интервала, МСК"} {arrow("timestamp")}
            </th>
            <th scope="col" className="sortable" onClick={() => toggleSort("predicted_load")}>
              {scenarioActive ? "Базовый прогноз модели" : forecast.value_unit === "validations" ? "Прогноз валидаций маршрута" : "Значение прогноза"} {arrow("predicted_load")}
            </th>
            {scenarioActive && <th scope="col" className="sortable" onClick={() => toggleSort("scenario")}>Сценарный расчёт {arrow("scenario")}</th>}
            {scenarioActive && <th scope="col">Изменение</th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((point) => {
            const scenarioValue = roundValidations(point.scenario);
            return <tr key={point.timestamp}>
              <td>{formatter.format(new Date(point.timestamp))}</td>
              {forecast.is_mock && forecast.horizon === "day" && point.base === 0 ? (
                <td>Нет значения</td>
              ) : (
                <td>{number.format(point.base)}</td>
              )}
              {scenarioActive && <td className="table-scenario">{number.format(scenarioValue)}</td>}
              {scenarioActive && <td className="table-delta">{formatSignedNumber(scenarioValue - point.base)} · {deltaLabel}</td>}
            </tr>;
          })}
        </tbody>
      </table>
    </div>
  );
}
