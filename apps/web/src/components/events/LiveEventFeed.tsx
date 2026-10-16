import { useQuery } from '@tanstack/react-query';
import { getEvents, getPlanLiveController } from '../../api';
import { toEventTableRows } from '../../features/events/eventTable';
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

function eventSeverity(name: string) {
  const value = name.toLowerCase();
  if (value.includes('відмов') || value.includes('заборон')) return 'denied';
  if (value.includes('заблок') || value.includes('помил')) return 'warn';
  return 'green';
}

export function LiveEventFeed() {
  const selected = useStore((state) => state.selected);
  const eventsQuery = useQuery({
    queryKey: ['plan-live-events'],
    queryFn: () => getEvents({ hours: 24, limit: 8 }),
    refetchInterval: 10_000,
  });
  const controllerToken = selected?.type === 'device'
    ? selected.token
    : selected?.deviceToken;
  const controllerQuery = useQuery({
    queryKey: ['plan-live-controller', controllerToken],
    queryFn: () => getPlanLiveController(controllerToken!),
    refetchInterval: 10_000,
    enabled: Boolean(controllerToken),
  });
  const events = toEventTableRows(eventsQuery.data);
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
    <section className="feed">
      <div className="feed-title">
        <b>Об’єкт на плані</b>
        <em>{selected ? 'ПРИВ’ЯЗАНО' : 'НЕ ОБРАНО'}</em>
      </div>
      <div className="plan-details">
        {selected ? <>
          <div className={`object-icon ${selected.type === 'device' ? 'blue' : selected.type === 'input' ? 'yellow' : 'green'}`}>{objectIcon(selected.type)}</div>
          <h2>{selected.name}</h2>
          <p>{selected.floor} · прив’язаний до локального електронного шару</p>
          <dl>
            <div><dt>Тип</dt><dd>{objectType(selected.type)}</dd></div>
            <div><dt>U‑PROX токен</dt><dd>{selected.token || '—'}</dd></div>
            {selected.detail && <div><dt>Деталі</dt><dd>{selected.detail}</dd></div>}
            <div><dt>Live-стан</dt><dd>{liveState}</dd></div>
          </dl>
          {controllerToken && <div className="plan-live-telemetry">
            <div><span>Входи</span><b>{controllerQuery.data?.inputs.length ?? '—'}</b></div>
            <div><span>Виходи</span><b>{controllerQuery.data?.outputs.length ?? '—'}</b></div>
            <div><span>HardwareState</span><b>{controller?.hardwareState ?? '—'}</b></div>
            <div><span>HealthStatus</span><b>{controller?.healthStatus ?? '—'}</b></div>
          </div>}
          <p className="plan-details-note">Дані DeviceInputGetList і DeviceOutputGetList, оновлення кожні 10 секунд. Числові коди не інтерпретуються без таблиці значень вашої версії U‑PROX.</p>
        </> : <div className="plan-details-empty">Клацни по збереженому маркеру на плані, щоб побачити його реальний токен і дані U‑PROX.</div>}
      </div>
      <div className="feed-title feed-title-events">
        <b>Останні події U‑PROX</b>
        <em>{eventsQuery.isError ? 'ПОМИЛКА' : 'LIVE'}</em>
      </div>
      <div className="feed-events">
        {eventsQuery.isLoading && <p className="feed-empty">Завантаження подій…</p>}
        {eventsQuery.isError && <p className="feed-empty feed-error">Не вдалося отримати події.</p>}
        {!eventsQuery.isLoading && !eventsQuery.isError && events.length === 0 && <p className="feed-empty">U‑PROX не повернув подій за останні 24 години.</p>}
        {!eventsQuery.isError && events.map((event) => (
          <article className={eventSeverity(event.eventName)} key={event.id}>
            <i />
            <div>
              <b>{event.eventName}</b>
              <time>{event.occurredAt}</time>
              <p>{event.employee} · {event.accessPoint}</p>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
