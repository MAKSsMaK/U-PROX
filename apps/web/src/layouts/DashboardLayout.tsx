import type { ReactNode } from 'react';
import { Sidebar } from '../components/navigation/Sidebar';

export function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <div className="app">
      <Sidebar />
      {children}
    </div>
  );
}
