import { useEffect } from "react";
import type { ForecastResponse } from "../../types";
import { ForecastTable } from "./ForecastTable";

interface ForecastModalProps {
  forecast: ForecastResponse;
  onClose: () => void;
}

function downloadCsv(forecast: ForecastResponse) {
  const header = "timestamp,predicted_load";
  const rows = forecast.points.map((p) =>
    [
      p.timestamp,
      p.predicted_load,
    ].join(",")
  );
  const csv = [header, ...rows].join("\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `forecast_${forecast.series_key.route_id}_${forecast.horizon}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function ForecastModal({ forecast, onClose }: ForecastModalProps) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Прогноз по временным интервалам</h2>
          <button className="modal-close" onClick={onClose} aria-label="Закрыть">
            ✕
          </button>
        </div>

        <div className="modal-actions">
          <button className="btn-secondary" onClick={() => downloadCsv(forecast)}>
            Скачать CSV
          </button>
        </div>

        <div className="modal-body">
          <ForecastTable forecast={forecast} />
        </div>
      </div>
    </div>
  );
}
