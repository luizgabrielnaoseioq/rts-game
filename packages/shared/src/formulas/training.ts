// GDD 7.4 e 8 — treino, cura, manutenção, poder e enfermaria.
import type { Resources } from '../contracts/common';
import { BARRACKS, INFIRMARY } from '../config/buildings';
import { roundHalfUp } from '../config/curves';
import { DEFAULT_SPEED, type SpeedSettings } from '../config/speed';
import { HEALING, TIERS, TROOPS } from '../config/troops';
import type { BuildingLevels, TroopCounts, TroopTypeId } from '../ids';
import { buildingsPower } from './buildings';
import { mapResources } from './resources';

function entries(troops: TroopCounts): [TroopTypeId, number][] {
  return (Object.entries(troops) as [TroopTypeId, number | undefined][])
    .filter(([id, n]) => TROOPS[id] && (n ?? 0) > 0)
    .map(([id, n]) => [id, n ?? 0]);
}

export function trainingCost(troopTypeId: TroopTypeId, count: number): Resources {
  const c = TROOPS[troopTypeId].cost;
  return mapResources((k) => c[k] * count);
}

/** Fator do quartel: × (1 − 0,04 × (nv−1)). */
export function barracksTimeFactor(barracksLevel: number): number {
  return 1 - BARRACKS.timeReductionPerLevel * (Math.max(1, barracksLevel) - 1);
}

/** Tempo do lote = qtd × tempo × fatorQuartel / GAME_SPEED (ms). */
export function trainingDurationMs(
  troopTypeId: TroopTypeId,
  count: number,
  barracksLevel: number,
  speed: SpeedSettings = DEFAULT_SPEED,
): number {
  return Math.round((count * TROOPS[troopTypeId].trainTimeSec * barracksTimeFactor(barracksLevel) * 1000) / speed.gameSpeed);
}

/** Lote máx. = 50 × nv. */
export function maxBatch(barracksLevel: number): number {
  return BARRACKS.batchPerLevel * Math.max(0, barracksLevel);
}

/** Tier liberado pelo Quartel (T1: 1, T2: 4, T3: 8). */
export function isTroopUnlocked(troopTypeId: TroopTypeId, barracksLevel: number): boolean {
  return barracksLevel >= TIERS[TROOPS[troopTypeId].tier].barracksLevel;
}

/** Cura: 40% do custo de treino por unidade (arredondado pra cima no total). */
export function healingCost(troopTypeId: TroopTypeId, count: number): Resources {
  const c = TROOPS[troopTypeId].cost;
  return mapResources((k) => Math.ceil(c[k] * count * HEALING.costRate));
}

/** Cura: 40% do tempo de treino base por unidade (sem o fator do Quartel), / GAME_SPEED. */
export function healingDurationMs(troopTypeId: TroopTypeId, count: number, speed: SpeedSettings = DEFAULT_SPEED): number {
  return Math.round((count * TROOPS[troopTypeId].trainTimeSec * HEALING.timeRate * 1000) / speed.gameSpeed);
}

/** Capacidade de feridos da Enfermaria: 100 + 200 × 1,5^(nv−1) (nv 0 = 100). */
export function infirmaryCapacity(infirmaryLevel: number): number {
  if (infirmaryLevel <= 0) return INFIRMARY.base;
  return roundHalfUp(INFIRMARY.base + INFIRMARY.bonus * INFIRMARY.factor ** (infirmaryLevel - 1));
}

/** Feridos que cabem; o resto morre. */
export function admitWounded(wounded: number, usedCapacity: number, capacityTotal: number): { admitted: number; dead: number } {
  const free = Math.max(0, capacityTotal - usedCapacity);
  const admitted = Math.min(wounded, free);
  return { admitted, dead: wounded - admitted };
}

/** Manutenção em comida/h das tropas (sai da produção de comida). */
export function troopUpkeepPerHour(troops: TroopCounts): number {
  return entries(troops).reduce((s, [id, n]) => s + TROOPS[id].upkeepPerHour * n, 0);
}

export function troopsPower(troops: TroopCounts): number {
  return entries(troops).reduce((s, [id, n]) => s + TROOPS[id].power * n, 0);
}

export function troopCount(troops: TroopCounts): number {
  return entries(troops).reduce((s, [, n]) => s + n, 0);
}

/** Poder do jogador = Σ(tropas × poder) + 20 × Σ(níveis de prédios). */
export function playerPower(troops: TroopCounts, levels: BuildingLevels): number {
  return troopsPower(troops) + buildingsPower(levels);
}

export function addTroops(a: TroopCounts, b: TroopCounts): TroopCounts {
  const out: TroopCounts = { ...a };
  for (const [id, n] of entries(b)) out[id] = (out[id] ?? 0) + n;
  return out;
}
