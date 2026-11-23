// GDD seção 12 — nós de recurso e coleta.
import type { Biome, ResourceKey, Resources } from '../contracts/common';
import { curve, curveRaw, levelsUpTo } from './curves';

export const RESOURCE_NODE_BASES = {
  /** capacidadeNó = capBase[recurso] × 1,6^(nívelNó−1) */
  capacity: { food: 6000, wood: 6000, stone: 4500, gold: 2500 } as Resources,
  capacityFactor: 1.6,
  /** taxa (/min) = taxaBase[recurso] × 1,3^(nívelNó−1) × (1 + bônus) × ECONOMY_SPEED × GAME_SPEED */
  ratePerMin: { food: 80, wood: 80, stone: 60, gold: 30 } as Resources,
  rateFactor: 1.3,
  /** Nó esvaziado some e reaparece em outra casa do mesmo bioma após 120 s (/GAME_SPEED). */
  respawnSec: 120,
} as const;

export const RESOURCE_NODE_MAX_LEVEL = 6;

export interface ResourceNodeLevelDef {
  level: number;
  biome: Biome;
  capacity: Resources;
  /** Taxa base por minuto (sem bônus/velocidade), sem arredondar. */
  ratePerMin: Resources;
}

const NODE_LEVEL_BIOME: Record<number, Biome> = { 1: 'vale', 2: 'vale', 3: 'waste', 4: 'waste', 5: 'frost', 6: 'frost' };

function mapRes(fn: (k: ResourceKey) => number): Resources {
  return { food: fn('food'), wood: fn('wood'), stone: fn('stone'), gold: fn('gold') };
}

/** Índice 0 = nível 1. */
export const RESOURCE_NODE_LEVELS: ResourceNodeLevelDef[] = levelsUpTo(RESOURCE_NODE_MAX_LEVEL).map((level) => ({
  level,
  biome: NODE_LEVEL_BIOME[level],
  capacity: mapRes((k) => curve(RESOURCE_NODE_BASES.capacity[k], RESOURCE_NODE_BASES.capacityFactor, level)),
  ratePerMin: mapRes((k) => curveRaw(RESOURCE_NODE_BASES.ratePerMin[k], RESOURCE_NODE_BASES.rateFactor, level)),
}));
