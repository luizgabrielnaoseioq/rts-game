// GDD seção 11.2 — baús e tabelas de drop.
import type { Resources } from '../contracts/common';
import type { ITEMS } from './items';

type ItemIdLocal = keyof typeof ITEMS;

export interface ChestDropEntry {
  itemId: ItemIdLocal;
  quantity: number;
  weight: number;
}

export type ChestGuaranteed =
  | { kind: 'item'; itemId: ItemIdLocal; quantity: number }
  /** Recursos × nível da Cidadela (baú diário). */
  | { kind: 'resources_per_keep_level'; resources: Resources };

export interface ChestDef {
  id: string;
  name: string;
  origin: string;
  guaranteed: readonly ChestGuaranteed[];
  /** Sorteios independentes na tabela. */
  draws: number;
  table: readonly ChestDropEntry[];
  /** Com FEATURES.speedups = false, speedup sorteado vira este item. */
  speedupFallbackItem: ItemIdLocal;
}

const CHEST_LIST = [
  {
    id: 'chest_iron',
    name: 'Baú de Ferro',
    origin: 'Acampamento 1–3',
    guaranteed: [{ kind: 'item', itemId: 'res_random_s', quantity: 1 }],
    draws: 1,
    table: [
      { itemId: 'res_random_s', quantity: 1, weight: 40 },
      { itemId: 'speedup_1m', quantity: 1, weight: 25 },
      { itemId: 'tome_xp_s', quantity: 1, weight: 20 },
      { itemId: 'hero_fragment', quantity: 1, weight: 10 },
      { itemId: 'speedup_5m', quantity: 1, weight: 5 },
    ],
    speedupFallbackItem: 'res_random_s',
  },
  {
    id: 'chest_bronze',
    name: 'Baú de Bronze',
    origin: 'Acampamento 4–7',
    guaranteed: [{ kind: 'item', itemId: 'res_random_m', quantity: 1 }],
    draws: 2,
    table: [
      { itemId: 'res_random_m', quantity: 1, weight: 35 },
      { itemId: 'speedup_5m', quantity: 1, weight: 20 },
      { itemId: 'tome_xp_m', quantity: 1, weight: 15 },
      { itemId: 'hero_fragment', quantity: 2, weight: 15 },
      { itemId: 'speedup_15m', quantity: 1, weight: 10 },
      { itemId: 'tome_xp_s', quantity: 3, weight: 5 },
    ],
    speedupFallbackItem: 'res_random_m',
  },
  {
    id: 'chest_relic',
    name: 'Relicário',
    origin: 'Acampamento 8–10',
    guaranteed: [
      { kind: 'item', itemId: 'res_random_l', quantity: 1 },
      { kind: 'item', itemId: 'hero_fragment', quantity: 3 },
    ],
    draws: 2,
    table: [
      { itemId: 'res_random_l', quantity: 1, weight: 30 },
      { itemId: 'speedup_15m', quantity: 1, weight: 20 },
      { itemId: 'tome_xp_m', quantity: 1, weight: 20 },
      { itemId: 'hero_fragment', quantity: 5, weight: 15 },
      { itemId: 'speedup_60m', quantity: 1, weight: 10 },
      { itemId: 'tome_xp_l', quantity: 1, weight: 5 },
    ],
    speedupFallbackItem: 'res_random_l',
  },
  {
    id: 'chest_daily',
    name: 'Oferenda do Braseiro',
    origin: '1 por dia, grátis',
    guaranteed: [
      { kind: 'resources_per_keep_level', resources: { food: 400, wood: 400, stone: 300, gold: 150 } },
      { kind: 'item', itemId: 'hero_fragment', quantity: 2 },
    ],
    draws: 1,
    table: [
      { itemId: 'speedup_5m', quantity: 1, weight: 35 },
      { itemId: 'tome_xp_m', quantity: 1, weight: 30 },
      { itemId: 'hero_fragment', quantity: 3, weight: 25 },
      { itemId: 'speedup_15m', quantity: 1, weight: 10 },
    ],
    // O GDD não define "tamanho" do diário; usamos o médio.
    speedupFallbackItem: 'res_random_m',
  },
] as const satisfies readonly ChestDef[];

type ChestIdInternal = (typeof CHEST_LIST)[number]['id'];

export const CHESTS: Record<ChestIdInternal, ChestDef> = Object.fromEntries(
  CHEST_LIST.map((c) => [c.id, c as ChestDef]),
) as Record<ChestIdInternal, ChestDef>;

export const CHEST_IDS = CHEST_LIST.map((c) => c.id) as ChestIdInternal[];

/** Baú de NPC vai para o inventário quando a marcha volta para casa; abrir é instantâneo. */
export const CHEST_RULES = { npcChestOnReturn: true, openIsInstant: true } as const;
