import { useEffect, useRef, useState, type CSSProperties, type PointerEvent } from 'react';
import { useStore } from '../../store';
import { planElementIcon, readPlanElements } from '../../features/plans/planElements';
import { floorOptions, getFloorPlan } from '../../features/plans/floorPlans';

export function FloorMap() {
  const floor = useStore((state) => state.floor);
  const selected = useStore((state) => state.selected);
  const select = useStore((state) => state.select);
  const setFloor = useStore((state) => state.setFloor);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [imageUnavailable, setImageUnavailable] = useState(false);
  const [savedElements, setSavedElements] = useState(() => readPlanElements(floor));
  const dragStart = useRef<{ x: number; y: number; panX: number; panY: number }>();
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
    setSavedElements(readPlanElements(floor));
    select(undefined);
  }, [floor]);

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

  return (
    <section className="electronic-plan" aria-label={`Електронний план: ${floor}`}>
      <div className="plan-meta">
        <div>
          <strong>{floor.toUpperCase()}</strong>
          <span>Адміністративна будівля · етап 1</span>
        </div>
        <div className="plan-levels" aria-label="Вибір поверху">
          {floorOptions.map((level) => (
            <button
              className={floor === level ? 'active' : ''}
              key={level}
              onClick={() => setFloor(level)}
              type="button"
            >
              {level}
            </button>
          ))}
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
            {savedElements.map((element) =>
              element.type === 'label' ? (
                <span className="map-plan-label" key={element.id} style={{ left: `${element.x}%`, top: `${element.y}%` }}>
                  {element.name}
                </span>
              ) : (
                <button
                  aria-label={element.name}
                  className={`marker ${element.type === 'device' ? 'blue' : element.type === 'input' ? 'yellow' : 'green'} ${selected?.id === element.id ? 'selected' : ''}`}
                  key={element.id}
                  onClick={() => select({ id: element.id, name: element.name, type: element.type as 'door' | 'device' | 'input', token: element.token, detail: element.detail, floor })}
                  style={{ left: `${element.x}%`, top: `${element.y}%` }}
                  title={`${element.name}${element.token ? ` · токен ${element.token}` : ''}`}
                  type="button"
                >
                  {planElementIcon(element.type)}
                </button>
              ),
            )}
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
