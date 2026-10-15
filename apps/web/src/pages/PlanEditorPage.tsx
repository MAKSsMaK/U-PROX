import { useQuery } from '@tanstack/react-query';
import { getPlanCatalog, type PlanCatalogItem } from '../api';
import { DashboardLayout } from '../layouts/DashboardLayout';

type CatalogSectionProps = {
  description: string;
  emptyMessage: string;
  items: PlanCatalogItem[];
  title: string;
  type: 'door' | 'device' | 'input';
};

function CatalogSection({ description, emptyMessage, items, title, type }: CatalogSectionProps) {
  return (
    <section className="catalog-section">
      <div className="catalog-heading">
        <div>
          <h2>{title}</h2>
          <p>{description}</p>
        </div>
        <strong>{items.length}</strong>
      </div>
      <div className="catalog-items">
        {items.length === 0 ? (
          <p className="catalog-empty">{emptyMessage}</p>
        ) : (
          items.map((item) => (
            <article className="catalog-item" key={`${type}-${item.token}`}>
              <i className={`catalog-icon ${type}`}>
                {type === 'door' ? '▯' : type === 'device' ? '▣' : '◉'}
              </i>
              <div>
                <b>{item.name}</b>
                <span>Token: {item.token || '—'}</span>
                {item.model && <small>{item.model}</small>}
                {item.deviceToken && <small>Контролер: {item.deviceToken}</small>}
                {item.inputNumber && <small>Вхід: {item.inputNumber}</small>}
              </div>
              {item.online !== null && (
                <em className={item.online ? 'online' : 'offline'}>
                  {item.online ? 'ONLINE' : 'OFFLINE'}
                </em>
              )}
            </article>
          ))
        )}
      </div>
    </section>
  );
}

export function PlanEditorPage() {
  const catalogQuery = useQuery({ queryKey: ['plan-catalog'], queryFn: getPlanCatalog });
  const catalog = catalogQuery.data;

  return (
    <DashboardLayout>
      <main className="plan-editor-page">
        <header className="page-header">
          <div>
            <p className="eyebrow">ЕТАП 2 · READ-ONLY ІМПОРТ</p>
            <h1>Редактор плану</h1>
            <span>
              Спочатку підтверджуємо реальні об’єкти U‑PROX, потім розставляємо їх на плані.
            </span>
          </div>
          <button className="catalog-refresh" onClick={() => catalogQuery.refetch()} type="button">
            Оновити з U‑PROX
          </button>
        </header>
        {catalogQuery.isError ? (
          <section className="catalog-error">
            Не вдалося отримати каталог: {catalogQuery.error.message}
          </section>
        ) : (
          <>
            <section className="catalog-note">
              <b>Безпечний режим</b>
              <span>
                Сторінка лише читає дані U‑PROX. Жодна команда на контролери не надсилається.
              </span>
            </section>
            {catalog?.warnings.length ? (
              <section className="catalog-warning">
                {catalog.warnings.map((warning) => (
                  <span key={warning}>{warning}</span>
                ))}
              </section>
            ) : null}
            <div className="catalog-grid">
              <CatalogSection
                description="Реальні точки доступу для розстановки на схемі."
                emptyMessage={
                  catalogQuery.isLoading ? 'Завантажуємо двері…' : 'U‑PROX не повернув дверей.'
                }
                items={catalog?.doors ?? []}
                title="Двері"
                type="door"
              />
              <CatalogSection
                description="Контролери, зокрема IP100/IP400, якщо їх так називає U‑PROX."
                emptyMessage={
                  catalogQuery.isLoading
                    ? 'Завантажуємо контролери…'
                    : 'U‑PROX не повернув пристроїв.'
                }
                items={catalog?.devices ?? []}
                title="Контролери та пристрої"
                type="device"
              />
              <CatalogSection
                description="Входи контролерів: датчики, геркони, кнопки та інші сигнали."
                emptyMessage={
                  catalogQuery.isLoading
                    ? 'Завантажуємо входи…'
                    : 'Входи не повернуті цим API-запитом.'
                }
                items={catalog?.inputs ?? []}
                title="Входи / датчики"
                type="input"
              />
            </div>
          </>
        )}
      </main>
    </DashboardLayout>
  );
}
