import type { DataTableColumn } from '../../components/tables/DataTable';
import { EventAvatar } from '../../components/events/EventAvatar';

type UproxxPerson = { Name?: string; Post?: string };
type UproxxNamed = { Name?: string; Token?: string | number };
type UproxxEmployee = {
  Token?: string | number;
  Name?: string;
  Post?: string;
  ImageToken?: string | number;
  PhotoToken?: string | number;
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
  ImageToken?: string | number;
  PhotoToken?: string | number;
  Employee?: UproxxEmployee;
};

export type EventTableRow = {
  id: string;
  occurredAt: string;
  occurredAtMs: number;
  photoToken?: string;
  employee: string;
  employeeToken?: string;
  department: string;
  accessPoint: string;
  senderToken?: string;
  eventName: string;
  cardCode: string;
  position: string;
};

export type EventSeverity = 'normal' | 'warning' | 'critical';

/**
 * U-PROX returns the displayed event text, rather than a common severity field.
 * Keep the classification in one place so the journal and live-plan feed use the
 * same visual signal.
 */
export function getEventSeverity(eventName: string): EventSeverity {
  const value = eventName.toLocaleLowerCase('uk-UA');
  if ([
    'відмов',
    'заборон',
    'невідом',
    'заблок',
    'тривог',
    'авар',
    'несправ',
    'обрив',
    'зв’язок втрач',
    "зв'язок втрач",
    'помил',
  ].some((term) => value.includes(term))) return 'critical';
  if (['поперед', 'відчинен', 'відкрит', 'примус', 'tamper'].some((term) => value.includes(term))) return 'warning';
  return 'normal';
}

type EventObject = { token?: string; name: string };

function normalizedWords(value: string) {
  return value
    .toLocaleLowerCase('uk-UA')
    .replace(/[^a-zа-яіїєґ0-9]+/giu, ' ')
    .split(' ')
    .filter((word) => word.length >= 5)
    .map((word) => word.slice(0, 6));
}

/** Match by U-PROX sender token first; name stems are a fallback for older API responses. */
export function eventMatchesObject(event: EventTableRow, object: EventObject) {
  if (object.token && event.senderToken === object.token) return true;
  const objectWords = normalizedWords(object.name);
  const pointWords = normalizedWords(event.accessPoint);
  return objectWords.some((word) => pointWords.includes(word));
}

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

function photoToken(event: UproxxEvent) {
  const user = event.User as
    | (UproxxPerson & {
        ImageToken?: string | number;
        PhotoToken?: string | number;
      })
    | undefined;
  return (
    event.PhotoToken ??
    event.ImageToken ??
    user?.PhotoToken ??
    user?.ImageToken ??
    event.Employee?.PhotoToken ??
    event.Employee?.ImageToken
  );
}

export function toEventTableRows(payload: unknown): EventTableRow[] {
  const response = payload as { Event?: UproxxEvent[] } | undefined;
  const events = response?.Event ?? [];
  return [...events]
    .sort((left, right) => issuedMilliseconds(right.Issued) - issuedMilliseconds(left.Issued))
    .map((event, index) => {
      const employee = event.User?.Name || (event.CardCode ? 'Невідома картка' : 'Системна подія');
      const imageToken = photoToken(event);
      return {
        id: String(event.Token ?? `${event.Issued}-${index}`),
        occurredAt: formatUproxxDate(event.Issued),
        occurredAtMs: issuedMilliseconds(event.Issued),
        photoToken: imageToken === undefined ? undefined : String(imageToken),
        employee,
        employeeToken: event.User?.Token === undefined && event.Employee?.Token === undefined
          ? undefined
          : String(event.User?.Token ?? event.Employee?.Token),
        department:
          event.Department?.Name ||
          event.Employee?.Department?.Name ||
          event.Employee?.DepartmentName ||
          '—',
        accessPoint: event.Sender?.Name || '—',
        senderToken: event.Sender?.Token === undefined ? undefined : String(event.Sender.Token),
        eventName: event.Message?.Name || 'Подія без назви',
        cardCode: event.CardCode || '—',
        position: event.User?.Post || event.Employee?.Post || '—',
      };
    });
}

export const eventTableColumns: DataTableColumn<EventTableRow>[] = [
  {
    id: 'occurredAt',
    header: 'Дата та час',
    cell: (row) => row.occurredAt,
    className: 'event-time',
  },
  {
    id: 'photo',
    header: 'Фото',
    className: 'event-photo-cell',
    cell: (row) => <EventAvatar name={row.employee} photoToken={row.photoToken} />,
  },
  { id: 'employee', header: 'Співробітник', cell: (row) => <strong>{row.employee}</strong> },
  { id: 'department', header: 'Відділ', cell: (row) => row.department },
  { id: 'accessPoint', header: 'Місце', cell: (row) => row.accessPoint },
  {
    id: 'eventName',
    header: 'Подія',
    cell: (row) => <span className={`event-name event-name--${getEventSeverity(row.eventName)}`}>{row.eventName}</span>,
  },
  { id: 'cardCode', header: 'Ідентифікатор', cell: (row) => row.cardCode },
  { id: 'position', header: 'Посада', cell: (row) => row.position },
];
