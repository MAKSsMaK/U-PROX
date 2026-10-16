export async function runIntegrationTest() {
  const r = await fetch('/api/integration/test');
  if (!r.ok) throw new Error(`Backend returned HTTP ${r.status}`);
  return r.json();
}

export async function getEvents({ hours = 24, limit = 50 } = {}) {
  const response = await fetch(`/api/events?hours=${hours}&limit=${limit}`);
  if (!response.ok) throw new Error(`Backend returned HTTP ${response.status}`);
  return response.json();
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

export async function getPlanLiveController(token: string): Promise<PlanLiveController> {
  const response = await fetch(`/api/plan/live/${encodeURIComponent(token)}`);
  if (!response.ok) throw new Error(`Backend returned HTTP ${response.status}`);
  return response.json();
}
