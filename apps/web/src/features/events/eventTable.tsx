import type { DataTableColumn } from '../../components/tables/DataTable';

type UproxxPerson = { Name?: string; Post?: string };
type UproxxNamed = { Name?: string };
export type UproxxEvent = {
  Token?: string | number;
  Issued?: string;
  User?: UproxxPerson;
  Department?: UproxxNamed;
  Sender?: UproxxNamed;
  Message?: { Name?: string; Code?: string | number };
  CardCode?: string;
};

export type EventTableRow = {
  id: string;
  occurredAt: string;
  employee: string;
  department: string;
  accessPoint: string;
  eventName: string;
  cardCode: string;
  position: string;
};

function formatUproxxDate(value?: string) {
  const milliseconds = value?.match(/\d+/)?.[0];
  if (!milliseconds) return '—';
  return new Intl.DateTimeFormat('uk-UA', {
    dateStyle: 'short',
    timeStyle: 'medium',
  }).format(new Date(Number(milliseconds)));
}

export function toEventTableRows(payload: unknown): EventTableRow[] {
  const events = (payload as { Event?: UproxxEvent[] } | undefined)?.Event ?? [];
  return events.map((event, index) => ({
    id: String(event.Token ?? `${event.Issued}-${index}`),
    occurredAt: formatUproxxDate(event.Issued),
    employee: event.User?.Name || 'Невідома особа',
    department: event.Department?.Name || '—',
    accessPoint: event.Sender?.Name || '—',
    eventName: event.Message?.Name || 'Подія без назви',
    cardCode: event.CardCode || '—',
    position: event.User?.Post || '—',
  }));
}

export const eventTableColumns: DataTableColumn<EventTableRow>[] = [
  {
    id: 'occurredAt',
    header: 'Дата та час',
    cell: (row) => row.occurredAt,
    className: 'event-time',
  },
  { id: 'employee', header: 'Співробітник', cell: (row) => <strong>{row.employee}</strong> },
  { id: 'department', header: 'Відділ', cell: (row) => row.department },
  { id: 'accessPoint', header: 'Місце', cell: (row) => row.accessPoint },
  {
    id: 'eventName',
    header: 'Подія',
    cell: (row) => <span className="event-name">{row.eventName}</span>,
  },
  { id: 'cardCode', header: 'Ідентифікатор', cell: (row) => row.cardCode },
  { id: 'position', header: 'Посада', cell: (row) => row.position },
];
