// Ids derivados da config: erro de digitação vira erro de tipo.
import type { BUILDINGS } from './config/buildings';
import type { CHESTS } from './config/chests';
import type { HEROES } from './config/heroes';
import type { ITEMS } from './config/items';
import type { NPC_FACTIONS } from './config/npcCamps';
import type { TROOPS } from './config/troops';

export type BuildingTypeId = keyof typeof BUILDINGS;
export type TroopTypeId = keyof typeof TROOPS;
export type HeroTypeId = keyof typeof HEROES;
export type ItemId = keyof typeof ITEMS;
export type ChestTypeId = keyof typeof CHESTS;
/** Tipo de acampamento = facção NPC (o nível fica na linha do NpcCamp). */
export type CampTypeId = keyof typeof NPC_FACTIONS;
export type NpcFactionId = CampTypeId;

export type TroopCounts = Partial<Record<TroopTypeId, number>>;
export type BuildingLevels = Partial<Record<BuildingTypeId, number>>;
