// GDD 6 e 7 — produção, capacidade e liquidação preguiçosa de recursos. Funções puras.
import type { IsoDate, ResourceKey, Resources } from '../contracts/common';
import { RESOURCE_KEYS } from '../contracts/common';
import { BUILDINGS, WAREHOUSE } from '../config/buildings';
import { roundHalfUp } from '../config/curves';
import { KEEP_BASE_PRODUCTION } from '../config/resources';
import { DEFAULT_SPEED, type SpeedSettings } from '../config/speed';
import type { BuildingLevels, BuildingTypeId } from '../ids';

const HOUR_MS = 3_600_000;

// ── helpers de Resources ──

export function emptyResources(): Resources {
  return { food: 0, wood: 0, stone: 0, gold: 0 };
}

export function mapResources(fn: (k: ResourceKey) => number): Resources {
  return { food: fn('food'), wood: fn('wood'), stone: fn('stone'), gold: fn('gold') };
}

export function addResources(a: Resources, b: Partial<Resources>): Resources {
  return mapResources((k) => a[k] + (b[k] ?? 0));
}

export function subtractResources(a: Resources, b: Partial<Resources>): Resources {
  return mapResources((k) => a[k] - (b[k] ?? 0));
}

export function scaleResources(a: Partial<Resources>, factor: number): Resources {
  return mapResources((k) => (a[k] ?? 0) * factor);
}

export function floorResources(a: Resources): Resources {
  return mapResources((k) => Math.floor(a[k]));
}

export function sumResources(a: Partial<Resources>): number {
  return RESOURCE_KEYS.reduce((s, k) => s + (a[k] ?? 0), 0);
}

export function hasResources(have: Resources, cost: Partial<Resources>): boolean {
  return RESOURCE_KEYS.every((k) => have[k] + 1e-9 >= (cost[k] ?? 0));
}

/** Quanto falta de cada recurso (0 onde já tem). */
export function missingResources(have: Resources, cost: Partial<Resources>): Resources {
  return mapResources((k) => Math.max(0, Math.ceil((cost[k] ?? 0) - have[k])));
}

// ── produção e capacidade ──

/** Produção /h de um prédio produtor no nível (antes do ECONOMY_SPEED). 0 se não produz. */
export function buildingProduction(typeId: BuildingTypeId, level: number): number {
  const def = BUILDINGS[typeId];
  if (!def.production || level <= 0) return 0;
  return def.levels[Math.min(level, def.maxLevel) - 1].production;
}

export interface ProductionOptions {
  /** Manutenção de tropas em comida/h (ver training.troopUpkeepPerHour). */
  upkeepPerHour?: number;
  speed?: SpeedSettings;
}

/**
 * Produção líquida por hora: base fixa da Cidadela + prédios, × ECONOMY_SPEED;
 * a manutenção sai da comida (pode ficar negativa; o settle segura em 0).
 */
export function productionPerHour(levels: BuildingLevels, opts: ProductionOptions = {}): Resources {
  const speed = opts.speed ?? DEFAULT_SPEED;
  const gross = { ...KEEP_BASE_PRODUCTION };
  for (const [typeId, level] of Object.entries(levels) as [BuildingTypeId, number | undefined][]) {
    const prod = BUILDINGS[typeId]?.production;
    if (!prod || !level) continue;
    gross[prod.resource] += buildingProduction(typeId, level);
  }
  const out = scaleResources(gross, speed.economySpeed);
  out.food -= opts.upkeepPerHour ?? 0;
  return out;
}

/** Capacidade por recurso do Armazém: 5000 + 4000 × 1,5^(nv−1) (nv 0 = 5000). */
export function warehouseCapacity(warehouseLevel: number): number {
  if (warehouseLevel <= 0) return WAREHOUSE.capacityBase;
  return roundHalfUp(WAREHOUSE.capacityBase + WAREHOUSE.capacityBonus * WAREHOUSE.capacityFactor ** (warehouseLevel - 1));
}

/** Recurso protegido de saque: 1000 + 1000 × 1,45^(nv−1) (nv 0 = 1000). */
export function warehouseProtected(warehouseLevel: number): number {
  if (warehouseLevel <= 0) return WAREHOUSE.protectedBase;
  return roundHalfUp(
    WAREHOUSE.protectedBase + WAREHOUSE.protectedBonus * WAREHOUSE.protectedFactor ** (warehouseLevel - 1),
  );
}

export function capacity(warehouseLevel: number): Resources {
  const c = warehouseCapacity(warehouseLevel);
  return { food: c, wood: c, stone: c, gold: c };
}

export function protectedResources(warehouseLevel: number): Resources {
  const p = warehouseProtected(warehouseLevel);
  return { food: p, wood: p, stone: p, gold: p };
}

// ── liquidação (lazy) ──

export interface ResourceState {
  resources: Resources;
  /** epoch ms em que `resources` valia isso. */
  at: number;
}

/**
 * Avança os recursos até `toMs` com as taxas dadas.
 * - Produção positiva para na capacidade; acima do cap (saque/coleta/baú) não perde.
 * - Taxa negativa (comida com manutenção) reduz até 0.
 * - Nunca volta no tempo.
 */
export function settle(state: ResourceState, ratesPerHour: Resources, cap: Resources, toMs: number): ResourceState {
  const t = Math.max(toMs, state.at);
  const h = (t - state.at) / HOUR_MS;
  const resources = mapResources((k) => {
    const v = state.resources[k];
    const rate = ratesPerHour[k];
    if (rate >= 0) return v < cap[k] ? Math.min(cap[k], v + rate * h) : v;
    return Math.max(0, v + rate * h);
  });
  return { resources, at: t };
}

/** Projeção no cliente a partir do CityStateDto (resources em resourcesAt). */
export function projectResources(
  city: { resources: Resources; resourcesAt: IsoDate | number; productionPerHour: Resources; capacity: Resources },
  nowMs: number,
): Resources {
  const at = typeof city.resourcesAt === 'number' ? city.resourcesAt : Date.parse(city.resourcesAt);
  return settle({ resources: city.resources, at }, city.productionPerHour, city.capacity, nowMs).resources;
}
