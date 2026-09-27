import { useEffect, useMemo, useState } from "react";
import {
  ArrowRightIcon,
  BrainIcon,
  CalendarBlankIcon,
  ChartLineUpIcon,
  CheckCircleIcon,
  DatabaseIcon,
  FlaskIcon,
  WarningCircleIcon,
} from "@phosphor-icons/react";
import { getModelMetadata } from "../../api";
import type { ModelMetadata, ModelMetricSet, ModelMetricSlice } from "../../types";

const dateFormat = new Intl.DateTimeFormat("ru-RU", { day: "2-digit", month: "short", year: "numeric" });

function formatDate(value: string): string {
  return dateFormat.format(new Date(`${value}T00:00:00+03:00`));
}

function formatMetric(value: number | null, suffix = "%"): string {
  return value === null ? "Ожидается" : `${value.toLocaleString("ru-RU", { maximumFractionDigits: 2 })}${suffix}`;
}

function MetricCard({ title, metric }: { title: string; metric: ModelMetricSet }) {
  return <article className="model-metric-card">
    <span>{title}</span>
    <h3>{metric.name}</h3>
    <dl>
      <div><dt>WAPE</dt><dd>{formatMetric(metric.wape)}</dd></div>
      <div><dt>MAE</dt><dd>{formatMetric(metric.mae, "")}</dd></div>
      <div><dt>Bias</dt><dd>{formatMetric(metric.bias, "")}</dd></div>
    </dl>
  </article>;
}

function MetricBars({ title, items, empty }: { title: string; items: ModelMetricSlice[]; empty: string }) {
  const max = useMemo(() => Math.max(1, ...items.map((item) => item.wape)), [items]);
  return <article className="model-breakdown">
    <div className="model-card-heading"><ChartLineUpIcon weight="bold" aria-hidden="true" /><h3>{title}</h3></div>
    {items.length ? <ol>
      {items.map((item) => <li key={item.label}>
        <span>{item.label}</span>
        <i><b style={{ width: `${Math.max(5, item.wape / max * 100)}%` }} /></i>
        <strong>{formatMetric(item.wape)}</strong>
      </li>)}
    </ol> : <p className="model-empty">{empty}</p>}
  </article>;
}

export function ModelPage() {
  const [metadata, setMetadata] = useState<ModelMetadata | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    getModelMetadata(controller.signal)
      .then((data) => { if (!controller.signal.aborted) setMetadata(data); })
      .catch((failure: unknown) => {
        if (!controller.signal.aborted) setError(failure instanceof Error ? failure.message : "Не удалось загрузить metadata модели");
      });
    return () => controller.abort();
  }, []);

  if (error) return <section className="model-page"><div className="model-state" role="alert">
    <WarningCircleIcon weight="bold" aria-hidden="true" /><h1>Metadata модели недоступны</h1><p>{error}</p>
  </div></section>;
  if (!metadata) return <section className="model-page"><div className="model-state" role="status">
    <BrainIcon weight="bold" aria-hidden="true" /><h1>Загружаем карточку модели…</h1>
  </div></section>;

  const { coverage, validation } = metadata;
  const validated = metadata.status === "validated";

  return <div className="model-page">
    <section className="model-hero">
      <div>
        <p className="eyebrow">MODEL CARD · {metadata.schema_version}</p>
        <h1>Что прогнозирует система и насколько ей можно доверять</h1>
        <p>{metadata.target}. Прогноз поддерживает диспетчерский анализ, но не заменяет фактический учёт пассажиров.</p>
      </div>
      <div className={`model-status model-status--${validated ? "ready" : "pending"}`}>
        {validated ? <CheckCircleIcon weight="fill" aria-hidden="true" /> : <WarningCircleIcon weight="fill" aria-hidden="true" />}
        <span>{validated ? "Метрики опубликованы" : "Валидация ожидает отчёт"}</span>
        <small>{metadata.model_version}</small>
      </div>
    </section>

    <section className="model-facts" aria-label="Охват модели">
      <article><CalendarBlankIcon weight="bold" aria-hidden="true" /><span>История</span><strong>{formatDate(coverage.history_from)} — {formatDate(coverage.history_to)}</strong></article>
      <article><ChartLineUpIcon weight="bold" aria-hidden="true" /><span>Прогноз</span><strong>{formatDate(coverage.forecast_from)} — {formatDate(coverage.forecast_to)}</strong></article>
      <article><DatabaseIcon weight="bold" aria-hidden="true" /><span>Охват</span><strong>{coverage.routes} маршрутов · {coverage.horizon_days} день</strong></article>
      <article><BrainIcon weight="bold" aria-hidden="true" /><span>Версия</span><strong>{metadata.model_version}</strong><small>{metadata.built_at ? `Сборка ${metadata.built_at}` : "Дата сборки ещё не опубликована"}</small></article>
    </section>

    <section className="model-section" aria-labelledby="pipeline-title">
      <div className="model-section-heading"><div><p className="eyebrow">TRAIN / BACKTEST</p><h2 id="pipeline-title">Временная проверка без leakage</h2></div><p>{validation.leakage_control}</p></div>
      <div className="model-pipeline" role="list" aria-label="Этапы обучения и проверки">
        <div role="listitem"><DatabaseIcon weight="bold" aria-hidden="true" /><span>01</span><strong>История Jan–Oct 2025</strong><small>Только доступные на тот момент данные</small></div>
        <ArrowRightIcon aria-hidden="true" />
        <div role="listitem"><FlaskIcon weight="bold" aria-hidden="true" /><span>02</span><strong>Временные folds</strong><small>{validation.method}</small></div>
        <ArrowRightIcon aria-hidden="true" />
        <div role="listitem"><ChartLineUpIcon weight="bold" aria-hidden="true" /><span>03</span><strong>Прогноз Nov–Dec</strong><small>{coverage.horizon_days}-дневный горизонт</small></div>
      </div>
    </section>

    <section className="model-section" aria-labelledby="quality-title">
      <div className="model-section-heading"><div><p className="eyebrow">КАЧЕСТВО ПРОГНОЗА</p><h2 id="quality-title">Baseline против финальной модели</h2></div><p><strong>WAPE</strong> — основная метрика: суммарная абсолютная ошибка, делённая на фактический объём посадок.</p></div>
      <div className="model-quality-grid">
        <MetricCard title="Контрольная точка" metric={validation.baseline} />
        <MetricCard title="Финальная модель" metric={validation.final} />
        <MetricBars title="WAPE по folds" items={validation.folds} empty="Fold-метрики появятся после добавления утверждённого отчёта." />
        <MetricBars title="WAPE по горизонтам" items={validation.horizon_buckets} empty="Разбивка по horizon buckets пока не опубликована." />
      </div>
    </section>

    <div className="model-two-column">
      <section className="model-section" aria-labelledby="features-title">
        <div className="model-card-heading"><BrainIcon weight="bold" aria-hidden="true" /><h2 id="features-title">Семейства признаков</h2></div>
        <ul className="model-chip-list">{metadata.feature_families.map((feature) => <li key={feature}>{feature}</li>)}</ul>
      </section>
      <section className="model-section model-limitations" aria-labelledby="limits-title">
        <div className="model-card-heading"><WarningCircleIcon weight="bold" aria-hidden="true" /><h2 id="limits-title">Ограничения</h2></div>
        <ul>{metadata.limitations.map((item) => <li key={item}>{item}</li>)}</ul>
      </section>
    </div>

    <section className="model-section" aria-labelledby="sources-title">
      <div className="model-section-heading"><div><p className="eyebrow">ПРОИСХОЖДЕНИЕ ДАННЫХ</p><h2 id="sources-title">Источники</h2></div><p>Карточка загружается из <code>/api/model/metadata</code>; значения не зашиты в React.</p></div>
      <div className="model-sources">{metadata.sources.map((source) => <article key={source.name}><DatabaseIcon weight="bold" aria-hidden="true" /><div><h3>{source.name}</h3><p>{source.description}</p>{source.url && <a href={source.url} target="_blank" rel="noreferrer">Открыть источник ↗</a>}</div></article>)}</div>
    </section>
  </div>;
}
