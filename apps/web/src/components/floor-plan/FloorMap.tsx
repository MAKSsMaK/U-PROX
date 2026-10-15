import { useState, type CSSProperties } from 'react';
import { doors, useStore } from '../../store';

export function FloorMap() {
  const floor = useStore((state) => state.floor);
  const selected = useStore((state) => state.selected);
  const select = useStore((state) => state.select);
  const [zoom, setZoom] = useState(1);
  const changeZoom = (change: number) =>
    setZoom((current) => Math.min(1.5, Math.max(0.65, current + change)));
  return (
    <section className="electronic-plan" aria-label={`Електронний план: ${floor}`}>
      <div className="plan-meta">
        <div>
          <strong>{floor.toUpperCase()}</strong>
          <span>Адміністративна будівля · етап 1</span>
        </div>
        <div className="plan-levels" aria-label="Вибір поверху">
          <button type="button">2 поверх</button>
          <button className="active" type="button">
            3 поверх
          </button>
          <button type="button">4 поверх</button>
        </div>
      </div>
      <div className="plan-canvas">
        <div className="plan-grid" />
        <div className="plan-watermark">Електронний шар · налаштування в редакторі плану</div>
        <div className="plan-frame" style={{ '--plan-scale': zoom } as CSSProperties}>
          <img
            alt="План третього поверху суду"
            className="court-plan-image"
            src="/floor-plans/court-floor-3-blueprint.png"
          />
          {doors.map((door) => (
            <button
              aria-label={door[0]}
              className={`marker ${door[1]} ${selected[0] === door[0] ? 'selected' : ''}`}
              key={door[0]}
              onClick={() => select(door)}
              style={{ left: `${door[2]}%`, top: `${door[3]}%` }}
              title={door[0]}
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
