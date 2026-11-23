// GDD 12 — coleta em nós de recurso.
import type { ResourceKey } from '../contracts/common';
import { RESOURCE_NODE_BASES } from '../config/resourceNodes';
import { roundHalfUp } from '../config/curves';
import { DEFAULT_SPEED, type SpeedSettings } from '../config/speed';

/** capacidadeNó = capBase[recurso] × 1,6^(nívelNó−1) */
export function nodeCapacity(resource: ResourceKey, level: number): number {
  return roundHalfUp(RESOURCE_NODE_BASES.capacity[resource] * RESOURCE_NODE_BASES.capacityFactor ** (level - 1));
}

/** taxa (/min) = taxaBase × 1,3^(nívelNó−1) × (1 + bônus de coleta) × ECONOMY_SPEED × GAME_SPEED */
export function gatherRatePerMin(
  resource: ResourceKey,
  level: number,
  gatherBonus = 0,
  speed: SpeedSettings = DEFAULT_SPEED,
): number {
  return (
    RESOURCE_NODE_BASES.ratePerMin[resource] *
    RESOURCE_NODE_BASES.rateFactor ** (level - 1) *
    (1 + gatherBonus) *
    speed.economySpeed *
    speed.gameSpeed
  );
}

/** duração = min(carga, restanteNó) / taxa (ms). */
export function gatherDurationMs(carry: number, nodeRemaining: number, ratePerMin: number): number {
  const amount = Math.max(0, Math.min(carry, nodeRemaining));
  if (ratePerMin <= 0) return Number.POSITIVE_INFINITY;
  return Math.round((amount / ratePerMin) * 60_000);
}

/** Coletado após `elapsedMs` (recall no meio ou fim da coleta), limitado a `maxAmount`. */
export function gatheredAmount(elapsedMs: number, ratePerMin: number, maxAmount: number): number {
  const raw = (Math.max(0, elapsedMs) / 60_000) * ratePerMin;
  return Math.max(0, Math.min(maxAmount, Math.floor(raw + 1e-9)));
}

/** Respawn do nó esvaziado (ms, / GAME_SPEED). */
export function nodeRespawnMs(speed: SpeedSettings = DEFAULT_SPEED): number {
  return Math.round((RESOURCE_NODE_BASES.respawnSec * 1000) / speed.gameSpeed);
}
