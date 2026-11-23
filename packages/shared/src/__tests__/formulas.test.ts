import { describe, expect, it } from 'vitest';
import {
  START_KIT,
  canAttackByKeepLevel,
  capacity,
  carryCapacity,
  checkUpgrade,
  createRng,
  distance,
  gatherDurationMs,
  gatherRatePerMin,
  gatheredAmount,
  isDailyAvailable,
  isTroopUnlocked,
  levelFromXp,
  marchHeroBonuses,
  marchSpeed,
  nextDailyReset,
  playerPower,
  positionAt,
  productionPerHour,
  projectResources,
  requirementsMet,
  rollChest,
  rollSummon,
  settle,
  trainingDurationMs,
  travelMs,
  troopUpkeepPerHour,
} from '../index';

const HOUR = 3_600_000;

describe('recursos', () => {
  it('produção inicial (Cidadela base + Fazenda 1 + Serraria 1) menos manutenção', () => {
    const upkeep = troopUpkeepPerHour(START_KIT.troops);
    expect(upkeep).toBe(60);
    const p = productionPerHour(START_KIT.buildings, { upkeepPerHour: upkeep });
    expect(p).toEqual({ food: 100 + 400 - 60, wood: 500, stone: 50, gold: 20 });
  });

  it('ECONOMY_SPEED multiplica a produção', () => {
    const p = productionPerHour({ keep: 1 }, { speed: { gameSpeed: 1, economySpeed: 2 } });
    expect(p.food).toBe(200);
  });

  it('settle para na capacidade, não perde excedente e não volta no tempo', () => {
    const cap = capacity(0);
    const s = settle({ resources: { food: 4900, wood: 6000, stone: 0, gold: 0 }, at: 0 }, { food: 1000, wood: 1000, stone: 100, gold: -50 }, cap, HOUR);
    expect(s.resources.food).toBe(5000);
    expect(s.resources.wood).toBe(6000);
    expect(s.resources.stone).toBe(100);
    expect(s.resources.gold).toBe(0);
    const back = settle(s, { food: 1, wood: 1, stone: 1, gold: 1 }, cap, 0);
    expect(back.at).toBe(HOUR);
  });

  it('projectResources usa ISO', () => {
    const r = projectResources(
      { resources: { food: 0, wood: 0, stone: 0, gold: 0 }, resourcesAt: new Date(0).toISOString(), productionPerHour: { food: 360, wood: 0, stone: 0, gold: 0 }, capacity: capacity(0) },
      HOUR / 2,
    );
    expect(r.food).toBeCloseTo(180, 9);
  });
});

describe('prédios', () => {
  it('requisitos da Cidadela', () => {
    expect(requirementsMet('keep', 3, { keep: 2, wall: 1 }).ok).toBe(false);
    expect(requirementsMet('keep', 3, { keep: 2, wall: 2 }).ok).toBe(true);
    expect(requirementsMet('keep', 5, { keep: 4, wall: 4, barracks: 3 }).missing).toEqual([{ typeId: 'barracks', level: 4 }]);
  });

  it('checkUpgrade', () => {
    const res = { food: 10000, wood: 10000, stone: 10000, gold: 10000 };
    expect(checkUpgrade({ typeId: 'farm', levels: { keep: 1, farm: 1 }, resources: res, activeUpgrades: 0 })).toMatchObject({ ok: false, code: 'REQUIREMENT_NOT_MET' });
    expect(checkUpgrade({ typeId: 'quarry', levels: { keep: 1 }, resources: res, activeUpgrades: 0 })).toMatchObject({ ok: false, code: 'REQUIREMENT_NOT_MET' });
    expect(checkUpgrade({ typeId: 'keep', levels: { keep: 1 }, resources: res, activeUpgrades: 0 })).toEqual({
      ok: true,
      targetLevel: 2,
      cost: { food: 288, wood: 320, stone: 240, gold: 64 },
      durationMs: 15000,
    });
    expect(checkUpgrade({ typeId: 'keep', levels: { keep: 1 }, resources: res, activeUpgrades: 1 })).toMatchObject({ ok: false, code: 'BUILD_QUEUE_FULL' });
    expect(checkUpgrade({ typeId: 'keep', levels: { keep: 1 }, resources: { ...res, gold: 10 }, activeUpgrades: 0 })).toMatchObject({
      ok: false,
      code: 'INSUFFICIENT_RESOURCES',
      details: { missing: { food: 0, wood: 0, stone: 0, gold: 54 } },
    });
  });

  it('poder do jogador inicial', () => {
    expect(playerPower(START_KIT.troops, START_KIT.buildings)).toBe(120 * 3 + 20 * 4);
  });
});

describe('treino', () => {
  it('tempo do lote com fator do quartel', () => {
    expect(trainingDurationMs('infantry_t1', 10, 1)).toBe(15000);
    expect(trainingDurationMs('infantry_t1', 10, 6)).toBe(12000);
    expect(trainingDurationMs('infantry_t1', 10, 1, { gameSpeed: 2, economySpeed: 1 })).toBe(7500);
  });
  it('tiers', () => {
    expect(isTroopUnlocked('infantry_t2', 3)).toBe(false);
    expect(isTroopUnlocked('infantry_t2', 4)).toBe(true);
    expect(isTroopUnlocked('cavalry_t3', 8)).toBe(true);
  });
});

describe('marcha e coleta (GDD 12)', () => {
  it('exemplos de tempo de viagem', () => {
    const inf = marchSpeed({ infantry_t1: 10 });
    expect(inf).toBe(20);
    expect(travelMs(5, inf)).toBe(15000);
    expect(travelMs(20, inf)).toBe(60000);
    expect(travelMs(50, inf)).toBe(150000);
    expect(travelMs(50, marchSpeed({ cavalry_t1: 10 }))).toBe(100000);
    expect(travelMs(1, inf)).toBe(10000); // mínimo de 10 s
    expect(marchSpeed({ infantry_t1: 1, cavalry_t1: 1 })).toBe(20); // a mais lenta manda
  });

  it('Brannoc dá +10% de velocidade e Dorrik (principal) +20% de carga', () => {
    const b = marchHeroBonuses({ heroTypeId: 'hero_brannoc', level: 1 });
    expect(marchSpeed({ cavalry_t1: 1 }, b.bonuses.marchSpeed)).toBeCloseTo(33, 9);
    const d = marchHeroBonuses({ heroTypeId: 'hero_dorrik', level: 1 });
    expect(d.bonuses.load).toBeCloseTo(0.2, 9);
    expect(carryCapacity({ infantry_t1: 80, archer_t1: 40 }, d.bonuses.load)).toBe(1344);
  });

  it('marcha inicial num nó de comida nível 1 leva 14 min', () => {
    const carry = carryCapacity({ infantry_t1: 80, archer_t1: 40 });
    expect(carry).toBe(1120);
    const rate = gatherRatePerMin('food', 1);
    expect(gatherDurationMs(carry, 6000, rate)).toBe(14 * 60_000);
    expect(gatheredAmount(7 * 60_000, rate, carry)).toBe(560);
    expect(gatheredAmount(60 * 60_000, rate, carry)).toBe(1120);
  });

  it('positionAt e distância', () => {
    expect(distance({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(5);
    const leg = { fromX: 0, fromY: 0, toX: 10, toY: 0, legStartAt: 1000, legEndAt: 2000 };
    expect(positionAt(leg, 1500)).toEqual({ x: 5, y: 0 });
    expect(positionAt(leg, 5000)).toEqual({ x: 10, y: 0 });
    expect(positionAt(leg, 0)).toEqual({ x: 0, y: 0 });
  });
});

describe('heróis, PvP, diário, baús', () => {
  it('nível por XP com teto do Salão', () => {
    expect(levelFromXp(0)).toBe(1);
    expect(levelFromXp(99)).toBe(1);
    expect(levelFromXp(100)).toBe(2);
    expect(levelFromXp(48398)).toBe(20);
    expect(levelFromXp(5000, 4)).toBe(4);
  });

  it('diferença de nível no PvP', () => {
    expect(canAttackByKeepLevel(7, 4)).toBe(true);
    expect(canAttackByKeepLevel(7, 3)).toBe(false);
    expect(canAttackByKeepLevel(2, 9)).toBe(true);
  });

  it('reset diário às 00:00 de Brasília (03:00 UTC)', () => {
    const now = Date.UTC(2026, 10, 23, 2, 59); // 22/11 23:59 em Brasília
    expect(new Date(nextDailyReset(now)).toISOString()).toBe('2026-11-23T03:00:00.000Z');
    expect(isDailyAvailable(Date.UTC(2026, 10, 22, 12), now)).toBe(false);
    expect(isDailyAvailable(Date.UTC(2026, 10, 22, 12), Date.UTC(2026, 10, 23, 3, 1))).toBe(true);
  });

  it('baús e taverna são determinísticos com o mesmo Rng', () => {
    const a = rollChest('chest_relic', createRng('t'), { keepLevel: 5 });
    const b = rollChest('chest_relic', createRng('t'), { keepLevel: 5 });
    expect(a).toEqual(b);
    const daily = rollChest('chest_daily', createRng('d'), { keepLevel: 3 });
    expect(daily[0]).toEqual({ kind: 'resources', resources: { food: 1200, wood: 1200, stone: 900, gold: 450 } });
    const noSpeedups = rollChest('chest_iron', createRng('x'), { keepLevel: 1, speedupsEnabled: false });
    expect(noSpeedups.every((r) => r.kind !== 'item' || !r.itemId.startsWith('speedup'))).toBe(true);
    const pity = rollSummon(createRng('s'), 10);
    expect(Object.values(pity).reduce((s, n) => s + (n ?? 0), 0)).toBe(5);
    expect((pity.hero_ysolde ?? 0) + (pity.hero_vesna ?? 0)).toBeGreaterThanOrEqual(1);
  });
});
