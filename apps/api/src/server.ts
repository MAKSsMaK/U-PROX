import Fastify from 'fastify';
import DigestFetch from 'digest-fetch';
import { XMLParser } from 'fast-xml-parser';
import rateLimit from '@fastify/rate-limit';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import PDFDocument from 'pdfkit';
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
    HIKVISION_NVR_HOST: z.string().trim().optional(),
    HIKVISION_NVR_USERNAME: z.string().trim().optional(),
    HIKVISION_NVR_PASSWORD: z.string().optional(),
    HIKVISION_CAMERA_TEST_CHANNEL: z.coerce.number().int().min(1).max(99).default(6),
    HIKVISION_FFMPEG_PATH: z.string().trim().default('ffmpeg'),
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
const cameraPreviewFile = resolve(dirname(planStorageFile), 'camera-preview.jpg');
const reportFontFile = resolve(moduleDirectory, '../assets/NotoSans-Regular.ttf');
await app.register(rateLimit, { global: false });
type Session = { sid: string; expiresAt: number };
let session: Session | undefined;
let authenticationPending: Promise<Session> | undefined;
type EmployeeDirectory = { employees: unknown[]; expiresAt: number };
let employeeDirectory: EmployeeDirectory | undefined;
type CachedImage = { content: Buffer; contentType: string; expiresAt: number };
const images = new Map<string, CachedImage>();
const IMAGE_CACHE_MAX_BYTES = 32 * 1024 * 1024;
let imageCacheBytes = 0;
const LIVE_CACHE_MS = 5_000;
const UPROX_EVENT_PAGE_SIZE = 200;
const UPROX_REPORT_MAX_EVENTS = 100_000;
let cameraPreviewPending: Promise<void> | undefined;
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
    if (!authenticationPending) {
      authenticationPending = (async () => {
        const r = await fetch(new URL('/json/Authenticate', env.UPROX_BASE_URL!), {
          method: 'POST', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ UserName: env.UPROX_USERNAME, PasswordHash: passwordHash(env.UPROX_PASSWORD!) }),
          signal: AbortSignal.timeout(15_000),
        });
        if (!r.ok) throw new Error(`U-PROX Authenticate failed: HTTP ${r.status}`);
        const data = (await r.json()) as { UserSID?: string };
        if (!data.UserSID) throw new Error('U-PROX Authenticate returned no UserSID');
        return { sid: data.UserSID, expiresAt: Date.now() + 20 * 60_000 };
      })().finally(() => { authenticationPending = undefined; });
    }
    session = await authenticationPending;
  }
  const r = await fetch(new URL(`/json/${path}`, env.UPROX_BASE_URL), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ...(body as Record<string, unknown>), UserSID: session.sid }),
    signal: AbortSignal.timeout(30_000),
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

function cameraConfigured() {
  return Boolean(env.HIKVISION_NVR_HOST && env.HIKVISION_NVR_USERNAME && env.HIKVISION_NVR_PASSWORD);
}

function cameraRtspUrl(channel = env.HIKVISION_CAMERA_TEST_CHANNEL, stream = 2) {
  if (!cameraConfigured()) throw new Error('Camera integration is not configured');
  const username = encodeURIComponent(env.HIKVISION_NVR_USERNAME!);
  const password = encodeURIComponent(env.HIKVISION_NVR_PASSWORD!);
  return `rtsp://${username}:${password}@${env.HIKVISION_NVR_HOST}:554/Streaming/Channels/${channel * 100 + stream}`;
}

async function createCameraPreview() {
  if (cameraPreviewPending) return cameraPreviewPending;
  cameraPreviewPending = new Promise<void>((resolvePreview, rejectPreview) => {
    const outputFile = `${cameraPreviewFile}.tmp`;
    const child = spawn(env.HIKVISION_FFMPEG_PATH, [
      '-hide_banner', '-loglevel', 'error', '-nostdin', '-rtsp_transport', 'tcp',
      '-i', cameraRtspUrl(), '-frames:v', '1', '-q:v', '3', '-y', outputFile,
    ], { stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    child.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString(); });
    const timeout = setTimeout(() => child.kill('SIGKILL'), 15_000);
    child.once('error', (error) => { clearTimeout(timeout); rejectPreview(error); });
    child.once('close', async (code) => {
      clearTimeout(timeout);
      if (code !== 0) return rejectPreview(new Error(stderr.trim() || 'Unable to receive a frame from the camera'));
      try {
        await mkdir(dirname(cameraPreviewFile), { recursive: true });
        await rename(outputFile, cameraPreviewFile);
        resolvePreview();
      } catch (error) { rejectPreview(error); }
    });
  }).finally(() => { cameraPreviewPending = undefined; });
  return cameraPreviewPending;
}

type CameraChannel = { id: string; name: string; channel: number };
let cameraChannels: CameraChannel[] = [];
app.get('/api/cameras', async (_request, reply) => {
  if (!cameraConfigured()) return { configured: false, cameras: [] };
  try {
    const client = new DigestFetch(env.HIKVISION_NVR_USERNAME!, env.HIKVISION_NVR_PASSWORD!);
    const response = await client.fetch(`http://${env.HIKVISION_NVR_HOST}/ISAPI/ContentMgmt/InputProxy/channels`, { signal: AbortSignal.timeout(10000) });
    if (!response.ok) throw new Error(`ISAPI HTTP ${response.status}`);
    const parsed = new XMLParser({ removeNSPrefix: true }).parse(await response.text());
    const raw = parsed.InputProxyChannelList?.InputProxyChannel;
    if (!raw) throw new Error('ISAPI did not return camera channels');
    const list = Array.isArray(raw) ? raw : [raw];
    cameraChannels = list.map((item: Record<string, unknown>) => ({
      id: `D${Number(item.id)}`, channel: Number(item.id),
      name: String(item.name || `Камера D${item.id}`),
    })).filter((item: CameraChannel) => Number.isInteger(item.channel) && item.channel > 0 && item.channel <= 999);
    return { configured: true, cameras: cameraChannels };
  } catch (error) {
    app.log.warn({ message: error instanceof Error ? error.message : 'ISAPI error' }, 'Camera list unavailable');
    return reply.code(502).send({ error: 'Не вдалося отримати список камер із реєстратора. Перевірте доступ ISAPI та облікові дані.' });
  }
});

app.get('/api/cameras/diagnostics', async (_request, reply) => {
  if (!cameraConfigured()) return reply.code(409).send({ error: 'Реєстратор не налаштовано.' });
  const client = new DigestFetch(env.HIKVISION_NVR_USERNAME!, env.HIKVISION_NVR_PASSWORD!);
  const paths = ['/ISAPI/Streaming/channels', '/ISAPI/System/Network/ports'];
  const results = await Promise.all(paths.map(async (path) => {
    try {
      const response = await client.fetch(`http://${env.HIKVISION_NVR_HOST}${path}`, { signal: AbortSignal.timeout(10000) });
      if (!response.ok) return { endpoint: path, status: response.status };
      const document = new XMLParser({ removeNSPrefix: true }).parse(await response.text());
      if (path.includes('Streaming')) {
        const raw = document.StreamingChannelList?.StreamingChannel;
        const channels = raw ? (Array.isArray(raw) ? raw : [raw]) : [];
        return { endpoint: path, status: response.status, channels: channels.map((item: Record<string, any>) => ({ id: item.id, name: item.channelName, enabled: item.enabled, video: item.Video ? { codec: item.Video.videoCodecType, width: item.Video.videoResolutionWidth, height: item.Video.videoResolutionHeight } : undefined })) };
      }
      const raw = document.AdminAccessProtocolList?.AdminAccessProtocol;
      const ports = raw ? (Array.isArray(raw) ? raw : [raw]) : [];
      return { endpoint: path, status: response.status, ports: ports.map((item: Record<string, unknown>) => ({ protocol: item.id, port: item.portNo, enabled: item.enabled })) };
    } catch { return { endpoint: path, error: 'Запит не вдався' }; }
  }));
  return { results };
});

function cameraFailure(stderr: string, spawnFailed = false) {
  if (spawnFailed) return 'FFmpeg не знайдено на сервері. Перевірте HIKVISION_FFMPEG_PATH.';
  if (/401|unauthorized/i.test(stderr)) return 'RTSP відхилив облікові дані або доступ до камери.';
  if (/404|not found/i.test(stderr)) return 'Не вдалося відкрити RTSP-потік (404). Перевірте діагностику каналу.';
  if (/timed out|timeout|connection refused|no route/i.test(stderr)) return 'Немає з’єднання з RTSP реєстратора на порті 554.';
  return 'Не вдалося отримати кадр із RTSP. Перевірте, чи камера онлайн і чи ввімкнений підпотік.';
}

app.get('/api/cameras/:channel/diagnostics', async (request, reply) => {
  const { channel } = z.object({ channel: z.coerce.number().int().min(1).max(999) }).parse(request.params);
  if (!cameraConfigured()) return reply.code(409).send({ error: 'Реєстратор не налаштовано.' });
  const check = (stream: number) => new Promise<{ stream: number; result: string; detail: string }>((resolve) => {
    const child = spawn(env.HIKVISION_FFMPEG_PATH, ['-hide_banner', '-loglevel', 'error', '-nostdin', '-rtsp_transport', 'tcp', '-i', cameraRtspUrl(channel, stream), '-frames:v', '1', '-f', 'null', '-'], { stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    child.stderr.on('data', (chunk: Buffer) => { stderr = (stderr + chunk.toString()).slice(-4000); });
    let done = false;
    const finish = (result: string, detail: string) => { if (done) return; done = true; clearTimeout(timer); resolve({ stream, result, detail }); };
    const timer = setTimeout(() => { child.kill(); finish('timeout', 'Перевищено час очікування.'); }, 15000);
    child.once('error', () => finish('error', 'Не вдалося запустити FFmpeg.'));
    child.once('close', (code) => {
      const cleaned = stderr.replace(/rtsp:\/\/[^\s'"\]]+/gi, '[RTSP URL]')
        .replaceAll(env.HIKVISION_NVR_PASSWORD!, '[приховано]')
        .replaceAll(encodeURIComponent(env.HIKVISION_NVR_PASSWORD!), '[приховано]')
        .replaceAll(env.HIKVISION_NVR_USERNAME!, '[користувач]');
      finish(code === 0 ? 'ok' : 'error', cleaned.slice(-1200));
    });
  });
  const substream = await check(2);
  const main = await check(1);
  return { channel, substream, main };
});

let activeCameraStreams = 0;
const maxCameraStreams = 4;

app.get('/api/cameras/:channel/live', async (request, reply) => {
  const { channel } = z.object({ channel: z.coerce.number().int().min(1).max(999) }).parse(request.params);
  if (!cameraConfigured() || !cameraChannels.some((camera) => camera.channel === channel)) return reply.code(404).send({ error: 'Камеру не знайдено' });
  if (activeCameraStreams >= maxCameraStreams) return reply.code(503).send({ error: 'Забагато одночасних відеопотоків. Закрийте зайві перегляди та спробуйте ще раз.' });
  const startStream = async (stream: number) => {
    activeCameraStreams += 1;
    const child = spawn(env.HIKVISION_FFMPEG_PATH, ['-hide_banner', '-loglevel', 'error', '-nostdin', '-rtsp_transport', 'tcp', '-i', cameraRtspUrl(channel, stream), '-threads', '2', '-an', '-vf', 'fps=5,scale=640:-2', '-q:v', '7', '-f', 'mpjpeg', 'pipe:1'], { stdio: ['ignore', 'pipe', 'pipe'] });
    let released = false;
    const release = () => { if (!released) { released = true; activeCameraStreams -= 1; } };
    child.once('close', release);
    child.once('error', release);
    let stderr = '';
    child.stderr.on('data', (chunk: Buffer) => { stderr = (stderr + chunk.toString()).slice(-4000); });
    const result = await new Promise<{ chunk?: Buffer; error?: string; missing?: boolean }>((resolve) => {
      let settled = false;
      const finish = (value: { chunk?: Buffer; error?: string; missing?: boolean }) => { if (settled) return; settled = true; clearTimeout(timer); resolve(value); };
      const timer = setTimeout(() => { child.kill(); finish({ error: 'Камера не відповіла вчасно. Перевірте RTSP і доступність камери.' }); }, 15000);
      child.stdout.once('data', (chunk: Buffer) => { child.stdout.pause(); finish({ chunk }); });
      child.once('error', () => finish({ error: cameraFailure(stderr, true) }));
      child.once('close', () => finish({ error: cameraFailure(stderr), missing: /404|not found/i.test(stderr) }));
      reply.raw.once('close', () => { if (!settled) { child.kill(); finish({ error: 'З’єднання закрито.' }); } });
    });
    return { child, ...result };
  };
  let attempt = await startStream(2);
  if (attempt.missing && !reply.raw.destroyed) attempt = await startStream(1);
  const { child, chunk } = attempt;
  if (!chunk) { child.kill(); if (reply.raw.destroyed) return; return reply.code(502).send({ error: attempt.error }); }
  if (reply.raw.destroyed) { child.kill(); return; }
  reply.raw.once('close', () => { child.kill(); });
  if (reply.raw.destroyed) { child.kill(); return; }
  reply.hijack();
  reply.raw.writeHead(200, { 'Content-Type': 'multipart/x-mixed-replace; boundary=ffmpeg', 'Cache-Control': 'no-store', 'X-Accel-Buffering': 'no' });
  reply.raw.write(chunk);
  child.stdout.pipe(reply.raw);
  child.stdout.resume();
  child.once('close', () => { if (!reply.raw.destroyed) reply.raw.end(); });
});

app.post('/api/cameras/test-preview', { config: { rateLimit: { max: 8, timeWindow: '1 minute' } } }, async (_request, reply) => {
  if (!cameraConfigured()) return reply.code(409).send({ error: 'Камеру ще не налаштовано на сервері.' });
  try {
    await mkdir(dirname(cameraPreviewFile), { recursive: true });
    await createCameraPreview();
    return { ok: true, previewUrl: `/api/cameras/test-preview.jpg?t=${Date.now()}` };
  } catch (error) {
    app.log.warn({ error }, 'Camera preview failed');
    return reply.code(502).send({ error: 'Не вдалося отримати кадр. Перевірте RTSP-доступ користувача та наявність FFmpeg на сервері.' });
  }
});

app.get('/api/cameras/test-preview.jpg', async (_request, reply) => {
  try {
    const preview = await readFile(cameraPreviewFile);
    return reply.header('Cache-Control', 'no-store').type('image/jpeg').send(preview);
  } catch { return reply.code(404).send({ error: 'Тестовий кадр ще не створено.' }); }
});

const planElementSchema = z.object({
  id: z.string().min(1).max(128),
  type: z.enum(['door', 'device', 'input', 'label']),
  token: z.string().max(128).optional(),
  name: z.string().min(1).max(300),
  detail: z.string().max(300).nullable().optional(),
  deviceToken: z.string().max(128).nullable().optional(),
  eventTokens: z.array(z.string().min(1).max(128)).max(32).optional(),
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

function automaticPlanTokens(elements: z.infer<typeof planElementSchema>[], doors: PlanCatalogItem[]) {
  return elements.map((element) => ({ ...element, eventTokens: element.type === 'door'
    ? [...(doors.find((door) => door.token === element.token)?.eventTokens ?? [])] : [] }));
}

app.get('/api/plan/elements/:floor', async (request) => {
  const { floor } = planFloorParams.parse(request.params);
  await ensureSharedPlanElementsLoaded();
  const catalog = await loadPlanCatalog();
  return { floor, elements: automaticPlanTokens(sharedPlanElements[floor] ?? [], catalog.doors) };
});

app.put('/api/plan/elements/:floor', async (request) => {
  const { floor } = planFloorParams.parse(request.params);
  const { elements } = planElementsBody.parse(request.body);
  await ensureSharedPlanElementsLoaded();
  const catalog = await loadPlanCatalog();
  sharedPlanElements[floor] = automaticPlanTokens(elements, catalog.doors);
  await persistSharedPlanElements();
  return { floor, elements: sharedPlanElements[floor] };
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
  eventTokens?: string[];
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

async function fetchPlanCatalog() {
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

  const doors = doorResult.status === 'fulfilled' ? records(doorResult.value, 'Door').map((record) => {
    const token = (value: unknown) => value !== undefined && value !== null && String(value) !== '0' && String(value) !== '' ? String(value) : null;
    const entranceToken = token(record.EntranceToken);
    const exitToken = token(record.ExitToken);
    return { ...catalogItem(record), entranceToken, exitToken,
      eventTokens: [...new Set([entranceToken, exitToken].filter((value): value is string => value !== null))] };
  }) : [];
  return {
    doors,
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
}

let planCatalogCache: { value: Awaited<ReturnType<typeof fetchPlanCatalog>>; expiresAt: number } | undefined;
let planCatalogPending: Promise<Awaited<ReturnType<typeof fetchPlanCatalog>>> | undefined;
async function loadPlanCatalog(force = false) {
  if (!force && planCatalogCache && planCatalogCache.expiresAt > Date.now()) return planCatalogCache.value;
  if (!planCatalogPending) {
    planCatalogPending = fetchPlanCatalog().then((value) => {
      if (!value.warnings.length) planCatalogCache = { value, expiresAt: Date.now() + 30_000 };
      return value;
    }).finally(() => { planCatalogPending = undefined; });
  }
  return planCatalogPending;
}
app.get('/api/plan/catalog', async (request) => {
  const { refresh } = z.object({ refresh: z.string().optional() }).parse(request.query);
  return loadPlanCatalog(refresh === '1');
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
  offset: z.coerce.number().int().min(0).max(99_900).default(0),
  hours: z.coerce.number().int().min(1).max(168).default(24),
  from: z.coerce.number().int().positive().optional(),
  to: z.coerce.number().int().positive().optional(),
  search: z.string().trim().max(300).default(''),
  department: z.string().trim().max(300).default(''),
  accessPoint: z.string().trim().max(300).default(''),
  eventMode: z.enum(['all', 'normal', 'security']).default('all'),
  senderTokens: z.string().max(5000).default(''),
}).superRefine((value, context) => {
  if ((value.from === undefined) !== (value.to === undefined)) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: 'Both from and to are required for a custom event range' });
  }
  if (value.from !== undefined && value.to !== undefined && value.from > value.to) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: 'The event range start must be before its end' });
  }
});
const reportExportSchema = z.object({
  format: z.enum(['pdf', 'word']),
  kind: z.enum(['access', 'security', 'worktime']).default('access'),
  from: z.coerce.number().int().positive(),
  to: z.coerce.number().int().positive(),
  employeeTokens: z.array(z.string().min(1).max(128)).max(2_000).default([]),
  departments: z.array(z.string().min(1).max(300)).max(2_000).default([]),
  accessPoint: z.string().max(300).default(''),
}).superRefine((value, context) => {
  if (value.from > value.to) context.addIssue({ code: z.ZodIssueCode.custom, message: 'The event range start must be before its end' });
});
const presenceQuerySchema = z.object({
  accessPoint: z.string().trim().min(1).max(300).default('персонал,внутрішній двір'),
});

function issuedMilliseconds(value: unknown) {
  return Number(typeof value === 'string' ? (value.match(/\d+/)?.[0] ?? 0) : 0);
}

type EventRecord = Record<string, unknown>;
type EventsSnapshot = Record<string, unknown> & { Event: EventRecord[]; NextToken?: string | number };
type EventRange = { events: EventRecord[]; refreshedAt: number; expiresAt: number; pending?: Promise<EventRecord[]> };
type ReportEventRow = {
  issued: number;
  occurredAt: string;
  employee: string;
  employeeToken?: string;
  department: string;
  position: string;
  accessPoint: string;
  senderToken?: string;
  eventName: string;
  cardCode: string;
  photoToken?: string;
};
const eventRangeCache = new Map<string, EventRange>();
type PresenceRecord = { state: 'present' | 'away'; occurredAt: number; eventName: string };
type PresenceSnapshot = { value: Record<string, PresenceRecord>; expiresAt: number; pending?: Promise<Record<string, PresenceRecord>> };
const presenceCache = new Map<string, PresenceSnapshot>();

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

function reportDate(milliseconds: number) {
  return new Intl.DateTimeFormat('uk-UA', { dateStyle: 'short', timeStyle: 'medium' }).format(new Date(milliseconds));
}

function textValue(value: unknown) {
  return typeof value === 'string' ? value : value === undefined || value === null ? '' : String(value);
}

function reportRow(event: EventRecord): ReportEventRow {
  const user = event.User as { Name?: string; Token?: string | number; Post?: string; ImageToken?: string | number; PhotoToken?: string | number } | undefined;
  const employee = event.Employee as UproxxEmployee | undefined;
  const department = event.Department as { Name?: string } | undefined;
  const sender = event.Sender as { Name?: string; Token?: string | number } | undefined;
  const message = event.Message as { Name?: string } | undefined;
  const issued = issuedMilliseconds(event.Issued);
  const imageToken = event.PhotoToken ?? event.ImageToken ?? user?.PhotoToken ?? user?.ImageToken ?? employee?.PhotoToken ?? employee?.ImageToken;
  return {
    issued,
    occurredAt: issued ? reportDate(issued) : '—',
    employee: user?.Name || employee?.Name || (event.CardCode ? 'Невідома картка' : 'Системна подія'),
    employeeToken: user?.Token === undefined && employee?.Token === undefined ? undefined : String(user?.Token ?? employee?.Token),
    department: department?.Name || employee?.Department?.Name || employee?.DepartmentName || '—',
    position: user?.Post || employee?.Post || '—',
    accessPoint: sender?.Name || '—',
    senderToken: sender?.Token === undefined ? undefined : String(sender.Token),
    eventName: message?.Name || 'Подія без назви',
    cardCode: textValue(event.CardCode) || '—',
    photoToken: imageToken === undefined ? undefined : String(imageToken),
  };
}

function isSecurityReportEvent(name: string) {
  const value = name.toLocaleLowerCase('uk-UA');
  return ['відмов', 'заборон', 'невідом', 'тривог', 'помил', 'заблок', 'несправ', 'авар', 'обрив', 'зв’язок втрач', "зв'язок втрач", 'поперед', 'відчинен', 'відкрит', 'примус', 'tamper'].some((term) => value.includes(term));
}

function passageState(eventName: string) {
  const name = eventName.toLocaleLowerCase('uk-UA');
  // Depending on the controller and U-PROX configuration, a successful pass
  // may be reported as either "дозволений" or "здійснено".
  if (name.includes('вхід здійснен') || name.includes('вхід дозволен') || name.includes('доступ надан')) return 'present' as const;
  if (name.includes('вихід здійснен') || name.includes('вихід дозволен')) return 'away' as const;
  return undefined;
}

function startOfCurrentDay() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return today.getTime();
}

function normalizedPersonName(name: string) {
  return name.trim().toLocaleLowerCase('uk-UA').replace(/\s+/g, ' ');
}

async function getPersonnelPresence(accessPoint: string) {
  const from = startOfCurrentDay();
  const points = accessPoint
    .split(',')
    .map((point) => point.trim().toLocaleLowerCase('uk-UA'))
    .filter(Boolean);
  const key = `${points.join('|')}:${from}`;
  const cached = presenceCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  if (cached?.pending) return cached.pending;
  const pending = (async () => {
    const events = (await getEventsRange(from, Date.now(), UPROX_REPORT_MAX_EVENTS)).events;
    const employeeTokensByName = new Map(
      ((await getEmployeeDirectory()) as UproxxEmployee[]).flatMap((employee) =>
        employee.Token === undefined || !employee.Name ? [] : [[normalizedPersonName(employee.Name), String(employee.Token)] as const],
      ),
    );
    const presence: Record<string, PresenceRecord> = {};
    for (const event of events) {
      const row = reportRow(event);
      const employeeToken = row.employeeToken ?? employeeTokensByName.get(normalizedPersonName(row.employee));
      const eventPoint = row.accessPoint.toLocaleLowerCase('uk-UA');
      if (!employeeToken || !points.some((point) => eventPoint.includes(point))) continue;
      const state = passageState(row.eventName);
      if (!state || presence[employeeToken]) continue;
      presence[employeeToken] = { state, occurredAt: row.issued, eventName: row.eventName };
    }
    return presence;
  })();
  presenceCache.set(key, { value: cached?.value ?? {}, expiresAt: 0, pending });
  try {
    const value = await pending;
    presenceCache.set(key, { value, expiresAt: Date.now() + 10_000 });
    return value;
  } catch (error) {
    presenceCache.delete(key);
    throw error;
  }
}

function matchesEventFilter(event: EventRecord, input: z.infer<typeof eventsQuery>) {
  if (!input.search && !input.department && !input.accessPoint && input.eventMode === 'all') return true;
  const row = reportRow(event);
  const search = input.search.toLocaleLowerCase('uk-UA');
  if (search && !`${row.employee} ${row.cardCode} ${row.eventName}`.toLocaleLowerCase('uk-UA').includes(search)) return false;
  if (input.department && input.department !== row.department) return false;
  if (input.accessPoint && input.accessPoint !== row.accessPoint) return false;
  const attention = isSecurityReportEvent(row.eventName);
  return input.eventMode === 'all' || (input.eventMode === 'security' ? attention : !attention);
}

function collapseReportDuplicates(rows: ReportEventRow[]) {
  const mostRecent = new Map<string, number>();
  return rows.filter((row) => {
    const name = row.eventName.toLocaleLowerCase('uk-UA');
    if (!name.includes('дозвол') && !name.includes('доступ надан')) return true;
    const actor = row.employeeToken || (row.cardCode !== '—' ? row.cardCode : row.employee);
    const key = `${actor}|${row.senderToken ?? row.accessPoint}|${name.replace(/\s+/g, ' ').trim()}`;
    const newer = mostRecent.get(key);
    if (newer !== undefined && newer - row.issued <= 5_000) return false;
    mostRecent.set(key, row.issued);
    return true;
  });
}

async function getReportRows(input: z.infer<typeof reportExportSchema>) {
  const source = await fetchEventsFromUproxx(input.from, input.to, UPROX_REPORT_MAX_EVENTS);
  const employeeTokens = new Set(input.employeeTokens);
  const departments = new Set(input.departments);
  const rows = source.map(reportRow).filter((row) => {
    if (input.kind === 'security' && !isSecurityReportEvent(row.eventName)) return false;
    if (employeeTokens.size && (!row.employeeToken || !employeeTokens.has(row.employeeToken))) return false;
    if (departments.size && !departments.has(row.department)) return false;
    if (input.accessPoint && input.accessPoint !== row.accessPoint) return false;
    return true;
  });
  return collapseReportDuplicates(rows);
}

function htmlEscape(value: string) {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;');
}

function groupReportRows(rows: ReportEventRow[]) {
  const groups = new Map<string, ReportEventRow[]>();
  for (const row of rows) {
    const key = row.employeeToken ?? `${row.employee}|${row.department}`;
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }
  return [...groups.values()];
}

/** Lets pending HTTP work run while a large locally generated document is built. */
function yieldReportWork() {
  return new Promise<void>((resolve) => setImmediate(resolve));
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
    // Large report scans can contain tens of thousands of enriched records.
    // Share an in-flight scan, but do not retain it in the live cache.
    if (events.length > 5_000) eventRangeCache.delete(key);
    for (const [cacheKey, value] of eventRangeCache) {
      if (!value.pending && (value.expiresAt <= Date.now() || eventRangeCache.size > 12)) eventRangeCache.delete(cacheKey);
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
  if (cached && cached.expiresAt > Date.now()) {
    images.delete(imageToken);
    images.set(imageToken, cached);
    return cached;
  }
  if (cached) { images.delete(imageToken); imageCacheBytes -= cached.content.length; }

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
  if (content.length <= IMAGE_CACHE_MAX_BYTES) {
    while (images.size && (imageCacheBytes + content.length > IMAGE_CACHE_MAX_BYTES || images.size >= 500)) {
      const oldestKey = images.keys().next().value!;
      imageCacheBytes -= images.get(oldestKey)!.content.length;
      images.delete(oldestKey);
    }
    const existing = images.get(imageToken);
    if (existing) imageCacheBytes -= existing.content.length;
    images.delete(imageToken);
    images.set(imageToken, image);
    imageCacheBytes += content.length;
  }
  return image;
}

function reportTitle(kind: z.infer<typeof reportExportSchema>['kind']) {
  if (kind === 'security') return 'Безпекові події';
  if (kind === 'worktime') return 'Робочий час';
  return 'Журнал проходів';
}

function reportFileBase(kind: z.infer<typeof reportExportSchema>['kind']) {
  if (kind === 'security') return 'bezpekovi-podii';
  if (kind === 'worktime') return 'robochyi-chas';
  return 'zhurnal-prokhodiv';
}

function reportPeriod(input: z.infer<typeof reportExportSchema>) {
  return `${reportDate(input.from)} — ${reportDate(input.to)}`;
}

async function imageForReport(row: ReportEventRow) {
  if (!row.photoToken) return undefined;
  try {
    return await getImage(row.photoToken);
  } catch (error) {
    app.log.warn({ error, photoToken: row.photoToken }, 'Unable to load employee photo for report');
    return undefined;
  }
}

function reportFilterSummary(input: z.infer<typeof reportExportSchema>) {
  const filters = [
    input.employeeTokens.length ? `Працівників: ${input.employeeTokens.length}` : '',
    input.departments.length ? `Відділи: ${input.departments.join(', ')}` : '',
    input.accessPoint ? `Місце: ${input.accessPoint}` : '',
  ].filter(Boolean);
  return filters.join(' · ') || 'Без додаткових фільтрів';
}

async function wordReportHtml(input: z.infer<typeof reportExportSchema>, rows: ReportEventRow[]) {
  const groups = groupReportRows(rows);
  const sections: string[] = [];
  for (let groupIndex = 0; groupIndex < groups.length; groupIndex += 1) {
    if (groupIndex > 0 && groupIndex % 20 === 0) await yieldReportWork();
    const employeeEvents = groups[groupIndex];
    const employee = employeeEvents[0];
    const image = await imageForReport(employee);
    const photo = image
      ? `<img class="employee-photo" alt="${htmlEscape(employee.employee)}" src="data:${image.contentType};base64,${image.content.toString('base64')}">`
      : `<span class="employee-photo fallback">${htmlEscape(employee.employee.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase() || '—')}</span>`;
    const events = employeeEvents.map((event) => `<tr><td>${htmlEscape(event.occurredAt)}</td><td>${htmlEscape(event.accessPoint)}</td><td>${htmlEscape(event.eventName)}</td><td>${htmlEscape(event.cardCode)}</td></tr>`).join('');
    sections.push(`<section class="employee-section"><header>${photo}<div><h2>${htmlEscape(employee.employee)}</h2><p><b>Відділ:</b> ${htmlEscape(employee.department)}</p><p><b>Посада:</b> ${htmlEscape(employee.position)}</p></div></header><table><thead><tr><th>Дата та час</th><th>Місце</th><th>Подія</th><th>Ідентифікатор</th></tr></thead><tbody>${events}</tbody></table></section>`);
  }
  return `<!doctype html><html lang="uk"><head><meta charset="utf-8"><title>${htmlEscape(reportTitle(input.kind))}</title><style>body{font-family:Arial,sans-serif;color:#17212b;margin:28px}h1{font-size:23px}.summary{margin:18px 0;padding:12px;background:#edf6fa;border-left:4px solid #007db9}.employee-section{break-before:page;page-break-before:always;margin-top:30px}.employee-section:first-of-type{break-before:auto;page-break-before:auto}.employee-section header{display:flex;align-items:center;gap:14px;margin:22px 0 15px;padding:12px;background:#f1f7fa;border:1px solid #bed0db}.employee-section h2{margin:0 0 7px;font-size:17px}.employee-section p{margin:3px 0;color:#4b5b68;font-size:12px}.employee-section p b{color:#17212b}.employee-photo{width:54px;height:54px;object-fit:cover;border:1px solid #aabdc9;border-radius:50%;background:#fff}.fallback{display:inline-grid;place-items:center;font-weight:700}table{width:100%;border-collapse:collapse;font-size:10px}th{background:#09304b;color:#fff;text-align:left}th,td{padding:8px;border:1px solid #c9d5de;vertical-align:top}tr:nth-child(even){background:#f5f8fa}</style></head><body><h1>${htmlEscape(reportTitle(input.kind))}</h1><p>Період: ${htmlEscape(reportPeriod(input))}</p><p>Сформовано: ${htmlEscape(reportDate(Date.now()))}</p><div class="summary"><b>Подій у вибірці: ${rows.length}</b><br>${htmlEscape(reportFilterSummary(input))}</div>${sections.join('')}</body></html>`;
}

async function renderPdfReport(document: PDFKit.PDFDocument, input: z.infer<typeof reportExportSchema>, rows: ReportEventRow[]) {
  const pageBottom = () => document.page.height - document.page.margins.bottom;
  const addPage = () => { document.addPage(); document.font('Noto').fontSize(9).fillColor('#607180').text(reportTitle(input.kind), document.page.margins.left, 28, { align: 'right' }); document.moveDown(2); };
  const ensureSpace = (height: number) => { if (document.y + height > pageBottom()) addPage(); };
  document.registerFont('Noto', reportFontFile);
  document.font('Noto').fillColor('#17212b').fontSize(21).text(reportTitle(input.kind));
  document.moveDown(0.45).fontSize(10).fillColor('#4b5b68').text(`Період: ${reportPeriod(input)}`).text(`Сформовано: ${reportDate(Date.now())}`);
  document.moveDown(1).fillColor('#0b698d').fontSize(11).text(`Подій у вибірці: ${rows.length}`).fontSize(9).fillColor('#4b5b68').text(reportFilterSummary(input));
  document.moveDown(1.15);
  const columns = [90, 145, 180, 102];
  const headers = ['Дата та час', 'Місце', 'Подія', 'Ідентифікатор'];
  const drawTableHeader = () => {
    ensureSpace(25);
    const x = document.page.margins.left;
    const y = document.y;
    let offset = 0;
    document.save().fillColor('#09304b').rect(x, y, columns.reduce((total, width) => total + width, 0), 21).fill();
    document.fillColor('#ffffff').fontSize(8);
    headers.forEach((header, index) => { document.text(header, x + offset + 5, y + 6, { width: columns[index] - 10 }); offset += columns[index]; });
    document.restore().fillColor('#17212b');
    document.y = y + 21;
  };
  const groups = groupReportRows(rows);
  for (let groupIndex = 0; groupIndex < groups.length; groupIndex += 1) {
    const employeeEvents = groups[groupIndex];
    const employee = employeeEvents[0];
    if (groupIndex > 0) addPage();
    ensureSpace(96);
    const headerY = document.y;
    const image = await imageForReport(employee);
    if (image && ['image/jpeg', 'image/png'].includes(image.contentType)) {
      try { document.image(image.content, document.page.margins.left, headerY, { fit: [48, 48] }); } catch { /* Invalid image data is replaced by text below. */ }
    }
    const detailsX = document.page.margins.left + 62;
    document.fontSize(15).fillColor('#102d43').text(employee.employee, detailsX, headerY, { width: 430 });
    document.fontSize(9).fillColor('#4b5b68').text(`Відділ: ${employee.department}`, detailsX, headerY + 25, { width: 430 });
    document.text(`Посада: ${employee.position}`, detailsX, headerY + 40, { width: 430 });
    document.y = headerY + 76;
    drawTableHeader();
    for (let eventIndex = 0; eventIndex < employeeEvents.length; eventIndex += 1) {
      const event = employeeEvents[eventIndex];
      const values = [event.occurredAt, event.accessPoint, event.eventName, event.cardCode];
      document.fontSize(8);
      const rowHeight = Math.max(24, ...values.map((value, index) => document.heightOfString(value, { width: columns[index] - 10 }) + 10));
      if (document.y + rowHeight > pageBottom()) {
        addPage();
        document.fontSize(10).fillColor('#102d43').text(`${employee.employee} (продовження)`);
        document.moveDown(0.5);
        drawTableHeader();
      }
      const x = document.page.margins.left;
      const y = document.y;
      let offset = 0;
      document.save().lineWidth(0.4).strokeColor('#c9d5de').rect(x, y, columns.reduce((total, width) => total + width, 0), rowHeight).stroke();
      values.forEach((value, index) => { document.fillColor('#17212b').text(value, x + offset + 5, y + 5, { width: columns[index] - 10 }); offset += columns[index]; });
      document.restore();
      document.y = y + rowHeight;
      if (eventIndex > 0 && eventIndex % 250 === 0) await yieldReportWork();
    }
  }
}

app.get('/api/events', async (request) => {
  const input = eventsQuery.parse(request.query);
  const { limit, offset, hours, from: requestedFrom, to: requestedTo } = input;
  const to = requestedTo ?? Math.floor(Date.now() / LIVE_CACHE_MS) * LIVE_CACHE_MS;
  const from = requestedFrom ?? to - hours * 60 * 60_000;
  // The live journal remains light: a large scan is only needed for an
  // explicit field filter or when the user asks for older pages.
  const hasDeepLookup = Boolean(input.search || input.department || input.accessPoint || input.senderTokens || offset > 0);
  const range = await getEventsRange(from, to, hasDeepLookup ? UPROX_REPORT_MAX_EVENTS : limit);
  const senderTokens = new Set(input.senderTokens.split(',').filter(Boolean));
  const events = range.events.filter((event) => matchesEventFilter(event, input) && (!senderTokens.size || senderTokens.has(String((event.Sender as { Token?: string | number } | undefined)?.Token ?? ''))));
  const page = events.slice(offset, offset + limit);
  return {
    Event: page,
    refreshedAt: range.refreshedAt,
    offset,
    hasMore: hasDeepLookup ? offset + limit < events.length : range.events.length >= limit,
    nextOffset: offset + page.length,
  };
});

app.get('/api/personnel/presence', async (request) => {
  const { accessPoint } = presenceQuerySchema.parse(request.query);
  const presence = await getPersonnelPresence(accessPoint);
  return { accessPoint, from: startOfCurrentDay(), refreshedAt: Date.now(), presence };
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

app.post('/api/reports/export', {
  config: { rateLimit: { max: 4, timeWindow: '1 minute' } },
}, async (request, reply) => {
  const input = reportExportSchema.parse(request.body);
  const rows = await getReportRows(input);
  const filename = `${reportFileBase(input.kind)}-${new Date().toISOString().slice(0, 10)}`;
  if (input.format === 'word') {
    const document = await wordReportHtml(input, rows);
    return reply
      .header('Content-Disposition', `attachment; filename="${filename}.doc"`)
      .type('application/msword; charset=utf-8')
      .send(document);
  }

  reply.hijack();
  reply.raw.writeHead(200, {
    'Content-Type': 'application/pdf',
    'Content-Disposition': `attachment; filename="${filename}.pdf"`,
    'Cache-Control': 'no-store',
  });
  const document = new PDFDocument({ autoFirstPage: true, margin: 36, size: 'A4', bufferPages: false });
  document.pipe(reply.raw);
  try {
    await renderPdfReport(document, input, rows);
  } catch (error) {
    app.log.error({ error }, 'Unable to render report PDF');
  } finally {
    document.end();
  }
});
const probes = {
  version: { path: 'VersionGet', body: {} },
  doors: { path: 'DoorGetList', body: { Language: 'uk', Limit: 100, StartToken: 0 } },
  devices: { path: 'DeviceGetList', body: { Language: 'uk', Limit: 100, StartToken: 0 } },
  inputs: { path: 'DeviceInputGetList', body: { Language: 'uk', Limit: 2000, StartToken: 0 } },
  outputs: { path: 'DeviceOutputGetList', body: { Language: 'uk', Limit: 2000, StartToken: 0 } },
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
