// Constantes globais: combate, saque, PvP, escudos, start kit, filas.
import type { Resources } from '../contracts/common';
import type { BUILDINGS } from './buildings';
import type { HEROES } from './heroes';
import type { TROOPS } from './troops';
import { START_RESOURCES } from './resources';

const HOUR_MS = 3_600_000;
const MINUTE_MS = 60_000;

/** GDD 13.1 */
export const COMBAT = {
  MAX_ROUNDS: 5,
  DEF_K: 50,
  /** Feridos = fração das baixas. */
  WOUNDED_RATE: {
    attackerVsNpc: 0.8,
    attackerVsPlayer: 0.4,
    /** Defensor, inclusive reforços. */
    defender: 0.7,
    /** NPC não guarda feridos. */
    npc: 0,
  },
  /** 40% do recurso não protegido. */
  LOOT_RATE: 0.4,
} as const;

export interface ShieldDef {
  id: 'shield_newbie' | 'shield_truce';
  name: string;
  durationMs: number;
}

/** GDD 14 */
export const SHIELDS = {
  newbie: {
    id: 'shield_newbie',
    name: 'Escudo de Novato',
    /** 24 h reais desde a criação. */
    durationMs: 24 * HOUR_MS,
    /** Acaba ao chegar na Cidadela 5. */
    endsAtKeepLevel: 5,
    /** Acaba se o jogador mandar um attack_player. */
    breaksOnAttack: true,
  },
  truce: {
    id: 'shield_truce',
    name: 'Trégua',
    /** 30 min reais quando o atacante vence contra você. */
    durationMs: 30 * MINUTE_MS,
    /** Não acumula. */
    stacks: false,
    /** Atacar alguém cancela. */
    breaksOnAttack: true,
  },
} as const;

/** GDD 14 */
export const PVP = {
  /** Não pode atacar cidade com Cidadela 4+ níveis abaixo da sua. */
  maxKeepLevelsBelow: 3,
  /** Reforços: até a capacidade de marcha da Cidadela do anfitrião (soma de todos). */
  reinforcementsUseHostMarchCapacity: true,
} as const;

type BuildingIdLocal = keyof typeof BUILDINGS;
type TroopIdLocal = keyof typeof TROOPS;
type HeroIdLocal = keyof typeof HEROES;

export interface StartKit {
  resources: Resources;
  buildings: Partial<Record<BuildingIdLocal, number>>;
  troops: Partial<Record<TroopIdLocal, number>>;
  heroes: { heroTypeId: HeroIdLocal; level: number }[];
  newbieShield: boolean;
  /** O GDD não prevê baú inicial. */
  chests: string[];
}

/** GDD 7 — estado inicial. */
export const START_KIT: StartKit = {
  resources: START_RESOURCES,
  buildings: { keep: 1, farm: 1, sawmill: 1, barracks: 1 },
  troops: { infantry_t1: 80, archer_t1: 40 },
  heroes: [{ heroTypeId: 'hero_aldric', level: 1 }],
  newbieShield: true,
  chests: [],
};

/** Filas: treino e cura (o GDD não limita; 1 fila sequencial com até N jobs). */
export const QUEUES = {
  trainingQueueSize: 5,
  healingQueueSize: 5,
} as const;
