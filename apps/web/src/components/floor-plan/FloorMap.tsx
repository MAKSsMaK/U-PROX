import { doors, useStore } from '../../store';

export function FloorMap() {
  const floor = useStore((state) => state.floor);
  const selected = useStore((state) => state.selected);
  const select = useStore((state) => state.select);
  return <section className="map"><b>{floor.toUpperCase()} · МАСШТАБ 1:250</b><div className="room r1">OPEN SPACE · 301</div><div className="room r2">ПЕРЕГОВОРНА · 302</div><div className="room r3">ВІДДІЛ РОЗРОБКИ</div><div className="room r4">LAB · 304</div><div className="room r5">КОРИДОР B</div><div className="corridor" />
    {doors.map((door) => <button className={`marker ${door[1]} ${selected[0] === door[0] ? 'selected' : ''}`} style={{ left: `${door[2]}%`, top: `${door[3]}%` }} onClick={() => select(door)} title={door[0]} key={door[0]}>↔</button>)}
  </section>;
}
