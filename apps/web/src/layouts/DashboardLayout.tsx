import type { ReactNode } from 'react';
import { Sidebar } from '../components/navigation/Sidebar';

type DashboardLayoutProps = {
  children: ReactNode;
  variant?: 'single' | 'plan' | 'editor';
};

export function DashboardLayout({ children, variant = 'single' }: DashboardLayoutProps) {
  if (variant === 'editor') return <div className="app app--editor">{children}</div>;
  return (
    <div className={`app app--${variant}`}>
      <Sidebar />
      {children}
    </div>
  );
}
