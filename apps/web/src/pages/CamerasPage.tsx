import { useLayoutEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getCameras } from '../api';
import { DashboardLayout } from '../layouts/DashboardLayout';

export function CamerasPage() {
  const [showUnavailable, setShowUnavailable] = useState(false);
  const [selected, setSelected] = useState<string>();
  const [streamError, setStreamError] = useState('');
  const [streamVersion, setStreamVersion] = useState(0);
  const overview = useQuery({ queryKey: ['cameras'], queryFn: getCameras, staleTime: 60_000 });
  const cameras = overview.data?.cameras ?? [];
  const camera = cameras.find((item) => `${item.recorder}/${item.channel}` === selected);
  const streamRef = useRef<HTMLImageElement>(null);
  useLayoutEffect(() => {
    const image = streamRef.current;
    if (!image || !camera || streamError) return;
    image.src = `/api/cameras/${camera.channel}/live?recorder=${encodeURIComponent(camera.recorder)}&v=${streamVersion}`;
    return () => { image.removeAttribute('src'); };
  }, [camera?.recorder, camera?.channel, streamVersion, streamError]);
  return <DashboardLayout><main className="cameras-page">
    <header className="page-header"><div><p className="eyebrow">ВІДЕОСПОСТЕРЕЖЕННЯ · HIKVISION</p><h1>Камери</h1><span>Виберіть камеру для живого перегляду.</span></div>
      <span className={`camera-status ${overview.data?.configured ? 'ready' : ''}`}><i />{overview.isError ? 'ПОМИЛКА ПІДКЛЮЧЕННЯ' : overview.data?.configured ? 'РЕЄСТРАТОР НАЛАШТОВАНО' : 'ПОТРІБНЕ НАЛАШТУВАННЯ'}</span></header>
    <section className="camera-grid"><article className="camera-card">
      <div className="camera-card-heading"><span className="camera-icon">◉</span><div><h2>{camera?.name ?? 'Оберіть камеру'}</h2><p>{camera ? `${camera.recorder} · ${camera.id} · живий перегляд` : 'Список камер праворуч'}</p></div></div>
      <div className="camera-preview">{camera && !streamError ? <img ref={streamRef} onError={() => { setStreamError('Не вдалося отримати відео. Перевірте камеру та права доступу.'); void overview.refetch(); }} alt={`Відео: ${camera.name}`} /> : <div className="camera-preview-placeholder"><b>◉</b><span>{streamError ? 'Не вдалося отримати відео' : 'Камеру не вибрано'}</span><small>{streamError || 'Виберіть камеру зі списку.'}</small></div>}</div>
      <footer><button className="camera-refresh" disabled={!camera} onClick={() => { setStreamError(''); setStreamVersion((v) => v + 1); }} type="button">Перепідключити</button><button className="camera-refresh" disabled={!camera} onClick={() => { setSelected(undefined); setStreamError(''); }} type="button">Зупинити</button><span>Живе відео · підпотік</span></footer>
    </article><aside className="camera-info"><h2>Камери ({cameras.filter((item) => showUnavailable || (item.online !== false && !item.denied)).length})</h2>
      {overview.isLoading && <p>Завантажуємо список…</p>}{overview.isError && <p>Не вдалося отримати список камер. Перевірте підключення до реєстратора.</p>}
      {overview.data && !overview.data.configured && <p>Заповніть налаштування реєстратора на сервері.</p>}
      <button className="camera-refresh" onClick={() => overview.refetch()} type="button">Оновити список</button><label style={{ display: 'block', marginTop: 12 }}><input type="checkbox" checked={showUnavailable} onChange={(event) => setShowUnavailable(event.target.checked)} /> Показати недоступні</label>
      {(overview.data?.recorders ?? []).map((recorder) => <section key={recorder.host}>
        <h3>{recorder.host} · {recorder.available ? `${cameras.filter((item) => item.recorder === recorder.host && (showUnavailable || (item.online !== false && !item.denied))).length} камер` : 'недоступний'}</h3>
        <ol>{cameras.filter((item) => item.recorder === recorder.host && (showUnavailable || (item.online !== false && !item.denied))).map((item) => {
          const key = `${item.recorder}/${item.channel}`;
          return <li key={key}><button className="camera-refresh" aria-pressed={selected === key} onClick={() => { setSelected(key); setStreamError(''); setStreamVersion((v) => v + 1); }} type="button">{item.id} · {item.name}{item.denied ? ' · немає доступу' : item.online === false ? ' · офлайн' : item.online === null ? ' · стан невідомий' : ''}</button></li>;
        })}</ol>
      </section>)}
    </aside></section>
  </main></DashboardLayout>;
}
