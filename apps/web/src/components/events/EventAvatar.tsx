import { useState } from 'react';

type EventAvatarProps = {
  name: string;
  photoToken?: string;
};

function initials(name: string) {
  const letters = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]);
  return letters.join('').toUpperCase() || '—';
}

export function EventAvatar({ name, photoToken }: EventAvatarProps) {
  const [failed, setFailed] = useState(false);

  if (!photoToken || failed) {
    return (
      <span
        aria-label={`Фото: ${name}`}
        className="event-avatar event-avatar-fallback"
        title={name}
      >
        {initials(name)}
      </span>
    );
  }

  return (
    <img
      alt={`Фото: ${name}`}
      className="event-avatar"
      decoding="async"
      loading="lazy"
      onError={() => setFailed(true)}
      src={`/api/images/${encodeURIComponent(photoToken)}`}
    />
  );
}
