import { hashString } from '../world/rng';
import { COMBAT, SHIELDS, PVP, START_KIT, QUEUES } from './balance';
import { BUILDINGS, KEEP_REQUIREMENTS, WAREHOUSE, INFIRMARY, BARRACKS, WALL, HERO_HALL } from './buildings';
import { CHESTS } from './chests';
import { CITY_LAYOUT } from './cityLayout';
import { HEROES, HERO_ABILITIES, HERO_RARITIES, HERO_RULES, HERO_XP_CURVE } from './heroes';
import { ITEMS, FEATURES } from './items';
import { NPC_FACTIONS, NPC_CAMP_LEVELS, NPC_CURVES } from './npcCamps';
import { KEEP_LEVELS, ERAS } from './progression';
import { RESOURCE_NODE_BASES } from './resourceNodes';
import { KEEP_BASE_PRODUCTION } from './resources';
import { SPEED_CONFIG } from './speed';
import { TROOPS, TRIANGLE, TIERS, HEALING, POWER } from './troops';
import { BIOMES, WORLD, WORLD_DENSITY, SPAWN_LEVEL_JITTER, CITY_SPAWN } from './world';

export * from './curves';
export * from './speed';
export * from './resources';
export * from './buildings';
export * from './cityLayout';
export * from './troops';
export * from './heroes';
export * from './npcCamps';
export * from './resourceNodes';
export * from './items';
export * from './chests';
export * from './world';
export * from './balance';
export * from './progression';

/** Versão do GDD transcrito. */
export const GDD_VERSION = '0.1';
/** Suba quando mudar o algoritmo de geração do mapa (muda o mundo inteiro). */
export const GENERATOR_VERSION = 1;

/** Tudo que muda regra/números do jogo. */
export const GAME_CONFIG = {
  speed: SPEED_CONFIG,
  world: WORLD,
  biomes: BIOMES,
  worldDensity: WORLD_DENSITY,
  spawnLevelJitter: SPAWN_LEVEL_JITTER,
  citySpawn: CITY_SPAWN,
  keepBaseProduction: KEEP_BASE_PRODUCTION,
  buildings: BUILDINGS,
  keepRequirements: KEEP_REQUIREMENTS,
  warehouse: WAREHOUSE,
  infirmary: INFIRMARY,
  barracks: BARRACKS,
  wall: WALL,
  heroHall: HERO_HALL,
  cityLayout: CITY_LAYOUT,
  troops: TROOPS,
  triangle: TRIANGLE,
  tiers: TIERS,
  healing: HEALING,
  power: POWER,
  heroes: HEROES,
  heroAbilities: HERO_ABILITIES,
  heroRarities: HERO_RARITIES,
  heroRules: HERO_RULES,
  heroXpCurve: HERO_XP_CURVE,
  npcFactions: NPC_FACTIONS,
  npcCampLevels: NPC_CAMP_LEVELS,
  npcCurves: NPC_CURVES,
  resourceNodes: RESOURCE_NODE_BASES,
  items: ITEMS,
  features: FEATURES,
  chests: CHESTS,
  keepLevels: KEEP_LEVELS,
  eras: ERAS,
  combat: COMBAT,
  shields: SHIELDS,
  pvp: PVP,
  startKit: START_KIT,
  queues: QUEUES,
} as const;

/**
 * Versão da config: GDD + gerador + hash do conteúdo.
 * Gravada no World; o front compara com a do bundle e pede para recarregar se divergir.
 */
export const CONFIG_VERSION = `${GDD_VERSION}-g${GENERATOR_VERSION}-${hashString(JSON.stringify(GAME_CONFIG))
  .toString(16)
  .padStart(8, '0')}`;
