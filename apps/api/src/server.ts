import Fastify from 'fastify';
import rateLimit from '@fastify/rate-limit';
import { createHash } from 'node:crypto';
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
    CONTROL_RATE_LIMIT_PER_MINUTE: z.coerce.number().default(12),
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
await app.register(rateLimit, { global: false });
type Session = { sid: string; expiresAt: number };
let session: Session | undefined;
type EmployeeDirectory = { employees: unknown[]; expiresAt: number };
let employeeDirectory: EmployeeDirectory | undefined;
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
    DeviceGetList: { Device: [{ Token: 23880, Name: 'Контролер 3 поверх', Online: true }] },
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
const eventsQuery = z.object({
  limit: z.coerce.number().int().min(1).max(500).default(100),
  hours: z.coerce.number().int().min(1).max(168).default(24),
});

function issuedMilliseconds(value: unknown) {
  return Number(typeof value === 'string' ? (value.match(/\d+/)?.[0] ?? 0) : 0);
}

async function getEmployeeDirectory() {
  if (employeeDirectory && employeeDirectory.expiresAt > Date.now()) {
    return employeeDirectory.employees;
  }

  try {
    const response = (await uproxx('EmployeeGetList', {
      Language: 'uk',
      SubscriptionEnabled: false,
      Limit: 0,
      StartToken: 0,
      AdditionalFieldsRequired: false,
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

app.get('/api/events', async (request) => {
  const { limit, hours } = eventsQuery.parse(request.query);
  // The installed U-PROX accepts this minimal documented EventGetList request.
  // Negative Limit returns newest events first.
  const response = (await uproxx('EventGetList', {
    // A negative limit asks U-PROX for the newest events first.
    Limit: -Math.max(limit, 500),
    StartToken: 0,
  })) as Record<string, unknown> & { Event?: Array<Record<string, unknown>> };
  const fromMilliseconds = Date.now() - hours * 60 * 60_000;
  const events = (response.Event ?? [])
    .filter((event) => issuedMilliseconds(event.Issued) >= fromMilliseconds)
    .slice(0, limit);
  const employees = await getEmployeeDirectory();
  return { ...response, Event: events, Employee: employees };
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
