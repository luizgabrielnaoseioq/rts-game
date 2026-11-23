// GDD seção 11.1 — itens.
import type { ResourceKey } from '../contracts/common';

export interface RandomResourceOption {
  resource: ResourceKey;
  amount: number;
  weight: number;
}

export type ItemEffect =
  /** Sorteia 1 recurso (aplicado direto na abertura do baú). */
  | { kind: 'resource_random'; options: readonly RandomResourceOption[] }
  /** Reduz um timer de obra, treino ou cura (não vale para marcha). */
  | { kind: 'speedup'; seconds: number }
  /** XP para o herói escolhido. */
  | { kind: 'hero_xp'; xp: number }
  /** Fragmento aleatório de herói (raridade sorteada, ver heroes). */
  | { kind: 'hero_fragment' };

export interface ItemDef {
  id: string;
  name: string;
  description: string;
  /** Fica no inventário? (res_random e fragmento são resolvidos na abertura) */
  stackable: boolean;
  effect: ItemEffect;
}

const resOptions = (food: number, wood: number, stone: number, gold: number): RandomResourceOption[] => [
  { resource: 'food', amount: food, weight: 35 },
  { resource: 'wood', amount: wood, weight: 35 },
  { resource: 'stone', amount: stone, weight: 20 },
  { resource: 'gold', amount: gold, weight: 10 },
];

const ITEM_LIST = [
  {
    id: 'res_random_s',
    name: 'Saco de Recursos (pequeno)',
    description: '500 comida ou 500 madeira ou 400 pedra ou 200 ouro.',
    stackable: false,
    effect: { kind: 'resource_random', options: resOptions(500, 500, 400, 200) },
  },
  {
    id: 'res_random_m',
    name: 'Saco de Recursos (médio)',
    description: '2.500 comida ou 2.500 madeira ou 2.000 pedra ou 1.000 ouro.',
    stackable: false,
    effect: { kind: 'resource_random', options: resOptions(2500, 2500, 2000, 1000) },
  },
  {
    id: 'res_random_l',
    name: 'Saco de Recursos (grande)',
    description: '12.500 comida ou 12.500 madeira ou 10.000 pedra ou 5.000 ouro.',
    stackable: false,
    effect: { kind: 'resource_random', options: resOptions(12500, 12500, 10000, 5000) },
  },
  {
    id: 'speedup_1m',
    name: 'Acelerar 1 min',
    description: 'Reduz em 1 minuto um timer de obra, treino ou cura.',
    stackable: true,
    effect: { kind: 'speedup', seconds: 60 },
  },
  {
    id: 'speedup_5m',
    name: 'Acelerar 5 min',
    description: 'Reduz em 5 minutos um timer de obra, treino ou cura.',
    stackable: true,
    effect: { kind: 'speedup', seconds: 300 },
  },
  {
    id: 'speedup_15m',
    name: 'Acelerar 15 min',
    description: 'Reduz em 15 minutos um timer de obra, treino ou cura.',
    stackable: true,
    effect: { kind: 'speedup', seconds: 900 },
  },
  {
    id: 'speedup_60m',
    name: 'Acelerar 60 min',
    description: 'Reduz em 60 minutos um timer de obra, treino ou cura.',
    stackable: true,
    effect: { kind: 'speedup', seconds: 3600 },
  },
  {
    id: 'tome_xp_s',
    name: 'Tomo de Experiência (pequeno)',
    description: '200 XP para o herói escolhido.',
    stackable: true,
    effect: { kind: 'hero_xp', xp: 200 },
  },
  {
    id: 'tome_xp_m',
    name: 'Tomo de Experiência (médio)',
    description: '1.000 XP para o herói escolhido.',
    stackable: true,
    effect: { kind: 'hero_xp', xp: 1000 },
  },
  {
    id: 'tome_xp_l',
    name: 'Tomo de Experiência (grande)',
    description: '5.000 XP para o herói escolhido.',
    stackable: true,
    effect: { kind: 'hero_xp', xp: 5000 },
  },
  {
    id: 'hero_fragment',
    name: 'Fragmento de Herói',
    description: 'Fragmento aleatório de herói (Comum 50 / Raro 38 / Épico 12).',
    stackable: false,
    effect: { kind: 'hero_fragment' },
  },
] as const satisfies readonly ItemDef[];

type ItemIdInternal = (typeof ITEM_LIST)[number]['id'];

export const ITEMS: Record<ItemIdInternal, ItemDef> = Object.fromEntries(
  ITEM_LIST.map((i) => [i.id, i as ItemDef]),
) as Record<ItemIdInternal, ItemDef>;

export const ITEM_IDS = ITEM_LIST.map((i) => i.id) as ItemIdInternal[];

/** Speedups são opcionais: com `false`, cada speedup sorteado vira `res_random` do tamanho do baú. */
export const FEATURES = {
  speedups: true,
} as const;
