// GDD seções 2.2 e 10 — inimigos NPC e acampamentos.
import type { Biome, TroopClass, TroopTier } from '../contracts/common';
import { curve, levelsUpTo, roundHalfUp } from './curves';
import type { TROOPS } from './troops';

type TroopIdLocal = keyof typeof TROOPS;
type ChestIdLocal = 'chest_iron' | 'chest_bronze' | 'chest_relic';

export interface NpcFactionDef {
  id: string;
  name: string;
  biome: Biome;
  levels: readonly [number, number];
  visual: string;
  /** Ordem importa: o último tipo fica com o resto do arredondamento. */
  composition: readonly (readonly [TroopClass, number])[];
  /** Bônus fixos da facção (frações). */
  bonuses: { defense: number; hp: number };
  /** Ícone do estandarte (GDD 17). */
  icon: string;
}

const FACTION_LIST = [
  {
    id: 'npc_hollow',
    name: 'Os Ocos',
    biome: 'vale',
    levels: [1, 3],
    visual: 'Silhuetas cinzentas, olhos apagados, foices',
    composition: [
      ['infantry', 0.6],
      ['archer', 0.4],
    ],
    bonuses: { defense: 0, hp: 0 },
    icon: 'caveira oca',
  },
  {
    id: 'npc_brine',
    name: 'Seita Salobra',
    biome: 'waste',
    levels: [4, 7],
    visual: 'Corpos secos em faixas, crostas de sal, camelos-ossos',
    composition: [
      ['cavalry', 0.4],
      ['infantry', 0.3],
      ['archer', 0.3],
    ],
    bonuses: { defense: 0, hp: 0 },
    icon: 'gota de sal',
  },
  {
    id: 'npc_pale',
    name: 'Hoste Pálida',
    biome: 'frost',
    levels: [8, 10],
    visual: 'Armaduras congeladas, luz azul fria',
    composition: [
      ['infantry', 0.5],
      ['cavalry', 0.3],
      ['archer', 0.2],
    ],
    bonuses: { defense: 0.1, hp: 0.1 },
    icon: 'coroa de gelo',
  },
] as const satisfies readonly NpcFactionDef[];

type FactionIdInternal = (typeof FACTION_LIST)[number]['id'];

export const NPC_FACTIONS: Record<FactionIdInternal, NpcFactionDef> = Object.fromEntries(
  FACTION_LIST.map((f) => [f.id, f as NpcFactionDef]),
) as Record<FactionIdInternal, NpcFactionDef>;

export const NPC_FACTION_IDS = FACTION_LIST.map((f) => f.id) as FactionIdInternal[];

/** Facção do jogador (GDD 2.1). */
export const PLAYER_FACTION = {
  id: 'ember_oath',
  name: 'Juramento do Braseiro',
  description:
    'Casas humanas que guardam as últimas chamas. Cada jogador é uma Casa com uma cidade (Forte de Brasa).',
} as const;

/** Curvas (GDD 10). */
export const NPC_CURVES = {
  /** tropas(nível) = round(70 × 1,45^(nível−1)) */
  troopsBase: 70,
  troopsFactor: 1.45,
  /** xpHerói(nível) = round(50 × 1,5^(nível−1)) */
  xpBase: 50,
  xpFactor: 1.5,
  /** respawn(nível) = 30 × nível segundos (/GAME_SPEED) */
  respawnSecPerLevel: 30,
} as const;

export const NPC_RULES = {
  /** Vitória contra NPC = acampamento zerado. */
  attackerWinsOnlyIfCleared: true,
  /** Se o jogador perde, o acampamento volta cheio (perdas do NPC não ficam salvas no MVP). */
  persistLosses: false,
  /** Sem bônus de muralha nem herói do lado do NPC. */
  noWallOrHeroBonus: true,
  /** Respawn em outra casa livre do mesmo bioma. */
  respawnElsewhereInBiome: true,
} as const;

export function npcTierForLevel(level: number): TroopTier {
  return level <= 3 ? 1 : level <= 7 ? 2 : 3;
}

export function npcFactionForLevel(level: number): FactionIdInternal {
  return level <= 3 ? 'npc_hollow' : level <= 7 ? 'npc_brine' : 'npc_pale';
}

export function npcChestForLevel(level: number): ChestIdLocal {
  return level <= 3 ? 'chest_iron' : level <= 7 ? 'chest_bronze' : 'chest_relic';
}

export interface NpcCampLevelDef {
  level: number;
  biome: Biome;
  faction: FactionIdInternal;
  tier: TroopTier;
  totalTroops: number;
  troops: Partial<Record<TroopIdLocal, number>>;
  power: number;
  heroXp: number;
  chest: ChestIdLocal;
  respawnSec: number;
}

const TIER_POWER: Record<TroopTier, number> = { 1: 3, 2: 6, 3: 12 };

function buildCampLevel(level: number): NpcCampLevelDef {
  const faction = NPC_FACTIONS[npcFactionForLevel(level)];
  const tier = npcTierForLevel(level);
  const total = curve(NPC_CURVES.troopsBase, NPC_CURVES.troopsFactor, level);
  const troops: Partial<Record<TroopIdLocal, number>> = {};
  let assigned = 0;
  faction.composition.forEach(([cls, pct], i) => {
    const isLast = i === faction.composition.length - 1;
    const n = isLast ? total - assigned : roundHalfUp(total * pct);
    assigned += n;
    troops[`${cls}_t${tier}` as TroopIdLocal] = n;
  });
  return {
    level,
    biome: faction.biome,
    faction: faction.id as FactionIdInternal,
    tier,
    totalTroops: total,
    troops,
    power: total * TIER_POWER[tier],
    heroXp: curve(NPC_CURVES.xpBase, NPC_CURVES.xpFactor, level),
    chest: npcChestForLevel(level),
    respawnSec: NPC_CURVES.respawnSecPerLevel * level,
  };
}

/** Índice 0 = nível 1. */
export const NPC_CAMP_LEVELS: NpcCampLevelDef[] = levelsUpTo(10).map(buildCampLevel);

export const NPC_CAMP_MAX_LEVEL = NPC_CAMP_LEVELS.length;
