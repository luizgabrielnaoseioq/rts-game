// GDD seção 8 — tropas.
import type { Resources, TroopClass, TroopTier } from '../contracts/common';

export interface TroopDef {
  id: string;
  name: string;
  class: TroopClass;
  tier: TroopTier;
  cost: Resources;
  /** Segundos por unidade, antes do fator do quartel e do GAME_SPEED. */
  trainTimeSec: number;
  attack: number;
  defense: number;
  hp: number;
  /** Carga por unidade. */
  load: number;
  /** Casas por minuto. */
  speed: number;
  /** Comida por hora, por unidade. */
  upkeepPerHour: number;
  power: number;
}

type Row = readonly [string, string, TroopClass, TroopTier, number, number, number, number, number, number, number, number, number, number, number, number];

// id, nome, classe, tier, C, M, P, O, tempo, ATQ, DEF, VIDA, carga, veloc., manut., poder
const ROWS = [
  ['infantry_t1', 'Lança de Cinza', 'infantry', 1, 30, 25, 0, 0, 1.5, 8, 12, 40, 10, 20, 0.5, 3],
  ['infantry_t2', 'Escudo Jurado', 'infantry', 2, 55, 45, 15, 4, 3, 12, 18, 60, 14, 20, 1, 6],
  ['infantry_t3', 'Guardião do Braseiro', 'infantry', 3, 90, 75, 30, 10, 6, 18, 27, 90, 18, 20, 1.5, 12],
  ['archer_t1', 'Arqueiro de Turfa', 'archer', 1, 30, 35, 0, 0, 1.5, 12, 6, 30, 8, 20, 0.5, 3],
  ['archer_t2', 'Besteiro Jurado', 'archer', 2, 55, 60, 10, 4, 3, 18, 9, 45, 11, 20, 1, 6],
  ['archer_t3', 'Atirador de Brasa', 'archer', 3, 90, 100, 20, 10, 6, 27, 14, 68, 14, 20, 1.5, 12],
  ['cavalry_t1', 'Batedor Montado', 'cavalry', 1, 45, 20, 10, 0, 1.5, 11, 8, 45, 15, 30, 0.5, 3],
  ['cavalry_t2', 'Cavaleiro de Cinza', 'cavalry', 2, 80, 35, 25, 6, 3, 16, 12, 68, 20, 30, 1, 6],
  ['cavalry_t3', 'Cavaleiro da Mortalha', 'cavalry', 3, 130, 60, 45, 15, 6, 24, 18, 100, 26, 30, 1.5, 12],
] as const satisfies readonly Row[];

type TroopIdInternal = (typeof ROWS)[number][0];

export const TROOPS: Record<TroopIdInternal, TroopDef> = Object.fromEntries(
  ROWS.map(([id, name, cls, tier, food, wood, stone, gold, trainTimeSec, attack, defense, hp, load, speed, upkeepPerHour, power]) => [
    id,
    {
      id,
      name,
      class: cls,
      tier,
      cost: { food, wood, stone, gold },
      trainTimeSec,
      attack,
      defense,
      hp,
      load,
      speed,
      upkeepPerHour,
      power,
    } satisfies TroopDef,
  ]),
) as Record<TroopIdInternal, TroopDef>;

export const TROOP_IDS = ROWS.map((r) => r[0]) as TroopIdInternal[];

export const TROOP_CLASS_DEFS: Record<TroopClass, { name: string; plural: string; weapon: string }> = {
  infantry: { name: 'Infantaria', plural: 'Infantaria', weapon: 'lanças' },
  archer: { name: 'Arqueiro', plural: 'Arqueiros', weapon: 'arcos' },
  cavalry: { name: 'Cavalaria', plural: 'Cavalaria', weapon: 'montaria' },
};

/** Infantaria > Cavalaria > Arqueiros > Infantaria. */
export const TRIANGLE_VALUES = { advantage: 1.25, neutral: 1, disadvantage: 0.8 } as const;

/** TRIANGLE[atacante][alvo] = multiplicador de dano. */
export const TRIANGLE: Record<TroopClass, Record<TroopClass, number>> = {
  infantry: { infantry: 1, cavalry: 1.25, archer: 0.8 },
  cavalry: { cavalry: 1, archer: 1.25, infantry: 0.8 },
  archer: { archer: 1, infantry: 1.25, cavalry: 0.8 },
};

export const TIERS: Record<TroopTier, { barracksLevel: number; era: string; name: string }> = {
  1: { barracksLevel: 1, era: 'era_ash', name: 'T1' },
  2: { barracksLevel: 4, era: 'era_iron', name: 'T2' },
  3: { barracksLevel: 8, era: 'era_ember', name: 'T3' },
};

/** Cura na Enfermaria: 40% do custo e 40% do tempo de treino, por unidade. */
export const HEALING = { costRate: 0.4, timeRate: 0.4 } as const;

/** Poder do jogador = Σ(tropas × poder) + 20 × Σ(níveis de prédios). */
export const POWER = { perBuildingLevel: 20 } as const;
