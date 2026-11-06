import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getCameras } from '../api';
import { DashboardLayout } from '../layouts/DashboardLayout';

export function CamerasPage() {
  const [selected, setSelected] = useState<number>();
  const [streamError, setStreamError] = useState('');
  const [streamVersion, setStreamVersion] = useState(0);
  const overview = useQuery({ queryKey: ['cameras'], queryFn: getCameras, staleTime: 60_000 });
  const cameras = overview.data?.cameras ?? [];
  const camera = cameras.find((item) => item.channel === selected);
  return <DashboardLayout><main className="cameras-page">
    <header className="page-header"><div><p className="eyebrow">ВІДЕОСПОСТЕРЕЖЕННЯ · HIKVISION</p><h1>Камери</h1><span>Виберіть камеру для живого перегляду.</span></div>
      <span className={`camera-status ${overview.data?.configured ? 'ready' : ''}`}><i />{overview.isError ? 'ПОМИЛКА ПІДКЛЮЧЕННЯ' : overview.data?.configured ? 'РЕЄСТРАТОР НАЛАШТОВАНО' : 'ПОТРІБНЕ НАЛАШТУВАННЯ'}</span></header>
    <section className="camera-grid"><article className="camera-card">
      <div className="camera-card-heading"><span className="camera-icon">◉</span><div><h2>{camera?.name ?? 'Оберіть камеру'}</h2><p>{camera ? `${camera.id} · живий перегляд` : 'Список камер праворуч'}</p></div></div>
      <div className="camera-preview">{camera && !streamError ? <img key={`${camera.channel}-${streamVersion}`} src={`/api/cameras/${camera.channel}/live?v=${streamVersion}`} onError={() => setStreamError('Не вдалося отримати відео. Перевірте камеру та спробуйте ще раз.')} alt={`Відео: ${camera.name}`} /> : <div className="camera-preview-placeholder"><b>◉</b><span>{streamError ? 'Не вдалося отримати відео' : 'Камеру не вибрано'}</span><small>{streamError || 'Виберіть камеру зі списку.'}</small></div>}</div>
      <footer><button className="camera-refresh" disabled={!camera} onClick={() => { setStreamError(''); setStreamVersion((v) => v + 1); }} type="button">Перепідключити</button><span>Живе відео · підпотік</span></footer>
    </article><aside className="camera-info"><h2>Камери ({cameras.length})</h2>
      {overview.isLoading && <p>Завантажуємо список…</p>}{overview.isError && <p>Не вдалося отримати список камер. Перевірте підключення до реєстратора.</p>}
      {overview.data && !overview.data.configured && <p>Заповніть налаштування реєстратора на сервері.</p>}
      <button className="camera-refresh" onClick={() => overview.refetch()} type="button">Оновити список</button>
      <ol>{cameras.map((item) => <li key={item.id}><button className="camera-refresh" aria-pressed={selected === item.channel} onClick={() => { setSelected(item.channel); setStreamError(''); setStreamVersion((v) => v + 1); }} type="button">{item.id} · {item.name}</button></li>)}</ol>
    </aside></section>
  </main></DashboardLayout>;
}
