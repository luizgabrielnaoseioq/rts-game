// GDD 5.2 — geração determinística do terreno e dos spawns (nós e acampamentos).
import type { Biome, Coord, ObstacleKind, ResourceKey } from '../contracts/common';
import { BIOMES_ORDER } from '../contracts/common';
import { RESOURCE_NODE_LEVELS } from '../config/resourceNodes';
import { BIOMES, CITY_SPAWN, SPAWN_LEVEL_JITTER, WORLD, WORLD_DENSITY } from '../config/world';
import type { CampTypeId } from '../ids';
import { biomeForD, latitudeD } from './biome';
import { chebyshev } from './geometry';
import { fbm2D, valueNoise2D } from './noise';
import { createRng, hashString, pickWeighted, shuffleInPlace, type Rng } from './rng';

export const OBSTACLE_CODES: readonly (ObstacleKind | null)[] = [null, 'mountain', 'lake', 'ruin'];

export interface TerrainMap {
  seed: string;
  width: number;
  height: number;
  /** Índice em BIOMES_ORDER, por casa (i = y × width + x). */
  biome: Uint8Array;
  /** 0 = livre; 1 montanha; 2 lago; 3 ruína (ver OBSTACLE_CODES). */
  obstacle: Uint8Array;
  /** Ruído 0..255 para variar o tom da casa (visual). */
  shade: Uint8Array;
}

export interface TerrainTile {
  x: number;
  y: number;
  biome: Biome;
  d: number;
  obstacle: ObstacleKind | null;
  shade: number;
}

let terrainCache: TerrainMap | null = null;

/** Terreno inteiro do mundo (14.400 casas no padrão). Memoiza a última chamada. */
export function generateTerrain(seed: string, width: number = WORLD.width, height: number = WORLD.height): TerrainMap {
  if (terrainCache && terrainCache.seed === seed && terrainCache.width === width && terrainCache.height === height) {
    return terrainCache;
  }
  const n = width * height;
  const biome = new Uint8Array(n);
  const obstacle = new Uint8Array(n);
  const shade = new Uint8Array(n);
  const base = hashString(seed);
  const rng = createRng(seed, 'terrain');

  const byBiome: number[][] = BIOMES_ORDER.map(() => []);
  for (let y = 0; y < height; y++) {
    const b = BIOMES_ORDER.indexOf(biomeForD(latitudeD(y, height)));
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      biome[i] = b;
      shade[i] = Math.floor(valueNoise2D(base + 7, x, y, 4) * 256);
      byBiome[b].push(i);
    }
  }

  // Obstáculos: 8% de cada bioma, nas casas de maior ruído (formam manchas, não pontos soltos).
  for (const tiles of byBiome) {
    const target = Math.round(tiles.length * WORLD_DENSITY.obstacles);
    const scored = tiles.map((i) => {
      const x = i % width;
      const y = Math.floor(i / width);
      return { i, score: fbm2D(base + 1, x, y, 10, 3) + rng() * 0.15 };
    });
    scored.sort((a, b) => b.score - a.score || a.i - b.i);
    for (let k = 0; k < target; k++) {
      const { i } = scored[k];
      const x = i % width;
      const y = Math.floor(i / width);
      const kindNoise = valueNoise2D(base + 2, x, y, 9);
      obstacle[i] = kindNoise < 0.45 ? 1 : kindNoise < 0.8 ? 2 : 3;
    }
  }

  terrainCache = { seed, width, height, biome, obstacle, shade };
  return terrainCache;
}

export function terrainTile(map: TerrainMap, x: number, y: number): TerrainTile {
  const i = y * map.width + x;
  return {
    x,
    y,
    biome: BIOMES_ORDER[map.biome[i]],
    d: latitudeD(y, map.height),
    obstacle: OBSTACLE_CODES[map.obstacle[i]],
    shade: map.shade[i],
  };
}

export function isObstacle(map: TerrainMap, x: number, y: number): boolean {
  return map.obstacle[y * map.width + x] !== 0;
}

/**
 * Nível dentro do bioma (GDD 5.2): t = (d − dMin) / 20; nível = min + floor(t × (max − min + 1));
 * 20% de chance de ±1 (preso à faixa). Sobe em direção ao polo.
 */
export function levelInBiome(d: number, biome: Biome, range: readonly [number, number], rng: Rng): number {
  const [min, max] = range;
  const dMin = BIOMES[biome].dRange[0];
  const t = (d - dMin) / WORLD.bandHeight;
  let level = min + Math.floor(t * (max - min + 1));
  if (rng() < SPAWN_LEVEL_JITTER.chance) level += rng() < 0.5 ? -1 : 1;
  return Math.min(max, Math.max(min, level));
}

export interface ResourceNodeSpawn {
  kind: 'node';
  x: number;
  y: number;
  biome: Biome;
  resourceType: ResourceKey;
  level: number;
  maxAmount: number;
}

export interface NpcCampSpawn {
  kind: 'camp';
  x: number;
  y: number;
  biome: Biome;
  campTypeId: CampTypeId;
  level: number;
}

export interface WorldSpawns {
  resourceNodes: ResourceNodeSpawn[];
  npcCamps: NpcCampSpawn[];
}

const RESOURCE_KEYS_ORDER: readonly ResourceKey[] = ['food', 'wood', 'stone', 'gold'];

export function rollNodeType(biome: Biome, rng: Rng): ResourceKey {
  const w = BIOMES[biome].nodeWeights;
  return pickWeighted(rng, RESOURCE_KEYS_ORDER, (k) => w[k]);
}

export function makeNodeSpawn(x: number, y: number, biome: Biome, height: number, rng: Rng): ResourceNodeSpawn {
  const resourceType = rollNodeType(biome, rng);
  const level = levelInBiome(latitudeD(y, height), biome, BIOMES[biome].nodeLevels, rng);
  return { kind: 'node', x, y, biome, resourceType, level, maxAmount: RESOURCE_NODE_LEVELS[level - 1].capacity[resourceType] };
}

export function makeCampSpawn(x: number, y: number, biome: Biome, height: number, rng: Rng): NpcCampSpawn {
  const level = levelInBiome(latitudeD(y, height), biome, BIOMES[biome].campLevels, rng);
  return { kind: 'camp', x, y, biome, campTypeId: BIOMES[biome].faction, level };
}

/**
 * Spawns iniciais: por bioma, 5% de nós e 3% de acampamentos (240 e 144 no 120×120),
 * em casas sem obstáculo e sem repetir casa. Determinístico pela seed.
 */
export function generateSpawns(seed: string, width: number = WORLD.width, height: number = WORLD.height): WorldSpawns {
  const map = generateTerrain(seed, width, height);
  const rng = createRng(seed, 'spawns');
  const resourceNodes: ResourceNodeSpawn[] = [];
  const npcCamps: NpcCampSpawn[] = [];

  BIOMES_ORDER.forEach((biome, b) => {
    let biomeTiles = 0;
    const free: number[] = [];
    for (let i = 0; i < map.biome.length; i++) {
      if (map.biome[i] !== b) continue;
      biomeTiles++;
      if (map.obstacle[i] === 0) free.push(i);
    }
    shuffleInPlace(rng, free);
    const nNodes = Math.round(biomeTiles * WORLD_DENSITY.resourceNodes);
    const nCamps = Math.round(biomeTiles * WORLD_DENSITY.npcCamps);
    for (let k = 0; k < nNodes + nCamps && k < free.length; k++) {
      const i = free[k];
      const x = i % width;
      const y = Math.floor(i / width);
      if (k < nNodes) resourceNodes.push(makeNodeSpawn(x, y, biome, height, rng));
      else npcCamps.push(makeCampSpawn(x, y, biome, height, rng));
    }
  });

  const byPos = (a: Coord, b: Coord) => a.y - b.y || a.x - b.x;
  resourceNodes.sort(byPos);
  npcCamps.sort(byPos);
  return { resourceNodes, npcCamps };
}

/**
 * Casa de respawn (GDD 10 e 12: "em outra casa livre do mesmo bioma").
 * Ordem de candidatos determinística por (seed, salt); `isFree` diz se a casa está desocupada.
 */
export function pickRespawnTile(
  seed: string,
  biome: Biome,
  salt: string,
  isFree: (x: number, y: number) => boolean,
  width: number = WORLD.width,
  height: number = WORLD.height,
): Coord | null {
  const map = generateTerrain(seed, width, height);
  const b = BIOMES_ORDER.indexOf(biome);
  const candidates: number[] = [];
  for (let i = 0; i < map.biome.length; i++) if (map.biome[i] === b && map.obstacle[i] === 0) candidates.push(i);
  shuffleInPlace(createRng(seed, 'respawn', salt), candidates);
  for (const i of candidates) {
    const x = i % width;
    const y = Math.floor(i / width);
    if (isFree(x, y)) return { x, y };
  }
  return null;
}

/** Casas candidatas a spawn de cidade: d ≤ 14 e sem obstáculo. */
export function citySpawnCandidates(seed: string, width: number = WORLD.width, height: number = WORLD.height): Coord[] {
  const map = generateTerrain(seed, width, height);
  const out: Coord[] = [];
  for (let y = 0; y < height; y++) {
    if (latitudeD(y, height) > CITY_SPAWN.maxD) continue;
    for (let x = 0; x < width; x++) if (map.obstacle[y * width + x] === 0) out.push({ x, y });
  }
  return out;
}

/** Regra de spawn: ≥ 8 casas (Chebyshev) de outra cidade e ≥ 2 de nó/acampamento. */
export function isCitySpawnValid(tile: Coord, nearbyCities: readonly Coord[], nearbyEntities: readonly Coord[]): boolean {
  return (
    nearbyCities.every((c) => chebyshev(tile, c) >= CITY_SPAWN.minCityDistance) &&
    nearbyEntities.every((e) => chebyshev(tile, e) >= CITY_SPAWN.minEntityDistance)
  );
}
