import { useQuery } from '@tanstack/react-query';
import { getEvents } from '../api';
import { DataTable } from '../components/tables/DataTable';
import { eventTableColumns, toEventTableRows } from '../features/events/eventTable';
import { DashboardLayout } from '../layouts/DashboardLayout';

export function EventsPage() {
  const eventsQuery = useQuery({
    queryKey: ['events'],
    queryFn: () => getEvents({ hours: 24, limit: 50 }),
    refetchInterval: 5_000,
  });
  const rows = toEventTableRows(eventsQuery.data);

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
              <h2>Журнал подій</h2>
              <p>Останні події, що повертає U‑PROX API</p>
            </div>
            <button onClick={() => eventsQuery.refetch()} type="button">
              Оновити
            </button>
          </div>
          {eventsQuery.isError ? (
            <div className="events-error">
              Не вдалося отримати події: {eventsQuery.error.message}
            </div>
          ) : (
            <DataTable
              columns={eventTableColumns}
              emptyMessage="U‑PROX не повернув подій за поточним запитом."
              getRowId={(row) => row.id}
              isLoading={eventsQuery.isLoading}
              rows={rows}
            />
          )}
        </section>
      </main>
    </DashboardLayout>
  );
}
