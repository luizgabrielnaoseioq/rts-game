// GDD 11 — sorteio de baús. Puro: o servidor passa um Rng (ex.: baseado em crypto), o cliente nunca sorteia.
import type { Resources } from '../contracts/common';
import type { ChestRewardDto } from '../contracts/rest';
import { CHESTS, type ChestDropEntry } from '../config/chests';
import { FEATURES, ITEMS } from '../config/items';
import type { ChestTypeId, HeroTypeId, ItemId } from '../ids';
import { pickWeighted, type Rng } from '../world/rng';
import { rollFragmentHero } from './heroes';
import { emptyResources } from './resources';

export interface RollChestOptions {
  /** Nível da Cidadela (baú diário escala com ele). */
  keepLevel: number;
  speedupsEnabled?: boolean;
}

/** Resolve 1 entrada (item × qtd) em recompensas concretas. */
function resolveItem(itemId: ItemId, quantity: number, rng: Rng, out: ChestRewardDto[], fallback: ItemId, speedups: boolean): void {
  const def = ITEMS[itemId];
  const eff = def.effect;
  if (eff.kind === 'speedup' && !speedups) {
    resolveItem(fallback, quantity, rng, out, fallback, speedups);
    return;
  }
  if (eff.kind === 'resource_random') {
    for (let i = 0; i < quantity; i++) {
      const opt = pickWeighted(rng, eff.options, (o) => o.weight);
      out.push({ kind: 'resources', resources: { [opt.resource]: opt.amount } as Partial<Resources> });
    }
    return;
  }
  if (eff.kind === 'hero_fragment') {
    const byHero: Partial<Record<HeroTypeId, number>> = {};
    for (let i = 0; i < quantity; i++) {
      const h = rollFragmentHero(rng);
      byHero[h] = (byHero[h] ?? 0) + 1;
    }
    for (const [heroTypeId, count] of Object.entries(byHero) as [HeroTypeId, number][]) {
      out.push({ kind: 'heroFragments', heroTypeId, count });
    }
    return;
  }
  out.push({ kind: 'item', itemId, quantity });
}

/**
 * Sorteia as recompensas: garantidos + N sorteios independentes na tabela.
 * res_random vira recurso na hora; fragmentos viram herói específico; speedups/tomos vão para o inventário.
 * (Fragmento de herói já liberado → 100 XP: conversão feita no back, que conhece o estado.)
 */
export function rollChest(chestTypeId: ChestTypeId, rng: Rng, opts: RollChestOptions): ChestRewardDto[] {
  const def = CHESTS[chestTypeId];
  const speedups = opts.speedupsEnabled ?? FEATURES.speedups;
  const out: ChestRewardDto[] = [];
  const fallback = def.speedupFallbackItem as ItemId;
  for (const g of def.guaranteed) {
    if (g.kind === 'resources_per_keep_level') {
      const r = emptyResources();
      for (const k of Object.keys(r) as (keyof Resources)[]) r[k] = g.resources[k] * Math.max(1, opts.keepLevel);
      out.push({ kind: 'resources', resources: r });
    } else {
      resolveItem(g.itemId as ItemId, g.quantity, rng, out, fallback, speedups);
    }
  }
  for (let d = 0; d < def.draws; d++) {
    const e = pickWeighted<ChestDropEntry>(rng, def.table, (x) => x.weight);
    resolveItem(e.itemId as ItemId, e.quantity, rng, out, fallback, speedups);
  }
  return out;
}

/** Soma os recursos de uma lista de recompensas. */
export function rewardResources(rewards: readonly ChestRewardDto[]): Resources {
  const r = emptyResources();
  for (const x of rewards) {
    if (x.kind !== 'resources') continue;
    for (const k of Object.keys(r) as (keyof Resources)[]) r[k] += x.resources[k] ?? 0;
  }
  return r;
}
