export type PlanElementType = 'door' | 'device' | 'input' | 'label' | 'camera';

export type PlanElement = {
  id: string;
  type: PlanElementType;
  token?: string;
  recorder?: string;
  cameraChannel?: number;
  name: string;
  detail?: string | null;
  deviceToken?: string | null;
  /** Tokens of child U-PROX inputs that report events for this single marker. */
  eventTokens?: string[];
  x: number;
  y: number;
};

const storageKey = 'uproxx-plan-elements-v1';

function keyForFloor(floor: string) {
  return `${storageKey}:${floor}`;
}

export function readPlanElements(floor: string): PlanElement[] {
  try {
    const value = localStorage.getItem(keyForFloor(floor));
    // Retain existing third-floor draft data after upgrading to per-floor storage.
    const legacyValue = floor === '3 поверх' ? localStorage.getItem(storageKey) : null;
    const source = value ?? legacyValue;
    if (!source) return [];
    const parsed = JSON.parse(source) as unknown;
    return Array.isArray(parsed) ? (parsed as PlanElement[]) : [];
  } catch {
    return [];
  }
}

export function writePlanElements(floor: string, elements: PlanElement[]) {
  localStorage.setItem(keyForFloor(floor), JSON.stringify(elements));
}

export function planElementIcon(type: PlanElementType) {
  if (type === 'door') return '▯';
  if (type === 'device') return '▣';
  if (type === 'input') return '◉';
  if (type === 'camera') return '▣';
  return 'T';
}
