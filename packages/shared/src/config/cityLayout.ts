// Layout da cidade: 10 lotes, um prédio de cada tipo (GDD 17 e 18: sem prédios repetidos no MVP).
import type { BUILDINGS } from './buildings';

type BuildingIdLocal = keyof typeof BUILDINGS;

export interface CitySlotDef {
  slot: number;
  /** Único tipo permitido no lote. */
  typeId: BuildingIdLocal;
  /** Posição na grade isométrica fake (coluna/linha). */
  col: number;
  row: number;
}

export const CITY_LAYOUT: readonly CitySlotDef[] = [
  { slot: 0, typeId: 'keep', col: 1, row: 1 },
  { slot: 1, typeId: 'farm', col: 0, row: 0 },
  { slot: 2, typeId: 'sawmill', col: 1, row: 0 },
  { slot: 3, typeId: 'barracks', col: 2, row: 0 },
  { slot: 4, typeId: 'quarry', col: 0, row: 1 },
  { slot: 5, typeId: 'warehouse', col: 2, row: 1 },
  { slot: 6, typeId: 'wall', col: 3, row: 1 },
  { slot: 7, typeId: 'infirmary', col: 0, row: 2 },
  { slot: 8, typeId: 'hero_hall', col: 1, row: 2 },
  { slot: 9, typeId: 'gold_mine', col: 2, row: 2 },
];

export const CITY_SLOT_COUNT = CITY_LAYOUT.length;

export function slotForBuilding(typeId: BuildingIdLocal): number {
  const s = CITY_LAYOUT.find((d) => d.typeId === typeId);
  if (!s) throw new Error(`Sem slot para o prédio ${typeId}`);
  return s.slot;
}

export function buildingForSlot(slot: number): BuildingIdLocal | null {
  return CITY_LAYOUT.find((d) => d.slot === slot)?.typeId ?? null;
}
