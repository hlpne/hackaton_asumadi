import { useEffect, useRef, useState } from "react";
import type { MapForecastPoint, MapForecastResponse, RouteStop } from "../../types";
import { WheelPicker } from "../layout/WheelPicker";

interface StopsModalProps {
  stops: RouteStop[];
  snapshot: MapForecastResponse | null;
  selectedStopId: string;
  onSelect: (point: MapForecastPoint) => void;
  onClose: () => void;
}

export function StopsModal({ stops, snapshot, selectedStopId, onSelect, onClose }: StopsModalProps) {
  const [direction, setDirection] = useState("all");
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
        </div>
        <div className="modal-body stops-modal-body">
          <p className="stops-count" role="status">Показано {visible.length} из {stops.length} остановок</p>
          {visible.length ? <div className="stops-wheel-layout">
            <WheelPicker inline label="Выберите остановку" value={chosenKey} onChange={setWheelValue}
              options={visible.map(({ stop }) => ({ value: `${stop.direction_id}/${stop.id}`, label: stop.name,
                meta: `№ ${stop.sequence + 1}` }))} />
            <div className="wheel-preview"><span>Направление {chosen.stop.direction_id + 1} · остановка {chosen.stop.sequence + 1}</span>
              <strong>{chosen.stop.name}</strong><small>Прогноз доступен только для маршрута целиком</small>
              <button type="button" disabled={!chosen.point} onClick={() => { if (chosen.point) { onSelect(chosen.point); onClose(); } }}>
                Показать на карте</button>
            </div>
          </div> : <p className="stops-empty">Для выбранных фильтров остановок нет.</p>}
        </div>
      </div>
    </div>
  );
}
