import { useEffect, useRef, useState } from "react";
import { loadColor, loadLabels, loadLevel, type LoadLevel } from "../../loadLevel";
import type { MapForecastPoint, MapForecastResponse, RouteStop } from "../../types";
import { WheelPicker } from "../layout/WheelPicker";

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
  const [wheelValue, setWheelValue] = useState("");
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
  const chosen = visible.find(({ stop }) => `${stop.direction_id}/${stop.id}` === wheelValue)
    ?? visible.find(({ stop }) => stop.id === selectedStopId) ?? visible[0];
  const chosenKey = chosen ? `${chosen.stop.direction_id}/${chosen.stop.id}` : "";

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
          <WheelPicker label="Направление" value={direction} onChange={setDirection}
            options={[{ value: "all", label: "Оба направления" }, { value: "0", label: "Направление 1" },
              { value: "1", label: "Направление 2" }]} />
          <WheelPicker label="Загрузка" value={load} onChange={(value) => setLoad(value as LoadFilter)}
            options={[{ value: "all", label: "Любая" }, { value: "low", label: "Низкая" },
              { value: "medium", label: "Средняя" }, { value: "high", label: "Высокая" },
              { value: "unavailable", label: "Без прогноза" }]} />
        </div>
        <div className="modal-body stops-modal-body">
          <p className="stops-count" role="status">Показано {visible.length} из {stops.length} остановок</p>
          {visible.length ? <div className="stops-wheel-layout">
            <WheelPicker inline label="Выберите остановку" value={chosenKey} onChange={setWheelValue}
              options={visible.map(({ stop, point }) => ({ value: `${stop.direction_id}/${stop.id}`, label: stop.name,
                meta: `№ ${stop.sequence + 1} · ${point ? number.format(point.predicted_load) : "—"}`,
                color: point && snapshot ? loadColor(point.predicted_load, snapshot) : undefined }))} />
            <div className="wheel-preview"><span>Направление {chosen.stop.direction_id + 1} · остановка {chosen.stop.sequence + 1}</span>
              <strong>{chosen.stop.name}</strong><small>{chosen.point && snapshot
                ? `${loadLabels[loadLevel(chosen.point.predicted_load, snapshot)]} · индекс ${number.format(chosen.point.predicted_load)}`
                : "Нет прогноза для остановки"}</small>
              <button type="button" disabled={!chosen.point} onClick={() => { if (chosen.point) { onSelect(chosen.point); onClose(); } }}>
                Показать на карте</button>
            </div>
          </div> : <p className="stops-empty">Для выбранных фильтров остановок нет.</p>}
        </div>
      </div>
    </div>
  );
}
