export type PlanElementType = 'door' | 'device' | 'input' | 'label';

export type PlanElement = {
  id: string;
  type: PlanElementType;
  token?: string;
  name: string;
  detail?: string | null;
  x: number;
  y: number;
};

const storageKey = 'uproxx-plan-elements-v1';

export function readPlanElements(): PlanElement[] {
  try {
    const value = localStorage.getItem(storageKey);
    if (!value) return [];
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? (parsed as PlanElement[]) : [];
  } catch {
    return [];
  }
}

export function writePlanElements(elements: PlanElement[]) {
  localStorage.setItem(storageKey, JSON.stringify(elements));
}

export function planElementIcon(type: PlanElementType) {
  if (type === 'door') return '▯';
  if (type === 'device') return '▣';
  if (type === 'input') return '◉';
  return 'T';
}
