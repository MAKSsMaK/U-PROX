import { useEffect, useMemo, useRef, useState, type MouseEvent, type PointerEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
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

type CatalogSectionProps = {
  items: PlanCatalogItem[];
  selectedToken?: string;
  title: string;
  type: Exclude<PlanElementType, 'label'>;
  onSelect: (item: PaletteItem) => void;
};

function CatalogSection({ items, onSelect, selectedToken, title, type }: CatalogSectionProps) {
  return (
    <section className="editor-catalog-section">
      <div className="editor-catalog-heading"><h2>{title}</h2><strong>{items.length}</strong></div>
      <div className="editor-catalog-items">
        {items.map((item) => (
          <button
            className={`editor-catalog-item ${selectedToken === `${type}-${item.token}` ? 'selected' : ''}`}
            key={`${type}-${item.token}`}
            onClick={() => onSelect({ type, item })}
            title={`Обрати «${item.name}» для розміщення`}
            type="button"
          >
            <i className={`catalog-icon ${type}`}>{planElementIcon(type)}</i>
            <span>
              <b>{item.name}</b><small>Токен: {item.token || '—'}</small>
              {item.model && <small>{item.model}</small>}
              {item.deviceToken && <small>Контролер: {item.deviceToken}</small>}
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}

export function PlanEditorPage() {
  const catalogQuery = useQuery({ queryKey: ['plan-catalog'], queryFn: getPlanCatalog });
  const floor = useStore((state) => state.floor);
  const setFloor = useStore((state) => state.setFloor);
  const plan = getFloorPlan(floor);
  const [elements, setElements] = useState<PlanElement[]>(() => readPlanElements(floor));
  const [selection, setSelection] = useState<PaletteItem>();
  const [label, setLabel] = useState('');
  const frameRef = useRef<HTMLDivElement>(null);
  const dragState = useRef<DragState>();
  const catalog = catalogQuery.data;
  const selectionKey = selection ? `${selection.type}-${selection.item.token}` : undefined;
  const selectedDescription = useMemo(() => {
    if (!selection) return 'Обери об’єкт у лівій панелі або створи текстову позначку.';
    return `Обрано: ${selection.item.name}. Клацни на схемі, щоб розмістити.`;
  }, [selection]);

  useEffect(() => {
    setElements(readPlanElements(floor));
    setSelection(undefined);
  }, [floor]);

  const saveElements = (next: PlanElement[]) => {
    setElements(next);
    writePlanElements(floor, next);
  };
  const addLabel = () => {
    const normalized = label.trim();
    if (!normalized) return;
    setSelection({ type: 'label', item: { token: `label-${Date.now()}`, name: normalized, model: null, online: null, deviceToken: null, inputNumber: null } });
    setLabel('');
  };
  const placeElement = (event: MouseEvent<HTMLDivElement>) => {
    if (!selection || !frameRef.current) return;
    const bounds = frameRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(100, ((event.clientX - bounds.left) / bounds.width) * 100));
    const y = Math.max(0, Math.min(100, ((event.clientY - bounds.top) / bounds.height) * 100));
    saveElements([...elements, {
      id: crypto.randomUUID(), type: selection.type,
      token: selection.type === 'label' ? undefined : selection.item.token,
      name: selection.item.name, detail: selection.item.model ?? selection.item.deviceToken, x, y,
    }]);
    setSelection(undefined);
  };
  const removeElement = (id: string) => saveElements(elements.filter((element) => element.id !== id));
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
    saveElements(next);
  };
  const stopDrag = (event?: PointerEvent<HTMLDivElement>) => {
    const drag = dragState.current;
    if (drag && event?.currentTarget.hasPointerCapture(drag.pointerId)) event.currentTarget.releasePointerCapture(drag.pointerId);
    dragState.current = undefined;
  };

  return (
    <DashboardLayout>
      <main className="plan-editor-page">
        <header className="page-header">
          <div>
            <p className="eyebrow">ЕТАП 3 · ПРИВ’ЯЗКА ДО ПЛАНУ</p>
            <h1>Редактор плану</h1>
            <span>Обери реальний об’єкт U‑PROX, клацни на схемі й перевір його токен. Прив’язки окремі для кожного поверху.</span>
          </div>
          <div className="editor-header-actions">
            <select aria-label="Поверх для редагування" className="editor-floor-select" onChange={(event) => setFloor(event.target.value)} value={floor}>
              {floorOptions.map((option) => <option key={option}>{option}</option>)}
            </select>
            <button className="catalog-refresh" onClick={() => catalogQuery.refetch()} type="button">Оновити з U‑PROX</button>
          </div>
        </header>
        {catalogQuery.isError ? (
          <section className="catalog-error">Не вдалося отримати каталог: {catalogQuery.error.message}</section>
        ) : (
          <>
            <section className="catalog-note"><b>Локальне збереження</b><span>Прив’язки зберігаються у браузері цієї VM. Після перевірки перенесемо їх до спільної БД.</span></section>
            <div className="plan-editor-workspace">
              <aside className="editor-palette" aria-label="Об’єкти для плану">
                <div className="editor-palette-intro"><b>1. Обери об’єкт</b><span>Потім клацни по плану. Усі створені прив’язки нижче вже збережені.</span></div>
                <div className="label-composer">
                  <label htmlFor="plan-label">Напис на плані</label>
                  <div>
                    <input id="plan-label" onChange={(event) => setLabel(event.target.value)} onKeyDown={(event) => event.key === 'Enter' && addLabel()} placeholder="Наприклад: Канцелярія" value={label} />
                    <button onClick={addLabel} type="button">Додати</button>
                  </div>
                </div>
                <CatalogSection items={catalog?.doors ?? []} onSelect={setSelection} selectedToken={selectionKey} title="Двері" type="door" />
                <CatalogSection items={catalog?.devices ?? []} onSelect={setSelection} selectedToken={selectionKey} title="Контролери" type="device" />
                <CatalogSection items={catalog?.inputs ?? []} onSelect={setSelection} selectedToken={selectionKey} title="Датчики / входи" type="input" />
              </aside>
              <section className="editor-map-panel">
                <div className={`editor-placement-hint ${selection ? 'is-ready' : ''}`}><b>2. Розмісти на плані</b><span>{selectedDescription}</span></div>
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
                <div className="editor-bindings-heading"><div><b>3. Прив’язки</b><span>{elements.length} на плані</span></div></div>
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
