export type FloorPlanDefinition = {
  floor: string;
  imageUrl: string;
  alt: string;
  aspectRatio: string;
};

export type FloorRoom = {
  number: number;
  name: string;
  area: string;
};

const basementRooms: FloorRoom[] = [
  { number: 1, name: 'Сходова клітина №1', area: '21,35 м²' },
  { number: 2, name: 'Комунікаційна', area: '5,71 м²' },
  { number: 3, name: 'Архів розглянутих справ', area: '9,85 м²' },
  { number: 4, name: 'Архів справ, що знаходяться у розгляді', area: '13,68 м²' },
  { number: 5, name: 'Приміщення для ознайомлення зі справами', area: '30,48 м²' },
  { number: 6, name: 'Коридор', area: '21,04 м²' },
  { number: 7, name: 'Бібліотека', area: '31,74 м²' },
  { number: 8, name: 'Кімната відпочинку водіїв', area: '12,97 м²' },
  { number: 9, name: 'Диспетчерська', area: '12,90 м²' },
  { number: 10, name: 'Водомірний вузол', area: '10,66 м²' },
  { number: 11, name: 'Електрощитова', area: '11,12 м²' },
  { number: 12, name: 'Коридор', area: '13,47 м²' },
  { number: 13, name: 'Тамбур-шлюз', area: '5,30 м²' },
  { number: 14, name: 'Сходова клітина №2', area: '16,13 м²' },
  { number: 15, name: 'Зал обслуговування буфету', area: '79,90 м²' },
  { number: 16, name: 'Зал обслуговування буфету', area: '44,90 м²' },
  { number: 17, name: 'Коридор', area: '24,48 м²' },
  { number: 18, name: 'Санвузол', area: '7,80 м²' },
  { number: 19, name: 'Сходова клітина №3', area: '12,60 м²' },
  { number: 20, name: 'Форкамера', area: '9,30 м²' },
  { number: 21, name: 'Приміщення для припливної вентиляції (категорія Д)', area: '28,72 м²' },
  { number: 22, name: 'Завантажувальна', area: '23,80 м²' },
  { number: 23, name: 'Коридор', area: '7,08 м²' },
  { number: 24, name: 'Гардероб верхнього та спецодягу персоналу буфету', area: '4,02 м²' },
  { number: 25, name: 'Санвузол', area: '5,54 м²' },
  { number: 26, name: 'Комора продуктів', area: '4,57 м²' },
  { number: 27, name: 'Допоміжне приміщення буфетниць', area: '5,10 м²' },
  { number: 28, name: 'Коридор', area: '6,15 м²' },
];

export const floorOptions = ['Підвал', '1 поверх', '2 поверх', '3 поверх', '4 поверх', '5 поверх', '6 поверх'] as const;

const plans: FloorPlanDefinition[] = [
  {
    floor: 'Підвал',
    imageUrl: '/floor-plans/court-basement-blueprint.png',
    alt: 'План підвалу суду',
    aspectRatio: '1672 / 941',
  },
  {
    floor: '1 поверх',
    imageUrl: '/floor-plans/court-floor-1-blueprint.png',
    alt: 'План першого поверху суду',
    aspectRatio: '1448 / 1086',
  },
  {
    floor: '2 поверх',
    imageUrl: '/floor-plans/court-floor-2-blueprint.png',
    alt: 'План другого поверху суду',
    aspectRatio: '1448 / 1086',
  },
  {
    floor: '3 поверх',
    imageUrl: '/floor-plans/court-floor-3-blueprint.png',
    alt: 'План третього поверху суду',
    aspectRatio: '1448 / 1086',
  },
  {
    floor: '4 поверх',
    imageUrl: '/floor-plans/court-floor-4-blueprint.png',
    alt: 'План четвертого поверху суду',
    aspectRatio: '1448 / 1086',
  },
  {
    floor: '5 поверх',
    imageUrl: '/floor-plans/court-floor-5-blueprint.png',
    alt: 'План п’ятого поверху суду',
    aspectRatio: '1448 / 1086',
  },
  {
    floor: '6 поверх',
    imageUrl: '/floor-plans/court-floor-6-blueprint.png',
    alt: 'План шостого поверху суду',
    aspectRatio: '1448 / 1086',
  },
];

export function getFloorPlan(floor: string) {
  return plans.find((plan) => plan.floor === floor);
}

export function getFloorRooms(floor: string): FloorRoom[] {
  return floor === 'Підвал' ? basementRooms : [];
}
