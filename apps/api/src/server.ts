import Fastify from 'fastify';
import rateLimit from '@fastify/rate-limit';
import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { z } from 'zod';

const moduleDirectory = dirname(fileURLToPath(import.meta.url));
const envFile = resolve(moduleDirectory, '../../../.env');
dotenv.config({ path: envFile });
const env = z
  .object({
    PORT: z.coerce.number().default(3001),
    MOCK_UPROX: z.enum(['true', 'false']).default('false'),
    UPROX_BASE_URL: z.string().url().optional(),
    UPROX_USERNAME: z.string().optional(),
    UPROX_PASSWORD: z.string().optional(),
    UPROX_EMPLOYEE_DIRECTORY_LIMIT: z.coerce.number().int().min(1).max(10_000).default(2_000),
    CONTROL_RATE_LIMIT_PER_MINUTE: z.coerce.number().default(12),
    PLAN_STORAGE_FILE: z.string().optional(),
  })
  .superRefine((value, context) => {
    if (
      value.MOCK_UPROX === 'false' &&
      (!value.UPROX_BASE_URL || !value.UPROX_USERNAME || !value.UPROX_PASSWORD)
    )
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: `U-PROX settings are required in ${envFile} when MOCK_UPROX=false`,
      });
  })
  .parse(process.env);
const app = Fastify({ logger: { level: process.env.LOG_LEVEL || 'info' } });
app.log.info({ mode: env.MOCK_UPROX, envFile }, 'U-PROX integration configuration loaded');
const planStorageFile = env.PLAN_STORAGE_FILE
  ? resolve(env.PLAN_STORAGE_FILE)
  : resolve(moduleDirectory, '../data/plan-elements.json');
const personnelStorageFile = resolve(dirname(planStorageFile), 'personnel-overrides.json');
await app.register(rateLimit, { global: false });
type Session = { sid: string; expiresAt: number };
let session: Session | undefined;
type EmployeeDirectory = { employees: unknown[]; expiresAt: number };
let employeeDirectory: EmployeeDirectory | undefined;
type CachedImage = { content: Buffer; contentType: string; expiresAt: number };
const images = new Map<string, CachedImage>();
const LIVE_CACHE_MS = 5_000;
const UPROX_EVENT_PAGE_SIZE = 200;
type TimedCache = { value: unknown; expiresAt: number; pending?: Promise<unknown> };
const liveControllerCache = new Map<string, TimedCache>();
type UproxxEmployee = {
  Token?: string | number;
  Name?: string;
  Post?: string;
  ImageToken?: string | number;
  PhotoToken?: string | number;
  Department?: { Name?: string };
  DepartmentName?: string;
  Email?: string;
  EmployeeNumber?: string | number;
  PersonnelNumber?: string | number;
  AccessLevel?: { Name?: string };
  AccessLevelName?: string;
};
const personnelIdentifierSchema = z.object({
  id: z.string().min(1).max(128),
  type: z.enum(['card', 'key_fob', 'bracelet', 'face', 'fingerprint']),
  value: z.string().trim().min(1).max(160),
  validUntil: z.string().max(40).default('always'),
});
// U-PROX requires uppercase hexadecimal MD5 values (0-9 and A-F).
const md5 = (s: string) => createHash('md5').update(s).digest('hex').toUpperCase();
function passwordHash(password: string) {
  return md5(md5(md5(password) + 'F593B01C562548C6B7A31B30884BDE53'));
}
async function uproxx(path: string, body: unknown) {
  if (env.MOCK_UPROX === 'true') return mockResponse(path);
  if (!env.UPROX_BASE_URL || !env.UPROX_USERNAME || !env.UPROX_PASSWORD)
    throw new Error('U-PROX credentials/base URL are not configured');
  if (!session || session.expiresAt < Date.now()) {
    const r = await fetch(new URL('/json/Authenticate', env.UPROX_BASE_URL), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        UserName: env.UPROX_USERNAME,
        PasswordHash: passwordHash(env.UPROX_PASSWORD),
      }),
    });
    if (!r.ok) throw new Error(`U-PROX Authenticate failed: HTTP ${r.status}`);
    const data = (await r.json()) as { UserSID?: string };
    if (!data.UserSID) throw new Error('U-PROX Authenticate returned no UserSID');
    session = { sid: data.UserSID, expiresAt: Date.now() + 20 * 60_000 };
  }
  const r = await fetch(new URL(`/json/${path}`, env.UPROX_BASE_URL), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ...(body as Record<string, unknown>), UserSID: session.sid }),
  });
  if (!r.ok) throw new Error(`U-PROX ${path} failed: HTTP ${r.status}`);
  return r.json();
}
function mockResponse(path: string) {
  const samples: Record<string, unknown> = {
    VersionGet: { Version: 'MOCK U-PROX 3.057.7988' },
    DoorGetList: { Door: [{ Token: 23902, Name: 'Двері 3-01' }] },
    DeviceGetList: {
      Device: [
        { Token: 23880, Name: 'Контролер 3 поверх', DeviceType: 'U‑PROX IP400', Online: true },
      ],
    },
    DeviceInputGetList: {
      DeviceInput: [
        { Token: 41001, Name: 'Геркон службового входу', DeviceToken: 23880, Number: 1 },
      ],
    },
    DeviceOutputGetList: {
      DeviceOutput: [
        { Token: 42001, Name: 'Замок службового входу', DeviceToken: 23880, WorkingMode: 0 },
      ],
    },
    EventGetListV2: { Event: [] },
    EmployeeGetList: { Employee: [] },
    DesktopLayoutGet: { Language: 'uk', UserToken: 0, EventColumns: [] },
  };
  return samples[path] ?? { Event: [] };
}
app.get('/api/health', async () => ({
  ok: true,
  mode: env.MOCK_UPROX === 'true' ? 'mock' : 'uproxx',
  uproxxBase: env.MOCK_UPROX === 'true' ? null : env.UPROX_BASE_URL,
}));

const planElementSchema = z.object({
  id: z.string().min(1).max(128),
  type: z.enum(['door', 'device', 'input', 'label']),
  token: z.string().max(128).optional(),
  name: z.string().min(1).max(300),
  detail: z.string().max(300).nullable().optional(),
  deviceToken: z.string().max(128).nullable().optional(),
  x: z.number().finite().min(0).max(100),
  y: z.number().finite().min(0).max(100),
});
const planFloorParams = z.object({ floor: z.string().trim().min(1).max(80) });
const planElementsBody = z.object({ elements: z.array(planElementSchema).max(2_000) });
type SharedPlanElement = z.infer<typeof planElementSchema>;
type SharedPlanElements = Record<string, SharedPlanElement[]>;
let sharedPlanElements: SharedPlanElements = {};
let loadSharedPlanElements: Promise<void> | undefined;
let sharedPlanWrite = Promise.resolve();

async function ensureSharedPlanElementsLoaded() {
  if (!loadSharedPlanElements) {
    loadSharedPlanElements = (async () => {
      try {
        const source = await readFile(planStorageFile, 'utf8');
        const parsed = z.record(z.string(), z.array(planElementSchema)).safeParse(JSON.parse(source));
        if (!parsed.success) {
          app.log.warn({ planStorageFile }, 'Plan storage has an invalid format; starting with an empty plan');
          return;
        }
        sharedPlanElements = parsed.data;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      }
    })();
  }
  await loadSharedPlanElements;
}

async function persistSharedPlanElements() {
  const directory = dirname(planStorageFile);
  sharedPlanWrite = sharedPlanWrite.catch(() => undefined).then(async () => {
    await mkdir(directory, { recursive: true });
    const temporaryFile = `${planStorageFile}.tmp`;
    await writeFile(temporaryFile, JSON.stringify(sharedPlanElements, null, 2), 'utf8');
    await rename(temporaryFile, planStorageFile);
  });
  await sharedPlanWrite;
}

app.get('/api/plan/elements/:floor', async (request) => {
  const { floor } = planFloorParams.parse(request.params);
  await ensureSharedPlanElementsLoaded();
  return { floor, elements: sharedPlanElements[floor] ?? [] };
});

app.put('/api/plan/elements/:floor', async (request) => {
  const { floor } = planFloorParams.parse(request.params);
  const { elements } = planElementsBody.parse(request.body);
  await ensureSharedPlanElementsLoaded();
  sharedPlanElements[floor] = elements;
  await persistSharedPlanElements();
  return { floor, elements };
});

const personnelRecordSchema = z.object({
  token: z.string().min(1).max(128),
  name: z.string().trim().min(2).max(300),
  department: z.string().trim().min(1).max(200),
  position: z.string().trim().max(200).default(''),
  identifier: z.string().trim().max(160).default(''),
  photoToken: z.string().max(128).optional(),
  photoData: z.string().regex(/^data:image\/(?:png|jpe?g|webp);base64,/).max(2_800_000).nullable().optional(),
  employeeNumber: z.string().trim().max(80).default(''),
  email: z.string().trim().email().or(z.literal('')).default(''),
  accessLevel: z.string().trim().max(200).default('inherit'),
  identifiers: z.array(personnelIdentifierSchema).max(30).default([]),
  active: z.boolean().default(true),
  local: z.boolean().default(false),
  deleted: z.boolean().default(false),
});
const personnelBody = personnelRecordSchema.omit({ token: true, local: true, deleted: true });
type PersonnelRecord = z.infer<typeof personnelRecordSchema>;
let personnelOverrides: Record<string, PersonnelRecord> = {};
let loadPersonnelOverrides: Promise<void> | undefined;
let personnelWrite = Promise.resolve();

async function ensurePersonnelOverridesLoaded() {
  if (!loadPersonnelOverrides) {
    loadPersonnelOverrides = (async () => {
      try {
        const source = await readFile(personnelStorageFile, 'utf8');
        const parsed = z.record(z.string(), personnelRecordSchema).safeParse(JSON.parse(source));
        if (parsed.success) personnelOverrides = parsed.data;
        else app.log.warn({ personnelStorageFile }, 'Personnel storage has an invalid format; starting with an empty list');
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      }
    })();
  }
  await loadPersonnelOverrides;
}

async function persistPersonnelOverrides() {
  personnelWrite = personnelWrite.catch(() => undefined).then(async () => {
    await mkdir(dirname(personnelStorageFile), { recursive: true });
    const temporaryFile = `${personnelStorageFile}.tmp`;
    await writeFile(temporaryFile, JSON.stringify(personnelOverrides, null, 2), 'utf8');
    await rename(temporaryFile, personnelStorageFile);
  });
  await personnelWrite;
}

function employeeToPersonnel(employee: UproxxEmployee): PersonnelRecord | undefined {
  if (employee.Token === undefined) return undefined;
  return {
    token: String(employee.Token),
    name: employee.Name?.trim() || `Працівник ${employee.Token}`,
    department: employee.Department?.Name || employee.DepartmentName || 'Без відділу',
    position: employee.Post || '',
    identifier: '',
    photoToken: employee.PhotoToken === undefined && employee.ImageToken === undefined ? undefined : String(employee.PhotoToken ?? employee.ImageToken),
    employeeNumber: employee.EmployeeNumber === undefined && employee.PersonnelNumber === undefined ? '' : String(employee.EmployeeNumber ?? employee.PersonnelNumber),
    email: employee.Email || '',
    accessLevel: employee.AccessLevel?.Name || employee.AccessLevelName || 'inherit',
    identifiers: [],
    active: true,
    local: false,
    deleted: false,
  };
}

async function listPersonnel() {
  await ensurePersonnelOverridesLoaded();
  const merged = new Map<string, PersonnelRecord>();
  for (const employee of (await getEmployeeDirectory()) as UproxxEmployee[]) {
    const record = employeeToPersonnel(employee);
    if (record) merged.set(record.token, { ...record, ...personnelOverrides[record.token], local: false });
  }
  Object.values(personnelOverrides).forEach((record) => {
    if (record.local) merged.set(record.token, record);
  });
  const personnel = [...merged.values()]
    .filter((record) => !record.deleted)
    .map((record) => record.identifiers.length || !record.identifier
      ? record
      : { ...record, identifiers: [{ id: `legacy-${record.token}`, type: 'card' as const, value: record.identifier, validUntil: 'always' }] })
    .sort((left, right) => left.name.localeCompare(right.name, 'uk-UA'));
  const departments = [...new Set(personnel.map((record) => record.department))].sort((left, right) => left.localeCompare(right, 'uk-UA'));
  return { personnel, departments };
}

app.get('/api/personnel', async () => listPersonnel());

app.post('/api/personnel', async (request, reply) => {
  const input = personnelBody.parse(request.body);
  await ensurePersonnelOverridesLoaded();
  const token = `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const record: PersonnelRecord = { ...input, token, local: true, deleted: false };
  personnelOverrides[token] = record;
  await persistPersonnelOverrides();
  return reply.code(201).send(record);
});

app.put('/api/personnel/:token', async (request, reply) => {
  const { token } = z.object({ token: z.string().min(1).max(128) }).parse(request.params);
  const input = personnelBody.parse(request.body);
  const current = (await listPersonnel()).personnel.find((record) => record.token === token);
  if (!current) return reply.code(404).send({ error: 'Працівника не знайдено' });
  const record: PersonnelRecord = { ...current, ...input, token };
  personnelOverrides[token] = record;
  await persistPersonnelOverrides();
  return record;
});

app.delete('/api/personnel/:token', async (request, reply) => {
  const { token } = z.object({ token: z.string().min(1).max(128) }).parse(request.params);
  const current = (await listPersonnel()).personnel.find((record) => record.token === token);
  if (!current) return reply.code(404).send({ error: 'Працівника не знайдено' });
  personnelOverrides[token] = { ...current, deleted: true };
  await persistPersonnelOverrides();
  return reply.code(204).send();
});

type UproxxCatalogRecord = Record<string, unknown>;
type PlanCatalogItem = {
  token: string;
  name: string;
  model: string | null;
  online: boolean | null;
  deviceToken: string | null;
  inputNumber: string | null;
};

function records(value: unknown, property: string) {
  const response = value as Record<string, unknown>;
  const list = response[property];
  return Array.isArray(list) ? (list as UproxxCatalogRecord[]) : [];
}

function catalogItem(record: UproxxCatalogRecord): PlanCatalogItem {
  const token = record.Token ?? record.DeviceToken ?? record.ID ?? record.Id;
  const name =
    record.Name ?? record.Description ?? record.Caption ?? `Об’єкт ${token ?? 'без токена'}`;
  const model = record.Model ?? record.DeviceModel ?? record.DeviceType ?? record.Type;
  const deviceToken = record.DeviceToken ?? record.ParentToken;
  const inputNumber = record.Number ?? record.InputNumber ?? record.Index;
  return {
    token: String(token ?? ''),
    name: String(name),
    model: model === undefined || model === null ? null : String(model),
    online: typeof record.Online === 'boolean' ? record.Online : null,
    deviceToken: deviceToken === undefined || deviceToken === null ? null : String(deviceToken),
    inputNumber: inputNumber === undefined || inputNumber === null ? null : String(inputNumber),
  };
}

app.get('/api/plan/catalog', async () => {
  const listBody = { Language: 'uk', Limit: 2_000, StartToken: 0 };
  const [doorResult, deviceResult, inputResult] = await Promise.allSettled([
    uproxx('DoorGetList', listBody),
    uproxx('DeviceGetList', listBody),
    uproxx('DeviceInputGetList', listBody),
  ]);
  const unavailable = (result: PromiseSettledResult<unknown>, label: string) =>
    result.status === 'rejected'
      ? `${label}: ${result.reason instanceof Error ? result.reason.message : 'недоступно'}`
      : null;

  return {
    doors:
      doorResult.status === 'fulfilled' ? records(doorResult.value, 'Door').map(catalogItem) : [],
    devices:
      deviceResult.status === 'fulfilled'
        ? records(deviceResult.value, 'Device').map(catalogItem)
        : [],
    inputs:
      inputResult.status === 'fulfilled'
        ? records(inputResult.value, 'DeviceInput').map(catalogItem)
        : [],
    warnings: [
      unavailable(doorResult, 'DoorGetList'),
      unavailable(deviceResult, 'DeviceGetList'),
      unavailable(inputResult, 'DeviceInputGetList'),
    ].filter((warning): warning is string => Boolean(warning)),
  };
});

const liveControllerParams = z.object({ token: z.coerce.number().int().positive() });

type LiveSignal = {
  token: string;
  name: string;
  deviceToken: string | null;
  hardwareState: number | null;
  healthStatus: number | null;
  usage: number | null;
  workingMode?: number | null;
  connectedTo: { token: string; name: string } | null;
};

function numberOrNull(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function liveSignal(record: UproxxCatalogRecord, isOutput = false): LiveSignal {
  const connectedTo = record.ConnectedTo as UproxxCatalogRecord | null | undefined;
  return {
    token: String(record.Token ?? ''),
    name: String(record.Name ?? record.Caption ?? 'Без назви'),
    deviceToken: record.DeviceToken === undefined || record.DeviceToken === null ? null : String(record.DeviceToken),
    hardwareState: numberOrNull(record.HardwareState),
    healthStatus: numberOrNull(record.HealthStatus),
    usage: numberOrNull(record.Usage),
    ...(isOutput ? { workingMode: numberOrNull(record.WorkingMode) } : {}),
    connectedTo: connectedTo?.Token === undefined
      ? null
      : { token: String(connectedTo.Token), name: String(connectedTo.Name ?? 'Без назви') },
  };
}

async function fetchLiveController(token: number) {
  const listBody = {
    Language: 'uk',
    SubscriptionEnabled: true,
    Limit: 2_000,
    StartToken: 0,
    DeviceToken: token,
  };
  const [devicesResult, inputsResult, outputsResult] = await Promise.allSettled([
    uproxx('DeviceGetList', { Language: 'uk', Limit: 2_000, StartToken: 0 }),
    uproxx('DeviceInputGetList', listBody),
    uproxx('DeviceOutputGetList', listBody),
  ]);
  const warning = (result: PromiseSettledResult<unknown>, label: string) =>
    result.status === 'rejected'
      ? `${label}: ${result.reason instanceof Error ? result.reason.message : 'недоступно'}`
      : null;
  const controller = devicesResult.status === 'fulfilled'
    ? records(devicesResult.value, 'Device').find((device) => String(device.Token) === String(token))
    : undefined;
  const inputs = inputsResult.status === 'fulfilled'
    ? records(inputsResult.value, 'DeviceInput').map((item) => liveSignal(item))
    : [];
  const outputs = outputsResult.status === 'fulfilled'
    ? records(outputsResult.value, 'DeviceOutput').map((item) => liveSignal(item, true))
    : [];
  return {
    controller: controller
      ? {
          token: String(controller.Token ?? token),
          name: String(controller.Name ?? 'Без назви'),
          online: typeof controller.Online === 'boolean' ? controller.Online : null,
          hardwareState: numberOrNull(controller.HardwareState),
          healthStatus: numberOrNull(controller.HealthStatus),
        }
      : null,
    inputs,
    outputs,
    warnings: [
      warning(devicesResult, 'DeviceGetList'),
      warning(inputsResult, 'DeviceInputGetList'),
      warning(outputsResult, 'DeviceOutputGetList'),
    ].filter((message): message is string => Boolean(message)),
  };
}

async function getLiveController(token: number) {
  const key = String(token);
  const cached = liveControllerCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  if (cached?.pending) return cached.pending;
  const pending = fetchLiveController(token);
  liveControllerCache.set(key, { value: cached?.value, expiresAt: 0, pending });
  try {
    const value = await pending;
    liveControllerCache.set(key, { value, expiresAt: Date.now() + LIVE_CACHE_MS });
    return value;
  } catch (error) {
    liveControllerCache.delete(key);
    throw error;
  }
}

app.get('/api/plan/live/:token', async (request, reply) => {
  const parsed = liveControllerParams.safeParse(request.params);
  if (!parsed.success) return reply.code(400).send({ error: 'Invalid controller token' });
  return getLiveController(parsed.data.token);
});
const eventsQuery = z.object({
  limit: z.coerce.number().int().min(1).max(10_000).default(50),
  hours: z.coerce.number().int().min(1).max(168).default(24),
  from: z.coerce.number().int().positive().optional(),
  to: z.coerce.number().int().positive().optional(),
}).superRefine((value, context) => {
  if ((value.from === undefined) !== (value.to === undefined)) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: 'Both from and to are required for a custom event range' });
  }
  if (value.from !== undefined && value.to !== undefined && value.from > value.to) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: 'The event range start must be before its end' });
  }
});

function issuedMilliseconds(value: unknown) {
  return Number(typeof value === 'string' ? (value.match(/\d+/)?.[0] ?? 0) : 0);
}

type EventRecord = Record<string, unknown>;
type EventsSnapshot = Record<string, unknown> & { Event: EventRecord[]; NextToken?: string | number };
type EventRange = { events: EventRecord[]; refreshedAt: number; expiresAt: number; pending?: Promise<EventRecord[]> };
const eventRangeCache = new Map<string, EventRange>();

function eventKey(event: EventRecord) {
  if (event.Token !== undefined && event.Token !== null) return `token:${event.Token}`;
  const sender = event.Sender as { Token?: string | number } | undefined;
  const message = event.Message as { Code?: string | number; Name?: string } | undefined;
  return `fallback:${event.Issued ?? ''}:${sender?.Token ?? ''}:${message?.Code ?? message?.Name ?? ''}:${event.CardCode ?? ''}`;
}

async function getEmployeeDirectory() {
  if (employeeDirectory && employeeDirectory.expiresAt > Date.now()) {
    return employeeDirectory.employees;
  }

  try {
    const response = (await uproxx('EmployeeGetList', {
      Language: 'uk',
      SubscriptionEnabled: false,
      Limit: env.UPROX_EMPLOYEE_DIRECTORY_LIMIT,
      StartToken: 0,
      AdditionalFieldsRequired: true,
      DepartmentUsed: false,
      HideDismissed: true,
    })) as { Employee?: unknown[] };

    employeeDirectory = {
      employees: response.Employee ?? [],
      expiresAt: Date.now() + 10 * 60_000,
    };
    return employeeDirectory.employees;
  } catch (error) {
    app.log.warn({ error }, 'Unable to load U-PROX employee directory');
    return employeeDirectory?.employees ?? [];
  }
}

async function enrichEvents(events: EventRecord[]) {
  const employeesByToken = new Map(
    ((await getEmployeeDirectory()) as UproxxEmployee[]).flatMap((employee) =>
      employee.Token === undefined ? [] : [[String(employee.Token), employee] as const],
    ),
  );
  return events.map((event) => {
    const user = event.User as { Token?: string | number } | undefined;
    const employee = user?.Token === undefined ? undefined : employeesByToken.get(String(user.Token));
    return employee ? { ...event, Employee: employee } : event;
  });
}

function nextEventToken(response: EventsSnapshot) {
  const token = response.NextToken;
  return token === undefined || token === null || token === '' || token === 0 || token === '0'
    ? undefined
    : String(token);
}

/**
 * Reads the selected period directly from U-PROX in pages. Nothing from the
 * journal is written to our disk; the brief cache below only coalesces equal
 * requests from open screens during a few seconds.
 */
async function fetchEventsFromUproxx(from: number, to: number, limit: number) {
  let startToken = '0';
  const seenTokens = new Set<string>();
  const collected = new Map<string, EventRecord>();
  let pages = 0;
  while (pages < 500 && !seenTokens.has(startToken)) {
    seenTokens.add(startToken);
    const response = (await uproxx('EventGetList', {
      Limit: -UPROX_EVENT_PAGE_SIZE,
      StartToken: Number(startToken),
    })) as Record<string, unknown> & { Event?: EventRecord[]; NextToken?: string | number };
    const events = await enrichEvents(response.Event ?? []);
    if (!events.length) break;
    events.forEach((event) => collected.set(eventKey(event), event));
    pages += 1;
    const oldest = Math.min(...events.map((event) => issuedMilliseconds(event.Issued)).filter(Boolean));
    const nextToken = nextEventToken(response as EventsSnapshot);
    if (!nextToken || oldest <= from || collected.size >= limit) break;
    startToken = nextToken;
  }
  const events = [...collected.values()]
    .filter((event) => {
      const issued = issuedMilliseconds(event.Issued);
      return issued >= from && issued <= to;
    })
    .sort((left, right) => issuedMilliseconds(right.Issued) - issuedMilliseconds(left.Issued))
    .slice(0, limit);
  app.log.debug({ from, to, limit, pages, events: events.length }, 'U-PROX event range loaded');
  return events;
}

async function getEventsRange(from: number, to: number, limit: number) {
  const key = `${from}:${to}:${limit}`;
  const existing = eventRangeCache.get(key);
  if (existing?.expiresAt && existing.expiresAt > Date.now()) return existing;
  if (existing?.pending) {
    const events = await existing.pending;
    return { events, refreshedAt: existing.refreshedAt, expiresAt: existing.expiresAt };
  }
  const range: EventRange = { events: existing?.events ?? [], refreshedAt: existing?.refreshedAt ?? 0, expiresAt: 0 };
  range.pending = fetchEventsFromUproxx(from, to, limit);
  eventRangeCache.set(key, range);
  try {
    const events = await range.pending;
    range.events = events;
    range.refreshedAt = Date.now();
    range.expiresAt = range.refreshedAt + LIVE_CACHE_MS;
    range.pending = undefined;
    if (eventRangeCache.size > 12) {
      for (const [cacheKey, value] of eventRangeCache) {
        if (value.expiresAt <= Date.now()) eventRangeCache.delete(cacheKey);
      }
    }
    return range;
  } catch (error) {
    eventRangeCache.delete(key);
    throw error;
  }
}

function imageContentType(content: Buffer) {
  if (content.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))) return 'image/jpeg';
  if (content.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])))
    return 'image/png';
  if (content.subarray(0, 4).toString('ascii') === 'GIF8') return 'image/gif';
  return 'application/octet-stream';
}

async function getImage(imageToken: string) {
  const cached = images.get(imageToken);
  if (cached && cached.expiresAt > Date.now()) return cached;

  if (images.size >= 2_000) {
    for (const [token, image] of images) {
      if (image.expiresAt <= Date.now()) images.delete(token);
    }
  }

  const response = (await uproxx('ImageGet', {
    Language: 'uk',
    ImageToken: Number(imageToken),
  })) as { ImageBase64?: string };
  const encodedImage = response.ImageBase64?.replace(/^data:[^;]+;base64,/, '');
  if (!encodedImage) return undefined;

  const content = Buffer.from(encodedImage, 'base64');
  if (content.length === 0) return undefined;
  const image = {
    content,
    contentType: imageContentType(content),
    expiresAt: Date.now() + 60 * 60_000,
  };
  if (images.size < 2_000) images.set(imageToken, image);
  return image;
}

app.get('/api/events', async (request) => {
  const { limit, hours, from: requestedFrom, to: requestedTo } = eventsQuery.parse(request.query);
  const to = requestedTo ?? Date.now();
  const from = requestedFrom ?? to - hours * 60 * 60_000;
  const range = await getEventsRange(from, to, limit);
  return {
    Event: range.events,
    refreshedAt: range.refreshedAt,
  };
});

app.get('/api/images/:token', async (request, reply) => {
  const parsed = z
    .string()
    .regex(/^\d+$/)
    .safeParse((request.params as { token?: string }).token);
  if (!parsed.success) return reply.code(400).send({ error: 'Invalid image token' });

  const image = await getImage(parsed.data);
  if (!image) return reply.code(404).send({ error: 'Image was not found' });
  return reply
    .header('Cache-Control', 'private, max-age=3600')
    .type(image.contentType)
    .send(image.content);
});
const probes = {
  version: { path: 'VersionGet', body: {} },
  doors: { path: 'DoorGetList', body: { Language: 'uk', Limit: 100, StartToken: 0 } },
  devices: { path: 'DeviceGetList', body: { Language: 'uk', Limit: 100, StartToken: 0 } },
  events: {
    path: 'EventGetListV2',
    body: { Language: 'uk', SubscriptionEnabled: false, Limit: 10, StartToken: 0 },
  },
  desktopLayout: { path: 'DesktopLayoutGet', body: { Language: 'uk' } },
} as const;
app.get('/api/integration/test/:probe', async (req, reply) => {
  const probe = (req.params as { probe: string }).probe as keyof typeof probes;
  const test = probes[probe];
  if (!test) return reply.code(404).send({ error: 'Unknown probe' });
  const started = Date.now();
  const result = await uproxx(test.path, test.body);
  return {
    ok: true,
    probe,
    endpoint: `/json/${test.path}`,
    durationMs: Date.now() - started,
    result,
  };
});
app.get('/api/integration/test', async () => {
  const entries = await Promise.all(
    Object.entries(probes).map(async ([probe, test]) => {
      const started = Date.now();
      try {
        return {
          probe,
          endpoint: `/json/${test.path}`,
          ok: true,
          durationMs: Date.now() - started,
          result: await uproxx(test.path, test.body),
        };
      } catch (error) {
        return {
          probe,
          endpoint: `/json/${test.path}`,
          ok: false,
          durationMs: Date.now() - started,
          error: error instanceof Error ? error.message : 'Unknown error',
        };
      }
    }),
  );
  return { mode: env.MOCK_UPROX === 'true' ? 'mock' : 'uproxx', tests: entries };
});
const action = z.object({ doorToken: z.union([z.string(), z.number()]) });
app.post(
  '/api/actions/:kind',
  { config: { rateLimit: { max: env.CONTROL_RATE_LIMIT_PER_MINUTE, timeWindow: '1 minute' } } },
  async (req, reply) => {
    const parsed = action.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'Invalid doorToken' });
    const kind = (req.params as { kind: string }).kind;
    // Request shape for control endpoints must be confirmed against the installed U-PROX build before enabling.
    if (env.MOCK_UPROX === 'true')
      return { ok: true, mock: true, action: kind, target: parsed.data.doorToken };
    return reply.code(501).send({
      error:
        'Control endpoints intentionally disabled until DoorAccess request contract is verified for this U-PROX version.',
    });
  },
);
app.setErrorHandler((err, _req, reply) => {
  app.log.error({ err }, 'request failed');
  reply.code(502).send({ error: 'U-PROX integration request failed' });
});

await app.listen({ port: env.PORT, host: '0.0.0.0' });
