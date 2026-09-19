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

type SortKey = "timestamp" | "predicted_load" | "lower_bound" | "upper_bound";
type SortDir = "asc" | "desc";

interface ForecastTableProps {
  forecast: ForecastResponse;
}

export function ForecastTable({ forecast }: ForecastTableProps) {
  const [sortKey, setSortKey] = useState<SortKey>("timestamp");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  const sorted: ForecastPoint[] = useMemo(() => {
    const list = [...forecast.points];
    list.sort((a, b) => {
      let cmp = 0;
      if (sortKey === "timestamp") {
        cmp = new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime();
      } else {
        const va = a[sortKey] ?? -Infinity;
        const vb = b[sortKey] ?? -Infinity;
        cmp = (va as number) - (vb as number);
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
    return list;
  }, [forecast.points, sortKey, sortDir]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortDir(key === "timestamp" ? "asc" : "desc");
    }
  }

  function arrow(key: SortKey): string {
    if (sortKey !== key) return "↕";
    return sortDir === "asc" ? "↑" : "↓";
  }

  return (
    <div className="table-wrap">
      <table>
        <caption>
          Прогноз по временным интервалам. Кликните на заголовок для сортировки.
        </caption>
        <thead>
          <tr>
            <th scope="col" className="sortable" onClick={() => toggleSort("timestamp")}>
              Начало интервала, МСК <span className="sort-arrow">{arrow("timestamp")}</span>
            </th>
            <th scope="col" className="sortable" onClick={() => toggleSort("predicted_load")}>
              Прогноз <span className="sort-arrow">{arrow("predicted_load")}</span>
            </th>
            <th scope="col" className="sortable" onClick={() => toggleSort("lower_bound")}>
              Нижняя граница <span className="sort-arrow">{arrow("lower_bound")}</span>
            </th>
            <th scope="col" className="sortable" onClick={() => toggleSort("upper_bound")}>
              Верхняя граница <span className="sort-arrow">{arrow("upper_bound")}</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((point) => (
            <tr key={point.timestamp}>
              <td>{formatter.format(new Date(point.timestamp))}</td>
              <td>{number.format(point.predicted_load)}</td>
              <td>{point.lower_bound === null ? "—" : number.format(point.lower_bound)}</td>
              <td>{point.upper_bound === null ? "—" : number.format(point.upper_bound)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}