import { CalendarBlankIcon, ChartBarIcon, MapPinIcon } from "@phosphor-icons/react";
import type { Page } from "./Header";

interface HomePageProps {
  onNavigate: (page: Page) => void;
}

export function HomePage({ onNavigate }: HomePageProps) {
  return (
    <div className="home-page">
      <section className="home-hero" aria-labelledby="home-title">
        <div className="home-hero-copy">
          <p className="eyebrow">ХАКАТОН МОСКОВСКОГО ТРАНСПОРТА · 2026</p>
          <h1 id="home-title">Прогноз валидаций трамвайных маршрутов</h1>
          <p className="home-lead">
            Модель прогнозирует число успешных валидаций за час по всему маршруту.
            Для ноября–декабря 2025 доступен финальный ансамбль, для следующих дат — экстраполяция сохранённой ML-модели.
            Карта показывает расположение маршрутов и остановок без расчёта нагрузки по остановкам.
          </p>
          <div className="home-actions">
            <button type="button" onClick={() => onNavigate("details")}>Изучить маршрут</button>
            <button type="button" className="btn-secondary" onClick={() => onNavigate("analytics")}>Смотреть аналитику</button>
          </div>
        </div>
        <div className="home-flow" aria-label="Как работает решение">
          <span><CalendarBlankIcon weight="bold" aria-hidden="true" />01 · Выберите период</span>
          <span><MapPinIcon weight="fill" aria-hidden="true" />02 · Посмотрите прогноз</span>
          <span><ChartBarIcon weight="bold" aria-hidden="true" />03 · Сравните маршруты</span>
        </div>
      </section>

      <section className="home-section" aria-labelledby="project-title">
        <div className="home-section-heading">
          <p className="eyebrow">О ПРОЕКТЕ</p>
          <h2 id="project-title">Маршрутный прогноз и схема остановок</h2>
          <p>
            Прогноз из модели доступен для девяти маршрутов. Остановки помогают изучать
            схему движения; модель не рассчитывает отдельные показатели для остановок.
          </p>
        </div>
        <div className="home-values">
          <article className="home-value">
            <span className="home-value-number">01</span>
            <h3>Изучить схему</h3>
            <p>Карта показывает маршруты и остановки. Числа валидаций относятся к маршрутам целиком.</p>
          </article>
          <article className="home-value">
            <span className="home-value-number">02</span>
            <h3>Выбрать период</h3>
            <p>Выбор даты обновляет прогноз валидаций маршрута до конца 2027 года.</p>
          </article>
          <article className="home-value">
            <span className="home-value-number">03</span>
            <h3>Поддержать решение</h3>
            <p>Сервис показывает сигналы для анализа, но не принимает диспетчерские решения за человека.</p>
          </article>
        </div>
      </section>

      <section className="home-explore" aria-labelledby="home-explore-title">
        <div className="home-section-heading">
          <p className="eyebrow">ИССЛЕДОВАТЬ ДАННЫЕ</p>
          <h2 id="home-explore-title">Выберите масштаб просмотра</h2>
          <p>Начните с прогноза отдельного маршрута или сравните прогнозные валидации всей сети.</p>
        </div>
        <div className="home-explore-grid">
          <article className="home-explore-card">
            <MapPinIcon weight="fill" aria-hidden="true" />
            <div>
              <h3>Один маршрут</h3>
              <p>Прогноз валидаций всего маршрута и схема его остановок.</p>
              <button type="button" className="home-explore-link" onClick={() => onNavigate("details")}>Открыть детализацию <span aria-hidden="true">→</span></button>
            </div>
          </article>
          <article className="home-explore-card">
            <ChartBarIcon weight="bold" aria-hidden="true" />
            <div>
              <h3>Вся сеть</h3>
              <p>Карта сети, рейтинг маршрутов и сумма прогнозных валидаций.</p>
              <button type="button" className="home-explore-link" onClick={() => onNavigate("analytics")}>Открыть аналитику <span aria-hidden="true">→</span></button>
            </div>
          </article>
        </div>
      </section>

      <section className="home-model" aria-labelledby="model-title">
        <div>
          <p className="eyebrow">О МОДЕЛИ</p>
          <h2 id="model-title">Как формируется прогноз</h2>
          <p>
            Отдельная модельная карточка объясняет target, временную валидацию,
            метрики, признаки и ограничения без подмены посадок заполняемостью салона.
          </p>
          <button type="button" className="home-explore-link" onClick={() => onNavigate("model")}>
            Открыть карточку модели <span aria-hidden="true">→</span>
          </button>
        </div>
        <span className="home-model-status">Machine-readable metadata</span>
      </section>
    </div>
  );
}
