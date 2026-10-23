import { useEffect, useRef, useState, type CSSProperties, type PointerEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getEvents, getPlanElements } from '../../api';
import { useStore } from '../../store';
import { planElementIcon } from '../../features/plans/planElements';
import { getFloorPlan } from '../../features/plans/floorPlans';
import { eventMatchesObject, toEventTableRows, type EventTableRow } from '../../features/events/eventTable';

type MapEventState = 'opened' | 'closed' | 'alert' | 'activity';

function eventState(eventName: string): MapEventState {
  const name = eventName.toLocaleLowerCase('uk-UA');
  if (name.includes('відчинен') || name.includes('відкрит')) return 'opened';
  if (name.includes('зачинен') || name.includes('закрит') || name.includes('заблок')) return 'closed';
  if (name.includes('відмов') || name.includes('заборон') || name.includes('тривог') || name.includes('обрив') || name.includes('несправ') || name.includes('зв’язок втрач')) return 'alert';
  return 'activity';
}

function lastEventForElement(
  element: { token?: string; name: string },
  events: EventTableRow[],
) {
  return events.find((event) => eventMatchesObject(event, element));
}

export function FloorMap() {
  const floor = useStore((state) => state.floor);
  const building = useStore((state) => state.building);
  const selected = useStore((state) => state.selected);
  const select = useStore((state) => state.select);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [imageUnavailable, setImageUnavailable] = useState(false);
  const [visibleTypes, setVisibleTypes] = useState({ door: true, device: true, input: true });
  const [showNames, setShowNames] = useState(false);
  const [showTextLabels, setShowTextLabels] = useState(true);
  const [pulseUntil, setPulseUntil] = useState<Record<string, number>>({});
  const eventsQuery = useQuery({
    queryKey: ['plan-events', 24, 100],
    queryFn: () => getEvents({ hours: 24, limit: 100 }),
    refetchInterval: 5_000,
  });
  const planElementsQuery = useQuery({
    queryKey: ['plan-elements', floor],
    queryFn: () => getPlanElements(floor),
    refetchInterval: 5_000,
  });
  const savedElements = planElementsQuery.data?.elements ?? [];
  const events = toEventTableRows(eventsQuery.data);
  const visibleElements = savedElements.filter((element) => {
    if (element.type === 'label') return showTextLabels;
    return visibleTypes[element.type];
  });
  const dragStart = useRef<{ x: number; y: number; panX: number; panY: number }>();
  const observedEventIds = useRef(new Map<string, string>());
  const eventsWereObserved = useRef(false);
  const plan = getFloorPlan(floor);
  const changeZoom = (change: number) =>
    setZoom((current) => {
      const next = Math.min(1.5, Math.max(0.65, current + change));
      if (next <= 1) setPan({ x: 0, y: 0 });
      return next;
    });

  useEffect(() => {
    setPan({ x: 0, y: 0 });
    setZoom(1);
    setImageUnavailable(false);
    observedEventIds.current.clear();
    eventsWereObserved.current = false;
    setPulseUntil({});
    select(undefined);
  }, [floor]);

  useEffect(() => {
    if (!eventsQuery.data) return;
    const latestEvents = toEventTableRows(eventsQuery.data);
    const nextObserved = new Map<string, string>();
    const newlyObserved: Record<string, number> = {};

    savedElements.forEach((element) => {
      if (element.type === 'label') return;
      const lastEvent = lastEventForElement(element, latestEvents);
      if (!lastEvent) return;
      nextObserved.set(element.id, lastEvent.id);
      if (eventsWereObserved.current && observedEventIds.current.get(element.id) && observedEventIds.current.get(element.id) !== lastEvent.id) {
        newlyObserved[element.id] = Date.now() + 5_000;
      }
    });

    observedEventIds.current = nextObserved;
    eventsWereObserved.current = true;
    if (Object.keys(newlyObserved).length) {
      setPulseUntil((current) => ({ ...current, ...newlyObserved }));
    }
  }, [eventsQuery.data, savedElements]);

  useEffect(() => {
    const expirations = Object.values(pulseUntil);
    if (!expirations.length) return;
    const delay = Math.max(0, Math.min(...expirations) - Date.now());
    const timer = window.setTimeout(() => {
      const now = Date.now();
      setPulseUntil((current) => Object.fromEntries(Object.entries(current).filter(([, expiresAt]) => expiresAt > now)));
    }, delay + 20);
    return () => window.clearTimeout(timer);
  }, [pulseUntil]);

  const beginPan = (event: PointerEvent<HTMLDivElement>) => {
    if (zoom <= 1 || event.target instanceof HTMLButtonElement) return;
    dragStart.current = { x: event.clientX, y: event.clientY, panX: pan.x, panY: pan.y };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const movePlan = (event: PointerEvent<HTMLDivElement>) => {
    const start = dragStart.current;
    if (!start) return;
    const limit = Math.round((zoom - 1) * 300);
    const x = Math.max(-limit, Math.min(limit, start.panX + event.clientX - start.x));
    const y = Math.max(-limit, Math.min(limit, start.panY + event.clientY - start.y));
    setPan({ x, y });
  };

  const endPan = () => {
    dragStart.current = undefined;
  };
  const allTypesVisible = Object.values(visibleTypes).every(Boolean);
  const toggleType = (type: keyof typeof visibleTypes) =>
    setVisibleTypes((types) => ({ ...types, [type]: !types[type] }));

  return (
    <section className="electronic-plan" aria-label={`Електронний план: ${floor}`}>
      <div className="plan-meta">
        <div>
          <strong>{floor.toUpperCase()}</strong>
          <span>{building} · локальний електронний план</span>
        </div>
        <div className="plan-display-filters" aria-label="Фільтри відображення">
          <span>Показати</span>
          <button className={allTypesVisible ? 'active' : ''} onClick={() => setVisibleTypes(allTypesVisible ? { door: false, device: false, input: false } : { door: true, device: true, input: true })} type="button">Усі</button>
          <button aria-pressed={visibleTypes.door} className={visibleTypes.door ? 'active' : ''} onClick={() => toggleType('door')} type="button">Двері</button>
          <button aria-pressed={visibleTypes.device} className={visibleTypes.device ? 'active' : ''} onClick={() => toggleType('device')} type="button">Контролери</button>
          <button aria-pressed={visibleTypes.input} className={visibleTypes.input ? 'active' : ''} onClick={() => toggleType('input')} type="button">Датчики</button>
          <i />
          <button aria-pressed={showNames} className={showNames ? 'active' : ''} onClick={() => setShowNames((value) => !value)} type="button">Назви</button>
          <button aria-pressed={showTextLabels} className={showTextLabels ? 'active' : ''} onClick={() => setShowTextLabels((value) => !value)} type="button">Написи</button>
        </div>
      </div>
      <div
        className={`plan-canvas ${zoom > 1 ? 'is-pannable' : ''}`}
        onPointerCancel={endPan}
        onPointerDown={beginPan}
        onPointerMove={movePlan}
        onPointerUp={endPan}
      >
        <div className="plan-grid" />
        {plan && !imageUnavailable ? (
          <div
            className="plan-frame"
            style={
              {
                '--plan-scale': zoom,
                '--plan-pan-x': `${pan.x}px`,
                '--plan-pan-y': `${pan.y}px`,
                aspectRatio: plan.aspectRatio,
              } as CSSProperties
            }
          >
            <img
              alt={plan.alt}
              className="court-plan-image"
              onError={() => setImageUnavailable(true)}
              src={plan.imageUrl}
            />
            {visibleElements.map((element) => {
              const lastEvent = element.type === 'label' ? undefined : lastEventForElement(element, events);
              const lastState = lastEvent ? eventState(lastEvent.eventName) : undefined;
              const hasFreshEvent = Boolean(
                lastEvent && (pulseUntil[element.id] > Date.now() || Date.now() - lastEvent.occurredAtMs < 5_000),
              );
              return element.type === 'label' ? (
                <span className="map-plan-label" key={element.id} style={{ left: `${element.x}%`, top: `${element.y}%` }}>
                  {element.name}
                </span>
              ) : (
                <button
                  aria-label={element.name}
                  className={`marker ${element.type === 'device' ? 'blue' : element.type === 'input' ? 'yellow' : 'green'} ${showNames ? 'show-name' : ''} ${lastState ? `event-${lastState}` : ''} ${hasFreshEvent ? 'is-recent' : ''} ${selected?.id === element.id ? 'selected' : ''}`}
                  key={element.id}
                  onClick={() => select({ id: element.id, name: element.name, type: element.type as 'door' | 'device' | 'input', token: element.token, detail: element.detail, deviceToken: element.deviceToken, lastEvent: lastEvent ? { name: lastEvent.eventName, occurredAt: lastEvent.occurredAt } : undefined, floor })}
                  style={{ left: `${element.x}%`, top: `${element.y}%` }}
                  title={lastEvent ? `${element.name} · ${lastEvent.eventName} · ${lastEvent.occurredAt}` : `${element.name}${element.token ? ` · токен ${element.token}` : ''}`}
                  type="button"
                >
                  {planElementIcon(element.type)}
                  {lastState && <i aria-label={`Остання подія: ${lastEvent?.eventName}`} className="marker-event-indicator" />}
                  {hasFreshEvent && <span aria-hidden="true" className="marker-event-wave" />}
                  <span className="marker-hover-label" role="tooltip">{element.name}</span>
                </button>
              );
            })}
          </div>
        ) : (
          <div className="plan-empty-state">
            <strong>{imageUnavailable ? 'Файл плану не знайдено' : `План «${floor}» ще не додано`}</strong>
            <span>
              {imageUnavailable
                ? 'Перевір папку public/floor-plans і наявність файлу схеми.'
                : 'Після завантаження схеми тут з’явиться окремий електронний шар.'}
            </span>
          </div>
        )}
        <div className="plan-watermark">{savedElements.length ? `Електронний шар · ${savedElements.length} прив’язок` : 'Електронний шар ще не налаштовано'}</div>
        <div className="plan-zoom" aria-label="Масштаб карти">
          <button
            aria-label="Зменшити масштаб"
            disabled={zoom <= 0.65}
            onClick={() => changeZoom(-0.1)}
            type="button"
          >
            −
          </button>
          <b>{Math.round(zoom * 100)}%</b>
          <button
            aria-label="Збільшити масштаб"
            disabled={zoom >= 1.5}
            onClick={() => changeZoom(0.1)}
            type="button"
          >
            +
          </button>
        </div>
      </div>
    </section>
  );
}
