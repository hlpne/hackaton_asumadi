import type { MapForecastPoint, TopOverloadResponse } from "../../types";
import { snapshotPeriod } from "../../constants";

interface TopOverloadPanelProps {
  data: TopOverloadResponse | null;
  busy: boolean;
  error: string;
  routeName: string;
  selectedPoint: MapForecastPoint | null;
  onSelect: (point: MapForecastPoint) => void;
  onRetry: () => void;
}

const timestampFormatter = new Intl.DateTimeFormat("ru-RU", {
  timeZone: "Europe/Moscow",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

const valueFormatter = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2 });

export function TopOverloadPanel({
  data,
  busy,
  error,
  routeName,
  selectedPoint,
  onSelect,
  onRetry,
}: TopOverloadPanelProps) {
  const unit = data?.value_unit === "demo_index" ? "условный индекс" : data?.value_unit;

  return (
    <section className="top-panel" aria-labelledby="top-panel-title" aria-busy={busy}>
      <div className="top-panel-heading">
        <div>
          <p className="eyebrow">ВЫБРАННЫЙ МАРШРУТ</p>
          <h2 id="top-panel-title">Остановки с наибольшим индексом{routeName ? ` · ${routeName}` : ""}</h2>
          <p>До пяти остановок с самым высоким демонстрационным прогнозом {snapshotPeriod[data?.horizon ?? "day"]}. Нажмите остановку, чтобы найти её на карте.</p>
        </div>
        {data && <span className="top-panel-time">{timestampFormatter.format(new Date(data.timestamp))} МСК</span>}
      </div>

      {busy && <p className="top-panel-status" role="status">Загружаем рейтинг остановок…</p>}
      {!busy && error && (
        <div className="top-panel-error" role="alert">
          <p>Не удалось получить рейтинг: {error}</p>
          <button type="button" onClick={onRetry}>Повторить</button>
        </div>
      )}
      {!busy && !error && data && !data.items.length && (
        <p className="top-panel-status" role="status">Для выбранного времени нет остановок с положительным прогнозом. Попробуйте другое время.</p>
      )}
      {!busy && !error && data && data.items.length > 0 && (
        <ol className="top-list">
          {data.items.map((item) => {
            const selected = selectedPoint?.route_id === item.route_id &&
              selectedPoint.stop_id === item.stop_id && selectedPoint.direction_id === item.direction_id;
            return (
              <li key={`${item.route_id}/${item.direction_id}/${item.stop_id}`}>
                <button
                  type="button"
                  className={`top-item${selected ? " top-item--selected" : ""}`}
                  aria-pressed={selected}
                  aria-label={`Показать на карте: ${item.stop_name}, направление ${item.direction_id + 1}, место ${item.rank}, прогноз ${valueFormatter.format(item.predicted_load)} ${unit}`}
                  onClick={() => onSelect(item)}
                >
                  <span className="top-rank">#{item.rank}</span>
                  <span className="top-place">
                    <strong>{item.stop_name}</strong>
                    <small>Направление {item.direction_id + 1} · {item.route_name}</small>
                  </span>
                  <span className="top-load"><small>Индекс</small>{valueFormatter.format(item.predicted_load)}</span>
                </button>
              </li>
            );
          })}
        </ol>
      )}
      {data && !error && (
        <p className="top-panel-note">
          {data.is_mock
            ? `Демонстрационные данные · ${unit}. № 1 — максимальное значение среди остановок выбранного маршрута. Это не реальная перегрузка.`
            : `Единица показателя: ${unit}. № 1 — максимальное значение среди остановок выбранного маршрута; порог перегрузки не задан.`}
          {" "}Источник: /forecast/top-overload · {data.model_version}.
        </p>
      )}
    </section>
  );
}
