import { useEffect, useMemo, useRef, useState, type MouseEvent, type PointerEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { getPlanCatalog, type PlanCatalogItem } from '../api';
import { DashboardLayout } from '../layouts/DashboardLayout';
import { useStore } from '../store';
import { floorOptions, getFloorPlan } from '../features/plans/floorPlans';
import {
  planElementIcon,
  readPlanElements,
  writePlanElements,
  type PlanElement,
  type PlanElementType,
} from '../features/plans/planElements';

type PaletteItem = { type: PlanElementType; item: PlanCatalogItem };
type DragState = { id: string; pointerId: number };
type CatalogType = Exclude<PlanElementType, 'label'>;

const selectorTypes: Array<{ type: CatalogType; label: string }> = [
  { type: 'door', label: 'Двері' },
  { type: 'device', label: 'Контролери' },
  { type: 'input', label: 'Датчики / входи' },
];

export function PlanEditorPage() {
  const catalogQuery = useQuery({ queryKey: ['plan-catalog'], queryFn: getPlanCatalog });
  const floor = useStore((state) => state.floor);
  const setFloor = useStore((state) => state.setFloor);
  const plan = getFloorPlan(floor);
  const [elements, setElements] = useState<PlanElement[]>(() => readPlanElements(floor));
  const [isDirty, setIsDirty] = useState(false);
  const [selection, setSelection] = useState<PaletteItem>();
  const [label, setLabel] = useState('');
  const [search, setSearch] = useState('');
  const [activeSelector, setActiveSelector] = useState<CatalogType>();
  const [selectorSearch, setSelectorSearch] = useState('');
  const frameRef = useRef<HTMLDivElement>(null);
  const dragState = useRef<DragState>();
  const catalog = catalogQuery.data;
  const catalogItems = useMemo(() => [
    ...(catalog?.doors ?? []).map((item) => ({ type: 'door' as const, item, group: 'Двері' })),
    ...(catalog?.devices ?? []).map((item) => ({ type: 'device' as const, item, group: 'Контролери' })),
    ...(catalog?.inputs ?? []).map((item) => ({ type: 'input' as const, item, group: 'Датчики / входи' })),
  ], [catalog]);
  const foundItems = useMemo(() => {
    const query = search.trim().toLocaleLowerCase('uk-UA');
    if (!query) return [];
    return catalogItems.filter(({ item }) => `${item.name} ${item.token} ${item.model ?? ''} ${item.deviceToken ?? ''}`.toLocaleLowerCase('uk-UA').includes(query)).slice(0, 8);
  }, [catalogItems, search]);
  const selectorItems = useMemo(() => {
    if (!activeSelector) return [];
    const query = selectorSearch.trim().toLocaleLowerCase('uk-UA');
    return catalogItems
      .filter(({ type }) => type === activeSelector)
      .filter(({ item }) => !query || `${item.name} ${item.token} ${item.model ?? ''}`.toLocaleLowerCase('uk-UA').includes(query))
      .slice(0, 8);
  }, [activeSelector, catalogItems, selectorSearch]);
  const selectedDescription = useMemo(() => {
    if (!selection) return 'Оберіть об’єкт у верхній панелі або створіть текстову позначку.';
    return `Обрано: ${selection.item.name}. Клацни на схемі, щоб розмістити.`;
  }, [selection]);

  useEffect(() => {
    setElements(readPlanElements(floor));
    setIsDirty(false);
    setSelection(undefined);
  }, [floor]);

  const updateElements = (next: PlanElement[]) => {
    setElements(next);
    setIsDirty(true);
  };
  const saveElements = () => {
    writePlanElements(floor, elements);
    setIsDirty(false);
  };
  const changeFloor = (nextFloor: string) => {
    if (isDirty) writePlanElements(floor, elements);
    setFloor(nextFloor);
  };
  const addLabel = () => {
    const normalized = label.trim();
    if (!normalized) return;
    setSelection({ type: 'label', item: { token: `label-${Date.now()}`, name: normalized, model: null, online: null, deviceToken: null, inputNumber: null } });
    setLabel('');
  };
  const chooseItem = (item: PaletteItem) => {
    setSelection(item);
    setSearch('');
    setActiveSelector(undefined);
    setSelectorSearch('');
  };
  const toggleSelector = (type: CatalogType) => {
    setActiveSelector((current) => current === type ? undefined : type);
    setSelectorSearch('');
  };
  const placeElement = (event: MouseEvent<HTMLDivElement>) => {
    if (!selection || !frameRef.current) return;
    const bounds = frameRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(100, ((event.clientX - bounds.left) / bounds.width) * 100));
    const y = Math.max(0, Math.min(100, ((event.clientY - bounds.top) / bounds.height) * 100));
    updateElements([...elements, {
      id: crypto.randomUUID(), type: selection.type,
      token: selection.type === 'label' ? undefined : selection.item.token,
      name: selection.item.name,
      detail: selection.type === 'input' ? selection.item.deviceToken : selection.item.model ?? selection.item.deviceToken,
      deviceToken: selection.item.deviceToken,
      x,
      y,
    }]);
    setSelection(undefined);
  };
  const removeElement = (id: string) => updateElements(elements.filter((element) => element.id !== id));
  const startDrag = (event: PointerEvent<HTMLButtonElement>, id: string) => {
    event.preventDefault();
    event.stopPropagation();
    dragState.current = { id, pointerId: event.pointerId };
    frameRef.current?.setPointerCapture(event.pointerId);
  };
  const moveElement = (event: PointerEvent<HTMLDivElement>) => {
    const drag = dragState.current;
    if (!drag || !frameRef.current) return;
    const bounds = frameRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(100, ((event.clientX - bounds.left) / bounds.width) * 100));
    const y = Math.max(0, Math.min(100, ((event.clientY - bounds.top) / bounds.height) * 100));
    const next = elements.map((element) => (element.id === drag.id ? { ...element, x, y } : element));
    updateElements(next);
  };
  const stopDrag = (event?: PointerEvent<HTMLDivElement>) => {
    const drag = dragState.current;
    if (drag && event?.currentTarget.hasPointerCapture(drag.pointerId)) event.currentTarget.releasePointerCapture(drag.pointerId);
    dragState.current = undefined;
  };

  return (
    <DashboardLayout variant="editor">
      <main className="plan-editor-page">
        <header className="page-header">
          <div>
            <p className="eyebrow">ЕТАП 3 · ПРИВ’ЯЗКА ДО ПЛАНУ</p>
            <h1>Редактор плану</h1>
            <span>Обери об’єкт зверху, клацни по схемі та перетягни його для точного позиціонування.</span>
          </div>
          <div className="editor-header-actions">
            <Link className="editor-back" to="/plans">← До живого плану</Link>
            <div className="editor-floor-control">
              <select aria-label="Поверх для редагування" className="editor-floor-select" onChange={(event) => changeFloor(event.target.value)} value={floor}>
                {floorOptions.map((option) => <option key={option}>{option}</option>)}
              </select>
              <i aria-hidden="true">⌄</i>
            </div>
            <button className={`editor-save ${isDirty ? 'is-dirty' : ''}`} disabled={!isDirty} onClick={saveElements} type="button">
              {isDirty ? 'Зберегти зміни' : 'Збережено'}
            </button>
            <button className="catalog-refresh" onClick={() => catalogQuery.refetch()} type="button">Оновити з U‑PROX</button>
          </div>
        </header>
        {catalogQuery.isError ? (
          <section className="catalog-error">Не вдалося отримати каталог: {catalogQuery.error.message}</section>
        ) : (
          <>
            <section className="editor-object-bar" aria-label="Додати об’єкт на план">
              <div className="editor-object-search">
                <label htmlFor="object-search">Загальний пошук U‑PROX</label>
                <input
                  autoComplete="off"
                  id="object-search"
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Пошук за назвою або токеном: наприклад, Серверна або 15094"
                  value={search}
                />
                {search && <div className="editor-search-results">
                  {foundItems.length ? foundItems.map(({ type, item, group }) => (
                    <button key={`${type}-${item.token}`} onClick={() => chooseItem({ type, item })} type="button">
                      <i className={type}>{planElementIcon(type)}</i>
                      <span><b>{item.name}</b><small>{group} · токен {item.token}{item.deviceToken ? ` · контролер ${item.deviceToken}` : ''}</small></span>
                    </button>
                  )) : <p>Нічого не знайдено.</p>}
                </div>}
              </div>
              <div className="editor-type-selectors" aria-label="Об’єкти за типом">
                {selectorTypes.map(({ type, label: typeLabel }) => (
                  <div className="editor-type-selector" key={type}>
                    <button aria-expanded={activeSelector === type} className={activeSelector === type ? 'active' : ''} onClick={() => toggleSelector(type)} type="button">
                      {typeLabel}<span>⌄</span>
                    </button>
                    {activeSelector === type && <div className="editor-type-menu">
                      <input autoFocus aria-label={`Пошук: ${typeLabel}`} onChange={(event) => setSelectorSearch(event.target.value)} placeholder={`Пошук у «${typeLabel}»`} value={selectorSearch} />
                      <div>
                        {selectorItems.length ? selectorItems.map(({ item }) => (
                          <button key={item.token} onClick={() => chooseItem({ type, item })} type="button">
                            <b>{item.name}</b><small>Токен {item.token}</small>
                          </button>
                        )) : <p>Нічого не знайдено.</p>}
                      </div>
                    </div>}
                  </div>
                ))}
              </div>
              <div className="editor-label-bar">
                <label htmlFor="plan-label">Напис</label>
                <input id="plan-label" onChange={(event) => setLabel(event.target.value)} onKeyDown={(event) => event.key === 'Enter' && addLabel()} placeholder="Наприклад: Серверна" value={label} />
                <button onClick={addLabel} type="button">Додати напис</button>
              </div>
            </section>
            <div className="plan-editor-workspace">
              <section className="editor-map-panel">
                <div className={`editor-placement-hint ${selection ? 'is-ready' : ''}`}><b>Розміщення на плані</b><span>{selectedDescription}</span></div>
                <div className="editor-map-viewport">
                  {plan ? <div
                    className={`editor-map-frame ${selection ? 'is-placing' : ''}`}
                    onClick={placeElement}
                    onPointerCancel={stopDrag}
                    onPointerMove={moveElement}
                    onPointerUp={stopDrag}
                    ref={frameRef}
                    style={{ aspectRatio: plan.aspectRatio }}
                  >
                    <img alt={plan.alt} src={plan.imageUrl} />
                    {elements.map((element) => (
                      <button
                        className={`editor-map-element ${element.type}`}
                        key={element.id}
                        onClick={(event) => event.stopPropagation()}
                        onPointerDown={(event) => startDrag(event, element.id)}
                        style={{ left: `${element.x}%`, top: `${element.y}%` }}
                        title={`Перетягни: ${element.name}`}
                        type="button"
                      >
                        {element.type === 'label' ? element.name : planElementIcon(element.type)}
                      </button>
                    ))}
                  </div> : <div className="editor-no-plan">Для «{floor}» ще не додано файл плану.</div>}
                </div>
                <p className="editor-map-help">Перетягни маркер, щоб перемістити. Видалення — тільки кнопкою × у списку праворуч. Поки що жодна команда на U‑PROX не надсилається.</p>
              </section>
              <aside className="editor-bindings" aria-label="Прив’язані елементи">
                <div className="editor-bindings-heading"><div><b>Прив’язки</b><span>{elements.length} на плані</span></div></div>
                {elements.length === 0 ? <p>Ще немає прив’язок. Почни з дверей, які точно знаходяться на третьому поверсі.</p> : (
                  <ol>{elements.map((element) => (
                    <li key={element.id}>
                      <i className={element.type}>{planElementIcon(element.type)}</i>
                      <span><b>{element.name}</b><small>{element.token ? `Токен: ${element.token}` : 'Текстова позначка'}</small></span>
                      <button onClick={() => removeElement(element.id)} title="Прибрати з плану" type="button">×</button>
                    </li>
                  ))}</ol>
                )}
              </aside>
            </div>
          </>
        )}
      </main>
    </DashboardLayout>
  );
}
