import { useEffect } from "react";
import type { ForecastResponse } from "../../types";
import { ForecastTable } from "./ForecastTable";
import { downloadRouteScenarioCsv, downloadRouteValidationsCsv } from "../../forecastCsv";
import { isNeutralScenario, type ScenarioAdjustments } from "../../scenario";

interface ForecastModalProps {
  forecast: ForecastResponse;
  title?: string;
  scenario?: ScenarioAdjustments;
  onClose: () => void;
}

export function ForecastModal({ forecast, title = "Прогноз по временным интервалам", scenario, onClose }: ForecastModalProps) {
  const scenarioActive = scenario !== undefined && !isNeutralScenario(scenario);
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
      <div className="modal" role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{title}</h2>
          <button className="modal-close" onClick={onClose} aria-label="Закрыть">
            ✕
          </button>
        </div>

        <div className="modal-actions">
          <button className="btn-secondary" onClick={() => downloadRouteValidationsCsv(forecast)}>
            ↓ Базовый CSV
          </button>
          {scenarioActive && <button className="btn-secondary" onClick={() => downloadRouteScenarioCsv(forecast, scenario)}>
            ↓ Сценарный CSV
          </button>}
        </div>

        <div className="modal-body">
          <ForecastTable forecast={forecast} scenario={scenario} />
        </div>
      </div>
    </div>
  );
}
