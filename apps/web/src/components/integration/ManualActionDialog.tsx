export function ManualActionDialog({ action, doorName, onClose }: { action: string; doorName: string; onClose: () => void }) {
  return <dialog open><div className="dialog-head"><b>Підтвердіть ручну дію</b><button onClick={onClose}>×</button></div><p>«{action}» для «{doorName}». Команда поки не буде надіслана U‑PROX.</p><button className="confirm" onClick={onClose}>Зрозуміло</button></dialog>;
}
