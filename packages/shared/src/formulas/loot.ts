// GDD 13.2 — saque (atacante vence contra jogador).
import type { Resources } from '../contracts/common';
import { COMBAT } from '../config/balance';
import { mapResources, sumResources } from './resources';

/** saqueável[r] = max(0, estoque[r] − protegido[r]) × LOOT_RATE × (1 + bônusSaque) */
export function lootable(stock: Resources, protectedAmount: Resources, lootBonus = 0): Resources {
  return mapResources((k) => Math.max(0, stock[k] - protectedAmount[k]) * COMBAT.LOOT_RATE * (1 + lootBonus));
}

/**
 * Se Σ saqueável > cargaLivre, cada recurso × (cargaLivre / Σ saqueável); saque[r] = floor(resultado).
 */
export function distributeLoot(lootableAmount: Resources, freeCarry: number): Resources {
  const total = sumResources(lootableAmount);
  const factor = total > freeCarry && total > 0 ? Math.max(0, freeCarry) / total : 1;
  return mapResources((k) => Math.floor(lootableAmount[k] * factor));
}
