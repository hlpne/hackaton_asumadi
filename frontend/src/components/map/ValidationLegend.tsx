import { loadColors, loadLabels, type LoadLevel } from "../../loadLevel";

const levels: LoadLevel[] = ["low", "medium", "high"];

export function ValidationLegend() {
  return <div className="map-legend" aria-label="Уровень валидаций маршрута относительно его собственного прогноза"
    title="Сравнение маршрута с его же значениями за выбранный период; это не заполненность вагона">
    {levels.map((level) => <span key={level}><i style={{ background: loadColors[level], color: loadColors[level] }} aria-hidden="true" />
      {loadLabels[level]}</span>)}
  </div>;
}
