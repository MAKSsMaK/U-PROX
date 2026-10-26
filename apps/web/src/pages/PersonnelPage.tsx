import { useMemo, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createPersonnel,
  deletePersonnel,
  getPersonnel,
  updatePersonnel,
  type PersonnelInput,
  type PersonnelRecord,
} from '../api';
import { DashboardLayout } from '../layouts/DashboardLayout';
import { EventAvatar } from '../components/events/EventAvatar';

const blankForm: PersonnelInput = {
  name: '', department: '', position: '', identifier: '', active: true,
};

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase() || '—';
}

export function PersonnelPage() {
  const queryClient = useQueryClient();
  const directoryQuery = useQuery({ queryKey: ['personnel'], queryFn: getPersonnel, staleTime: 30_000 });
  const [department, setDepartment] = useState('');
  const [search, setSearch] = useState('');
  const [departmentSearch, setDepartmentSearch] = useState('');
  const [expandedDepartments, setExpandedDepartments] = useState<string[]>([]);
  const [editing, setEditing] = useState<PersonnelRecord>();
  const [isCreating, setIsCreating] = useState(false);
  const [form, setForm] = useState<PersonnelInput>(blankForm);
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['personnel'] });
  const saveMutation = useMutation({
    mutationFn: async () => editing ? updatePersonnel(editing.token, form) : createPersonnel(form),
    onSuccess: () => { void refresh(); closeModal(); },
  });
  const deleteMutation = useMutation({
    mutationFn: deletePersonnel,
    onSuccess: () => { void refresh(); closeModal(); },
  });
  const personnel = directoryQuery.data?.personnel ?? [];
  const departments = directoryQuery.data?.departments ?? [];
  const visibleDepartments = useMemo(() => {
    const normalized = departmentSearch.trim().toLocaleLowerCase('uk-UA');
    return departments.filter((item) => !normalized || item.toLocaleLowerCase('uk-UA').includes(normalized));
  }, [departmentSearch, departments]);
  const visiblePersonnel = useMemo(() => {
    const normalized = search.trim().toLocaleLowerCase('uk-UA');
    return personnel.filter((person) => {
      const matchesDepartment = !department || person.department === department;
      const haystack = `${person.name} ${person.department} ${person.position} ${person.identifier}`.toLocaleLowerCase('uk-UA');
      return matchesDepartment && (!normalized || haystack.includes(normalized));
    });
  }, [department, personnel, search]);
  const closeModal = () => { setEditing(undefined); setIsCreating(false); setForm(blankForm); };
  const toggleDepartment = (item: string) => setExpandedDepartments((current) => current.includes(item) ? current.filter((value) => value !== item) : [...current, item]);
  const openCreate = () => { setEditing(undefined); setForm({ ...blankForm, department: department || departments[0] || '' }); setIsCreating(true); };
  const openEdit = (person: PersonnelRecord) => { setEditing(person); setForm({ name: person.name, department: person.department, position: person.position, identifier: person.identifier, active: person.active }); setIsCreating(false); };
  const submit = (event: FormEvent) => { event.preventDefault(); saveMutation.mutate(); };
  const modalOpen = isCreating || Boolean(editing);

  return (
    <DashboardLayout>
      <main className="personnel-page">
        <header className="personnel-header">
          <div>
            <p className="eyebrow">U‑PROX · КЕРУВАННЯ ДОСТУПОМ</p>
            <h1>Персонал</h1>
            <span>Керуйте співробітниками, відділами та ідентифікаторами в одному місці.</span>
          </div>
          <button className="personnel-primary" onClick={openCreate} type="button">＋ Додати працівника</button>
        </header>
        <div className="personnel-workspace">
          <aside className="department-panel" aria-label="Структура відділів">
            <div className="department-heading"><div><b>Структура відділів</b><span>{personnel.length} працівників</span></div></div>
            <label className="department-search"><span>⌕</span><input onChange={(event) => setDepartmentSearch(event.target.value)} placeholder="Пошук відділу" value={departmentSearch} /></label>
            <button className={!department ? 'department-row active' : 'department-row'} onClick={() => setDepartment('')} type="button"><span>◉ Усі співробітники</span><b>{personnel.length}</b></button>
            {visibleDepartments.map((item) => {
              const count = personnel.filter((person) => person.department === item).length;
              const isExpanded = expandedDepartments.includes(item);
              const members = personnel.filter((person) => person.department === item);
              return <div className="department-item" key={item}>
                <button className={department === item ? 'department-row active' : 'department-row'} onClick={() => { setDepartment(item); toggleDepartment(item); }} type="button"><span><i>{isExpanded ? '⌄' : '›'}</i>{item}</span><b>{count}</b></button>
                {isExpanded && <div className="department-members">{members.map((person) => <button key={person.token} onClick={() => openEdit(person)} title={person.name} type="button"><EventAvatar name={person.name} photoToken={person.photoToken} /><span>{person.name}</span></button>)}</div>}
              </div>;
            })}
            {!departments.length && <p className="department-empty">Після першого додавання тут з’являться відділи.</p>}
            {!!departments.length && !visibleDepartments.length && <p className="department-empty">Відділ не знайдено.</p>}
          </aside>
          <section className="personnel-list-panel">
            <div className="personnel-toolbar">
              <label className="personnel-search"><span>⌕</span><input onChange={(event) => setSearch(event.target.value)} placeholder="Пошук працівника: ПІБ або ідентифікатор" value={search} /></label>
            </div>
            {directoryQuery.isError ? <div className="personnel-error">Не вдалося отримати список персоналу: {directoryQuery.error.message}</div> : (
              <div className="personnel-table-wrap">
                <table className="personnel-table">
                  <thead><tr><th>Працівник</th><th>Відділ</th><th>Посада</th><th>Ідентифікатор</th><th>Статус</th><th aria-label="Дії" /></tr></thead>
                  <tbody>{visiblePersonnel.map((person) => <tr key={person.token} onDoubleClick={() => openEdit(person)}>
                    <td><div className="person-cell"><EventAvatar name={person.name} photoToken={person.photoToken} /><strong>{person.name}</strong></div></td>
                    <td>{person.department}</td><td>{person.position || '—'}</td><td className="personnel-identifier">{person.identifier || '—'}</td>
                    <td><button className={`personnel-status ${person.active ? 'active' : ''}`} onClick={() => openEdit(person)} type="button">● {person.active ? 'Активний' : 'Неактивний'}</button></td>
                    <td><button aria-label={`Редагувати ${person.name}`} className="personnel-edit" onClick={() => openEdit(person)} type="button">⋮</button></td>
                  </tr>)}
                  {!directoryQuery.isLoading && !visiblePersonnel.length && <tr><td className="personnel-empty" colSpan={6}>Нічого не знайдено.</td></tr>}
                  {directoryQuery.isLoading && <tr><td className="personnel-empty" colSpan={6}>Завантажуємо персонал…</td></tr>}
                  </tbody>
                </table>
              </div>
            )}
            <footer className="personnel-footer">Показано {visiblePersonnel.length} з {personnel.length} працівників</footer>
          </section>
        </div>
        {modalOpen && <div className="personnel-modal-backdrop" onMouseDown={closeModal} role="presentation"><section aria-label={editing ? 'Редагувати працівника' : 'Новий працівник'} className="personnel-modal" onMouseDown={(event) => event.stopPropagation()}>
          <div className="personnel-modal-header"><h2>{editing ? 'Редагувати працівника' : 'Новий працівник'}</h2><button aria-label="Закрити" onClick={closeModal} type="button">×</button></div>
          <form onSubmit={submit}>
            <div className="personnel-form-grid">
              <label className="personnel-photo"><i>{initials(form.name)}</i><span>Фото працівника можна буде підключити з U‑PROX.</span></label>
              <div className="personnel-fields">
                <label className="wide">ПІБ<input autoFocus onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} placeholder="Наприклад: Петренко Іван Петрович" required value={form.name} /></label>
                <label>Відділ<input list="personnel-departments" onChange={(event) => setForm((current) => ({ ...current, department: event.target.value }))} placeholder="Оберіть або введіть відділ" required value={form.department} /><datalist id="personnel-departments">{departments.map((item) => <option key={item} value={item} />)}</datalist></label>
                <label>Посада<input onChange={(event) => setForm((current) => ({ ...current, position: event.target.value }))} placeholder="Посада" value={form.position} /></label>
                <label className="wide">Ідентифікатор / картка<input onChange={(event) => setForm((current) => ({ ...current, identifier: event.target.value }))} placeholder="Номер картки або брелока" value={form.identifier} /></label>
                <label className="personnel-toggle"><input checked={form.active} onChange={(event) => setForm((current) => ({ ...current, active: event.target.checked }))} type="checkbox" /><span><b>Активний працівник</b><small>Неактивний працівник не матиме доступу.</small></span></label>
              </div>
            </div>
            {saveMutation.isError && <p className="personnel-form-error">Не вдалося зберегти: {saveMutation.error.message}</p>}
            <footer className="personnel-modal-footer">
              {editing && <button className="personnel-delete" disabled={deleteMutation.isPending} onClick={() => window.confirm(`Видалити «${editing.name}» зі списку?`) && deleteMutation.mutate(editing.token)} type="button">Видалити</button>}
              <span />
              <button className="personnel-cancel" onClick={closeModal} type="button">Скасувати</button>
              <button className="personnel-primary" disabled={saveMutation.isPending} type="submit">{saveMutation.isPending ? 'Зберігаємо…' : 'Зберегти працівника'}</button>
            </footer>
          </form>
        </section></div>}
      </main>
    </DashboardLayout>
  );
}
