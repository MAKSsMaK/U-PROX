import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getEvents } from '../api';
import { eventTableColumns, toEventTableRows } from '../features/events/eventTable';
import { DataTable } from '../components/tables/DataTable';
import { DashboardLayout } from '../layouts/DashboardLayout';

type ReportKind = 'access' | 'security' | 'worktime';
const REPORT_PAGE_SIZE = 100;

const reportCards: Array<{ kind: ReportKind; icon: string; title: string; description: string }> = [
  { kind: 'access', icon: '◷', title: 'Журнал проходів', description: 'Входи, виходи, дозволи та відмови за вибраний період.' },
  { kind: 'security', icon: '!', title: 'Безпекові події', description: 'Відмови, тривоги та події, що потребують уваги.' },
  { kind: 'worktime', icon: '◴', title: 'Робочий час', description: 'Підсумок присутності на основі подій доступу.' },
];

function isSecurityEvent(eventName: string) {
  const name = eventName.toLocaleLowerCase('uk-UA');
  return ['відмов', 'заборон', 'тривог', 'помил', 'заблок'].some((word) => name.includes(word));
}

function csvEscape(value: string) {
  return `"${value.replaceAll('"', '""')}"`;
}

export function ReportsPage() {
  const [kind, setKind] = useState<ReportKind>('access');
  const [hours, setHours] = useState(24);
  const [page, setPage] = useState(1);
  const eventsQuery = useQuery({
    queryKey: ['reports-events', hours],
    queryFn: () => getEvents({ hours, limit: 10_000 }),
    refetchInterval: 60_000,
  });
  const rows = useMemo(() => toEventTableRows(eventsQuery.data), [eventsQuery.data]);
  const reportRows = useMemo(() => kind === 'security' ? rows.filter((row) => isSecurityEvent(row.eventName)) : rows, [kind, rows]);
  const pageCount = Math.max(1, Math.ceil(reportRows.length / REPORT_PAGE_SIZE));
  const safePage = Math.min(page, pageCount);
  const visibleRows = reportRows.slice((safePage - 1) * REPORT_PAGE_SIZE, safePage * REPORT_PAGE_SIZE);
  const peopleCount = new Set(reportRows.filter((row) => row.employee !== 'Системна подія' && row.employee !== 'Невідома картка').map((row) => row.employee)).size;
  const deniedCount = reportRows.filter((row) => isSecurityEvent(row.eventName)).length;
  const activeReport = reportCards.find((item) => item.kind === kind)!;

  const exportReport = () => {
    const header = ['Дата та час', 'Працівник', 'Відділ', 'Місце', 'Подія', 'Ідентифікатор'];
    const records = reportRows.map((row) => [row.occurredAt, row.employee, row.department, row.accessPoint, row.eventName, row.cardCode]);
    const content = `\uFEFF${[header, ...records].map((record) => record.map(csvEscape).join(';')).join('\n')}`;
    const url = URL.createObjectURL(new Blob([content], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `${activeReport.title.toLocaleLowerCase('uk-UA').replaceAll(' ', '-')}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return <DashboardLayout>
    <main className="reports-page">
      <header className="page-header">
        <div>
          <p className="eyebrow">U‑PROX · АНАЛІТИКА</p>
          <h1>Звіти</h1>
          <span>Формуйте вибірки подій та експортуйте їх у CSV.</span>
        </div>
      </header>
      <section className="report-cards" aria-label="Тип звіту">
        {reportCards.map((item) => <button className={kind === item.kind ? 'report-card active' : 'report-card'} key={item.kind} onClick={() => { setKind(item.kind); setPage(1); }} type="button">
          <i>{item.icon}</i><span><b>{item.title}</b><small>{item.description}</small></span>
        </button>)}
      </section>
      <section className="report-panel">
        <div className="report-toolbar">
          <div><h2>{activeReport.title}</h2><p>{activeReport.description}</p></div>
          <label>Період<select onChange={(event) => { setHours(Number(event.target.value)); setPage(1); }} value={hours}><option value={24}>Останні 24 години</option><option value={72}>Останні 3 дні</option><option value={168}>Останні 7 днів</option></select></label>
          <div className="report-actions">
            <button className="report-refresh" disabled={eventsQuery.isFetching} onClick={() => void eventsQuery.refetch()} type="button">{eventsQuery.isFetching ? 'Оновлення…' : 'Оновити зараз'}</button>
            <button className="report-export" disabled={!reportRows.length || eventsQuery.isFetching} onClick={exportReport} type="button">Завантажити CSV</button>
          </div>
        </div>
        <div className="report-summary">
          <div><span>Подій у вибірці</span><b>{reportRows.length}</b></div>
          <div><span>Працівників</span><b>{peopleCount}</b></div>
          <div><span>{kind === 'security' ? 'Подій ризику' : 'Відмов / тривог'}</span><b>{deniedCount}</b></div>
          {kind === 'worktime' && <p>Це попередній підсумок за проходами. Повний табель із запізненнями й понаднормовими потребує графіків U‑PROX.</p>}
        </div>
        {eventsQuery.isError ? <p className="reports-error">Не вдалося отримати події: {eventsQuery.error.message}</p> : <>
          <DataTable columns={eventTableColumns} emptyMessage="За вибраний період даних немає." getRowId={(row) => row.id} isLoading={eventsQuery.isLoading} rows={visibleRows} />
          {reportRows.length > REPORT_PAGE_SIZE && <nav aria-label="Сторінки звіту" className="report-pagination">
            <button disabled={safePage === 1} onClick={() => setPage((current) => Math.max(1, current - 1))} type="button">← Попередня</button>
            <span>Сторінка {safePage} з {pageCount} · показано {visibleRows.length} із {reportRows.length}</span>
            <button disabled={safePage === pageCount} onClick={() => setPage((current) => Math.min(pageCount, current + 1))} type="button">Наступна →</button>
          </nav>}
        </>}
      </section>
    </main>
  </DashboardLayout>;
}
