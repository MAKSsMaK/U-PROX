import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getEvents } from '../api';
import { DataTable } from '../components/tables/DataTable';
import { eventTableColumns, getEventSeverity, toEventTableRows } from '../features/events/eventTable';
import { DashboardLayout } from '../layouts/DashboardLayout';

export function EventsPage() {
  const [eventMode, setEventMode] = useState<'normal' | 'security'>('normal');
  const eventsQuery = useQuery({
    queryKey: ['events'],
    queryFn: () => getEvents({ hours: 24, limit: 50 }),
    refetchInterval: 5_000,
  });
  const rows = toEventTableRows(eventsQuery.data);
  const visibleRows = useMemo(() => rows.filter((row) => {
    const isSecurity = getEventSeverity(row.eventName) !== 'normal';
    return eventMode === 'security' ? isSecurity : !isSecurity;
  }), [eventMode, rows]);

  return (
    <DashboardLayout>
      <main className="events-page">
        <header className="page-header">
          <div>
            <p className="eyebrow">U‑PROX · ЖИВІ ДАНІ</p>
            <h1>Події</h1>
            <span>До 50 подій за останні 24 години · оновлюється кожні 5 секунд</span>
          </div>
          <div className="events-status">
            <i className={eventsQuery.isError ? 'is-error' : ''} />
            {eventsQuery.isError ? 'Помилка отримання' : 'LIVE'}
          </div>
        </header>
        <section className="events-panel">
          <div className="events-panel-title">
            <div>
              <h2>{eventMode === 'security' ? 'Безпекові події' : 'Звичайні події'}</h2>
              <p>{eventMode === 'security' ? 'Відмови, попередження, тривоги та несправності.' : 'Входи, виходи й інші штатні події U‑PROX.'}</p>
            </div>
            <div className="events-panel-actions">
              <div aria-label="Тип подій" className="event-mode-toggle">
                <button aria-pressed={eventMode === 'normal'} className={eventMode === 'normal' ? 'active' : ''} onClick={() => setEventMode('normal')} type="button">Звичайні</button>
                <button aria-pressed={eventMode === 'security'} className={eventMode === 'security' ? 'active' : ''} onClick={() => setEventMode('security')} type="button">Безпекові</button>
              </div>
              <button onClick={() => eventsQuery.refetch()} type="button">Оновити</button>
            </div>
          </div>
          {eventsQuery.isError ? (
            <div className="events-error">
              Не вдалося отримати події: {eventsQuery.error.message}
            </div>
          ) : (
            <DataTable
              columns={eventTableColumns}
              emptyMessage={eventMode === 'security' ? 'Безпекових подій за поточним запитом немає.' : 'Звичайних подій за поточним запитом немає.'}
              getRowId={(row) => row.id}
              isLoading={eventsQuery.isLoading}
              rows={visibleRows}
            />
          )}
        </section>
      </main>
    </DashboardLayout>
  );
}
