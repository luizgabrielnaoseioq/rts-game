// GDD seção 5 — mapa do mundo.
import type { Biome, ObstacleKind, ResourceKey } from '../contracts/common';
import { WORLD_SEED } from './speed';

export const WORLD = {
  width: 120,
  height: 120,
  /** Lado do chunk em casas (120/16 → grade 8×8 de chunks). */
  chunkSize: 16,
  /** Altura (em casas de `d`) de cada banda de bioma. */
  bandHeight: 20,
  seed: WORLD_SEED,
  /** Sem wrap; y = 0 no polo norte. */
  wrap: false,
} as const;

export interface BiomeDef {
  id: Biome;
  name: string;
  /** Faixa de d = floor(|y − equador|), inclusiva. */
  dRange: readonly [number, number];
  faction: 'npc_hollow' | 'npc_brine' | 'npc_pale';
  campLevels: readonly [number, number];
  nodeLevels: readonly [number, number];
  /** Peso dos nós por recurso. */
  nodeWeights: Readonly<Record<ResourceKey, number>>;
  /** Cor base / alternada (xadrez). */
  colors: readonly [string, string];
}

export const BIOMES: Record<Biome, BiomeDef> = {
  vale: {
    id: 'vale',
    name: 'Vales do Braseiro',
    dRange: [0, 19],
    faction: 'npc_hollow',
    campLevels: [1, 3],
    nodeLevels: [1, 2],
    nodeWeights: { food: 40, wood: 40, stone: 15, gold: 5 },
    colors: ['#3E5B35', '#46663C'],
  },
  waste: {
    id: 'waste',
    name: 'Ermos de Sal',
    dRange: [20, 39],
    faction: 'npc_brine',
    campLevels: [4, 7],
    nodeLevels: [3, 4],
    nodeWeights: { food: 15, wood: 10, stone: 40, gold: 35 },
    colors: ['#A8834E', '#B8935C'],
  },
  frost: {
    id: 'frost',
    name: 'Coroa Gélida',
    dRange: [40, 59],
    faction: 'npc_pale',
    campLevels: [8, 10],
    nodeLevels: [5, 6],
    nodeWeights: { food: 10, wood: 20, stone: 30, gold: 40 },
    colors: ['#AFC2CF', '#C3D3DD'],
  },
};

/** Densidades por bioma (GDD 5.2): 4.800 casas por bioma → 384 / 240 / 144. */
export const WORLD_DENSITY = {
  obstacles: 0.08,
  resourceNodes: 0.05,
  npcCamps: 0.03,
} as const;

/** Nível dentro do bioma: 20% de chance de ±1 (preso à faixa). */
export const SPAWN_LEVEL_JITTER = { chance: 0.2 } as const;

export const OBSTACLES: Record<ObstacleKind, { name: string; color: string }> = {
  mountain: { name: 'Montanha', color: '#5A5550' },
  lake: { name: 'Lago', color: '#2C4A5A' },
  ruin: { name: 'Ruína', color: '#6E655C' },
};

/** Spawn de jogador (GDD 5.2). */
export const CITY_SPAWN = {
  /** Casa livre com d ≤ 14 (y 45–74). */
  maxD: 14,
  /** ≥ 8 casas (Chebyshev) de outra cidade. */
  minCityDistance: 8,
  /** ≥ 2 casas (Chebyshev) de nó/acampamento. */
  minEntityDistance: 2,
} as const;

/** Tick do mundo a cada 60 s recria nós/acampamentos até a densidade-alvo. */
export const WORLD_MAINTENANCE = { tickSec: 60 } as const;

/** Visual do mapa (GDD 17): casa de 32 px no zoom 1, zoom 0,5 a 2. */
export const MAP_VIEW = { tilePx: 32, minZoom: 0.5, maxZoom: 2 } as const;
