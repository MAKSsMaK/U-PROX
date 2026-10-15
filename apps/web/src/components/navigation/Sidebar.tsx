import { NavLink } from 'react-router-dom';
import { useIntegrationStore } from '../../store';

const navigation = [
  ['⌘', 'Плани', '/plans'], ['◷', 'Події', '/events'], ['▣', 'Точки доступу', '/access-points'],
  ['◈', 'Пристрої', '/devices'], ['✥', 'Редактор плану', '/plan-editor'], ['▤', 'Журнал аудиту', '/audit'], ['⚙', 'Інтеграція', '/integration'],
] as const;

export function Sidebar() {
  const mode = useIntegrationStore((state) => state.mode);
  return <aside><div className="brand"><i>U</i><b>U-PROX<small>SECURITY CENTER</small></b></div><label>ОПЕРАЦІЙНИЙ ЦЕНТР</label>
    {navigation.map(([icon, label, to]) => <NavLink className={({ isActive }) => `nav ${isActive ? 'active' : ''}`} to={to} key={to}>{icon}<span>{label}</span></NavLink>)}
    <div className="connection"><b>● СИСТЕМА В МЕРЕЖІ</b><small>U-PROX API · {mode === 'uproxx' ? 'REAL MODE' : 'MOCK MODE'}</small></div>
  </aside>;
}
