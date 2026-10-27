export type FloorPlanDefinition = {
  floor: string;
  imageUrl: string;
  alt: string;
  aspectRatio: string;
};

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
