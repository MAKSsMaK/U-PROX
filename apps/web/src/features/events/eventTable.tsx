import type { DataTableColumn } from '../../components/tables/DataTable';

type UproxxPerson = { Name?: string; Post?: string };
type UproxxNamed = { Name?: string };
type UproxxEmployee = {
  Token?: string | number;
  Name?: string;
  Post?: string;
  Department?: UproxxNamed;
  DepartmentName?: string;
};
export type UproxxEvent = {
  Token?: string | number;
  Issued?: string;
  User?: UproxxPerson & { Token?: string | number };
  Department?: UproxxNamed;
  Sender?: UproxxNamed;
  Message?: { Name?: string; Code?: string | number };
  CardCode?: string;
  Employee?: UproxxEmployee;
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

function issuedMilliseconds(value?: string) {
  return Number(value?.match(/\d+/)?.[0] ?? 0);
}

export function toEventTableRows(payload: unknown): EventTableRow[] {
  const response = payload as { Event?: UproxxEvent[] } | undefined;
  const events = response?.Event ?? [];
  return [...events]
    .sort((left, right) => issuedMilliseconds(right.Issued) - issuedMilliseconds(left.Issued))
    .map((event, index) => ({
      id: String(event.Token ?? `${event.Issued}-${index}`),
      occurredAt: formatUproxxDate(event.Issued),
      employee: event.User?.Name || (event.CardCode ? 'Невідома картка' : 'Системна подія'),
      department:
        event.Department?.Name ||
        event.Employee?.Department?.Name ||
        event.Employee?.DepartmentName ||
        '—',
      accessPoint: event.Sender?.Name || '—',
      eventName: event.Message?.Name || 'Подія без назви',
      cardCode: event.CardCode || '—',
      position: event.User?.Post || event.Employee?.Post || '—',
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
