import type { ForecastResponse } from "../../types";

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

export function ForecastTable({ forecast }: ForecastTableProps) {
  return (
    <div className="table-wrap">
      <table>
        <caption>
          Прогноз по временным интервалам. Время в строке — начало интервала.
        </caption>
        <thead>
          <tr>
            <th scope="col">Начало интервала, МСК</th>
            <th scope="col">Индекс загрузки</th>
            <th scope="col">Минимальная оценка</th>
            <th scope="col">Максимальная оценка</th>
          </tr>
        </thead>
        <tbody>
          {forecast.points.map((point) => (
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
