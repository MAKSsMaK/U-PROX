const statuses = [
  ['▯', '6', 'Дверей на плані'],
  ['◉', '2', 'Датчики · тестові'],
  ['▣', '1', 'Контролер · тестовий'],
] as const;

export function PlanStatusBar() {
  return (
    <section className="plan-status-bar">
      <div className="plan-summary">
        <h2>Статус елементів · етап 1</h2>
        <p>Візуальний шар готовий. Реальні токени та статуси підключимо в редакторі.</p>
        <div className="plan-stat-list">
          {statuses.map(([icon, number, label]) => (
            <div className="plan-stat" key={label}>
              <i>{icon}</i>
              <strong>{number}</strong>
              <span>{label}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="plan-legend">
        <h2>Позначення</h2>
        <span>
          <i className="legend-dot green" /> Норма
        </span>
        <span>
          <i className="legend-dot yellow" /> Увага
        </span>
        <span>
          <i className="legend-dot red" /> Тривога
        </span>
        <span>
          <i className="legend-dot blue" /> Контролер / датчик
        </span>
      </div>
    </section>
  );
}
