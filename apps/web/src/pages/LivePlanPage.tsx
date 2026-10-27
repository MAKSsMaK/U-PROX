import { useState } from 'react';
import { Link } from 'react-router-dom';
import { FloorMap } from '../components/floor-plan/FloorMap';
import { PlanStatusBar } from '../components/floor-plan/PlanStatusBar';
import { LiveEventFeed } from '../components/events/LiveEventFeed';
import { DashboardLayout } from '../layouts/DashboardLayout';
import { useStore } from '../store';
import { floorOptions } from '../features/plans/floorPlans';

export function LivePlanPage() {
  const building = useStore((state) => state.building);
  const floor = useStore((state) => state.floor);
  const setBuilding = useStore((state) => state.setBuilding);
  const setFloor = useStore((state) => state.setFloor);
  const [panelExpanded, setPanelExpanded] = useState(false);
  return (
    <DashboardLayout planPanelCollapsed={!panelExpanded} variant="plan">
      <main>
        <header>
          <div>
            <h1>Живий план</h1>
            <span>
              {building} / {floor}
            </span>
          </div>
          <div className="filters">
            <select value={building} onChange={(event) => setBuilding(event.target.value)}>
              <option>Головна будівля</option>
              <option>Складський корпус</option>
            </select>
            <select value={floor} onChange={(event) => setFloor(event.target.value)}>
              {floorOptions.map((option) => <option key={option}>{option}</option>)}
            </select>
            <Link className="plan-editor-link" to="/plan-editor">
              Редагувати план
            </Link>
          </div>
        </header>
        <FloorMap />
        <PlanStatusBar />
      </main>
      <LiveEventFeed collapsed={!panelExpanded} onToggle={() => setPanelExpanded((current) => !current)} />
    </DashboardLayout>
  );
}
