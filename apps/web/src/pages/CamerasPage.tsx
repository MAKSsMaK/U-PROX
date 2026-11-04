import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { getCameras, refreshCameraPreview } from '../api';
import { DashboardLayout } from '../layouts/DashboardLayout';

export function CamerasPage() {
  const [previewUrl, setPreviewUrl] = useState('');
  const overview = useQuery({ queryKey: ['cameras'], queryFn: getCameras, staleTime: 60_000 });
  const preview = useMutation({
    mutationFn: refreshCameraPreview,
    onSuccess: (result) => setPreviewUrl(result.previewUrl),
  });
  const camera = overview.data?.camera;
  const configured = overview.data?.configured ?? false;

  return <DashboardLayout>
    <main className="cameras-page">
      <header className="page-header">
        <div>
          <p className="eyebrow">ВІДЕОСПОСТЕРЕЖЕННЯ · HIKVISION</p>
          <h1>Камери</h1>
          <span>Тестове підключення: сервер сам отримує кадр із NVR, доступи не передаються в браузер.</span>
        </div>
        <span className={`camera-status ${configured ? 'ready' : ''}`}><i />{configured ? 'ГОТОВО ДО ПІДКЛЮЧЕННЯ' : 'ПОТРІБНЕ НАЛАШТУВАННЯ'}</span>
      </header>
      <section className="camera-grid">
        <article className="camera-card">
          <div className="camera-card-heading"><span className="camera-icon">◉</span><div><h2>{camera?.name ?? 'Тестова камера'}</h2><p>{camera ? `${camera.id} · канал ${camera.channel} · ${camera.stream}` : 'Завантаження параметрів…'}</p></div></div>
          <div className="camera-preview" aria-live="polite">
            {previewUrl ? <img alt={`Останній кадр ${camera?.name ?? 'камери'}`} src={previewUrl} /> : <div className="camera-preview-placeholder"><b>◉</b><span>Кадр ще не отримано</span><small>Натисніть «Оновити кадр», щоб перевірити підключення.</small></div>}
            {preview.isPending && <div className="camera-loading">Отримуємо кадр…</div>}
          </div>
          {preview.isError && <p className="camera-error">{preview.error.message}</p>}
          <footer><button className="camera-refresh" disabled={!configured || preview.isPending} onClick={() => preview.mutate()} type="button">{preview.isPending ? 'Отримуємо кадр…' : 'Оновити кадр'}</button><span>Тестовий режим · один JPEG-кадр</span></footer>
        </article>
        <aside className="camera-info">
          <h2>Як це працює</h2>
          <ol><li>Сервер підключається до NVR через RTSP.</li><li>FFmpeg бере один кадр із підпотоку.</li><li>Браузер отримує лише готове зображення.</li></ol>
          <p>Після успішної перевірки тут підключимо постійний живий потік.</p>
        </aside>
      </section>
    </main>
  </DashboardLayout>;
}
