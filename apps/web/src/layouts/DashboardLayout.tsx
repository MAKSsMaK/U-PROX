import type { ReactNode } from 'react';
import { Sidebar } from '../components/navigation/Sidebar';

type DashboardLayoutProps = {
  children: ReactNode;
  variant?: 'single' | 'plan' | 'editor';
  planPanelCollapsed?: boolean;
};

export function DashboardLayout({ children, variant = 'single', planPanelCollapsed = false }: DashboardLayoutProps) {
  if (variant === 'editor') return <div className="app app--editor">{children}</div>;
  return (
    <div className={`app app--${variant}${variant === 'plan' && planPanelCollapsed ? ' app--plan-panel-collapsed' : ''}`}>
      <Sidebar />
      {children}
    </div>
  );
}
