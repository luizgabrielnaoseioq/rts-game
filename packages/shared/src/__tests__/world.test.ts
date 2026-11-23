import { describe, expect, it } from 'vitest';
import {
  BIOMES,
  biomeAt,
  chunkIdsInRect,
  chunkOf,
  chunksCrossedBySegment,
  citySpawnCandidates,
  generateSpawns,
  generateTerrain,
  isCitySpawnValid,
  isObstacle,
  latitudeD,
  mulberry32,
  hashString,
  pickRespawnTile,
} from '../index';

describe('rng', () => {
  it('mulberry32 e hashString são determinísticos', () => {
    const a = mulberry32(hashString('vharos-1'));
    const b = mulberry32(hashString('vharos-1'));
    const sa = Array.from({ length: 5 }, a);
    expect(sa).toEqual(Array.from({ length: 5 }, b));
    expect(sa.every((v) => v >= 0 && v < 1)).toBe(true);
    expect(hashString('a')).not.toBe(hashString('b'));
  });
});

describe('biomas (GDD 5.1)', () => {
  it('bandas por latitude', () => {
    expect(latitudeD(0)).toBe(59);
    expect(latitudeD(59)).toBe(0);
    expect(latitudeD(60)).toBe(0);
    expect(latitudeD(119)).toBe(59);
    for (let y = 0; y < 120; y++) {
      const expected = (y >= 40 && y <= 79) ? 'vale' : (y >= 20 && y <= 99) ? 'waste' : 'frost';
      expect(biomeAt('s', 0, y)).toBe(expected);
    }
  });
});

describe('gerador', () => {
  const seed = 'vharos-1';

  it('terreno: 8% de obstáculos por bioma', () => {
    const t = generateTerrain(seed);
    const counts = [0, 0, 0];
    for (let i = 0; i < t.obstacle.length; i++) if (t.obstacle[i]) counts[t.biome[i]]++;
    expect(counts).toEqual([384, 384, 384]);
  });

  it('spawns: 240 nós e 144 acampamentos por bioma, nas faixas de nível', () => {
    const s = generateSpawns(seed);
    expect(s.resourceNodes).toHaveLength(720);
    expect(s.npcCamps).toHaveLength(432);
    for (const biome of ['vale', 'waste', 'frost'] as const) {
      const nodes = s.resourceNodes.filter((n) => n.biome === biome);
      const camps = s.npcCamps.filter((c) => c.biome === biome);
      expect(nodes).toHaveLength(240);
      expect(camps).toHaveLength(144);
      const [nMin, nMax] = BIOMES[biome].nodeLevels;
      const [cMin, cMax] = BIOMES[biome].campLevels;
      expect(nodes.every((n) => n.level >= nMin && n.level <= nMax)).toBe(true);
      expect(camps.every((c) => c.level >= cMin && c.level <= cMax && c.campTypeId === BIOMES[biome].faction)).toBe(true);
      // todos os níveis da faixa aparecem
      expect(new Set(camps.map((c) => c.level)).size).toBe(cMax - cMin + 1);
    }
    const t = generateTerrain(seed);
    const all = [...s.resourceNodes, ...s.npcCamps];
    expect(all.every((e) => !isObstacle(t, e.x, e.y))).toBe(true);
    expect(new Set(all.map((e) => `${e.x},${e.y}`)).size).toBe(all.length);
  });

  it('é determinístico (mesma seed, mesmo mundo) e muda com outra seed', () => {
    const a = generateSpawns(seed);
    const b = generateSpawns(seed);
    expect(a).toEqual(b);
    const c = generateSpawns('outra-seed');
    expect(c.resourceNodes.slice(0, 20)).not.toEqual(a.resourceNodes.slice(0, 20));
    // snapshot leve: as 3 primeiras entidades da seed padrão
    expect(a.resourceNodes.slice(0, 3)).toMatchSnapshot();
    expect(a.npcCamps.slice(0, 3)).toMatchSnapshot();
  });

  it('respawn e spawn de cidade', () => {
    const p = pickRespawnTile(seed, 'waste', 'camp:abc:g1', () => true);
    expect(p).not.toBeNull();
    expect(biomeAt(seed, p!.x, p!.y)).toBe('waste');
    expect(pickRespawnTile(seed, 'waste', 'camp:abc:g1', () => true)).toEqual(p);
    const cands = citySpawnCandidates(seed);
    expect(cands.length).toBeGreaterThan(2000);
    expect(cands.every((c) => latitudeD(c.y) <= 14)).toBe(true);
    expect(isCitySpawnValid({ x: 10, y: 60 }, [{ x: 17, y: 60 }], [])).toBe(false);
    expect(isCitySpawnValid({ x: 10, y: 60 }, [{ x: 18, y: 60 }], [{ x: 12, y: 61 }])).toBe(true);
    expect(isCitySpawnValid({ x: 10, y: 60 }, [], [{ x: 11, y: 61 }])).toBe(false);
  });
});

describe('chunks', () => {
  it('chunkOf / chunkIdsInRect / segmento', () => {
    expect(chunkOf(0, 0)).toBe('0:0');
    expect(chunkOf(119, 119)).toBe('7:7');
    expect(chunkIdsInRect({ x: 0, y: 0, width: 20, height: 5 })).toEqual(['0:0', '1:0']);
    expect(chunkIdsInRect({ x: 0, y: 0, width: 5, height: 5 }, 1)).toEqual(['0:0', '1:0', '0:1', '1:1']);
    expect(chunksCrossedBySegment({ x: 2, y: 2 }, { x: 40, y: 2 })).toEqual(['0:0', '1:0', '2:0']);
  });
});
