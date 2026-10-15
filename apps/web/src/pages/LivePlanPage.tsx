import { useState } from 'react';
import { FloorMap } from '../components/floor-plan/FloorMap';
import { PlanStatusBar } from '../components/floor-plan/PlanStatusBar';
import { LiveEventFeed } from '../components/events/LiveEventFeed';
import { IntegrationTestDialog } from '../components/integration/IntegrationTestDialog';
import { DashboardLayout } from '../layouts/DashboardLayout';
import { useStore } from '../store';

export function LivePlanPage() {
  const building = useStore((state) => state.building);
  const floor = useStore((state) => state.floor);
  const setBuilding = useStore((state) => state.setBuilding);
  const setFloor = useStore((state) => state.setFloor);
  const [testing, setTesting] = useState(false);
  return (
    <DashboardLayout variant="plan">
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
              <option>1 поверх</option>
              <option>2 поверх</option>
              <option>3 поверх</option>
            </select>
          </div>
        </header>
        <FloorMap />
        <PlanStatusBar />
      </main>
      <LiveEventFeed />
      <button className="api-test" onClick={() => setTesting(true)}>
        API ТЕСТ
      </button>
      {testing && <IntegrationTestDialog onClose={() => setTesting(false)} />}
    </DashboardLayout>
  );
}
