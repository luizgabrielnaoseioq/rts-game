import { describe, expect, it } from 'vitest';
import {
  BUILDINGS,
  BUILDING_IDS,
  BUILDING_EFFECT_TABLES,
  CONFIG_VERSION,
  KEEP_LEVELS,
  NPC_CAMP_LEVELS,
  RESOURCE_NODE_LEVELS,
  buildingProduction,
  summonCost,
  maxHeroLevel,
  xpToNext,
  totalXpForLevel,
  infirmaryCapacity,
  warehouseCapacity,
  warehouseProtected,
  barracksTimeFactor,
  maxBatch,
} from '../index';

const col = (id: keyof typeof BUILDINGS, k: 'food' | 'wood' | 'stone' | 'gold') => BUILDINGS[id].levels.map((l) => l.cost[k]);
const times = (id: keyof typeof BUILDINGS) => BUILDINGS[id].levels.map((l) => l.timeSec);

describe('GDD 7.2 — custo e tempo dos prédios', () => {
  it('Cidadela', () => {
    expect(col('keep', 'food')).toEqual([180, 288, 461, 737, 1180, 1887, 3020, 4832, 7731, 12370]);
    expect(col('keep', 'wood')).toEqual([200, 320, 512, 819, 1311, 2097, 3355, 5369, 8590, 13744]);
    expect(col('keep', 'stone')).toEqual([150, 240, 384, 614, 983, 1573, 2517, 4027, 6442, 10308]);
    expect(col('keep', 'gold')).toEqual([40, 64, 102, 164, 262, 419, 671, 1074, 1718, 2749]);
    // 10s 15s 23s 34s 51s 1m16s 1m54s 2m51s 4m16s 6m24s
    expect(times('keep')).toEqual([10, 15, 23, 34, 51, 76, 114, 171, 256, 384]);
  });

  it('Fazenda / Serraria / Pedreira', () => {
    const c = [90, 144, 230, 369, 590, 944, 1510, 2416, 3865, 6185];
    const s = [30, 48, 77, 123, 197, 315, 503, 805, 1288, 2062];
    const t6 = [6, 9, 14, 20, 30, 46, 68, 103, 154, 231];
    expect(col('farm', 'wood')).toEqual(c);
    expect(col('farm', 'stone')).toEqual(s);
    expect(col('sawmill', 'food')).toEqual(c);
    expect(col('quarry', 'food')).toEqual(c);
    expect(col('quarry', 'wood')).toEqual(c);
    expect(times('farm')).toEqual(t6);
    expect(times('infirmary')).toEqual(t6);
  });

  it('Quartel, Muralha, Armazém, Salão, Enfermaria, Mina', () => {
    const t8 = [8, 12, 18, 27, 41, 61, 91, 137, 205, 308];
    expect(col('barracks', 'wood')).toEqual([160, 256, 410, 655, 1049, 1678, 2684, 4295, 6872, 10995]);
    expect(col('wall', 'stone')).toEqual([180, 288, 461, 737, 1180, 1887, 3020, 4832, 7731, 12370]);
    expect(col('wall', 'gold')).toEqual([20, 32, 51, 82, 131, 210, 336, 537, 859, 1374]);
    expect(col('warehouse', 'wood')).toEqual([140, 224, 358, 573, 918, 1468, 2349, 3758, 6013, 9621]);
    expect(col('hero_hall', 'gold')).toEqual([40, 64, 102, 164, 262, 419, 671, 1074, 1718, 2749]);
    expect(col('infirmary', 'food')).toEqual([100, 160, 256, 410, 655, 1049, 1678, 2684, 4295, 6872]);
    expect(col('gold_mine', 'stone')).toEqual([60, 96, 154, 246, 393, 629, 1007, 1611, 2577, 4123]);
    expect(times('barracks')).toEqual(t8);
    expect(times('gold_mine')).toEqual(t8);
  });

  it('total para levar os 10 prédios ao nível 10 (509.688; sem o nível 1 da Cidadela, que já vem pronta)', () => {
    const tot = { food: 0, wood: 0, stone: 0, gold: 0 };
    for (const id of BUILDING_IDS) {
      for (const l of BUILDINGS[id].levels) {
        if (id === 'keep' && l.level === 1) continue;
        for (const k of Object.keys(tot) as (keyof typeof tot)[]) tot[k] += l.cost[k];
      }
    }
    expect(tot).toEqual({ food: 159614, wood: 199543, stone: 132413, gold: 18118 });
    expect(tot.food + tot.wood + tot.stone + tot.gold).toBe(509688);
  });
});

describe('GDD 7.3 / 7.4 — produção e efeitos', () => {
  it('produção por nível', () => {
    const lv = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    expect(lv.map((l) => buildingProduction('farm', l))).toEqual([400, 580, 841, 1219, 1768, 2564, 3718, 5391, 7816, 11334]);
    expect(lv.map((l) => buildingProduction('quarry', l))).toEqual([300, 435, 631, 915, 1326, 1923, 2788, 4043, 5862, 8500]);
    expect(lv.map((l) => buildingProduction('gold_mine', l))).toEqual([150, 218, 315, 457, 663, 961, 1394, 2021, 2931, 4250]);
  });

  it('armazém, enfermaria, quartel, salão', () => {
    expect(BUILDING_EFFECT_TABLES.warehouseCapacity).toEqual([9000, 11000, 14000, 18500, 25250, 35375, 50563, 73344, 107516, 158773]);
    expect(BUILDING_EFFECT_TABLES.warehouseProtected).toEqual([2000, 2450, 3103, 4049, 5421, 7410, 10294, 14476, 20541, 29334]);
    expect(BUILDING_EFFECT_TABLES.infirmaryCapacity).toEqual([300, 400, 550, 775, 1113, 1619, 2378, 3517, 5226, 7789]);
    expect(warehouseCapacity(0)).toBe(5000);
    expect(warehouseProtected(0)).toBe(1000);
    expect(warehouseCapacity(7)).toBe(50563);
    expect(infirmaryCapacity(0)).toBe(100);
    expect(barracksTimeFactor(10)).toBeCloseTo(0.64, 10);
    expect(maxBatch(3)).toBe(150);
    const lv = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    expect(lv.map(maxHeroLevel)).toEqual([2, 4, 6, 8, 10, 12, 14, 16, 18, 20]);
    expect(lv.map(summonCost)).toEqual([291, 282, 273, 264, 255, 246, 237, 228, 219, 210]);
  });
});

describe('GDD 9.2 — XP de herói', () => {
  it('curva', () => {
    expect([1, 2, 3, 4, 5, 9, 10, 11, 19].map(xpToNext)).toEqual([100, 130, 169, 220, 286, 816, 1060, 1379, 11246]);
    expect(totalXpForLevel(20)).toBe(48398);
    expect(totalXpForLevel(11)).toBe(4262);
  });
});

describe('GDD 10 — acampamentos', () => {
  it('tabela por nível', () => {
    expect(NPC_CAMP_LEVELS.map((c) => c.totalTroops)).toEqual([70, 102, 147, 213, 309, 449, 651, 943, 1368, 1983]);
    expect(NPC_CAMP_LEVELS.map((c) => c.power)).toEqual([210, 306, 441, 1278, 1854, 2694, 3906, 11316, 16416, 23796]);
    expect(NPC_CAMP_LEVELS.map((c) => c.heroXp)).toEqual([50, 75, 113, 169, 253, 380, 570, 854, 1281, 1922]);
    expect(NPC_CAMP_LEVELS.map((c) => c.respawnSec)).toEqual([30, 60, 90, 120, 150, 180, 210, 240, 270, 300]);
    expect(NPC_CAMP_LEVELS[0].troops).toEqual({ infantry_t1: 42, archer_t1: 28 });
    expect(NPC_CAMP_LEVELS[3].troops).toEqual({ cavalry_t2: 85, infantry_t2: 64, archer_t2: 64 });
    expect(NPC_CAMP_LEVELS[4].troops).toEqual({ cavalry_t2: 124, infantry_t2: 93, archer_t2: 92 });
    expect(NPC_CAMP_LEVELS[6].troops).toEqual({ cavalry_t2: 260, infantry_t2: 195, archer_t2: 196 });
    expect(NPC_CAMP_LEVELS[9].troops).toEqual({ infantry_t3: 992, cavalry_t3: 595, archer_t3: 396 });
    expect(NPC_CAMP_LEVELS.map((c) => c.chest)).toEqual([
      'chest_iron', 'chest_iron', 'chest_iron', 'chest_bronze', 'chest_bronze', 'chest_bronze', 'chest_bronze',
      'chest_relic', 'chest_relic', 'chest_relic',
    ]);
  });
});

describe('GDD 12 / 15 — nós e Cidadela', () => {
  it('nós de recurso', () => {
    expect(RESOURCE_NODE_LEVELS.map((n) => n.capacity.food)).toEqual([6000, 9600, 15360, 24576, 39322, 62915]);
    expect(RESOURCE_NODE_LEVELS.map((n) => n.capacity.stone)).toEqual([4500, 7200, 11520, 18432, 29491, 47186]);
    expect(RESOURCE_NODE_LEVELS.map((n) => n.capacity.gold)).toEqual([2500, 4000, 6400, 10240, 16384, 26214]);
    expect(RESOURCE_NODE_LEVELS.map((n) => Math.round(n.ratePerMin.food))).toEqual([80, 104, 135, 176, 228, 297]);
    expect(RESOURCE_NODE_LEVELS.map((n) => Math.round(n.ratePerMin.gold))).toEqual([30, 39, 51, 66, 86, 111]);
  });

  it('tabela da Cidadela', () => {
    expect(KEEP_LEVELS.map((k) => k.marchCapacity)).toEqual([300, 390, 510, 660, 860, 1110, 1450, 1880, 2450, 3180]);
    expect(KEEP_LEVELS.map((k) => k.maxMarches)).toEqual([1, 2, 2, 2, 3, 3, 4, 4, 5, 5]);
    expect(KEEP_LEVELS.map((k) => k.secondaryHeroes)).toEqual([0, 0, 1, 1, 1, 2, 2, 2, 2, 2]);
    expect(KEEP_LEVELS.map((k) => k.buildQueues)).toEqual([1, 1, 1, 1, 1, 2, 2, 2, 2, 2]);
  });

  it('CONFIG_VERSION é estável', () => {
    expect(CONFIG_VERSION).toMatch(/^0\.1-g1-[0-9a-f]{8}$/);
  });
});
