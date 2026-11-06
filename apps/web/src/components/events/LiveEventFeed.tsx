import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { getCameras, getEvents, getPlanElements, getPlanLiveController } from '../../api';
import { eventMatchesObject, getEventSeverity, toEventTableRows } from '../../features/events/eventTable';
import { useStore } from '../../store';

function objectType(type?: 'door' | 'device' | 'input' | 'camera') {
  if (type === 'camera') return 'Камера';
  if (type === 'device') return 'Контролер';
  if (type === 'input') return 'Датчик / вхід';
  return 'Двері / точка доступу';
}

function objectIcon(type?: 'door' | 'device' | 'input' | 'camera') {
  if (type === 'camera') return '▣';
  if (type === 'device') return '▣';
  if (type === 'input') return '◉';
  return '▯';
}

function CameraPlanPreview({ recorder, channel, name }: { recorder: string; channel: number; name: string }) {
  const [playing, setPlaying] = useState(true);
  const [error, setError] = useState(false);
  const [version, setVersion] = useState(0);
  const ref = useRef<HTMLImageElement>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const [fullscreenError, setFullscreenError] = useState('');
  useEffect(() => {
    const update = () => setFullscreen(document.fullscreenElement === previewRef.current);
    document.addEventListener('fullscreenchange', update);
    return () => document.removeEventListener('fullscreenchange', update);
  }, []);
  const toggleFullscreen = async () => {
    try {
      setFullscreenError('');
      if (document.fullscreenElement === previewRef.current) await document.exitFullscreen();
      else if (previewRef.current?.requestFullscreen) await previewRef.current.requestFullscreen();
      else setFullscreenError('Браузер не підтримує повноекранний режим.');
    } catch { setFullscreenError('Не вдалося відкрити повноекранний режим.'); }
  };
  const cameras = useQuery({ queryKey: ['cameras'], queryFn: getCameras, staleTime: 60_000 });
  const camera = cameras.data?.cameras.find((item) => item.recorder === recorder && item.channel === channel);
  useLayoutEffect(() => {
    const image = ref.current;
    if (!image || !playing || !camera) return;
    image.src = `/api/cameras/${channel}/live?recorder=${encodeURIComponent(recorder)}&v=${version}`;
    return () => { image.removeAttribute('src'); };
  }, [recorder, channel, version, playing, Boolean(camera)]);
  return <div className="plan-camera-view">
    <p>{recorder} · D{channel}</p>
    {cameras.isLoading ? <p>Завантаження камери…</p> : !camera ? <p>Камеру не знайдено або реєстратор недоступний.</p> : playing && !error ? <div className="plan-camera-preview" ref={previewRef}><img ref={ref} alt={`Відео: ${name}`} onError={() => { setError(true); setPlaying(false); }} />{fullscreen && <button className="camera-fullscreen" onClick={() => void toggleFullscreen()} type="button" aria-label="Вийти з повного екрана">⤡ Згорнути</button>}</div> : <p>{error ? 'Не вдалося отримати відео.' : 'Відео зупинено.'}</p>}
    {fullscreenError && <p role="alert">{fullscreenError}</p>}
    {camera && <button className="plan-details-action" type="button" onClick={() => { if (playing) setPlaying(false); else { setError(false); setVersion((value) => value + 1); setPlaying(true); } }}>{playing ? 'Зупинити відео' : 'Увімкнути відео'}</button>}
    {camera && playing && !error && <button className="plan-details-action" type="button" onClick={() => void toggleFullscreen()}>⛶ На весь екран</button>}
  </div>;
}

type LiveEventFeedProps = {
  collapsed: boolean;
  onToggle: () => void;
  onShowObject: () => void;
  view: 'object' | 'legend';
};

export function LiveEventFeed({ collapsed, onShowObject, onToggle, view }: LiveEventFeedProps) {
  const selected = useStore((state) => state.selected);
  const floor = useStore((state) => state.floor);
  const navigate = useNavigate();
  const [detailsCollapsed, setDetailsCollapsed] = useState(true);
  const tokens = selected?.eventTokens ?? [];
  const eventsQuery = useQuery({
    queryKey: ['plan-events', 24, selected ? tokens : null],
    queryFn: () => getEvents({ hours: 24, limit: 200, senderTokens: tokens }),
    enabled: selected?.type !== 'camera' && (!selected || tokens.length > 0),
    refetchInterval: 30_000,
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
  const legendElementsQuery = useQuery({
    queryKey: ['plan-elements', floor],
    queryFn: () => getPlanElements(floor),
    enabled: view === 'legend',
    refetchInterval: view === 'legend' ? 5_000 : false,
  });
  const customLegendElements = (legendElementsQuery.data?.elements ?? []).filter((element) => element.type === 'label' && Boolean(element.detail?.trim()));
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

  if (collapsed) {
    return <section className="feed feed--collapsed"><button aria-label="Розгорнути бічну панель" className="feed-collapse-toggle" onClick={onToggle} title="Розгорнути бічну панель" type="button">‹</button></section>;
  }

  if (view === 'legend') {
    return (
      <section className="feed">
        <div className="feed-title">
          <b>Легенда карти</b>
          <span className="feed-title-actions">
            <button aria-label="Повернутися до об’єкта" onClick={onShowObject} title="Повернутися до об’єкта" type="button">‹</button>
            <button aria-label="Згорнути панель" onClick={onToggle} title="Згорнути панель" type="button">›</button>
          </span>
        </div>
        <div className="map-legend-panel">
          <p>Позначення об’єктів і станів на електронному шарі плану.</p>
          <section>
            <h2>Об’єкти</h2>
            <div className="map-legend-row"><i className="map-legend-symbol door">▯</i><span><b>Двері / точка доступу</b><small>Зелений маркер</small></span></div>
            <div className="map-legend-row"><i className="map-legend-symbol controller">▣</i><span><b>Контролер</b><small>Синій маркер</small></span></div>
            <div className="map-legend-row"><i className="map-legend-symbol sensor">◉</i><span><b>Датчик / вхід</b><small>Жовтий маркер</small></span></div>
            <div className="map-legend-row"><i className="map-legend-symbol controller">▣</i><span><b>Камера</b><small>Синій маркер</small></span></div>
            <div className="map-legend-row"><i className="map-legend-symbol label">T</i><span><b>Напис</b><small>Текстова позначка</small></span></div>
          </section>
          <section>
            <h2>Ваші позначки</h2>
            {legendElementsQuery.isLoading && <p className="map-legend-empty">Завантаження позначок…</p>}
            {!legendElementsQuery.isLoading && customLegendElements.length === 0 && <p className="map-legend-empty">Ще немає власних пунктів. Додай код і пояснення у редакторі плану.</p>}
            {customLegendElements.map((element) => <div className="map-legend-row" key={element.id}><i className="map-legend-code">{element.name}</i><span><b>{element.detail}</b><small>Позначка на плані: {element.name}</small></span></div>)}
          </section>
          <section>
            <h2>Стани</h2>
            <div className="map-legend-row"><i className="map-legend-state normal" /><span><b>Нормальний стан</b><small>Об’єкт доступний і без тривог</small></span></div>
            <div className="map-legend-row"><i className="map-legend-state warning" /><span><b>Попередження</b><small>Потрібна увага</small></span></div>
            <div className="map-legend-row"><i className="map-legend-state alarm" /><span><b>Тривога або несправність</b><small>Червоний маркер</small></span></div>
            <div className="map-legend-row"><i className="map-legend-pulse" /><span><b>Нова подія</b><small>Синій — системна подія, зелений — прохід; жовтий та червоний — попередження і тривога. Імпульс триває 5 секунд.</small></span></div>
          </section>
          <div className="map-legend-tip">Натисни маркер на плані, щоб відкрити його події та технічні дані.</div>
        </div>
      </section>
    );
  }

  if (selected?.type === 'camera') {
    return <section className="feed"><div className="feed-title"><b>Камера на плані</b><span className="feed-title-actions"><button aria-label="Згорнути панель" onClick={onToggle} type="button">›</button></span></div>
      <div className="plan-details"><div className="object-icon blue">▣</div><h2>{selected.name}</h2><p>{selected.floor}</p>
        {selected.recorder && selected.cameraChannel ? <CameraPlanPreview key={`${selected.recorder}/${selected.cameraChannel}`} recorder={selected.recorder} channel={selected.cameraChannel} name={selected.name} /> : <p>Камера не має прив’язки до реєстратора.</p>}
      </div></section>;
  }

  return (
    <section className={`feed ${collapsed ? 'feed--collapsed' : ''}`}>
      <>
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
              {selectedLastEvent ? <><b>{selectedLastEvent.name}</b><time>{selectedLastEvent.occurredAt}</time></> : <p>За останні 24 години подій для цього об’єкта не знайдено.</p>}
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
        {!eventsQuery.isLoading && !eventsQuery.isError && events.length === 0 && <p className="feed-empty">{selected ? (tokens.length ? 'Для вибраного об’єкта подій за останні 24 години не знайдено.' : 'U‑PROX не повернув точної прив’язки входів і виходів для цього об’єкта.') : 'U‑PROX не повернув подій за останні 24 години.'}</p>}
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
      </>
    </section>
  );
}
