import { useEffect, useRef, useState, type CSSProperties, type PointerEvent } from 'react';
import { doors, useStore } from '../../store';

const planFloors = ['2 поверх', '3 поверх', '4 поверх'] as const;

export function FloorMap() {
  const floor = useStore((state) => state.floor);
  const selected = useStore((state) => state.selected);
  const select = useStore((state) => state.select);
  const setFloor = useStore((state) => state.setFloor);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [imageUnavailable, setImageUnavailable] = useState(false);
  const dragStart = useRef<{ x: number; y: number; panX: number; panY: number }>();
  const hasThirdFloorPlan = floor === '3 поверх';
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
          {planFloors.map((level) => (
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
        {hasThirdFloorPlan && !imageUnavailable ? (
          <div
            className="plan-frame"
            style={
              {
                '--plan-scale': zoom,
                '--plan-pan-x': `${pan.x}px`,
                '--plan-pan-y': `${pan.y}px`,
              } as CSSProperties
            }
          >
            <img
              alt="План третього поверху суду"
              className="court-plan-image"
              onError={() => setImageUnavailable(true)}
              src="/floor-plans/court-floor-3-blueprint.png"
            />
            {doors.map((door) => (
              <button
                aria-label={door[0]}
                className={`marker ${door[1]} ${selected[0] === door[0] ? 'selected' : ''}`}
                key={door[0]}
                onClick={() => select(door)}
                style={{ left: `${door[2]}%`, top: `${door[3]}%` }}
                title={`${door[0]} · тестова позиція`}
                type="button"
              >
                {door[1] === 'blue' ? '▣' : '▯'}
              </button>
            ))}
            <span
              className="sensor-marker"
              style={{ left: '40%', top: '27%' }}
              title="Датчик · ще не прив’язано"
            />
            <span
              className="sensor-marker"
              style={{ left: '62%', top: '58%' }}
              title="Датчик · ще не прив’язано"
            />
          </div>
        ) : (
          <div className="plan-empty-state">
            <strong>{imageUnavailable ? 'Файл плану не знайдено' : `План «${floor}» ще не додано`}</strong>
            <span>
              {imageUnavailable
                ? 'Перевір папку public/floor-plans і назву файлу court-floor-3-blueprint.png.'
                : 'Після завантаження схеми тут з’явиться окремий електронний шар.'}
            </span>
          </div>
        )}
        <div className="plan-watermark">Електронний шар · тестові маркери не прив’язані</div>
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
