import type { PlanElement } from './features/plans/planElements';

export async function runIntegrationTest() {
  const r = await fetch('/api/integration/test');
  if (!r.ok) throw new Error(`Backend returned HTTP ${r.status}`);
  return r.json();
}

export async function getEvents({ hours = 24, limit = 50, offset = 0, from, to, search = '', department = '', accessPoint = '', eventMode = 'all' }: {
  hours?: number;
  limit?: number;
  offset?: number;
  from?: number;
  to?: number;
  search?: string;
  department?: string;
  accessPoint?: string;
  eventMode?: 'all' | 'normal' | 'security';
} = {}) {
  const params = new URLSearchParams({ hours: String(hours), limit: String(limit), offset: String(offset), eventMode });
  if (from !== undefined && to !== undefined) {
    params.set('from', String(from));
    params.set('to', String(to));
  }
  if (search) params.set('search', search);
  if (department) params.set('department', department);
  if (accessPoint) params.set('accessPoint', accessPoint);
  const response = await fetch(`/api/events?${params}`);
  if (!response.ok) throw new Error(`Backend returned HTTP ${response.status}`);
  return response.json();
}

export type ReportExportRequest = {
  format: 'pdf' | 'word';
  kind: 'access' | 'security' | 'worktime';
  from: number;
  to: number;
  employeeTokens: string[];
  departments: string[];
  accessPoint: string;
};

export async function downloadServerReport(input: ReportExportRequest) {
  const response = await fetch('/api/reports/export', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!response.ok) throw new Error(`Backend returned HTTP ${response.status}`);
  const disposition = response.headers.get('content-disposition') ?? '';
  const fileName = disposition.match(/filename="?([^";]+)"?/i)?.[1] ?? `zvit.${input.format === 'pdf' ? 'pdf' : 'doc'}`;
  return { blob: await response.blob(), fileName };
}

export type HealthResponse = { ok: boolean; mode: 'mock' | 'uproxx' };

export type PlanCatalogItem = {
  token: string;
  name: string;
  model: string | null;
  online: boolean | null;
  deviceToken: string | null;
  inputNumber: string | null;
};

export type PlanCatalog = {
  doors: PlanCatalogItem[];
  devices: PlanCatalogItem[];
  inputs: PlanCatalogItem[];
  warnings: string[];
};

export type LiveSignal = {
  token: string;
  name: string;
  deviceToken: string | null;
  hardwareState: number | null;
  healthStatus: number | null;
  usage: number | null;
  workingMode?: number | null;
  connectedTo: { token: string; name: string } | null;
};

export type PlanLiveController = {
  controller: {
    token: string;
    name: string;
    online: boolean | null;
    hardwareState: number | null;
    healthStatus: number | null;
  } | null;
  inputs: LiveSignal[];
  outputs: LiveSignal[];
  warnings: string[];
};

export type PersonnelRecord = {
  token: string;
  name: string;
  department: string;
  position: string;
  identifier: string;
  photoToken?: string;
  photoData?: string | null;
  employeeNumber: string;
  email: string;
  /** "inherit" means that the employee inherits the department access level. */
  accessLevel: string;
  identifiers: PersonnelIdentifier[];
  active: boolean;
  local: boolean;
};
export type PersonnelIdentifier = {
  id: string;
  type: 'card' | 'key_fob' | 'bracelet' | 'face' | 'fingerprint';
  value: string;
  validUntil: string;
};
export type PersonnelDirectory = { personnel: PersonnelRecord[]; departments: string[] };
export type PersonnelInput = Omit<PersonnelRecord, 'token' | 'local'>;

export async function getHealth(): Promise<HealthResponse> {
  const response = await fetch('/api/health');
  if (!response.ok) throw new Error(`Backend returned HTTP ${response.status}`);
  return response.json();
}

export async function getPlanCatalog(): Promise<PlanCatalog> {
  const response = await fetch('/api/plan/catalog');
  if (!response.ok) throw new Error(`Backend returned HTTP ${response.status}`);
  return response.json();
}

export async function getPersonnel(): Promise<PersonnelDirectory> {
  const response = await fetch('/api/personnel');
  if (!response.ok) throw new Error(`Backend returned HTTP ${response.status}`);
  return response.json();
}

export async function createPersonnel(input: PersonnelInput): Promise<PersonnelRecord> {
  const response = await fetch('/api/personnel', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(input),
  });
  if (!response.ok) throw new Error(`Backend returned HTTP ${response.status}`);
  return response.json();
}

export async function updatePersonnel(token: string, input: PersonnelInput): Promise<PersonnelRecord> {
  const response = await fetch(`/api/personnel/${encodeURIComponent(token)}`, {
    method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(input),
  });
  if (!response.ok) throw new Error(`Backend returned HTTP ${response.status}`);
  return response.json();
}

export async function deletePersonnel(token: string) {
  const response = await fetch(`/api/personnel/${encodeURIComponent(token)}`, { method: 'DELETE' });
  if (!response.ok) throw new Error(`Backend returned HTTP ${response.status}`);
}

type PlanElementsResponse = { floor: string; elements: PlanElement[] };

export async function getPlanElements(floor: string): Promise<PlanElementsResponse> {
  const response = await fetch(`/api/plan/elements/${encodeURIComponent(floor)}`);
  if (!response.ok) throw new Error(`Backend returned HTTP ${response.status}`);
  return response.json();
}

export async function savePlanElements(floor: string, elements: PlanElement[]): Promise<PlanElementsResponse> {
  const response = await fetch(`/api/plan/elements/${encodeURIComponent(floor)}`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ elements }),
  });
  if (!response.ok) throw new Error(`Backend returned HTTP ${response.status}`);
  return response.json();
}

export async function getPlanLiveController(token: string): Promise<PlanLiveController> {
  const response = await fetch(`/api/plan/live/${encodeURIComponent(token)}`);
  if (!response.ok) throw new Error(`Backend returned HTTP ${response.status}`);
  return response.json();
}
