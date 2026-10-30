import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getEvents, getPersonnel, getPlanCatalog } from '../api';
import { DataTable } from '../components/tables/DataTable';
import { eventTableColumns, toEventTableRows } from '../features/events/eventTable';
import { DashboardLayout } from '../layouts/DashboardLayout';

type EventFilters = { search: string; department: string; accessPoint: string };
const emptyFilters: EventFilters = { search: '', department: '', accessPoint: '' };
const pageSize = 100;

function inputDateTimeValue(date: Date) {
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function rangeForHours(hours: number) {
  const to = new Date();
  return { from: inputDateTimeValue(new Date(to.getTime() - hours * 60 * 60_000)), to: inputDateTimeValue(to) };
}

export function EventsPage() {
  const [eventMode, setEventMode] = useState<'normal' | 'security'>('normal');
  const [hours, setHours] = useState(24);
  const [range, setRange] = useState(() => rangeForHours(24));
  const [draftFilters, setDraftFilters] = useState<EventFilters>(emptyFilters);
  const [filters, setFilters] = useState<EventFilters>(emptyFilters);
  const [offset, setOffset] = useState(0);
  const personnelQuery = useQuery({ queryKey: ['personnel'], queryFn: getPersonnel, staleTime: 30_000 });
  const catalogQuery = useQuery({ queryKey: ['plan-catalog'], queryFn: getPlanCatalog, staleTime: 60_000 });
  const eventsQuery = useQuery({
    queryKey: ['events', hours, range, filters, eventMode, offset],
    queryFn: () => getEvents({
      hours,
      limit: pageSize,
      offset,
      ...(hours === 0 ? { from: new Date(range.from).getTime(), to: new Date(range.to).getTime() } : {}),
      ...filters,
      eventMode,
    }),
    refetchInterval: offset === 0 && hours === 24 && !filters.search && !filters.department && !filters.accessPoint ? 5_000 : 60_000,
  });
  const rows = toEventTableRows(eventsQuery.data);
  const departments = personnelQuery.data?.departments ?? [];
  const accessPoints = useMemo(() => {
    const catalog = catalogQuery.data;
    if (!catalog) return filters.accessPoint ? [filters.accessPoint] : [];
    const names = new Set([...catalog.doors, ...catalog.devices, ...catalog.inputs].map((item) => item.name));
    if (filters.accessPoint) names.add(filters.accessPoint);
    return [...names].filter((name) => name && name !== '—').sort((left, right) => left.localeCompare(right, 'uk-UA'));
  }, [catalogQuery.data, filters.accessPoint]);
  const periodLabel = hours === 24 ? 'останні 24 години' : hours === 72 ? 'останні 3 дні' : hours === 168 ? 'останні 7 днів' : 'власний діапазон';
  const choosePeriod = (value: number) => {
    setHours(value);
    if (value) setRange(rangeForHours(value));
    setOffset(0);
  };
  const changeMode = (nextMode: 'normal' | 'security') => { setEventMode(nextMode); setOffset(0); };
  const applyFilters = () => { setFilters(draftFilters); setOffset(0); };
  const resetFilters = () => { setDraftFilters(emptyFilters); setFilters(emptyFilters); setOffset(0); };

  return (
    <DashboardLayout>
      <main className="events-page">
        <header className="page-header">
          <div>
            <p className="eyebrow">U‑PROX · ЖИВІ ДАНІ</p>
            <h1>Події</h1>
            <span>Події за {periodLabel} · {hours === 24 ? 'оновлюється кожні 5 секунд' : 'оновлюється щохвилини'}</span>
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
              <label className="events-period">Період<select onChange={(event) => choosePeriod(Number(event.target.value))} value={hours}><option value={24}>24 години</option><option value={72}>3 дні</option><option value={168}>7 днів</option><option value={0}>Власний діапазон</option></select></label>
              <div aria-label="Тип подій" className="event-mode-toggle">
                <button aria-pressed={eventMode === 'normal'} className={eventMode === 'normal' ? 'active' : ''} onClick={() => changeMode('normal')} type="button">Звичайні</button>
                <button aria-pressed={eventMode === 'security'} className={eventMode === 'security' ? 'active' : ''} onClick={() => changeMode('security')} type="button">Безпекові</button>
              </div>
              <button onClick={() => eventsQuery.refetch()} type="button">Оновити</button>
            </div>
          </div>
          <form className="events-filters" onSubmit={(event) => { event.preventDefault(); applyFilters(); }}>
            {hours === 0 && <><label>Від<input onChange={(event) => setRange((current) => ({ ...current, from: event.target.value }))} type="datetime-local" value={range.from} /></label><label>До<input onChange={(event) => setRange((current) => ({ ...current, to: event.target.value }))} type="datetime-local" value={range.to} /></label></>}
            <label className="events-filter-search">Пошук<input onChange={(event) => setDraftFilters((current) => ({ ...current, search: event.target.value }))} placeholder="ПІБ, картка або подія" type="search" value={draftFilters.search} /></label>
            <label>Відділ<select onChange={(event) => setDraftFilters((current) => ({ ...current, department: event.target.value }))} value={draftFilters.department}><option value="">Усі відділи</option>{departments.map((department) => <option key={department} value={department}>{department}</option>)}</select></label>
            <label>Точка доступу<select onChange={(event) => setDraftFilters((current) => ({ ...current, accessPoint: event.target.value }))} value={draftFilters.accessPoint}><option value="">Усі точки</option>{accessPoints.map((accessPoint) => <option key={accessPoint} value={accessPoint}>{accessPoint}</option>)}</select></label>
            <button type="submit">Застосувати</button><button className="events-filter-reset" onClick={resetFilters} type="button">Скинути</button>
          </form>
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
              rows={rows}
            />
          )}
          <footer className="events-pagination"><span>Події від {offset + 1}{eventsQuery.isFetching ? ' · оновлення…' : ''}</span><div><button disabled={offset === 0 || eventsQuery.isFetching} onClick={() => setOffset((current) => Math.max(0, current - pageSize))} type="button">← Новіші</button><button disabled={!eventsQuery.data?.hasMore || eventsQuery.isFetching} onClick={() => setOffset(eventsQuery.data?.nextOffset ?? offset)} type="button">Старіші →</button></div></footer>
        </section>
      </main>
    </DashboardLayout>
  );
}
