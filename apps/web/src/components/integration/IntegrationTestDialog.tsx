import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { runIntegrationTest } from '../../api';
import { useIntegrationStore } from '../../store';

export function IntegrationTestDialog({ onClose }: { onClose: () => void }) {
  const setMode = useIntegrationStore((state) => state.setMode);
  const query = useQuery({ queryKey: ['integration'], queryFn: runIntegrationTest, retry: false });
  useEffect(() => {
    if (query.data?.mode) setMode(query.data.mode);
  }, [query.data, setMode]);
  return (
    <dialog open>
      <div className="dialog-head">
        <b>Перевірка інтеграції U‑PROX</b>
        <button onClick={onClose}>×</button>
      </div>
      <p>Лише read-only запити через backend.</p>
      <pre>
        {query.isFetching
          ? 'Виконую безпечні API-запити…'
          : query.error
            ? `Помилка: ${query.error.message}`
            : JSON.stringify(query.data, null, 2)}
      </pre>
    </dialog>
  );
}
