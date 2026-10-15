import { useState } from 'react';
import { liveEvents } from '../../data/dashboard';
import { useStore } from '../../store';
import { ManualActionDialog } from '../integration/ManualActionDialog';

export function LiveEventFeed() {
  const selected = useStore((state) => state.selected);
  const [action, setAction] = useState<string>();
  return (
    <section className="feed">
      <div className="feed-title">
        <b>Живі події</b>
        <em>● LIVE</em>
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
      <div className="details">
        <b>{selected[0]}</b>
        <small>Контролер U-PROX IC A · Reader 02</small>
        <strong>● НОРМА</strong>
        <div className="actions">
          {['Відкрити', 'Доступ: вхід', 'Доступ: вихід', 'Заблокувати'].map((label) => (
            <button onClick={() => setAction(label)} key={label}>
              {label}
            </button>
          ))}
        </div>
      </div>
      {action && (
        <ManualActionDialog
          action={action}
          doorName={selected[0]}
          onClose={() => setAction(undefined)}
        />
      )}
    </section>
  );
}
