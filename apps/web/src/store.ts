import { create } from 'zustand';

export type Door = [string, 'green' | 'red' | 'yellow' | 'blue', number, number];
export const doors: Door[] = [
  ['Двері 3-01', 'green', 8, 28],
  ['Двері 3-02', 'green', 19, 56],
  ['Двері 3-03', 'yellow', 34, 46],
  ['Двері 3-04', 'green', 50, 49],
  ['Двері 3-05', 'red', 73, 47],
  ['Двері 3-06', 'green', 89, 58],
  ['Контролер · не прив’язано', 'blue', 54, 31],
];

type AppState = {
  building: string;
  floor: string;
  selected: Door;
  setBuilding: (value: string) => void;
  setFloor: (value: string) => void;
  select: (door: Door) => void;
};
type IntegrationState = { mode: 'mock' | 'uproxx'; setMode: (mode: 'mock' | 'uproxx') => void };

export const useStore = create<AppState>((set) => ({
  building: 'Головна будівля',
  floor: '3 поверх',
  selected: doors[0],
  setBuilding: (building) => set({ building }),
  setFloor: (floor) => set({ floor }),
  select: (selected) => set({ selected }),
}));
export const useIntegrationStore = create<IntegrationState>((set) => ({
  mode: 'mock',
  setMode: (mode) => set({ mode }),
}));
