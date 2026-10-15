import { Navigate, Route, Routes } from 'react-router-dom';
import { PlaceholderPage } from '../pages/PlaceholderPage';
import { LivePlanPage } from '../pages/LivePlanPage';

export function AppRouter() {
  return (
    <Routes>
      <Route path="/plans" element={<LivePlanPage />} />
      <Route path="/events" element={<PlaceholderPage title="Події" />} />
      <Route path="/access-points" element={<PlaceholderPage title="Точки доступу" />} />
      <Route path="/devices" element={<PlaceholderPage title="Пристрої" />} />
      <Route path="/plan-editor" element={<PlaceholderPage title="Редактор плану" />} />
      <Route path="/audit" element={<PlaceholderPage title="Журнал аудиту" />} />
      <Route path="/integration" element={<PlaceholderPage title="Інтеграція" />} />
      <Route path="*" element={<Navigate to="/plans" replace />} />
    </Routes>
  );
}
