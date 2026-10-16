import { create } from 'zustand';

export type Door = [string, 'green' | 'red' | 'yellow' | 'blue', number, number];
export type PlanSelection = {
  id: string;
  name: string;
  type: 'door' | 'device' | 'input';
  token?: string;
  detail?: string | null;
  floor: string;
};

type AppState = {
  building: string;
  floor: string;
  selected?: PlanSelection;
  setBuilding: (value: string) => void;
  setFloor: (value: string) => void;
  select: (selection?: PlanSelection) => void;
};
type IntegrationState = { mode: 'mock' | 'uproxx'; setMode: (mode: 'mock' | 'uproxx') => void };

export const useStore = create<AppState>((set) => ({
  building: 'Головна будівля',
  floor: '3 поверх',
  selected: undefined,
  setBuilding: (building) => set({ building }),
  setFloor: (floor) => set({ floor }),
  select: (selected) => set({ selected }),
}));
export const useIntegrationStore = create<IntegrationState>((set) => ({
  mode: 'mock',
  setMode: (mode) => set({ mode }),
}));
