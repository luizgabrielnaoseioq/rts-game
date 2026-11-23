// GDD seção 7 — cidade e prédios.
import type { ResourceKey, Resources } from '../contracts/common';
import { curve, levelsUpTo, roundHalfUp } from './curves';

export const BUILDING_MAX_LEVEL = 10;

/** Curvas (GDD 7.1). nível = nível de destino. */
export const BUILDING_CURVES = {
  costFactor: 1.6,
  timeFactor: 1.5,
  productionFactor: 1.45,
} as const;

export interface BuildingProductionDef {
  resource: ResourceKey;
  /** /h no nível 1, antes do ECONOMY_SPEED. */
  base: number;
}

export interface BuildingDefInput {
  name: string;
  description: string;
  /** Nível da Cidadela que libera a construção. 0 = sempre (a própria Cidadela). */
  unlockKeepLevel: number;
  /** Nível com que a cidade começa (0 = não construído). */
  startLevel: number;
  baseCost: Resources;
  baseTimeSec: number;
  production?: BuildingProductionDef;
}

export interface BuildingLevelDef {
  level: number;
  cost: Resources;
  /** Segundos, antes do GAME_SPEED. */
  timeSec: number;
  /** /h deste nível (só prédios produtores), antes do ECONOMY_SPEED. */
  production: number;
}

export interface BuildingDef extends BuildingDefInput {
  id: string;
  maxLevel: number;
  /** Índice 0 = nível 1. */
  levels: BuildingLevelDef[];
}

const R = (food: number, wood: number, stone: number, gold: number): Resources => ({ food, wood, stone, gold });

const BUILDING_INPUTS = {
  keep: {
    name: 'Cidadela',
    description: 'Nível da vila; limita os outros prédios; produção base.',
    unlockKeepLevel: 0,
    startLevel: 1,
    baseCost: R(180, 200, 150, 40),
    baseTimeSec: 10,
  },
  farm: {
    name: 'Fazenda',
    description: 'Produz comida por hora.',
    unlockKeepLevel: 1,
    startLevel: 1,
    baseCost: R(0, 90, 30, 0),
    baseTimeSec: 6,
    production: { resource: 'food', base: 400 },
  },
  sawmill: {
    name: 'Serraria',
    description: 'Produz madeira por hora.',
    unlockKeepLevel: 1,
    startLevel: 1,
    baseCost: R(90, 0, 30, 0),
    baseTimeSec: 6,
    production: { resource: 'wood', base: 400 },
  },
  barracks: {
    name: 'Quartel',
    description: 'Treina tropas, libera tiers e acelera o treino.',
    unlockKeepLevel: 1,
    startLevel: 1,
    baseCost: R(120, 160, 60, 0),
    baseTimeSec: 8,
  },
  quarry: {
    name: 'Pedreira',
    description: 'Produz pedra por hora.',
    unlockKeepLevel: 2,
    startLevel: 0,
    baseCost: R(90, 90, 0, 0),
    baseTimeSec: 6,
    production: { resource: 'stone', base: 300 },
  },
  warehouse: {
    name: 'Armazém',
    description: 'Capacidade de recursos e recurso protegido de saque.',
    unlockKeepLevel: 2,
    startLevel: 0,
    baseCost: R(60, 140, 100, 0),
    baseTimeSec: 6,
  },
  wall: {
    name: 'Muralha',
    description: 'Bônus de DEF e VIDA a quem defende a cidade.',
    unlockKeepLevel: 2,
    startLevel: 0,
    baseCost: R(0, 80, 180, 20),
    baseTimeSec: 8,
  },
  infirmary: {
    name: 'Enfermaria',
    description: 'Capacidade de feridos.',
    unlockKeepLevel: 2,
    startLevel: 0,
    baseCost: R(100, 100, 60, 0),
    baseTimeSec: 6,
  },
  hero_hall: {
    name: 'Salão dos Heróis',
    description: 'Taverna: recrutamento, nível máximo de herói e comandante de defesa.',
    unlockKeepLevel: 2,
    startLevel: 0,
    baseCost: R(120, 120, 60, 40),
    baseTimeSec: 8,
  },
  gold_mine: {
    name: 'Mina de Ouro',
    description: 'Produz ouro por hora.',
    unlockKeepLevel: 3,
    startLevel: 0,
    baseCost: R(120, 120, 60, 0),
    baseTimeSec: 8,
    production: { resource: 'gold', base: 150 },
  },
} satisfies Record<string, BuildingDefInput>;

export type BuildingTypeIdInternal = keyof typeof BUILDING_INPUTS;

function buildLevels(def: BuildingDefInput): BuildingLevelDef[] {
  return levelsUpTo(BUILDING_MAX_LEVEL).map((level) => ({
    level,
    cost: {
      food: curve(def.baseCost.food, BUILDING_CURVES.costFactor, level),
      wood: curve(def.baseCost.wood, BUILDING_CURVES.costFactor, level),
      stone: curve(def.baseCost.stone, BUILDING_CURVES.costFactor, level),
      gold: curve(def.baseCost.gold, BUILDING_CURVES.costFactor, level),
    },
    timeSec: curve(def.baseTimeSec, BUILDING_CURVES.timeFactor, level),
    production: def.production ? curve(def.production.base, BUILDING_CURVES.productionFactor, level) : 0,
  }));
}

export const BUILDINGS: Record<BuildingTypeIdInternal, BuildingDef> = Object.fromEntries(
  Object.entries(BUILDING_INPUTS).map(([id, def]) => [
    id,
    { ...(def as BuildingDefInput), id, maxLevel: BUILDING_MAX_LEVEL, levels: buildLevels(def as BuildingDefInput) },
  ]),
) as Record<BuildingTypeIdInternal, BuildingDef>;

export const BUILDING_IDS = Object.keys(BUILDING_INPUTS) as BuildingTypeIdInternal[];

/** Pré-requisitos da Cidadela (GDD 7): nível N≥3 exige Muralha ≥ N−1; N≥5 exige também Quartel ≥ N−1. */
export const KEEP_REQUIREMENTS = [
  { typeId: 'wall', fromKeepLevel: 3, offset: -1 },
  { typeId: 'barracks', fromKeepLevel: 5, offset: -1 },
] as const satisfies readonly { typeId: BuildingTypeIdInternal; fromKeepLevel: number; offset: number }[];

/** Cancelar obra devolve 50% do custo. */
export const BUILD_CANCEL_REFUND_RATE = 0.5;

// ── Efeitos (GDD 7.4) ──

export const WAREHOUSE = {
  /** capacidade(nv) = 5000 + 4000 × 1,5^(nv−1); nv 0 = 5000 — por recurso */
  capacityBase: 5000,
  capacityBonus: 4000,
  capacityFactor: 1.5,
  /** protegido(nv) = 1000 + 1000 × 1,45^(nv−1); nv 0 = 1000 — por recurso, não saqueável */
  protectedBase: 1000,
  protectedBonus: 1000,
  protectedFactor: 1.45,
} as const;

export const INFIRMARY = {
  /** feridos(nv) = 100 + 200 × 1,5^(nv−1); nv 0 = 100 */
  base: 100,
  bonus: 200,
  factor: 1.5,
} as const;

export const BARRACKS = {
  /** tempoTreino × (1 − 0,04 × (nv−1)) */
  timeReductionPerLevel: 0.04,
  /** lote máx. = 50 × nv */
  batchPerLevel: 50,
} as const;

export const WALL = {
  /** +5% DEF e +5% VIDA por nível a quem defende a cidade (inclui reforços) */
  defensePerLevel: 0.05,
  hpPerLevel: 0.05,
} as const;

export const HERO_HALL = {
  /** nívelMáxHerói = max(2, 2 × nv), teto 20 */
  minMaxHeroLevel: 2,
  maxHeroLevelPerHallLevel: 2,
  heroLevelCap: 20,
  /** custo do chamado = round(300 × (1 − 0,03 × nv)) ouro */
  summonBaseGold: 300,
  summonDiscountPerLevel: 0.03,
  /** Fragmentos por chamado. */
  fragmentsPerSummon: 5,
  /** Chamados grátis por dia (Salão ≥ 1). */
  freeSummonsPerDay: 1,
  /** Todo 10º chamado (pago ou grátis) é de herói Épico. */
  epicPityEvery: 10,
} as const;

/** Tabelas de efeito por nível (1..10) para exibição; as fórmulas em formulas/ são a fonte. */
export const BUILDING_EFFECT_TABLES = {
  warehouseCapacity: levelsUpTo(10).map((nv) =>
    roundHalfUp(WAREHOUSE.capacityBase + WAREHOUSE.capacityBonus * WAREHOUSE.capacityFactor ** (nv - 1)),
  ),
  warehouseProtected: levelsUpTo(10).map((nv) =>
    roundHalfUp(WAREHOUSE.protectedBase + WAREHOUSE.protectedBonus * WAREHOUSE.protectedFactor ** (nv - 1)),
  ),
  infirmaryCapacity: levelsUpTo(10).map((nv) =>
    roundHalfUp(INFIRMARY.base + INFIRMARY.bonus * INFIRMARY.factor ** (nv - 1)),
  ),
};
