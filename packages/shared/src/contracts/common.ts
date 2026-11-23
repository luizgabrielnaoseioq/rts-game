// Tipos básicos compartilhados por back e front.

export type Id = string;
/** ISO 8601 UTC, ex.: "2026-11-23T14:03:12.511Z" */
export type IsoDate = string;

export type ResourceKey = 'food' | 'wood' | 'stone' | 'gold';
export type Resources = Record<ResourceKey, number>;

export interface Coord {
  x: number;
  y: number;
}

/** "cx:cy" */
export type ChunkId = `${number}:${number}`;

export type MarchType = 'GATHER' | 'ATTACK_NPC' | 'ATTACK_PLAYER' | 'REINFORCE';
export type MarchState = 'OUTBOUND' | 'GATHERING' | 'STATIONED' | 'RETURNING' | 'COMPLETED';
export type MarchTargetKind = 'RESOURCE_NODE' | 'NPC_CAMP' | 'CITY';
export type ReportKind = 'GATHER' | 'BATTLE_NPC' | 'BATTLE_PVP';
export type ReportRole = 'ATTACKER' | 'DEFENDER' | 'GATHERER';
export type BattleOutcome = 'ATTACKER_WON' | 'DEFENDER_WON' | 'DRAW';
export type ChestSource = 'STARTER' | 'DAILY' | 'NPC_VICTORY' | 'ADMIN';
export type ShieldKind = 'NEWBIE' | 'TRUCE';

/** Biomas do GDD (seção 5.1), por latitude. */
export type Biome = 'vale' | 'waste' | 'frost';
/** Obstáculos decorativos (não bloqueiam marcha). */
export type ObstacleKind = 'mountain' | 'lake' | 'ruin';

export type TroopClass = 'infantry' | 'archer' | 'cavalry';
export type TroopTier = 1 | 2 | 3;
export type HeroRarity = 'common' | 'rare' | 'epic';
export type EraId = 'era_ash' | 'era_iron' | 'era_ember';

export const RESOURCE_KEYS: readonly ResourceKey[] = ['food', 'wood', 'stone', 'gold'];
export const TROOP_CLASSES: readonly TroopClass[] = ['infantry', 'archer', 'cavalry'];
export const BIOMES_ORDER: readonly Biome[] = ['vale', 'waste', 'frost'];
