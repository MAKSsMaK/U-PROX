import { useMemo, useRef, useState, type MouseEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getPlanCatalog, type PlanCatalogItem } from '../api';
import { DashboardLayout } from '../layouts/DashboardLayout';
import {
  planElementIcon,
  readPlanElements,
  writePlanElements,
  type PlanElement,
  type PlanElementType,
} from '../features/plans/planElements';

type PaletteItem = { type: PlanElementType; item: PlanCatalogItem };

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
  const [elements, setElements] = useState<PlanElement[]>(readPlanElements);
  const [selection, setSelection] = useState<PaletteItem>();
  const [label, setLabel] = useState('');
  const frameRef = useRef<HTMLDivElement>(null);
  const catalog = catalogQuery.data;
  const selectionKey = selection ? `${selection.type}-${selection.item.token}` : undefined;
  const selectedDescription = useMemo(() => {
    if (!selection) return 'Обери об’єкт у лівій панелі або створи текстову позначку.';
    return `Обрано: ${selection.item.name}. Клацни на схемі, щоб розмістити.`;
  }, [selection]);

  const saveElements = (next: PlanElement[]) => {
    setElements(next);
    writePlanElements(next);
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

  return (
    <DashboardLayout>
      <main className="plan-editor-page">
        <header className="page-header">
          <div>
            <p className="eyebrow">ЕТАП 3 · ПРИВ’ЯЗКА ДО ПЛАНУ</p>
            <h1>Редактор плану</h1>
            <span>Обери реальний об’єкт U‑PROX, клацни на схемі й перевір його токен.</span>
          </div>
          <button className="catalog-refresh" onClick={() => catalogQuery.refetch()} type="button">Оновити з U‑PROX</button>
        </header>
        {catalogQuery.isError ? (
          <section className="catalog-error">Не вдалося отримати каталог: {catalogQuery.error.message}</section>
        ) : (
          <>
            <section className="catalog-note"><b>Локальне збереження</b><span>Прив’язки зберігаються у браузері цієї VM. Після перевірки перенесемо їх до спільної БД.</span></section>
            <div className="plan-editor-workspace">
              <aside className="editor-palette" aria-label="Об’єкти для плану">
                <div className="editor-palette-intro"><b>1. Обери об’єкт</b><span>Потім клацни по плану.</span></div>
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
                  <div className={`editor-map-frame ${selection ? 'is-placing' : ''}`} onClick={placeElement} ref={frameRef}>
                    <img alt="План третього поверху суду" src="/floor-plans/court-floor-3-blueprint.png" />
                    {elements.map((element) => (
                      <button
                        className={`editor-map-element ${element.type}`}
                        key={element.id}
                        onClick={(event) => { event.stopPropagation(); removeElement(element.id); }}
                        style={{ left: `${element.x}%`, top: `${element.y}%` }}
                        title={`Прибрати: ${element.name}`}
                        type="button"
                      >
                        {element.type === 'label' ? element.name : planElementIcon(element.type)}
                      </button>
                    ))}
                  </div>
                </div>
                <p className="editor-map-help">Клацни маркер на схемі, щоб прибрати його. Поки що жодна команда на U‑PROX не надсилається.</p>
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
