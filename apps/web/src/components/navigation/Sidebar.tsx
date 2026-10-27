import { NavLink } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { getHealth } from '../../api';
import { useIntegrationStore } from '../../store';

const navigation = [
  ['⌘', 'Плани', '/plans'],
  ['◷', 'Події', '/events'],
  ['▣', 'Точки доступу', '/access-points'],
  ['◈', 'Пристрої', '/devices'],
  ['♙', 'Персонал', '/personnel'],
  ['▤', 'Звіти', '/reports'],
  ['▤', 'Журнал аудиту', '/audit'],
  ['⚙', 'Інтеграція', '/integration'],
] as const;

export function Sidebar() {
  const mode = useIntegrationStore((state) => state.mode);
  const healthQuery = useQuery({
    queryKey: ['health'],
    queryFn: getHealth,
    refetchInterval: 30_000,
  });
  const apiMode = healthQuery.data?.mode ?? mode;
  return (
    <aside>
      <div className="brand">
        <i>U</i>
        <b>
          U-PROX<small>SECURITY CENTER</small>
        </b>
      </div>
      <label>ОПЕРАЦІЙНИЙ ЦЕНТР</label>
      {navigation.map(([icon, label, to]) => (
        <NavLink className={({ isActive }) => `nav ${isActive ? 'active' : ''}`} to={to} key={to}>
          {icon}
          <span>{label}</span>
        </NavLink>
      ))}
      <div className="connection">
        <b>● СИСТЕМА В МЕРЕЖІ</b>
        <small>U-PROX API · {apiMode === 'uproxx' ? 'REAL MODE' : 'MOCK MODE'}</small>
      </div>
    </aside>
  );
}
