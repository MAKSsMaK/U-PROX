export type FloorPlanDefinition = {
  floor: string;
  imageUrl: string;
  alt: string;
  aspectRatio: string;
};

export const floorOptions = ['Підвал', '1 поверх', '2 поверх', '3 поверх', '4 поверх', '5 поверх', '6 поверх'] as const;

const plans: FloorPlanDefinition[] = [
  {
    floor: '2 поверх',
    imageUrl: '/floor-plans/court-floor-2-blueprint.png',
    alt: 'План другого поверху суду',
    aspectRatio: '1774 / 887',
  },
  {
    floor: '3 поверх',
    imageUrl: '/floor-plans/court-floor-3-blueprint.png',
    alt: 'План третього поверху суду',
    aspectRatio: '1774 / 767',
  },
];

export function getFloorPlan(floor: string) {
  return plans.find((plan) => plan.floor === floor);
}
