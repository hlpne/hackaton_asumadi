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
import type { ModelMetadata, ModelMetricSlice } from "../../types";

const dateFormat = new Intl.DateTimeFormat("ru-RU", { day: "2-digit", month: "short", year: "numeric" });

function formatDate(value: string): string {
  return dateFormat.format(new Date(`${value}T00:00:00+03:00`));
}

function formatMetric(value: number | null, suffix = "%"): string {
  return value === null ? "Не опубликовано" : `${value.toLocaleString("ru-RU", { maximumFractionDigits: 4 })}${suffix}`;
}

function formatScore(value: number): string {
  return value.toLocaleString("ru-RU", { minimumFractionDigits: 3, maximumFractionDigits: 5 });
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

  const { coverage, validation, artifact } = metadata;
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
        <span>{validated ? "Бэктест финала опубликован" : "Платформенный score опубликован"}</span>
        <small>{validated ? metadata.model_version : "Отдельного бэктеста финального ансамбля нет"}</small>
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
        <div role="listitem"><DatabaseIcon weight="bold" aria-hidden="true" /><span>01</span><strong>История январь–октябрь 2025</strong><small>Итоговое обучение до 31.10.2025</small></div>
        <ArrowRightIcon aria-hidden="true" />
        <div role="listitem"><FlaskIcon weight="bold" aria-hidden="true" /><span>02</span><strong>Два временных бэктеста</strong><small>Отсечки 31.08 и 30.09.2025 · ML-гибрид</small></div>
        <ArrowRightIcon aria-hidden="true" />
        <div role="listitem"><ChartLineUpIcon weight="bold" aria-hidden="true" /><span>03</span><strong>Прогноз ноябрь–декабрь</strong><small>{coverage.horizon_days} день · 9 маршрутов в интерфейсе</small></div>
      </div>
      <p className="model-method-note">{validation.method}</p>
    </section>

    <section className="model-section" aria-labelledby="quality-title">
      <div className="model-section-heading"><div><p className="eyebrow">КАЧЕСТВО ПРОГНОЗА</p><h2 id="quality-title">Результаты из отчётов команды</h2></div><p><strong>WAPE</strong> — суммарная абсолютная ошибка, делённая на фактическое число валидаций. Платформенный score и WAPE бэктеста относятся к разным проверкам.</p></div>
      <div className="model-platform-result">
        <div><span>Платформенный score · 10 маршрутов</span><strong>{formatScore(validation.platform_score)}</strong>
          <small>{validation.score_without_route5 === null ? "Score без маршрута 5 для новой версии не опубликован" : `Без маршрута 5: ${formatScore(validation.score_without_route5)}`}</small></div>
        <p>{validation.platform_scope}</p>
      </div>
      <div className="model-backtests">
        {validation.backtests.map((backtest) => <article key={backtest.label}>
          <p className="eyebrow">ВРЕМЕННОЙ БЭКТЕСТ · ML-ГИБРИД</p>
          <h3>{backtest.label}</h3>
          <p>Обучение до {formatDate(backtest.train_cutoff)} · проверка {backtest.forecast_period}</p>
          <div className="model-backtest-values"><div><span>Score</span><strong>{formatScore(backtest.score)}</strong></div><div><span>WAPE</span><strong>{formatMetric(backtest.wape)}</strong></div></div>
          <p>{backtest.method}</p><small>{backtest.note}</small>
        </article>)}
      </div>
      <div className="model-quality-grid">
        <MetricBars title="WAPE по маршрутам · октябрь" items={validation.route_wape_october} empty="Нет разбивки по маршрутам." />
        <MetricBars title="WAPE по маршрутам · сентябрь–октябрь" items={validation.route_wape_sep_oct} empty="Нет разбивки по маршрутам." />
        <article className="model-breakdown model-score-card">
          <div className="model-card-heading"><ChartLineUpIcon weight="bold" aria-hidden="true" /><h3>Как рос score на платформе</h3></div>
          <ol className="model-score-history">{metadata.score_history.map((stage) => <li key={stage.label}><span>{stage.label}</span><strong>{formatScore(stage.score)}</strong></li>)}</ol>
        </article>
      </div>
      <p className="model-method-note">{validation.final.name}: WAPE, MAE и bias отдельного бэктеста не опубликованы. Для базового метода численные метрики также отсутствуют.</p>
    </section>

    <section className="model-section" aria-labelledby="composition-title">
      <div className="model-section-heading"><div><p className="eyebrow">СОСТАВ РЕШЕНИЯ</p><h2 id="composition-title">От потока до финального ансамбля</h2></div><p>Этапы и веса взяты из README архива, а не восстановлены по выходному CSV.</p></div>
      <ol className="model-composition">{metadata.pipeline.map((stage, index) => <li key={stage.label}><span>{String(index + 1).padStart(2, "0")}</span><div><h3>{stage.label}</h3><p>{stage.description}</p></div></li>)}</ol>
    </section>

    <section className="model-section" aria-labelledby="artifact-title">
      <div className="model-section-heading"><div><p className="eyebrow">КОНТРОЛЬНЫЙ ПРОГОН</p><h2 id="artifact-title">Состав и проверка артефакта</h2></div><p>Проверка архива от {formatDate(artifact.verified_at)}: обучение с нуля и повторный инференс LightGBM дали побайтно одинаковый итоговый CSV.</p></div>
      <dl className="model-artifact-facts">
        <div><dt>Строк прогноза</dt><dd>{artifact.submitted_rows.toLocaleString("ru-RU")}</dd></div>
        <div><dt>Маршрутов в файле / на сайте</dt><dd>{artifact.submitted_routes} / {artifact.displayed_routes}</dd></div>
        <div><dt>Моделей объёма / профиля</dt><dd>{artifact.volume_models} / {artifact.shape_models}</dd></div>
      </dl>
      <p className="model-method-note">Проверенные движки ML-части: {artifact.inference_engines.join(", ")}. Максимальное расхождение с LightGBM: ONNX {artifact.onnx_max_abs_diff.toExponential(2)}, JVM {artifact.jvm_max_abs_diff.toExponential(2)}. JVM-прогон: {artifact.jvm_model_calls.toLocaleString("ru-RU")} вызовов моделей на {artifact.jvm_feature_rows.toLocaleString("ru-RU")} строках признаков. Итоговый JVM-файл отличается в {artifact.jvm_rounding_differences} ячейках на ±1 валидацию из-за округления float32.</p>
      <p className="model-artifact-hash">SHA-256 итогового CSV: <code>{artifact.sha256}</code></p>
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
