import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { downloadServerReport, getPersonnel, getPlanCatalog, type PersonnelRecord } from '../api';
import { DashboardLayout } from '../layouts/DashboardLayout';

type ReportKind = 'access' | 'security' | 'worktime';
type ReportExportFormat = 'pdf' | 'word';
type ReportFilters = { employeeTokens: string[]; departments: string[]; accessPoint: string };
type ReportDateRange = { from: string; to: string };
const emptyFilters: ReportFilters = { employeeTokens: [], departments: [], accessPoint: '' };

const reportCards: Array<{ kind: ReportKind; icon: string; title: string; description: string }> = [
  { kind: 'access', icon: '◷', title: 'Журнал проходів', description: 'Входи, виходи, дозволи та відмови за вибраний період.' },
  { kind: 'security', icon: '!', title: 'Безпекові події', description: 'Відмови, тривоги та події, що потребують уваги.' },
  { kind: 'worktime', icon: '◴', title: 'Робочий час', description: 'Підсумок присутності на основі подій доступу.' },
];

function dateTimeInputValue(date: Date) {
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function rangeForHours(hours: number): ReportDateRange {
  const to = new Date();
  return { from: dateTimeInputValue(new Date(to.getTime() - hours * 60 * 60_000)), to: dateTimeInputValue(to) };
}

type CompactOption = { value: string; label: string };

function CompactSelect({ ariaLabel, value, options, onChange }: { ariaLabel: string; value: string; options: CompactOption[]; onChange: (value: string) => void }) {
  const reference = useRef<HTMLDetailsElement>(null);
  const selected = options.find((option) => option.value === value) ?? options[0];
  useEffect(() => {
    const close = (event: PointerEvent) => {
      if (!reference.current?.contains(event.target as Node)) reference.current?.removeAttribute('open');
    };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, []);
  return <details className="compact-select" ref={reference}>
    <summary aria-label={ariaLabel}><span title={selected?.label}>{selected?.label}</span></summary>
    <div className="compact-select-menu" role="listbox">
      {options.map((option) => <button aria-selected={option.value === value} className={option.value === value ? 'selected' : ''} key={option.value || '__empty'} onClick={(event) => { onChange(option.value); event.currentTarget.closest('details')?.removeAttribute('open'); }} role="option" type="button" title={option.label}>{option.label}</button>)}
    </div>
  </details>;
}

function DepartmentMultiSelect({ departments, selectedDepartments, onChange }: { departments: string[]; selectedDepartments: string[]; onChange: (departments: string[]) => void }) {
  const reference = useRef<HTMLDetailsElement>(null);
  const [query, setQuery] = useState('');
  const visibleDepartments = departments.filter((department) => !query.trim() || department.toLocaleLowerCase('uk-UA').includes(query.trim().toLocaleLowerCase('uk-UA')));
  const label = selectedDepartments.length === 0 ? 'Усі відділи' : selectedDepartments.length === 1 ? selectedDepartments[0] : `Обрано відділів: ${selectedDepartments.length}`;
  useEffect(() => {
    const close = (event: PointerEvent) => {
      if (!reference.current?.contains(event.target as Node)) reference.current?.removeAttribute('open');
    };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, []);
  return <details className="personnel-multiselect department-multiselect" ref={reference}>
    <summary aria-label="Відділи"><span title={label}>{label}</span>{selectedDepartments.length > 0 && <b>{selectedDepartments.length}</b>}</summary>
    <div className="personnel-multiselect-menu">
      <input aria-label="Пошук відділу" autoComplete="off" onChange={(event) => setQuery(event.target.value)} placeholder="Пошук за назвою відділу" type="search" value={query} />
      <div className="personnel-multiselect-meta"><span>{selectedDepartments.length ? `Обрано: ${selectedDepartments.length}` : 'Не обрано — будуть усі'}</span>{selectedDepartments.length > 0 && <button onClick={() => onChange([])} type="button">Очистити</button>}</div>
      <div className="personnel-multiselect-options" role="listbox" aria-multiselectable="true">
        {visibleDepartments.map((department) => {
          const selected = selectedDepartments.includes(department);
          return <button aria-selected={selected} className={selected ? 'selected' : ''} key={department} onClick={() => onChange(selected ? selectedDepartments.filter((item) => item !== department) : [...selectedDepartments, department])} role="option" type="button"><i>{selected ? '✓' : ''}</i><span><b>{department}</b></span></button>;
        })}
        {visibleDepartments.length === 0 && <p>Відділів за цим запитом не знайдено.</p>}
      </div>
    </div>
  </details>;
}

function PersonnelMultiSelect({ departments, personnel, selectedTokens, onChange }: { departments: string[]; personnel: PersonnelRecord[]; selectedTokens: string[]; onChange: (tokens: string[]) => void }) {
  const reference = useRef<HTMLDetailsElement>(null);
  const [query, setQuery] = useState('');
  const visiblePersonnel = useMemo(() => {
    const term = query.trim().toLocaleLowerCase('uk-UA');
    return personnel.filter((person) => (departments.length === 0 || departments.includes(person.department)) && (!term || `${person.name} ${person.position} ${person.identifier}`.toLocaleLowerCase('uk-UA').includes(term)));
  }, [departments, personnel, query]);
  const selectedPeople = personnel.filter((person) => selectedTokens.includes(person.token));
  const label = selectedPeople.length === 0 ? (departments.length ? 'Усі працівники відділів' : 'Усі працівники') : selectedPeople.length === 1 ? selectedPeople[0].name : `Обрано працівників: ${selectedPeople.length}`;
  useEffect(() => {
    const close = (event: PointerEvent) => {
      if (!reference.current?.contains(event.target as Node)) reference.current?.removeAttribute('open');
    };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, []);
  return <details className="personnel-multiselect" ref={reference}>
    <summary aria-label="Працівники"><span title={label}>{label}</span>{selectedPeople.length > 0 && <b>{selectedPeople.length}</b>}</summary>
    <div className="personnel-multiselect-menu">
      <input aria-label="Пошук працівника" autoComplete="off" onChange={(event) => setQuery(event.target.value)} placeholder="Пошук за ПІБ або ідентифікатором" type="search" value={query} />
      <div className="personnel-multiselect-meta"><span>{selectedPeople.length ? `Обрано: ${selectedPeople.length}` : 'Не обрано — будуть усі'}</span>{selectedPeople.length > 0 && <button onClick={() => onChange([])} type="button">Очистити</button>}</div>
      <div className="personnel-multiselect-options" role="listbox" aria-multiselectable="true">
        {visiblePersonnel.map((person) => {
          const selected = selectedTokens.includes(person.token);
          return <button aria-selected={selected} className={selected ? 'selected' : ''} key={person.token} onClick={() => onChange(selected ? selectedTokens.filter((token) => token !== person.token) : [...selectedTokens, person.token])} role="option" type="button"><i>{selected ? '✓' : ''}</i><span><b>{person.name}</b><small>{person.department}{person.position ? ` · ${person.position}` : ''}</small></span></button>;
        })}
        {visiblePersonnel.length === 0 && <p>Працівників за цим запитом не знайдено.</p>}
      </div>
    </div>
  </details>;
}

const monthNames = ['січень', 'лютий', 'березень', 'квітень', 'травень', 'червень', 'липень', 'серпень', 'вересень', 'жовтень', 'листопад', 'грудень'];
const weekdayNames = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Нд'];

function dateFromInput(value: string) {
  const [datePart, timePart = '00:00'] = value.split('T');
  const [year, month, day] = datePart.split('-').map(Number);
  const [hours, minutes] = timePart.split(':').map(Number);
  return new Date(year, month - 1, day, hours, minutes);
}

function DateTimePicker({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  const reference = useRef<HTMLDivElement>(null);
  const selectedDate = dateFromInput(value);
  const [open, setOpen] = useState(false);
  const [viewDate, setViewDate] = useState(() => new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1));
  const firstWeekday = (viewDate.getDay() + 6) % 7;
  const daysInMonth = new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 0).getDate();
  const timeValue = value.slice(11, 16);
  const chooseDate = (day: number) => {
    const next = new Date(selectedDate);
    next.setFullYear(viewDate.getFullYear(), viewDate.getMonth(), day);
    onChange(dateTimeInputValue(next));
    setOpen(false);
  };
  const changeTime = (time: string) => {
    if (!/^\d{2}:\d{2}$/.test(time)) return;
    const next = new Date(selectedDate);
    const [hours, minutes] = time.split(':').map(Number);
    next.setHours(hours, minutes, 0, 0);
    onChange(dateTimeInputValue(next));
  };
  return <div className="report-date-field" onBlur={(event) => {
    if (!reference.current?.contains(event.relatedTarget as Node)) setOpen(false);
  }} ref={reference}>
    <span>{label}</span>
    <div className="report-date-controls">
      <button aria-expanded={open} className="report-date-trigger" onClick={() => { setViewDate(new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1)); setOpen((current) => !current); }} type="button"><span>{selectedDate.toLocaleDateString('uk-UA', { day: '2-digit', month: 'short', year: 'numeric' })}</span><b>▣</b></button>
      <input aria-label={`${label}: час`} className="report-time-input" onChange={(event) => changeTime(event.target.value)} type="time" value={timeValue} />
    </div>
    {open && <div className="report-calendar" role="dialog" aria-label={`${label}: календар`}>
      <div className="report-calendar-header"><button aria-label="Попередній місяць" onClick={() => setViewDate((current) => new Date(current.getFullYear(), current.getMonth() - 1, 1))} type="button">‹</button><b>{monthNames[viewDate.getMonth()]} {viewDate.getFullYear()}</b><button aria-label="Наступний місяць" onClick={() => setViewDate((current) => new Date(current.getFullYear(), current.getMonth() + 1, 1))} type="button">›</button></div>
      <div className="report-calendar-weekdays">{weekdayNames.map((day) => <span key={day}>{day}</span>)}</div>
      <div className="report-calendar-days">{Array.from({ length: firstWeekday }, (_, index) => <span key={`empty-${index}`} />)}{Array.from({ length: daysInMonth }, (_, index) => {
        const day = index + 1;
        const isSelected = selectedDate.getFullYear() === viewDate.getFullYear() && selectedDate.getMonth() === viewDate.getMonth() && selectedDate.getDate() === day;
        const today = new Date();
        const isToday = today.getFullYear() === viewDate.getFullYear() && today.getMonth() === viewDate.getMonth() && today.getDate() === day;
        return <button className={`${isSelected ? 'selected' : ''} ${isToday ? 'today' : ''}`} key={day} onClick={() => chooseDate(day)} type="button">{day}</button>;
      })}</div>
      <button className="report-calendar-today" onClick={() => { const today = new Date(); const next = new Date(selectedDate); next.setFullYear(today.getFullYear(), today.getMonth(), today.getDate()); onChange(dateTimeInputValue(next)); setViewDate(new Date(today.getFullYear(), today.getMonth(), 1)); setOpen(false); }} type="button">Сьогодні</button>
    </div>}
  </div>;
}

export function ReportsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [kind, setKind] = useState<ReportKind>('access');
  const [range, setRange] = useState<ReportDateRange>(() => rangeForHours(24));
  const [filters, setFilters] = useState<ReportFilters>(emptyFilters);
  const [draftKind, setDraftKind] = useState<ReportKind>('access');
  const [draftRange, setDraftRange] = useState<ReportDateRange>(() => rangeForHours(24));
  const [draftFilters, setDraftFilters] = useState<ReportFilters>(emptyFilters);
  const [reportModalOpen, setReportModalOpen] = useState(false);
  const [exportModalOpen, setExportModalOpen] = useState(false);
  const [exportFormat, setExportFormat] = useState<ReportExportFormat>('pdf');
  const [isExporting, setIsExporting] = useState(false);
  const [exportError, setExportError] = useState('');
  const [quickPeriod, setQuickPeriod] = useState('');
  const personnelQuery = useQuery({ queryKey: ['personnel'], queryFn: getPersonnel, staleTime: 30_000, enabled: reportModalOpen || exportModalOpen });
  const catalogQuery = useQuery({ queryKey: ['plan-catalog'], queryFn: getPlanCatalog, staleTime: 60_000, enabled: reportModalOpen });
  const activeReport = reportCards.find((item) => item.kind === kind)!;
  const personnel = personnelQuery.data?.personnel ?? [];
  const departments = personnelQuery.data?.departments ?? [];
  const invalidDraftRange = !draftRange.from || !draftRange.to || new Date(draftRange.from).getTime() > new Date(draftRange.to).getTime();
  const accessPoints = useMemo(() => {
    const catalogItems = catalogQuery.data ? [...catalogQuery.data.doors, ...catalogQuery.data.devices, ...catalogQuery.data.inputs] : [];
    const names = new Set(catalogItems.map((item) => item.name));
    if (draftFilters.accessPoint) names.add(draftFilters.accessPoint);
    return [...names].filter((item) => item && item !== '—').sort((left, right) => left.localeCompare(right, 'uk-UA'));
  }, [catalogQuery.data, draftFilters.accessPoint]);
  const openReportModal = () => {
    setDraftKind(kind);
    setDraftRange(range);
    setDraftFilters(filters);
    setQuickPeriod('');
    setReportModalOpen(true);
  };
  const generateReport = () => {
    setKind(draftKind);
    setRange(draftRange);
    setFilters(draftFilters);
    setReportModalOpen(false);
    setExportModalOpen(true);
  };

  useEffect(() => {
    if (searchParams.get('create') !== '1') return;
    const accessPoint = searchParams.get('accessPoint') ?? '';
    const nextFilters = { ...emptyFilters, accessPoint };
    setDraftKind('access');
    setDraftRange(rangeForHours(24));
    setDraftFilters(nextFilters);
    setQuickPeriod('');
    setExportError('');
    setReportModalOpen(true);
    setSearchParams({}, { replace: true });
  }, [searchParams, setSearchParams]);

  const downloadReport = async () => {
    setIsExporting(true);
    setExportError('');
    try {
      const { blob, fileName } = await downloadServerReport({
        format: exportFormat,
        kind,
        from: new Date(range.from).getTime(),
        to: new Date(range.to).getTime(),
        employeeTokens: filters.employeeTokens,
        departments: filters.departments,
        accessPoint: filters.accessPoint,
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = fileName;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
      setExportModalOpen(false);
    } catch {
      setExportError('Не вдалося сформувати звіт на сервері. Спробуйте ще раз.');
    } finally {
      setIsExporting(false);
    }
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
        {reportCards.map((item) => <button className={kind === item.kind ? 'report-card active' : 'report-card'} key={item.kind} onClick={() => { setKind(item.kind); setDraftKind(item.kind); setDraftRange(range); setDraftFilters(filters); setQuickPeriod(''); setReportModalOpen(true); }} type="button">
          <i>{item.icon}</i><span><b>{item.title}</b><small>{item.description}</small></span>
        </button>)}
        </div>
      </section>
      {reportModalOpen && <div className="report-modal-backdrop" onMouseDown={() => setReportModalOpen(false)} role="presentation">
        <section aria-label="Параметри звіту" className="report-modal" onMouseDown={(event) => event.stopPropagation()}>
          <header className="report-modal-header"><div><h2>Сформувати звіт</h2><p>Вкажіть, по кому, за який період і де шукати події.</p></div><button aria-label="Закрити" onClick={() => setReportModalOpen(false)} type="button">×</button></header>
          <div className="report-modal-fields">
            <label>Тип звіту<CompactSelect ariaLabel="Тип звіту" onChange={(value) => setDraftKind(value as ReportKind)} options={reportCards.map((item) => ({ value: item.kind, label: item.title }))} value={draftKind} /></label>
            <label>Швидкий період<CompactSelect ariaLabel="Швидкий період" onChange={(value) => { setQuickPeriod(value); if (value) setDraftRange(rangeForHours(Number(value))); }} options={[{ value: '', label: 'Власний діапазон' }, { value: '24', label: 'Останні 24 години' }, { value: '72', label: 'Останні 3 дні' }, { value: '168', label: 'Останні 7 днів' }]} value={quickPeriod} /></label>
            <DateTimePicker label="Від" onChange={(value) => { setQuickPeriod(''); setDraftRange((current) => ({ ...current, from: value })); }} value={draftRange.from} />
            <DateTimePicker label="До" onChange={(value) => { setQuickPeriod(''); setDraftRange((current) => ({ ...current, to: value })); }} value={draftRange.to} />
            <label className="wide">Відділи<DepartmentMultiSelect departments={departments} onChange={(departments) => setDraftFilters((current) => ({ ...current, departments, employeeTokens: current.employeeTokens.filter((token) => departments.length === 0 || departments.includes(personnel.find((person) => person.token === token)?.department ?? '')) }))} selectedDepartments={draftFilters.departments} /></label>
            <label className="wide">Працівники<PersonnelMultiSelect departments={draftFilters.departments} onChange={(employeeTokens) => setDraftFilters((current) => ({ ...current, employeeTokens }))} personnel={personnel} selectedTokens={draftFilters.employeeTokens} /></label>
            <label className="wide">Точка доступу / місце<CompactSelect ariaLabel="Точка доступу / місце" onChange={(value) => setDraftFilters((current) => ({ ...current, accessPoint: value }))} options={[{ value: '', label: 'Усі точки доступу' }, ...accessPoints.map((accessPoint) => ({ value: accessPoint, label: accessPoint }))]} value={draftFilters.accessPoint} /></label>
          </div>
          <footer className="report-modal-footer"><button className="report-modal-reset" onClick={() => setDraftFilters(emptyFilters)} type="button">Очистити фільтри</button><span />{invalidDraftRange && <small className="report-range-error">Перевірте дату й час діапазону.</small>}<button className="personnel-cancel" onClick={() => setReportModalOpen(false)} type="button">Скасувати</button><button className="report-export" disabled={invalidDraftRange} onClick={generateReport} type="button">Сформувати</button></footer>
        </section>
      </div>}
      {exportModalOpen && <div className="report-modal-backdrop" onMouseDown={() => { if (!isExporting) setExportModalOpen(false); }} role="presentation">
        <section aria-label="Формат завантаження звіту" className="report-modal report-export-modal" onMouseDown={(event) => event.stopPropagation()}>
          <header className="report-modal-header"><div><h2>Завантажити звіт</h2><p>Оберіть формат для «{activeReport.title}».</p></div><button aria-label="Закрити" disabled={isExporting} onClick={() => setExportModalOpen(false)} type="button">×</button></header>
          <div className="report-export-formats">
            <button className={exportFormat === 'pdf' ? 'report-format active' : 'report-format'} onClick={() => setExportFormat('pdf')} type="button"><b>PDF</b><span>Сервер сформує та завантажить готовий PDF-звіт.</span></button>
            <button className={exportFormat === 'word' ? 'report-format active' : 'report-format'} onClick={() => setExportFormat('word')} type="button"><b>Word</b><span>Сервер сформує редагований файл Word із поточною вибіркою.</span></button>
          </div>
          <footer className="report-modal-footer"><span />{exportError && <small className="reports-error">{exportError}</small>}<button className="personnel-cancel" disabled={isExporting} onClick={() => setExportModalOpen(false)} type="button">Скасувати</button><button className="report-export" disabled={isExporting} onClick={downloadReport} type="button">{isExporting ? 'Формування на сервері…' : exportFormat === 'pdf' ? 'Завантажити PDF' : 'Завантажити Word'}</button></footer>
        </section>
      </div>}
    </main>
  </DashboardLayout>;
}
