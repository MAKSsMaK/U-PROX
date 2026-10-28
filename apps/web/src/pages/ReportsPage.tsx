import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getEvents, getPersonnel, getPlanCatalog } from '../api';
import { toEventTableRows } from '../features/events/eventTable';
import { DashboardLayout } from '../layouts/DashboardLayout';

type ReportKind = 'access' | 'security' | 'worktime';
type ReportExportFormat = 'pdf' | 'word';
type ReportFilters = { employeeToken: string; department: string; accessPoint: string };
const emptyFilters: ReportFilters = { employeeToken: '', department: '', accessPoint: '' };

const reportCards: Array<{ kind: ReportKind; icon: string; title: string; description: string }> = [
  { kind: 'access', icon: '◷', title: 'Журнал проходів', description: 'Входи, виходи, дозволи та відмови за вибраний період.' },
  { kind: 'security', icon: '!', title: 'Безпекові події', description: 'Відмови, тривоги та події, що потребують уваги.' },
  { kind: 'worktime', icon: '◴', title: 'Робочий час', description: 'Підсумок присутності на основі подій доступу.' },
];

function isSecurityEvent(eventName: string) {
  const name = eventName.toLocaleLowerCase('uk-UA');
  return ['відмов', 'заборон', 'тривог', 'помил', 'заблок'].some((word) => name.includes(word));
}

function escapeHtml(value: string) {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;');
}

export function ReportsPage() {
  const [kind, setKind] = useState<ReportKind>('access');
  const [hours, setHours] = useState(24);
  const [filters, setFilters] = useState<ReportFilters>(emptyFilters);
  const [draftKind, setDraftKind] = useState<ReportKind>('access');
  const [draftHours, setDraftHours] = useState(24);
  const [draftFilters, setDraftFilters] = useState<ReportFilters>(emptyFilters);
  const [reportModalOpen, setReportModalOpen] = useState(false);
  const [exportModalOpen, setExportModalOpen] = useState(false);
  const [exportFormat, setExportFormat] = useState<ReportExportFormat>('pdf');
  const personnelQuery = useQuery({ queryKey: ['personnel'], queryFn: getPersonnel, staleTime: 30_000 });
  const catalogQuery = useQuery({ queryKey: ['plan-catalog'], queryFn: getPlanCatalog, staleTime: 60_000 });
  const eventsQuery = useQuery({
    queryKey: ['reports-events', hours],
    queryFn: () => getEvents({ hours, limit: 10_000 }),
    refetchInterval: 60_000,
  });
  const rows = useMemo(() => toEventTableRows(eventsQuery.data), [eventsQuery.data]);
  const reportRows = useMemo(() => rows.filter((row) => {
    if (kind === 'security' && !isSecurityEvent(row.eventName)) return false;
    if (filters.employeeToken && row.employeeToken !== filters.employeeToken) return false;
    if (filters.department && row.department !== filters.department) return false;
    if (filters.accessPoint && row.accessPoint !== filters.accessPoint) return false;
    return true;
  }), [filters, kind, rows]);
  const activeReport = reportCards.find((item) => item.kind === kind)!;
  const personnel = personnelQuery.data?.personnel ?? [];
  const departments = personnelQuery.data?.departments ?? [];
  const accessPoints = useMemo(() => {
    const catalogItems = catalogQuery.data ? [...catalogQuery.data.doors, ...catalogQuery.data.inputs] : [];
    const names = new Set([...catalogItems.map((item) => item.name), ...rows.map((row) => row.accessPoint)]);
    return [...names].filter((item) => item && item !== '—').sort((left, right) => left.localeCompare(right, 'uk-UA'));
  }, [catalogQuery.data, rows]);
  const openReportModal = () => {
    setDraftKind(kind);
    setDraftHours(hours);
    setDraftFilters(filters);
    setReportModalOpen(true);
  };
  const generateReport = () => {
    setKind(draftKind);
    setHours(draftHours);
    setFilters(draftFilters);
    setReportModalOpen(false);
    setExportModalOpen(true);
  };

  const reportFileName = `${activeReport.title.toLocaleLowerCase('uk-UA').replaceAll(' ', '-')}-${new Date().toISOString().slice(0, 10)}`;
  const periodLabel = hours === 24 ? 'Останні 24 години' : hours === 72 ? 'Останні 3 дні' : 'Останні 7 днів';
  const createReportDocument = () => {
    const selectedFilters = [
      filters.employeeToken && `Працівник: ${personnel.find((person) => person.token === filters.employeeToken)?.name ?? filters.employeeToken}`,
      filters.department && `Відділ: ${filters.department}`,
      filters.accessPoint && `Місце: ${filters.accessPoint}`,
    ].filter(Boolean).join(' · ') || 'Без додаткових фільтрів';
    const tableRows = reportRows.map((row) => `<tr><td>${escapeHtml(row.occurredAt)}</td><td>${escapeHtml(row.employee)}</td><td>${escapeHtml(row.department)}</td><td>${escapeHtml(row.accessPoint)}</td><td>${escapeHtml(row.eventName)}</td><td>${escapeHtml(row.cardCode)}</td></tr>`).join('');
    return `<!doctype html><html lang="uk"><head><meta charset="utf-8"><title>${escapeHtml(activeReport.title)}</title><style>body{font-family:Arial,sans-serif;color:#17212b;margin:32px}h1{font-size:23px;margin:0 0 8px}p{margin:5px 0;color:#4b5b68;font-size:12px}.summary{margin:22px 0 16px;padding:12px;background:#edf6fa;border-left:4px solid #007db9}table{width:100%;border-collapse:collapse;font-size:10px}th{background:#09304b;color:#fff;text-align:left}th,td{padding:8px;border:1px solid #c9d5de;vertical-align:top}tr:nth-child(even){background:#f5f8fa}@media print{body{margin:12mm}thead{display:table-header-group}}</style></head><body><h1>${escapeHtml(activeReport.title)}</h1><p>Період: ${escapeHtml(periodLabel)}</p><p>Сформовано: ${new Date().toLocaleString('uk-UA')}</p><div class="summary"><b>Подій у вибірці: ${reportRows.length}</b><br>${escapeHtml(selectedFilters)}</div><table><thead><tr><th>Дата та час</th><th>Працівник</th><th>Відділ</th><th>Місце</th><th>Подія</th><th>Ідентифікатор</th></tr></thead><tbody>${tableRows}</tbody></table></body></html>`;
  };

  const downloadReport = () => {
    const documentContent = createReportDocument();
    if (exportFormat === 'word') {
      const url = URL.createObjectURL(new Blob([documentContent], { type: 'application/msword;charset=utf-8' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = `${reportFileName}.doc`;
      link.click();
      URL.revokeObjectURL(url);
    } else {
      const printWindow = window.open('', '_blank');
      if (!printWindow) return;
      printWindow.document.write(documentContent);
      printWindow.document.close();
      window.setTimeout(() => { printWindow.focus(); printWindow.print(); }, 250);
    }
    setExportModalOpen(false);
  };

  return <DashboardLayout>
    <main className="reports-page">
      <header className="page-header">
        <div>
          <p className="eyebrow">U‑PROX · АНАЛІТИКА</p>
          <h1>Звіти</h1>
          <span>Формуйте вибірки подій та завантажуйте їх у PDF або Word.</span>
        </div>
        <button className="report-generate" onClick={openReportModal} type="button">＋ Сформувати звіт</button>
      </header>
      <section aria-labelledby="reports-library-title" className="reports-library">
        <div className="reports-library-heading"><div><p className="eyebrow">ГОТОВІ ШАБЛОНИ</p><h2 id="reports-library-title">Доступні звіти</h2><span>Оберіть звіт, задайте параметри та завантажте його у потрібному форматі.</span></div></div>
        <div className="report-cards" aria-label="Тип звіту">
        {reportCards.map((item) => <button className={kind === item.kind ? 'report-card active' : 'report-card'} key={item.kind} onClick={() => { setKind(item.kind); setDraftKind(item.kind); setDraftHours(hours); setDraftFilters(filters); setReportModalOpen(true); }} type="button">
          <i>{item.icon}</i><span><b>{item.title}</b><small>{item.description}</small></span>
        </button>)}
        </div>
      </section>
      {reportModalOpen && <div className="report-modal-backdrop" onMouseDown={() => setReportModalOpen(false)} role="presentation">
        <section aria-label="Параметри звіту" className="report-modal" onMouseDown={(event) => event.stopPropagation()}>
          <header className="report-modal-header"><div><h2>Сформувати звіт</h2><p>Вкажіть, по кому, за який період і де шукати події.</p></div><button aria-label="Закрити" onClick={() => setReportModalOpen(false)} type="button">×</button></header>
          <div className="report-modal-fields">
            <label>Тип звіту<select onChange={(event) => setDraftKind(event.target.value as ReportKind)} value={draftKind}>{reportCards.map((item) => <option key={item.kind} value={item.kind}>{item.title}</option>)}</select></label>
            <label>Період<select onChange={(event) => setDraftHours(Number(event.target.value))} value={draftHours}><option value={24}>Останні 24 години</option><option value={72}>Останні 3 дні</option><option value={168}>Останні 7 днів</option></select></label>
            <label>Працівник<select onChange={(event) => setDraftFilters((current) => ({ ...current, employeeToken: event.target.value }))} value={draftFilters.employeeToken}><option value="">Усі працівники</option>{personnel.map((person) => <option key={person.token} value={person.token}>{person.name}</option>)}</select></label>
            <label>Відділ<select onChange={(event) => setDraftFilters((current) => ({ ...current, department: event.target.value }))} value={draftFilters.department}><option value="">Усі відділи</option>{departments.map((department) => <option key={department} value={department}>{department}</option>)}</select></label>
            <label className="wide">Точка доступу / місце<select onChange={(event) => setDraftFilters((current) => ({ ...current, accessPoint: event.target.value }))} value={draftFilters.accessPoint}><option value="">Усі точки доступу</option>{accessPoints.map((accessPoint) => <option key={accessPoint} value={accessPoint}>{accessPoint}</option>)}</select></label>
          </div>
          <footer className="report-modal-footer"><button className="report-modal-reset" onClick={() => setDraftFilters(emptyFilters)} type="button">Очистити фільтри</button><span /><button className="personnel-cancel" onClick={() => setReportModalOpen(false)} type="button">Скасувати</button><button className="report-export" onClick={generateReport} type="button">Сформувати</button></footer>
        </section>
      </div>}
      {exportModalOpen && <div className="report-modal-backdrop" onMouseDown={() => setExportModalOpen(false)} role="presentation">
        <section aria-label="Формат завантаження звіту" className="report-modal report-export-modal" onMouseDown={(event) => event.stopPropagation()}>
          <header className="report-modal-header"><div><h2>Завантажити звіт</h2><p>Оберіть формат для «{activeReport.title}».</p></div><button aria-label="Закрити" onClick={() => setExportModalOpen(false)} type="button">×</button></header>
          <div className="report-export-formats">
            <button className={exportFormat === 'pdf' ? 'report-format active' : 'report-format'} onClick={() => setExportFormat('pdf')} type="button"><b>PDF</b><span>Відкриє підготовлений звіт у вікні друку — там його можна зберегти як PDF.</span></button>
            <button className={exportFormat === 'word' ? 'report-format active' : 'report-format'} onClick={() => setExportFormat('word')} type="button"><b>Word</b><span>Завантажить редагований файл .doc із поточною вибіркою.</span></button>
          </div>
          <footer className="report-modal-footer"><span />{eventsQuery.isError && <small className="reports-error">Не вдалося завантажити дані U‑PROX.</small>}<button className="personnel-cancel" onClick={() => setExportModalOpen(false)} type="button">Скасувати</button><button className="report-export" disabled={eventsQuery.isFetching || eventsQuery.isError || !reportRows.length} onClick={downloadReport} type="button">{eventsQuery.isFetching ? 'Завантаження…' : exportFormat === 'pdf' ? 'Відкрити PDF' : 'Завантажити Word'}</button></footer>
        </section>
      </div>}
    </main>
  </DashboardLayout>;
}
