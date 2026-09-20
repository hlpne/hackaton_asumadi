import { useEffect, useRef, useState } from "react";
import { loadColor, loadLabels, loadLevel, type LoadLevel } from "../../loadLevel";
import type { MapForecastPoint, MapForecastResponse, RouteStop } from "../../types";

type LoadFilter = "all" | LoadLevel | "unavailable";

interface StopsModalProps {
  stops: RouteStop[];
  snapshot: MapForecastResponse | null;
  selectedStopId: string;
  onSelect: (point: MapForecastPoint) => void;
  onClose: () => void;
}

const number = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 1 });

export function StopsModal({ stops, snapshot, selectedStopId, onSelect, onClose }: StopsModalProps) {
  const [direction, setDirection] = useState("all");
  const [load, setLoad] = useState<LoadFilter>("all");
  const closeButton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeButton.current?.focus();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const handleKey = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    document.addEventListener("keydown", handleKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKey);
    };
  }, [onClose]);

  const pointByStop = new Map(snapshot?.points.map((point) => [`${point.direction_id}/${point.stop_id}`, point]) ?? []);
  const visible = stops
    .filter((stop) => direction === "all" || stop.direction_id === Number(direction))
    .map((stop) => ({ stop, point: pointByStop.get(`${stop.direction_id}/${stop.id}`) }))
    .filter(({ point }) => {
      if (load === "all") return true;
      if (load === "unavailable") return !point;
      return Boolean(point && snapshot && loadLevel(point.predicted_load, snapshot) === load);
    })
    .sort((a, b) => a.stop.direction_id - b.stop.direction_id || a.stop.sequence - b.stop.sequence);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal stops-modal" role="dialog" aria-modal="true" aria-labelledby="stops-modal-title"
        onClick={(event) => event.stopPropagation()}>
        <div className="modal-header">
          <div>
            <p className="eyebrow">МАРШРУТ И ОСТАНОВКИ</p>
            <h2 id="stops-modal-title">Все остановки</h2>
          </div>
          <button ref={closeButton} type="button" className="modal-close" onClick={onClose} aria-label="Закрыть окно">×</button>
        </div>
        <div className="stops-modal-filters">
          <label>Направление
            <select value={direction} onChange={(event) => setDirection(event.target.value)}>
              <option value="all">Оба направления</option>
              <option value="0">Направление 1</option>
              <option value="1">Направление 2</option>
            </select>
          </label>
          <label>Загрузка
            <select value={load} onChange={(event) => setLoad(event.target.value as LoadFilter)}>
              <option value="all">Любая</option>
              <option value="low">Низкая</option>
              <option value="medium">Средняя</option>
              <option value="high">Высокая</option>
              <option value="unavailable">Без прогноза</option>
            </select>
          </label>
        </div>
        <div className="modal-body stops-modal-body">
          <p className="stops-count" role="status">Показано {visible.length} из {stops.length} остановок</p>
          {visible.length ? <ul className="stops-modal-list">
            {visible.map(({ stop, point }) => {
              const level = point && snapshot ? loadLevel(point.predicted_load, snapshot) : null;
              return <li key={`${stop.direction_id}/${stop.id}`}>
                <button type="button" className={`stops-modal-row${selectedStopId === stop.id ? " stops-modal-row--selected" : ""}`}
                  disabled={!point} aria-pressed={selectedStopId === stop.id}
                  onClick={() => { if (point) { onSelect(point); onClose(); } }}>
                  <span className="stops-modal-sequence">{stop.sequence + 1}</span>
                  <span className="stops-modal-name"><strong>{stop.name}</strong><small>Направление {stop.direction_id + 1}</small></span>
                  <span className="stops-modal-load">
                    {point && snapshot && level ? <><strong>{number.format(point.predicted_load)}</strong>
                      <small style={{ color: loadColor(point.predicted_load, snapshot) }}>{loadLabels[level]}</small></>
                      : <small>Нет прогноза</small>}
                  </span>
                </button>
              </li>;
            })}
          </ul> : <p className="stops-empty">Для выбранных фильтров остановок нет.</p>}
        </div>
      </div>
    </div>
  );
}
