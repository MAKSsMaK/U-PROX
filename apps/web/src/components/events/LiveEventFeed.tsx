import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { getEvents, getPlanLiveController } from '../../api';
import { eventMatchesObject, getEventSeverity, toEventTableRows } from '../../features/events/eventTable';
import { useStore } from '../../store';

function objectType(type?: 'door' | 'device' | 'input') {
  if (type === 'device') return 'Контролер';
  if (type === 'input') return 'Датчик / вхід';
  return 'Двері / точка доступу';
}

function objectIcon(type?: 'door' | 'device' | 'input') {
  if (type === 'device') return '▣';
  if (type === 'input') return '◉';
  return '▯';
}

type LiveEventFeedProps = {
  collapsed: boolean;
  onToggle: () => void;
};

export function LiveEventFeed({ collapsed, onToggle }: LiveEventFeedProps) {
  const selected = useStore((state) => state.selected);
  const navigate = useNavigate();
  const [detailsCollapsed, setDetailsCollapsed] = useState(true);
  const eventsQuery = useQuery({
    queryKey: ['plan-events', 24, 100],
    queryFn: () => getEvents({ hours: 24, limit: 100 }),
    refetchInterval: 5_000,
  });
  const controllerToken = selected?.type === 'device'
    ? selected.token
    : selected?.deviceToken;
  const controllerQuery = useQuery({
    queryKey: ['plan-live-controller', controllerToken],
    queryFn: () => getPlanLiveController(controllerToken!),
    refetchInterval: 5_000,
    enabled: Boolean(controllerToken),
  });
  const allEvents = toEventTableRows(eventsQuery.data);
  const selectedEvents = selected ? allEvents.filter((event) => eventMatchesObject(event, selected)) : [];
  const events = (selected ? selectedEvents : allEvents).slice(0, 8);
  const selectedLastEvent = selectedEvents[0]
    ? { name: selectedEvents[0].eventName, occurredAt: selectedEvents[0].occurredAt }
    : selected?.lastEvent;
  const controller = controllerQuery.data?.controller;
  const liveState = !selected
    ? undefined
    : !controllerToken
      ? 'Контролер не вказаний'
    : controllerQuery.isLoading
      ? 'Оновлення…'
      : controller?.online === true
        ? 'В мережі'
        : controller?.online === false
          ? 'Не в мережі'
          : 'Стан не повернувся';
  return (
    <section className={`feed ${collapsed ? 'feed--collapsed' : ''}`}>
      {collapsed ? <button aria-label="Розгорнути панель даних та подій" className="feed-collapse-toggle" onClick={onToggle} title="Розгорнути дані та події" type="button">‹</button> : <>
      <div className="feed-title">
        <b>Об’єкт на плані</b>
        <span className="feed-title-actions"><em>{selected ? 'ПРИВ’ЯЗАНО' : 'НЕ ОБРАНО'}</em><button aria-label="Згорнути панель" onClick={onToggle} title="Згорнути панель" type="button">›</button></span>
      </div>
      <div className="plan-details">
        {selected ? <>
          <div className={`object-icon ${selected.type === 'device' ? 'blue' : selected.type === 'input' ? 'yellow' : 'green'}`}>{objectIcon(selected.type)}</div>
          <h2>{selected.name}</h2>
          <p>{selected.floor} · прив’язаний до локального електронного шару</p>
          <button
            className="plan-details-action"
            onClick={() => navigate(`/reports?create=1&accessPoint=${encodeURIComponent(selected.name)}`)}
            type="button"
          >
            Сформувати звіт за об’єктом
          </button>
          <button aria-expanded={!detailsCollapsed} aria-label={detailsCollapsed ? 'Розгорнути технічні деталі' : 'Згорнути технічні деталі'} className="plan-details-toggle" onClick={() => setDetailsCollapsed((current) => !current)} title={detailsCollapsed ? 'Розгорнути технічні деталі' : 'Згорнути технічні деталі'} type="button"><span>Технічні деталі</span><b>{detailsCollapsed ? '⌄' : '⌃'}</b></button>
          {!detailsCollapsed && <div className="plan-details-extra">
            <dl>
              <div><dt>Тип</dt><dd>{objectType(selected.type)}</dd></div>
              <div><dt>U‑PROX токен</dt><dd>{selected.token || '—'}</dd></div>
              {selected.detail && <div><dt>Деталі</dt><dd>{selected.detail}</dd></div>}
              <div><dt>Live-стан</dt><dd>{liveState}</dd></div>
            </dl>
            <div className="plan-last-event">
              <span>Остання подія цієї точки</span>
              {selectedLastEvent ? <><b>{selectedLastEvent.name}</b><time>{selectedLastEvent.occurredAt}</time></> : <p>За останні 24 години подію для цього токена не знайдено.</p>}
            </div>
            {controllerToken && <div className="plan-live-telemetry">
              <div><span>Входи</span><b>{controllerQuery.data?.inputs.length ?? '—'}</b></div>
              <div><span>Виходи</span><b>{controllerQuery.data?.outputs.length ?? '—'}</b></div>
              <div><span>HardwareState</span><b>{controller?.hardwareState ?? '—'}</b></div>
              <div><span>HealthStatus</span><b>{controller?.healthStatus ?? '—'}</b></div>
            </div>}
            <p className="plan-details-note">Дані DeviceInputGetList і DeviceOutputGetList, оновлення кожні 10 секунд. Числові коди не інтерпретуються без таблиці значень вашої версії U‑PROX.</p>
          </div>}
        </> : <div className="plan-details-empty">Клацни по збереженому маркеру на плані, щоб побачити його реальний токен і дані U‑PROX.</div>}
      </div>
      <div className="feed-title feed-title-events">
        <b>{selected ? `Події: ${selected.name}` : 'Останні події U‑PROX'}</b>
        <em>{eventsQuery.isError ? 'ПОМИЛКА' : 'LIVE'}</em>
      </div>
      <div className="feed-events">
        {eventsQuery.isLoading && <p className="feed-empty">Завантаження подій…</p>}
        {eventsQuery.isError && <p className="feed-empty feed-error">Не вдалося отримати події.</p>}
        {!eventsQuery.isLoading && !eventsQuery.isError && events.length === 0 && <p className="feed-empty">{selected ? 'Для вибраного об’єкта подій за останні 24 години не знайдено.' : 'U‑PROX не повернув подій за останні 24 години.'}</p>}
        {!eventsQuery.isError && events.map((event) => (
          <article className={`event-${getEventSeverity(event.eventName)}`} key={event.id}>
            <i />
            <div>
              <b>{event.eventName}</b>
              <time>{event.occurredAt}</time>
              <p>{event.employee} · {event.accessPoint}</p>
            </div>
          </article>
        ))}
      </div>
      </>}
    </section>
  );
}
