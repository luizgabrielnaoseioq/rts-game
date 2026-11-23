// GDD seção 9 — comandantes e heróis.
import type { HeroRarity, TroopClass } from '../contracts/common';

export type HeroAbilityId = 'shield_wall' | 'mule_back' | 'ember_rain' | 'charge' | 'last_rite' | 'reap';

/** Alvo de um bônus por classe: uma classe ou todas. */
export type BonusTarget = TroopClass | 'all';

/**
 * Item da passiva. Valor no nível N = base + perLevel × (N − 1). Frações (0,10 = +10%).
 * - attack/defense/hp: por classe de tropa (combate)
 * - gather: velocidade de coleta
 * - marchSpeed: velocidade de marcha
 * - loot: saque
 */
export type HeroPassiveEffect =
  | { stat: 'attack' | 'defense' | 'hp'; target: BonusTarget; base: number; perLevel: number }
  | { stat: 'gather' | 'marchSpeed' | 'loot' | 'load'; base: number; perLevel: number };

export type HeroAbilityEffect =
  /** O próprio lado recebe `value` de dano extra (negativo = reduz) na rodada. */
  | { kind: 'damageTaken'; round: number; value: number }
  /** O próprio lado (classe ou todas) causa +value de dano na rodada. */
  | { kind: 'roundDamage'; round: number; target: BonusTarget; value: number }
  /** No fim do combate, `value` dos mortos do lado viram feridos. */
  | { kind: 'deadToWounded'; value: number }
  /** Fora de combate: carga da marcha +value. */
  | { kind: 'load'; value: number };

export interface HeroAbilityDef {
  id: HeroAbilityId;
  name: string;
  description: string;
  effect: HeroAbilityEffect;
}

export const HERO_ABILITIES: Record<HeroAbilityId, HeroAbilityDef> = {
  shield_wall: {
    id: 'shield_wall',
    name: 'Parede de Escudos',
    description: 'Rodada 1: o próprio lado recebe −25% de dano.',
    effect: { kind: 'damageTaken', round: 1, value: -0.25 },
  },
  mule_back: {
    id: 'mule_back',
    name: 'Lombo de Mula',
    description: 'Fora de combate: carga da marcha +20%.',
    effect: { kind: 'load', value: 0.2 },
  },
  ember_rain: {
    id: 'ember_rain',
    name: 'Chuva de Brasas',
    description: 'Rodada 2: arqueiros +60% de dano.',
    effect: { kind: 'roundDamage', round: 2, target: 'archer', value: 0.6 },
  },
  charge: {
    id: 'charge',
    name: 'Investida',
    description: 'Rodada 1: cavalaria +50% de dano.',
    effect: { kind: 'roundDamage', round: 1, target: 'cavalry', value: 0.5 },
  },
  last_rite: {
    id: 'last_rite',
    name: 'Última Unção',
    description: 'No fim do combate, 50% dos mortos do lado dela viram feridos.',
    effect: { kind: 'deadToWounded', value: 0.5 },
  },
  reap: {
    id: 'reap',
    name: 'Ceifa',
    description: 'Rodada 3: o próprio lado +40% de dano.',
    effect: { kind: 'roundDamage', round: 3, target: 'all', value: 0.4 },
  },
};

export type HeroObtain =
  | { kind: 'starter' }
  | { kind: 'keep_level'; keepLevel: number }
  | { kind: 'fragments'; fragments: number };

export interface HeroDef {
  id: string;
  name: string;
  title: string;
  rarity: HeroRarity;
  role: string;
  /** Todo herói pode ser comandante principal no MVP. */
  canLead: boolean;
  passive: readonly HeroPassiveEffect[];
  /** Texto da passiva (pt-BR). */
  passiveText: string;
  ability: HeroAbilityId;
  obtain: HeroObtain;
}

const HERO_LIST = [
  {
    id: 'hero_aldric',
    name: 'Aldric Varn',
    title: 'o Último Escudo',
    rarity: 'common',
    role: 'Infantaria / defesa',
    canLead: true,
    passive: [
      { stat: 'defense', target: 'infantry', base: 0.1, perLevel: 0.01 },
      { stat: 'hp', target: 'infantry', base: 0.05, perLevel: 0.005 },
    ],
    passiveText: 'Infantaria: DEF +10% (+1%/nível), VIDA +5% (+0,5%/nível)',
    ability: 'shield_wall',
    obtain: { kind: 'starter' },
  },
  {
    id: 'hero_dorrik',
    name: 'Dorrik Pá-Torta',
    title: 'o Farejador de Veios',
    rarity: 'common',
    role: 'Coleta',
    canLead: true,
    passive: [{ stat: 'gather', base: 0.15, perLevel: 0.015 }],
    passiveText: 'Velocidade de coleta +15% (+1,5%/nível)',
    ability: 'mule_back',
    obtain: { kind: 'keep_level', keepLevel: 2 },
  },
  {
    id: 'hero_seris',
    name: 'Seris Malvane',
    title: 'a Mira de Cinza',
    rarity: 'rare',
    role: 'Arqueiros',
    canLead: true,
    passive: [{ stat: 'attack', target: 'archer', base: 0.1, perLevel: 0.01 }],
    passiveText: 'Arqueiros: ATQ +10% (+1%/nível)',
    ability: 'ember_rain',
    obtain: { kind: 'fragments', fragments: 10 },
  },
  {
    id: 'hero_brannoc',
    name: 'Brannoc Hal',
    title: 'o Corvo de Estrada',
    rarity: 'rare',
    role: 'Cavalaria / velocidade',
    canLead: true,
    passive: [
      { stat: 'attack', target: 'cavalry', base: 0.08, perLevel: 0.008 },
      { stat: 'marchSpeed', base: 0.1, perLevel: 0 },
    ],
    passiveText: 'Cavalaria: ATQ +8% (+0,8%/nível); velocidade de marcha +10% (fixo)',
    ability: 'charge',
    obtain: { kind: 'fragments', fragments: 10 },
  },
  {
    id: 'hero_ysolde',
    name: 'Madre Ysolde',
    title: 'a Vela Negra',
    rarity: 'epic',
    role: 'Sustento (feridos)',
    canLead: true,
    passive: [{ stat: 'hp', target: 'all', base: 0.05, perLevel: 0.005 }],
    passiveText: 'Todas as tropas: VIDA +5% (+0,5%/nível)',
    ability: 'last_rite',
    obtain: { kind: 'fragments', fragments: 20 },
  },
  {
    id: 'hero_vesna',
    name: 'Vesna Korr',
    title: 'a Ceifadora Pálida',
    rarity: 'epic',
    role: 'Ataque / saque',
    canLead: true,
    passive: [
      { stat: 'attack', target: 'all', base: 0.06, perLevel: 0.006 },
      { stat: 'loot', base: 0.15, perLevel: 0 },
    ],
    passiveText: 'Todas as tropas: ATQ +6% (+0,6%/nível); saque +15% (fixo)',
    ability: 'reap',
    obtain: { kind: 'fragments', fragments: 20 },
  },
] as const satisfies readonly HeroDef[];

type HeroIdInternal = (typeof HERO_LIST)[number]['id'];

export const HEROES: Record<HeroIdInternal, HeroDef> = Object.fromEntries(
  HERO_LIST.map((h) => [h.id, h as HeroDef]),
) as Record<HeroIdInternal, HeroDef>;

export const HERO_IDS = HERO_LIST.map((h) => h.id) as HeroIdInternal[];

export const HERO_RARITIES: Record<HeroRarity, { name: string; color: string; fragmentWeight: number }> = {
  common: { name: 'Comum', color: '#A89A84', fragmentWeight: 50 },
  rare: { name: 'Raro', color: '#5B8FC9', fragmentWeight: 38 },
  epic: { name: 'Épico', color: '#9B5BC9', fragmentWeight: 12 },
};

export const HERO_RULES = {
  /** Toda marcha exige 1 comandante principal. */
  commanderRequired: true,
  /** Até 2 secundários (slots liberados pela Cidadela, ver progression). */
  maxSecondaryHeroes: 2,
  /** Secundário aplica 50% dos números da passiva, sem habilidade. */
  secondaryPassiveShare: 0.5,
  /** XP: principal ganha 100%, secundários 50%. */
  secondaryXpShare: 0.5,
  /** Fragmento de herói já liberado vira 100 XP para esse herói. */
  duplicateFragmentXp: 100,
  /** Coleta = 1 XP por 50 recursos coletados. */
  gatherResourcesPerXp: 50,
} as const;

/** XP para subir do nível N para N+1 = round(100 × 1,3^(N−1)). */
export const HERO_XP_CURVE = { base: 100, factor: 1.3, levelCap: 20 } as const;
