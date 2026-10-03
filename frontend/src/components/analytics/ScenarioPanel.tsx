import { useId, useState, type CSSProperties } from "react";
import {
  ArrowCounterClockwiseIcon,
  CaretDownIcon,
  CloudRainIcon,
  DownloadSimpleIcon,
  InfoIcon,
  MinusIcon,
  PlusIcon,
  SlidersHorizontalIcon,
  TrendUpIcon,
  UsersThreeIcon,
} from "@phosphor-icons/react";
import {
  SCENARIO_BOUNDS,
  SCENARIO_DISCLAIMER,
  SCENARIO_HINTS,
  SCENARIO_KEYS,
  SCENARIO_LABELS,
  SCENARIO_PRESETS,
  clampAdjustment,
  formatFactor,
  formatSignedNumber,
  formatSignedPercent,
  isNeutralScenario,
  resetScenario,
  scenarioConclusion,
  scenarioResult,
  type ScenarioAdjustments,
  type ScenarioFactorKey,
} from "../../scenario";

export interface ScenarioComparison {
  label: string;
  base: number | null;
  scenario: number | null;
}

interface ScenarioPanelProps {
  value: ScenarioAdjustments;
  onChange: (next: ScenarioAdjustments) => void;
  comparisons: ScenarioComparison[];
  unit?: string;
  defaultOpen?: boolean;
  /** Выгрузка сценарного CSV (базовый прогноз + сценарий); кнопка видна только при активном сценарии. */
  onDownload?: () => void;
  downloadLabel?: string;
}

const icons = { weather: CloudRainIcon, event: UsersThreeIcon, season: TrendUpIcon } as const;
const accusative: Record<ScenarioFactorKey, string> = { weather: "погоду", event: "событие", season: "сезонность" };
const count = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 });

function samePreset(value: ScenarioAdjustments, preset: ScenarioAdjustments): boolean {
  return value.weather === preset.weather && value.event === preset.event && value.season === preset.season;
}

function FactorRow({ factor, value, onChange }: { factor: ScenarioFactorKey; value: number; onChange: (value: number) => void }) {
  const id = useId();
  const { min, max, step } = SCENARIO_BOUNDS[factor];
  const [draft, setDraft] = useState<string | null>(null);
  const Icon = icons[factor];
  const zero = (0 - min) / (max - min) * 100;
  const position = (value - min) / (max - min) * 100;
  const label = SCENARIO_LABELS[factor];
  const commit = (text: string) => {
    const parsed = Number(text.replace(",", ".").replace("−", "-").trim());
    onChange(clampAdjustment(factor, Number.isFinite(parsed) ? parsed : value));
    setDraft(null);
  };
  return <div className={`scenario-row${value !== 0 ? " scenario-row--active" : ""}`}>
    <div className="scenario-row-head">
      <span className="scenario-row-icon" aria-hidden="true"><Icon weight="bold" /></span>
      <label htmlFor={id} className="scenario-row-label">{label}<small>{SCENARIO_HINTS[factor]}</small></label>
      <div className="scenario-stepper">
        <button type="button" onClick={() => onChange(clampAdjustment(factor, value - step))} disabled={value <= min}
          aria-label={`Уменьшить поправку на ${accusative[factor]} на ${step} %`}><MinusIcon weight="bold" aria-hidden="true" /></button>
        <input className="scenario-value" inputMode="numeric" aria-label={`Поправка на ${accusative[factor]}, процентов`}
          value={draft ?? (value > 0 ? `+${value}` : value < 0 ? `−${-value}` : "0")}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={(event) => commit(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") commit((event.target as HTMLInputElement).value);
            if (event.key === "Escape") setDraft(null);
          }} />
        <span className="scenario-value-unit" aria-hidden="true">%</span>
        <button type="button" onClick={() => onChange(clampAdjustment(factor, value + step))} disabled={value >= max}
          aria-label={`Увеличить поправку на ${accusative[factor]} на ${step} %`}><PlusIcon weight="bold" aria-hidden="true" /></button>
      </div>
    </div>
    <input id={id} type="range" className="scenario-range" min={min} max={max} step={step} value={value}
      aria-label={`Поправка на ${accusative[factor]}`} aria-valuetext={formatSignedPercent(value)}
      style={{ "--zero": `${zero}%`, "--value": `${position}%` } as CSSProperties}
      onChange={(event) => onChange(clampAdjustment(factor, Number(event.target.value)))} />
    <div className="scenario-scale" aria-hidden="true">
      <span>{formatSignedPercent(min)}</span>
      <span className="scenario-scale-zero" style={{ left: `${zero}%` }}>0</span>
      <span>{formatSignedPercent(max)}</span>
    </div>
  </div>;
}

export function ScenarioPanel({ value, onChange, comparisons, unit = "валидаций", defaultOpen = false, onDownload,
  downloadLabel = "Сценарный CSV" }: ScenarioPanelProps) {
  const [open, setOpen] = useState(defaultOpen);
  const titleId = useId();
  const bodyId = useId();
  const neutral = isNeutralScenario(value);
  const result = scenarioResult(value);
  const direction = neutral ? "neutral" : result.deltaPercent > 0 ? "up" : "down";

  return <section className={`scenario-panel scenario-panel--${direction}`} aria-labelledby={titleId}>
    <button type="button" className="scenario-toggle" aria-expanded={open} aria-controls={bodyId} onClick={() => setOpen((state) => !state)}>
      <span className="scenario-toggle-icon" aria-hidden="true"><SlidersHorizontalIcon weight="bold" /></span>
      <span className="scenario-toggle-text">
        <span className="eyebrow">ЧТО ЕСЛИ?</span>
        <strong id={titleId}>Сценарные факторы</strong>
        <small>Оцените, как изменится прогноз при внешних условиях</small>
      </span>
      <span className="scenario-badge" title="Итоговая поправка к базовому прогнозу">{neutral ? "0 %" : formatSignedPercent(result.deltaPercent, 1)}</span>
      <CaretDownIcon weight="bold" className="scenario-caret" aria-hidden="true" />
    </button>

    {open && <div className="scenario-body" id={bodyId}>
      <div className="scenario-presets" role="group" aria-label="Быстрые сценарии">
        {SCENARIO_PRESETS.map((preset) => <button type="button" key={preset.id} className="scenario-chip"
          aria-pressed={samePreset(value, preset.adjustments)} onClick={() => onChange({ ...preset.adjustments })}>
          {preset.label}
        </button>)}
      </div>
      <p className="scenario-caption">Значения быстрых сценариев заданы для демонстрации и не являются оценкой влияния события.</p>

      {SCENARIO_KEYS.map((factor) => <FactorRow key={factor} factor={factor} value={value[factor]}
        onChange={(next) => onChange({ ...value, [factor]: next })} />)}

      <div className="scenario-result" aria-live="polite">
        <div className="scenario-total">
          <span>Итоговая поправка</span>
          <strong>{formatFactor(result.factor)}</strong>
          <em>{formatSignedPercent(result.deltaPercent, 1)}</em>
        </div>
        <p className="scenario-formula">K = K<sub>погода</sub> × K<sub>событие</sub> × K<sub>сезон</sub>, сценарий = max(0, прогноз × K)</p>
        {comparisons.length > 0 && <dl className="scenario-compare">
          {comparisons.map((item) => {
            const delta = item.base !== null && item.scenario !== null ? item.scenario - item.base : null;
            return <div key={item.label}>
              <dt>{item.label}</dt>
              <dd>
                <span className="scenario-compare-values">
                  <b title="Базовый прогноз модели">{item.base === null ? "—" : count.format(item.base)}</b>
                  <span aria-hidden="true">→</span>
                  <b className="scenario-compare-scenario" title="Сценарный расчёт">{item.scenario === null ? "—" : count.format(item.scenario)}</b>
                  <small>{unit}</small>
                </span>
                {delta !== null && <span className="scenario-compare-delta">
                  {formatSignedNumber(delta)} · {item.base ? formatSignedPercent(delta / item.base * 100, 1) : "0 %"}
                </span>}
              </dd>
            </div>;
          })}
        </dl>}
        <p className="scenario-conclusion">{scenarioConclusion(result)}</p>
      </div>

      <p className="scenario-disclaimer"><InfoIcon weight="bold" aria-hidden="true" />
        <span><b>Базовый прогноз = модель, сценарий = пользовательская поправка.</b> {SCENARIO_DISCLAIMER}</span></p>

      <div className="scenario-actions">
        <button type="button" className="scenario-reset" onClick={() => onChange(resetScenario())} disabled={neutral}>
          <ArrowCounterClockwiseIcon weight="bold" aria-hidden="true" />Сбросить сценарий
        </button>
        {onDownload && !neutral && <button type="button" className="scenario-reset scenario-download" onClick={onDownload}
          title="CSV: базовый прогноз модели, сценарный расчёт, изменение и поправки">
          <DownloadSimpleIcon weight="bold" aria-hidden="true" />{downloadLabel}
        </button>}
      </div>
    </div>}
  </section>;
}
