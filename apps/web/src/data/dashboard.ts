export type LiveEvent = {
  title: string;
  detail: string;
  severity: 'green' | 'denied' | 'warn';
  time: string;
};

export const liveEvents: LiveEvent[] = [
  {
    title: 'Доступ дозволено',
    detail: 'Олексій Мельник · Двері 3-01',
    severity: 'green',
    time: '15:42:18',
  },
  {
    title: 'Доступ дозволено',
    detail: 'Ірина Коваль · Турнікет персонал',
    severity: 'green',
    time: '15:41:52',
  },
  {
    title: 'Відмовлено у доступі',
    detail: 'Невідома картка · Двері 3-03',
    severity: 'denied',
    time: '15:40:11',
  },
  {
    title: 'Двері відчинені понад норму',
    detail: 'Двері 3-05 · 01:37',
    severity: 'warn',
    time: '15:38:46',
  },
];
