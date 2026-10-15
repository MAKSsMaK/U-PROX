import { DashboardLayout } from '../layouts/DashboardLayout';

export function PlaceholderPage({ title }: { title: string }) {
  return <DashboardLayout><main className="placeholder"><h1>{title}</h1><p>Розділ уже має окремий маршрут. Наступним кроком підключаємо його до U‑PROX API.</p></main></DashboardLayout>;
}
