// GDD 7 e 15 — custo, duração, requisitos, nível da vila, filas.
import type { Resources } from '../contracts/common';
import type { ErrorCode } from '../contracts/errors';
import { BUILD_CANCEL_REFUND_RATE, BUILDINGS, KEEP_REQUIREMENTS } from '../config/buildings';
import { KEEP_LEVELS } from '../config/progression';
import { POWER } from '../config/troops';
import { DEFAULT_SPEED, type SpeedSettings } from '../config/speed';
import type { BuildingLevels, BuildingTypeId } from '../ids';
import { hasResources, missingResources, mapResources } from './resources';

/** Custo para chegar ao nível `targetLevel`. */
export function upgradeCost(typeId: BuildingTypeId, targetLevel: number): Resources {
  return { ...BUILDINGS[typeId].levels[targetLevel - 1].cost };
}

/** Duração em segundos (antes do GAME_SPEED). */
export function upgradeTimeSec(typeId: BuildingTypeId, targetLevel: number): number {
  return BUILDINGS[typeId].levels[targetLevel - 1].timeSec;
}

/** Duração em ms já com GAME_SPEED. */
export function upgradeDurationMs(typeId: BuildingTypeId, targetLevel: number, speed: SpeedSettings = DEFAULT_SPEED): number {
  return Math.round((upgradeTimeSec(typeId, targetLevel) * 1000) / speed.gameSpeed);
}

/** Nível da vila = nível da Cidadela. */
export function cityLevel(levels: BuildingLevels): number {
  return levels.keep ?? 0;
}

export function isBuildingUnlocked(typeId: BuildingTypeId, keepLevel: number): boolean {
  return keepLevel >= BUILDINGS[typeId].unlockKeepLevel;
}

/** Nível máximo permitido agora: nenhum prédio passa da Cidadela (a Cidadela vai até 10). */
export function maxBuildingLevel(typeId: BuildingTypeId, keepLevel: number): number {
  const def = BUILDINGS[typeId];
  return typeId === 'keep' ? def.maxLevel : Math.min(def.maxLevel, keepLevel);
}

export interface BuildingRequirement {
  typeId: BuildingTypeId;
  level: number;
}

/** Requisitos para levar `typeId` ao `targetLevel` (fora o limite de nível da Cidadela). */
export function requirementsFor(typeId: BuildingTypeId, targetLevel: number): BuildingRequirement[] {
  const reqs: BuildingRequirement[] = [];
  if (typeId === 'keep') {
    for (const r of KEEP_REQUIREMENTS) {
      if (targetLevel >= r.fromKeepLevel) reqs.push({ typeId: r.typeId, level: targetLevel + r.offset });
    }
  } else {
    const unlock = BUILDINGS[typeId].unlockKeepLevel;
    // Cidadela precisa estar no nível de desbloqueio e ≥ nível de destino.
    reqs.push({ typeId: 'keep', level: Math.max(unlock, targetLevel) });
  }
  return reqs;
}

export function requirementsMet(
  typeId: BuildingTypeId,
  targetLevel: number,
  levels: BuildingLevels,
): { ok: boolean; missing: BuildingRequirement[] } {
  const missing = requirementsFor(typeId, targetLevel).filter((r) => (levels[r.typeId] ?? 0) < r.level);
  return { ok: missing.length === 0, missing };
}

/** Filas de obra: 1 (2 a partir da Cidadela 6). */
export function buildQueueSize(keepLevel: number): number {
  return KEEP_LEVELS[Math.max(1, Math.min(keepLevel, KEEP_LEVELS.length)) - 1].buildQueues;
}

/** Cancelar devolve 50% do custo (arredondado pra baixo). */
export function cancelRefund(cost: Resources): Resources {
  return mapResources((k) => Math.floor(cost[k] * BUILD_CANCEL_REFUND_RATE));
}

/** Parte do poder vinda dos prédios: 20 × Σ níveis. */
export function buildingsPower(levels: BuildingLevels): number {
  return Object.values(levels).reduce<number>((s, l) => s + (l ?? 0), 0) * POWER.perBuildingLevel;
}

export type UpgradeCheck =
  | { ok: true; targetLevel: number; cost: Resources; durationMs: number }
  | { ok: false; code: ErrorCode; details?: Record<string, unknown> };

/**
 * Validação completa de "subir prédio" (mesma regra no back e na prévia do front).
 * `activeUpgrades` = obras em andamento na cidade.
 */
export function checkUpgrade(params: {
  typeId: BuildingTypeId;
  levels: BuildingLevels;
  resources: Resources;
  activeUpgrades: number;
  /** O próprio prédio já está em obra? */
  alreadyUpgrading?: boolean;
  speed?: SpeedSettings;
}): UpgradeCheck {
  const { typeId, levels, resources, activeUpgrades } = params;
  const keepLevel = cityLevel(levels);
  const current = levels[typeId] ?? 0;
  const target = current + 1;
  const def = BUILDINGS[typeId];
  if (params.alreadyUpgrading) return { ok: false, code: 'BUILD_QUEUE_FULL', details: { reason: 'already_upgrading' } };
  if (current >= def.maxLevel) return { ok: false, code: 'MAX_LEVEL_REACHED' };
  if (!isBuildingUnlocked(typeId, keepLevel) || target > maxBuildingLevel(typeId, keepLevel)) {
    return { ok: false, code: 'REQUIREMENT_NOT_MET', details: { missing: [{ typeId: 'keep', level: Math.max(def.unlockKeepLevel, target) }] } };
  }
  const req = requirementsMet(typeId, target, levels);
  if (!req.ok) return { ok: false, code: 'REQUIREMENT_NOT_MET', details: { missing: req.missing } };
  if (activeUpgrades >= buildQueueSize(keepLevel)) return { ok: false, code: 'BUILD_QUEUE_FULL' };
  const cost = upgradeCost(typeId, target);
  if (!hasResources(resources, cost)) {
    return { ok: false, code: 'INSUFFICIENT_RESOURCES', details: { missing: missingResources(resources, cost) } };
  }
  return { ok: true, targetLevel: target, cost, durationMs: upgradeDurationMs(typeId, target, params.speed) };
}
