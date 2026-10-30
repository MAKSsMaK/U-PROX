import { useMemo, useState, type ChangeEvent, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createPersonnel,
  deletePersonnel,
  getPersonnel,
  getPersonnelPresence,
  updatePersonnel,
  type PersonnelInput,
  type PersonnelIdentifier,
  type PersonnelRecord,
} from '../api';
import { DashboardLayout } from '../layouts/DashboardLayout';
import { EventAvatar } from '../components/events/EventAvatar';

const blankForm: PersonnelInput = {
  name: '', department: '', position: '', identifier: '', photoData: null,
  employeeNumber: '', email: '', accessLevel: 'inherit', identifiers: [], active: true,
};

const identifierLabels: Record<PersonnelIdentifier['type'], string> = {
  card: 'Картка', key_fob: 'Брелок', bracelet: 'Браслет', face: 'Обличчя', fingerprint: 'Відбиток пальця',
};
const biometricTypes = new Set<PersonnelIdentifier['type']>(['face', 'fingerprint']);
type PresenceFilter = 'all' | 'present' | 'away' | 'unknown';

function presenceLabel(state: PresenceFilter) {
  if (state === 'present') return 'У суді';
  if (state === 'away') return 'Поза судом';
  return 'Немає даних';
}

function createIdentifier(type: PersonnelIdentifier['type'] = 'card'): PersonnelIdentifier {
  return { id: `identifier-${crypto.randomUUID?.() ?? `${Date.now()}-${Math.random()}`}`, type, value: '', validUntil: 'always' };
}

export function PersonnelPage() {
  const queryClient = useQueryClient();
  const directoryQuery = useQuery({ queryKey: ['personnel'], queryFn: getPersonnel, staleTime: 30_000 });
  const presenceQuery = useQuery({
    queryKey: ['personnel-presence'],
    queryFn: getPersonnelPresence,
    enabled: Boolean(directoryQuery.data?.personnel.length),
    staleTime: 10_000,
    refetchInterval: 10_000,
  });
  const [department, setDepartment] = useState('');
  const [search, setSearch] = useState('');
  const [departmentSearch, setDepartmentSearch] = useState('');
  const [presenceFilter, setPresenceFilter] = useState<PresenceFilter>('all');
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
  const presence = presenceQuery.data?.presence ?? {};
  const statusFor = (person: PersonnelRecord): PresenceFilter => presence[person.token]?.state ?? 'unknown';
  const presenceCounts = useMemo(() => personnel.reduce<Record<PresenceFilter, number>>((counts, person) => {
    counts[statusFor(person)] += 1;
    counts.all += 1;
    return counts;
  }, { all: 0, present: 0, away: 0, unknown: 0 }), [personnel, presence]);
  const visibleDepartments = useMemo(() => {
    const normalized = departmentSearch.trim().toLocaleLowerCase('uk-UA');
    return departments.filter((item) => !normalized || item.toLocaleLowerCase('uk-UA').includes(normalized));
  }, [departmentSearch, departments]);
  const visiblePersonnel = useMemo(() => {
    const normalized = search.trim().toLocaleLowerCase('uk-UA');
    return personnel.filter((person) => {
      const matchesDepartment = !department || person.department === department;
      const haystack = `${person.name} ${person.department} ${person.position} ${person.identifier}`.toLocaleLowerCase('uk-UA');
      const matchesPresence = presenceFilter === 'all' || statusFor(person) === presenceFilter;
      return matchesDepartment && matchesPresence && (!normalized || haystack.includes(normalized));
    });
  }, [department, personnel, presence, presenceFilter, search]);
  const closeModal = () => { setEditing(undefined); setIsCreating(false); setForm(blankForm); };
  const toggleDepartment = (item: string) => setExpandedDepartments((current) => current.includes(item) ? current.filter((value) => value !== item) : [...current, item]);
  const openCreate = () => { setEditing(undefined); setForm({ ...blankForm, department: department || departments[0] || '' }); setIsCreating(true); };
  const openEdit = (person: PersonnelRecord) => {
    setEditing(person);
    setForm({
      name: person.name, department: person.department, position: person.position, identifier: person.identifier,
      photoData: person.photoData, employeeNumber: person.employeeNumber, email: person.email,
      accessLevel: person.accessLevel, identifiers: person.identifiers, active: person.active,
    });
    setIsCreating(false);
  };
  const submit = (event: FormEvent) => { event.preventDefault(); saveMutation.mutate(); };
  const updateIdentifier = (id: string, patch: Partial<PersonnelIdentifier>) => setForm((current) => ({
    ...current, identifiers: current.identifiers.map((item) => item.id === id ? { ...item, ...patch } : item),
  }));
  const addIdentifier = (type: PersonnelIdentifier['type'] = 'card') => setForm((current) => ({ ...current, identifiers: [...current.identifiers, createIdentifier(type)] }));
  const removeIdentifier = (id: string) => setForm((current) => ({ ...current, identifiers: current.identifiers.filter((item) => item.id !== id) }));
  const onPhotoChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/') || file.size > 2_000_000) return;
    const reader = new FileReader();
    reader.onload = () => setForm((current) => ({ ...current, photoData: typeof reader.result === 'string' ? reader.result : current.photoData }));
    reader.readAsDataURL(file);
  };
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
                {isExpanded && <div className="department-members">{members.map((person) => <button key={person.token} onClick={() => openEdit(person)} title={person.name} type="button"><EventAvatar name={person.name} photoData={person.photoData ?? undefined} photoToken={person.photoToken} /><span>{person.name}</span></button>)}</div>}
              </div>;
            })}
            {!departments.length && <p className="department-empty">Після першого додавання тут з’являться відділи.</p>}
            {!!departments.length && !visibleDepartments.length && <p className="department-empty">Відділ не знайдено.</p>}
          </aside>
          <section className="personnel-list-panel">
            <div className="personnel-toolbar">
              <label className="personnel-search"><span>⌕</span><input onChange={(event) => setSearch(event.target.value)} placeholder="Пошук працівника: ПІБ або ідентифікатор" value={search} /></label>
              <div aria-label="Присутність у суді" className="personnel-presence-toggle">
                {(['all', 'present', 'away', 'unknown'] as const).map((state) => <button aria-pressed={presenceFilter === state} className={presenceFilter === state ? 'active' : ''} key={state} onClick={() => setPresenceFilter(state)} type="button">{state === 'all' ? 'Усі' : presenceLabel(state)} <b>{presenceCounts[state]}</b></button>)}
              </div>
            </div>
            <p className="personnel-presence-note">Статус визначається за останньою подією «Вхід здійснено» або «Вихід здійснено» на турнікеті персоналу від початку поточного дня.</p>
            {directoryQuery.isError ? <div className="personnel-error">Не вдалося отримати список персоналу: {directoryQuery.error.message}</div> : (
              <div className="personnel-table-wrap">
                <table className="personnel-table">
                  <thead><tr><th>Працівник</th><th>Відділ</th><th>Посада</th><th>Ідентифікатор</th><th>Присутність</th><th>Статус</th><th aria-label="Дії" /></tr></thead>
                  <tbody>{visiblePersonnel.map((person) => <tr key={person.token} onDoubleClick={() => openEdit(person)}>
                    <td><div className="person-cell"><EventAvatar name={person.name} photoData={person.photoData ?? undefined} photoToken={person.photoToken} /><strong>{person.name}</strong></div></td>
                    <td>{person.department}</td><td>{person.position || '—'}</td><td className="personnel-identifier">{person.identifier || '—'}</td>
                    <td><span className={`personnel-presence ${statusFor(person)}`} title={presence[person.token]?.eventName}>{statusFor(person) === 'unknown' ? '● Немає даних' : `● ${presenceLabel(statusFor(person))}`}</span></td>
                    <td><button className={`personnel-status ${person.active ? 'active' : ''}`} onClick={() => openEdit(person)} type="button">● {person.active ? 'Активний' : 'Неактивний'}</button></td>
                    <td><button aria-label={`Редагувати ${person.name}`} className="personnel-edit" onClick={() => openEdit(person)} type="button">⋮</button></td>
                  </tr>)}
                  {!directoryQuery.isLoading && !visiblePersonnel.length && <tr><td className="personnel-empty" colSpan={7}>Нічого не знайдено.</td></tr>}
                  {directoryQuery.isLoading && <tr><td className="personnel-empty" colSpan={7}>Завантажуємо персонал…</td></tr>}
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
              <div className="personnel-photo">
                <EventAvatar name={form.name} photoData={form.photoData ?? undefined} photoToken={editing?.photoToken} />
                <label className="personnel-photo-upload">Завантажити фото<input accept="image/jpeg,image/png,image/webp" onChange={onPhotoChange} type="file" /></label>
                {form.photoData && <button className="personnel-photo-remove" onClick={() => setForm((current) => ({ ...current, photoData: null }))} type="button">Прибрати локальне фото</button>}
                <span>{form.photoData ? 'Локальне фото для цього центру.' : editing?.photoToken ? 'Фото отримано з U‑PROX.' : 'У U‑PROX для цього працівника фото поки відсутнє.'}</span>
              </div>
              <div className="personnel-fields">
                <label className="wide">ПІБ<input autoFocus onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} placeholder="Наприклад: Петренко Іван Петрович" required value={form.name} /></label>
                <label>Відділ<select onChange={(event) => setForm((current) => ({ ...current, department: event.target.value === '__new__' ? '' : event.target.value }))} required value={departments.includes(form.department) ? form.department : '__new__'}><option value="__new__">Створити або ввести інший відділ…</option>{departments.map((item) => <option key={item} value={item}>{item}</option>)}</select>{!departments.includes(form.department) && <input onChange={(event) => setForm((current) => ({ ...current, department: event.target.value }))} placeholder="Назва нового відділу" required value={form.department} />}</label>
                <label>Посада<input onChange={(event) => setForm((current) => ({ ...current, position: event.target.value }))} placeholder="Посада" value={form.position} /></label>
                <label>Табельний номер<input onChange={(event) => setForm((current) => ({ ...current, employeeNumber: event.target.value }))} placeholder="Наприклад: 00427" value={form.employeeNumber} /></label>
                <label>Електронна пошта<input onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))} placeholder="name@company.ua" type="email" value={form.email} /></label>
                <label className="wide">Рівень доступу<select onChange={(event) => setForm((current) => ({ ...current, accessLevel: event.target.value }))} value={form.accessLevel}>{!['inherit', 'none'].includes(form.accessLevel) && <option value={form.accessLevel}>{form.accessLevel}</option>}<option value="inherit">Успадковувати доступ відділу</option><option value="none">Без доступу</option></select><small>Індивідуальні рівні доступу додамо після підключення довідника рівнів з U‑PROX.</small></label>
                <label className="personnel-toggle"><input checked={form.active} onChange={(event) => setForm((current) => ({ ...current, active: event.target.checked }))} type="checkbox" /><span><b>Активний працівник</b><small>Неактивний працівник не матиме доступу.</small></span></label>
              </div>
            </div>
            <section className="personnel-identifiers">
              <div className="personnel-section-heading"><div><b>Ідентифікатори</b><span>Картки, брелоки та біометричні шаблони</span></div><button onClick={() => addIdentifier()} type="button">＋ Додати</button></div>
              {!!form.identifiers.length && <div className="personnel-identifier-list">{form.identifiers.map((item) => <div className="personnel-identifier-row" key={item.id}>
                <select aria-label="Тип ідентифікатора" onChange={(event) => updateIdentifier(item.id, { type: event.target.value as PersonnelIdentifier['type'] })} value={item.type}>{Object.entries(identifierLabels).map(([type, label]) => <option key={type} value={type}>{label}</option>)}</select>
                <input aria-label="Код ідентифікатора" onChange={(event) => updateIdentifier(item.id, { value: event.target.value })} placeholder={biometricTypes.has(item.type) ? 'Код шаблону в U‑PROX' : 'Номер картки або брелока'} required value={item.value} />
                <select aria-label="Термін дії" onChange={(event) => updateIdentifier(item.id, { validUntil: event.target.value })} value={item.validUntil}><option value="always">Завжди</option><option value="temporary">Тимчасово</option></select>
                <button aria-label="Видалити ідентифікатор" onClick={() => removeIdentifier(item.id)} type="button">×</button>
              </div>)}</div>}
              {!form.identifiers.length && <p>Ідентифікаторів ще немає. Додайте картку, брелок або біометричний шаблон.</p>}
              <div className="personnel-biometric-actions"><span>Біометричні ідентифікатори</span><button onClick={() => addIdentifier('face')} type="button">＋ Обличчя</button><button onClick={() => addIdentifier('fingerprint')} type="button">＋ Відбиток</button></div>
            </section>
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
