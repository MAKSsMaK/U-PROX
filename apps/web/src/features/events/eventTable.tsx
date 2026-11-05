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

type EventObject = { token?: string; eventTokens?: string[]; name: string };

// These words describe a type of object, not a specific access point.  Using
// one of them as a fallback key made every "door" match every other door.
const genericAccessPointWords = new Set([
  'двері', 'двер', 'вихід', 'вхід', 'точка', 'досту', 'контр', 'кнопк', 'систем', 'подія',
]);

function normalizedWords(value: string) {
  return value
    .toLocaleLowerCase('uk-UA')
    .replace(/[^a-zа-яіїєґ0-9]+/giu, ' ')
    .split(' ')
    .filter((word) => word.length >= 5)
    .map((word) => word.slice(0, 6))
    .filter((word) => !genericAccessPointWords.has(word));
}

/**
 * An event is emitted by a U-PROX input (for example, “Скляні двері — вхід”),
 * while a plan marker may be bound to the parent door (“Скляні двері”).
 *
 * Therefore the sender token remains the primary, exact link.  When it points
 * to a different U-PROX entity, use only a deliberately narrow name bridge:
 * at least one non-generic part of the door name must also be present in the
 * input name.  This preserves exact matching where possible without hiding
 * the input events that belong to a door or turnstile marker.
 */
export function eventMatchesObject(event: EventTableRow, object: EventObject) {
  // A saved child-token list is an explicit U-PROX binding.  Do not fall
  // back to words in the name if an event belongs to another access point —
  // otherwise unrelated doors can inherit each other's activity.
  if (object.eventTokens !== undefined) {
    return Boolean(event.senderToken && object.eventTokens.includes(event.senderToken))
      || Boolean(object.token && event.senderToken === object.token);
  }
  if (object.token && event.senderToken && event.senderToken === object.token) return true;
  const objectWords = normalizedWords(object.name);
  const pointWords = normalizedWords(event.accessPoint);
  return objectWords.length > 0 && objectWords.some((word) => pointWords.includes(word));
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

/**
 * Terminals can emit repeated "access granted" signals while a card remains
 * at the reader. They are presentation duplicates, not separate passages.
 * Keep the most recent one within a five-second window; the actual entry/exit
 * event has a different name and is never removed.
 */
function collapseTechnicalAccessDuplicates(rows: EventTableRow[]) {
  const mostRecent = new Map<string, number>();
  return rows.filter((row) => {
    const eventName = row.eventName.toLocaleLowerCase('uk-UA');
    const isGranted = eventName.includes('дозвол') || eventName.includes('доступ надан');
    if (!isGranted) return true;

    const actor = row.employeeToken || (row.cardCode !== '—' ? row.cardCode : row.employee);
    const key = `${actor}|${row.senderToken ?? row.accessPoint}|${eventName.replace(/\s+/g, ' ').trim()}`;
    const newerOccurrence = mostRecent.get(key);
    if (newerOccurrence !== undefined && newerOccurrence - row.occurredAtMs <= 5_000) return false;
    mostRecent.set(key, row.occurredAtMs);
    return true;
  });
}

export function toEventTableRows(payload: unknown): EventTableRow[] {
  const response = payload as { Event?: UproxxEvent[] } | undefined;
  const events = response?.Event ?? [];
  const rows = [...events]
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
  return collapseTechnicalAccessDuplicates(rows);
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
