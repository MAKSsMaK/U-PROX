import { Navigate, Route, Routes } from 'react-router-dom';
import { PlaceholderPage } from '../pages/PlaceholderPage';
import { EventsPage } from '../pages/EventsPage';
import { LivePlanPage } from '../pages/LivePlanPage';
import { PlanEditorPage } from '../pages/PlanEditorPage';
import { PersonnelPage } from '../pages/PersonnelPage';
import { ReportsPage } from '../pages/ReportsPage';

export function AppRouter() {
  return (
    <Routes>
      <Route path="/plans" element={<LivePlanPage />} />
      <Route path="/events" element={<EventsPage />} />
      <Route path="/access-points" element={<PlaceholderPage title="Точки доступу" />} />
      <Route path="/devices" element={<PlaceholderPage title="Пристрої" />} />
      <Route path="/personnel" element={<PersonnelPage />} />
      <Route path="/reports" element={<ReportsPage />} />
      <Route path="/plan-editor" element={<PlanEditorPage />} />
      <Route path="/audit" element={<PlaceholderPage title="Журнал аудиту" />} />
      <Route path="/integration" element={<PlaceholderPage title="Інтеграція" />} />
      <Route path="*" element={<Navigate to="/plans" replace />} />
    </Routes>
  );
}
