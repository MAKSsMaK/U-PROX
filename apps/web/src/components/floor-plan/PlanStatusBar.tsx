import { useQuery } from '@tanstack/react-query';
import { getPlanElements } from '../../api';
import { type PlanElement } from '../../features/plans/planElements';
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
  const elementsQuery = useQuery({
    queryKey: ['plan-elements', floor],
    queryFn: () => getPlanElements(floor),
    refetchInterval: 5_000,
  });
  const elements = elementsQuery.data?.elements ?? [];

  const statuses = getStatuses(elements);
  return (
    <section className="plan-status-bar">
      <div className="plan-summary">
        <h2>Елементи на плані</h2>
        <p>{elements.length ? 'Спільно збережені прив’язки поточного поверху.' : 'Ще немає збережених прив’язок для цього поверху.'}</p>
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
