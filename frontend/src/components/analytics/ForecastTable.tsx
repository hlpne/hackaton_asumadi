import { useMemo, useState } from "react";
import type { ForecastPoint, ForecastResponse } from "../../types";

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
}

type SortKey = "timestamp" | "predicted_load" | "lower_bound" | "upper_bound";
type SortDirection = "asc" | "desc";

export function ForecastTable({ forecast }: ForecastTableProps) {
  const [sortKey, setSortKey] = useState<SortKey>("timestamp");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");

  const sorted = useMemo(() => {
    const points: ForecastPoint[] = [...forecast.points];
    points.sort((left, right) => {
      const first =
        sortKey === "timestamp"
          ? new Date(left.timestamp).getTime()
          : left[sortKey] ?? -Infinity;
      const second =
        sortKey === "timestamp"
          ? new Date(right.timestamp).getTime()
          : right[sortKey] ?? -Infinity;
      const comparison = first - second;
      return sortDirection === "asc" ? comparison : -comparison;
    });
    return points;
  }, [forecast.points, sortKey, sortDirection]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDirection((value) => (value === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDirection(key === "timestamp" ? "asc" : "desc");
    }
  }

  const arrow = (key: SortKey) =>
    sortKey !== key ? "↕" : sortDirection === "asc" ? "↑" : "↓";

  return (
    <div className="table-wrap">
      <table>
        <caption>
          {forecast.resolution === "schedule"
            ? "Прогноз в моменты прибытия по расписанию."
            : "Прогноз по временным интервалам."}{" "}
          Нажмите на заголовок для сортировки.
        </caption>
        <thead>
          <tr>
            <th
              scope="col"
              className="sortable"
              onClick={() => toggleSort("timestamp")}
            >
              {forecast.resolution === "schedule"
                ? "Прибытие, МСК"
                : "Начало интервала, МСК"}{" "}
              {arrow("timestamp")}
            </th>
            <th
              scope="col"
              className="sortable"
              onClick={() => toggleSort("predicted_load")}
            >
              Индекс загрузки {arrow("predicted_load")}
            </th>
            <th
              scope="col"
              className="sortable"
              onClick={() => toggleSort("lower_bound")}
            >
              Минимальная оценка {arrow("lower_bound")}
            </th>
            <th
              scope="col"
              className="sortable"
              onClick={() => toggleSort("upper_bound")}
            >
              Максимальная оценка {arrow("upper_bound")}
            </th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((point) => (
            <tr key={point.timestamp}>
              <td>{formatter.format(new Date(point.timestamp))}</td>
              {forecast.is_mock &&
              forecast.horizon === "day" &&
              point.predicted_load === 0 ? (
                <>
                  <td>Нет рейсов (демо)</td>
                  <td>—</td>
                  <td>—</td>
                </>
              ) : (
                <>
                  <td>{number.format(point.predicted_load)}</td>
                  <td>
                    {point.lower_bound === null
                      ? "—"
                      : number.format(point.lower_bound)}
                  </td>
                  <td>
                    {point.upper_bound === null
                      ? "—"
                      : number.format(point.upper_bound)}
                  </td>
                </>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}