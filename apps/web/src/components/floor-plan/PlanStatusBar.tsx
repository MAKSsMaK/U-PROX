import { useEffect, useState } from 'react';
import { readPlanElements, type PlanElement } from '../../features/plans/planElements';
import { useStore } from '../../store';

type Status = { icon: string; count: number; label: string };

function getStatuses(elements: PlanElement[]): Status[] {
  const count = (type: PlanElement['type']) => elements.filter((element) => element.type === type).length;
  return [
    { icon: '▯', count: count('door'), label: 'Двері на плані' },
    { icon: '▣', count: count('device'), label: 'Контролери на плані' },
    { icon: '◉', count: count('input'), label: 'Датчики / входи' },
    { icon: 'T', count: count('label'), label: 'Написи' },
  ];
}

export function PlanStatusBar() {
  const floor = useStore((state) => state.floor);
  const [elements, setElements] = useState<PlanElement[]>(() => readPlanElements(floor));

  useEffect(() => {
    setElements(readPlanElements(floor));
  }, [floor]);

  const statuses = getStatuses(elements);
  return (
    <section className="plan-status-bar">
      <div className="plan-summary">
        <h2>Елементи на плані</h2>
        <p>{elements.length ? 'Локально збережені прив’язки поточного поверху.' : 'Ще немає збережених прив’язок для цього поверху.'}</p>
        <div className="plan-stat-list">
          {statuses.map(({ icon, count, label }) => (
            <div className="plan-stat" key={label}>
              <i>{icon}</i>
              <strong>{count}</strong>
              <span>{label}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="plan-legend">
        <h2>Позначення</h2>
        <span><i className="legend-dot green" /> Двері</span>
        <span><i className="legend-dot blue" /> Контролер</span>
        <span><i className="legend-dot yellow" /> Датчик / вхід</span>
        <span><i className="legend-dot neutral" /> Напис</span>
      </div>
    </section>
  );
}
