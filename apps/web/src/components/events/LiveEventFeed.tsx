import { liveEvents } from '../../data/dashboard';
import { useStore } from '../../store';

export function LiveEventFeed() {
  const selected = useStore((state) => state.selected);
  return (
    <section className="feed">
      <div className="feed-title">
        <b>Об’єкт на плані</b>
        <em>ЕТАП 1</em>
      </div>
      <div className="plan-details">
        <button className="plan-details-close" type="button" aria-label="Закрити панель">
          ×
        </button>
        <div className={`object-icon ${selected[1]}`}>{selected[1] === 'blue' ? '▣' : '▯'}</div>
        <h2>{selected[0]}</h2>
        <p>Третій поверх · мітка ще не прив’язана до об’єкта U‑PROX</p>
        <dl>
          <div>
            <dt>Тип</dt>
            <dd>{selected[1] === 'blue' ? 'Контролер' : 'Точка доступу'}</dd>
          </div>
          <div>
            <dt>U‑PROX токен</dt>
            <dd>Не налаштовано</dd>
          </div>
          <div>
            <dt>Live-стан</dt>
            <dd>Очікує прив’язку</dd>
          </div>
        </dl>
        <button className="plan-details-action" disabled type="button">
          Налаштувати в редакторі
        </button>
      </div>
      <div className="feed-title feed-title-events">
        <b>Приклад стрічки подій</b>
        <em>LIVE</em>
      </div>
      {liveEvents.map((event) => (
        <article className={event.severity} key={event.time}>
          <i />
          <div>
            <b>{event.title}</b>
            <time>{event.time}</time>
            <p>{event.detail}</p>
          </div>
        </article>
      ))}
    </section>
  );
}
