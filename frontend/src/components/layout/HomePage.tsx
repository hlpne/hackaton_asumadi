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
          <h1 id="home-title">Прогноз загрузки трамвайной сети</h1>
          <p className="home-lead">
            Инструмент, который помогает увидеть, где и когда ожидается высокая нагрузка
            на маршруты и остановки. Прогноз, карта и сравнение маршрутов собраны в одном интерфейсе.
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
          <h2 id="project-title">От данных к понятной картине на карте</h2>
          <p>
            Проект создаётся для задачи прогноза пассажиропотока трамвайных маршрутов.
            Он связывает прогноз с выбранной датой, маршрутом и остановкой, чтобы
            результат было удобно исследовать и использовать при планировании.
          </p>
        </div>
        <div className="home-values">
          <article className="home-value">
            <span className="home-value-number">01</span>
            <h3>Найти точки нагрузки</h3>
            <p>Карта и рейтинги помогают быстро перейти от общей картины сети к отдельной остановке.</p>
          </article>
          <article className="home-value">
            <span className="home-value-number">02</span>
            <h3>Выбрать период</h3>
            <p>Выбор даты и горизонта обновляет прогноз для маршрута.</p>
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
          <p>Начните с отдельного маршрута или посмотрите, как распределяется ожидаемая нагрузка по всей сети.</p>
        </div>
        <div className="home-explore-grid">
          <article className="home-explore-card">
            <MapPinIcon weight="fill" aria-hidden="true" />
            <div>
              <h3>Один маршрут</h3>
              <p>Остановки на карте, направление и прогноз для выбранной даты.</p>
              <button type="button" className="home-explore-link" onClick={() => onNavigate("details")}>Открыть детализацию <span aria-hidden="true">→</span></button>
            </div>
          </article>
          <article className="home-explore-card">
            <ChartBarIcon weight="bold" aria-hidden="true" />
            <div>
              <h3>Вся сеть</h3>
              <p>Карта всей сети, сравнение маршрутов, рейтинги остановок и общие показатели.</p>
              <button type="button" className="home-explore-link" onClick={() => onNavigate("analytics")}>Открыть аналитику <span aria-hidden="true">→</span></button>
            </div>
          </article>
        </div>
      </section>

      <section className="home-model" aria-labelledby="model-title">
        <div>
          <p className="eyebrow">О МОДЕЛИ</p>
          <h2 id="model-title">Подробности появятся здесь</h2>
          <p>
            Пока интерфейс показывает демонстрационный прогноз. Backend уже позволяет
            подключить модель без переделки карты и аналитики. После проверки модели
            на официальных данных здесь появятся её признаки, метрики и ограничения.
          </p>
        </div>
        <span className="home-model-status">Раздел готовится</span>
      </section>
    </div>
  );
}
