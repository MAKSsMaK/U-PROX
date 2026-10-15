import { create } from 'zustand';

export type Door = [string, 'green' | 'red' | 'yellow' | 'blue', number, number];
export const doors: Door[] = [['Двері 3-01', 'green', 19, 38], ['Двері 3-02', 'green', 39, 28], ['Двері 3-03', 'red', 65, 38], ['Двері 3-04', 'green', 43, 62], ['Двері 3-05', 'yellow', 67, 74], ['Двері 3-06', 'green', 86, 51], ['Турнікет персонал', 'blue', 34, 47]];

type AppState = { building: string; floor: string; selected: Door; setBuilding: (value: string) => void; setFloor: (value: string) => void; select: (door: Door) => void };
type IntegrationState = { mode: 'mock' | 'uproxx'; setMode: (mode: 'mock' | 'uproxx') => void };

export const useStore = create<AppState>((set) => ({ building: 'Головна будівля', floor: '3 поверх', selected: doors[0], setBuilding: (building) => set({ building }), setFloor: (floor) => set({ floor }), select: (selected) => set({ selected }) }));
export const useIntegrationStore = create<IntegrationState>((set) => ({ mode: 'mock', setMode: (mode) => set({ mode }) }));
