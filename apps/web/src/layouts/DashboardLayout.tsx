import type { ReactNode } from 'react';
import { Sidebar } from '../components/navigation/Sidebar';

type DashboardLayoutProps = {
  children: ReactNode;
  variant?: 'single' | 'plan';
};

export function DashboardLayout({ children, variant = 'single' }: DashboardLayoutProps) {
  return (
    <div className={`app app--${variant}`}>
      <Sidebar />
      {children}
    </div>
  );
}
