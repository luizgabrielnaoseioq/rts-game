import { describe, expect, it } from 'vitest';
import {
  COMBAT,
  NPC_CAMP_LEVELS,
  buildNpcSide,
  buildPlayerSide,
  carryCapacity,
  distributeLoot,
  heroBonuses,
  lootable,
  protectedResources,
  resolveBattle,
  splitXp,
} from '../index';

/** GDD 13.3 — exemplo calculado (PvP). */
function gddExample() {
  const attacker = buildPlayerSide({
    troops: { cavalry_t1: 120, infantry_t1: 80, archer_t1: 60 },
    commander: { heroTypeId: 'hero_brannoc', level: 6 },
    secondaries: [{ heroTypeId: 'hero_seris', level: 4 }],
    woundedRate: COMBAT.WOUNDED_RATE.attackerVsPlayer,
  });
  const defender = buildPlayerSide({
    troops: { infantry_t1: 100, archer_t1: 80 },
    commander: { heroTypeId: 'hero_aldric', level: 5 },
    wallLevel: 3,
    woundedRate: COMBAT.WOUNDED_RATE.defender,
  });
  return resolveBattle({ mode: 'pvp', attacker, defender });
}

describe('resolveBattle — exemplo do GDD 13.3', () => {
  it('bônus dos heróis batem com o texto', () => {
    expect(heroBonuses('hero_brannoc', 6).attack.cavalry).toBeCloseTo(0.12, 10);
    expect(heroBonuses('hero_seris', 4, 0.5).attack.archer).toBeCloseTo(0.065, 10);
    expect(heroBonuses('hero_aldric', 5).defense.infantry).toBeCloseTo(0.14, 10);
    expect(heroBonuses('hero_aldric', 5).hp.infantry).toBeCloseTo(0.07, 10);
    expect(heroBonuses('hero_aldric', 20).defense.infantry).toBeCloseTo(0.29, 10);
  });

  it('rodada 1 e quantidades no fim de cada rodada', () => {
    const r = gddExample();
    const table = [
      // atq cav, atq inf, atq arq, def inf, def arq
      [104.37, 67.59, 49.01, 78.01, 45.61],
      [93.35, 59.53, 42.1, 54.78, 20.55],
      [86.51, 54.93, 38.26, 31.24, 4.18],
      [83.26, 53.0, 36.68, 4.97, 0],
      [82.8, 52.76, 36.48, 0, 0],
    ];
    expect(r.rounds).toBe(5);
    r.roundLog.forEach((snap, i) => {
      const [ac, ai, aa, di, da] = table[i];
      expect(snap.attacker.cavalry_t1!).toBeCloseTo(ac, 1);
      expect(snap.attacker.infantry_t1!).toBeCloseTo(ai, 1);
      expect(snap.attacker.archer_t1!).toBeCloseTo(aa, 1);
      expect(snap.defender.infantry_t1!).toBeCloseTo(di, 1);
      expect(snap.defender.archer_t1!).toBeCloseTo(da, 1);
    });
    // baixas da rodada 1 (texto): arqueiros def 34,39; inf def 21,99; atq 15,63 / 12,41 / 10,99
    expect(80 - r.roundLog[0].defender.archer_t1!).toBeCloseTo(34.39, 2);
    expect(100 - r.roundLog[0].defender.infantry_t1!).toBeCloseTo(21.99, 2);
    expect(120 - r.roundLog[0].attacker.cavalry_t1!).toBeCloseTo(15.63, 2);
    expect(80 - r.roundLog[0].attacker.infantry_t1!).toBeCloseTo(12.41, 2);
    expect(60 - r.roundLog[0].attacker.archer_t1!).toBeCloseTo(10.99, 2);
  });

  it('resultado, feridos e mortos', () => {
    const r = gddExample();
    expect(r.outcome).toBe('ATTACKER_WON');
    expect(r.attacker.stacks.map((s) => [s.troopTypeId, s.casualties, s.wounded, s.dead])).toEqual([
      ['cavalry_t1', 37, 14, 23],
      ['infantry_t1', 27, 10, 17],
      ['archer_t1', 24, 9, 15],
    ]);
    expect(r.attacker.totalCasualties).toBe(88);
    expect(r.attacker.totalWounded).toBe(33);
    expect(r.attacker.totalDead).toBe(55);
    expect(r.defender.totalCasualties).toBe(180);
    expect(r.defender.wounded).toEqual({ infantry_t1: 70, archer_t1: 56 });
    expect(r.defender.totalDead).toBe(54);
  });

  it('saque e XP', () => {
    const r = gddExample();
    const loot = lootable({ food: 9000, wood: 8000, stone: 3000, gold: 1500 }, protectedResources(2));
    expect(loot.food).toBeCloseTo(2620, 6);
    expect(loot.wood).toBeCloseTo(2220, 6);
    expect(loot.stone).toBeCloseTo(220, 6);
    expect(loot.gold).toBe(0);
    const carry = carryCapacity(r.attacker.survivors);
    expect(carry).toBe(2063);
    expect(distributeLoot(loot, carry)).toEqual({ food: 1068, wood: 905, stone: 89, gold: 0 });
    expect(splitXp(r.defender.casualtiesPower, 'commander')).toBe(540);
    expect(splitXp(r.defender.casualtiesPower, 'secondary')).toBe(270);
    expect(r.attacker.casualtiesPower).toBe(264);
  });

  it('é determinístico', () => {
    expect(gddExample()).toEqual(gddExample());
  });
});

describe('resolveBattle — outras regras', () => {
  it('cidade sem tropas: atacante vence sem rodadas', () => {
    const r = resolveBattle({
      mode: 'pvp',
      attacker: { troops: { infantry_t1: 10 }, woundedRate: 0.4 },
      defender: { troops: {}, woundedRate: 0.7 },
    });
    expect(r.outcome).toBe('ATTACKER_WON');
    expect(r.rounds).toBe(0);
  });

  it('NPC: sem zerar o acampamento, o atacante perde', () => {
    const r = resolveBattle({
      mode: 'npc',
      attacker: { troops: { infantry_t1: 5 }, woundedRate: COMBAT.WOUNDED_RATE.attackerVsNpc },
      defender: buildNpcSide('npc_hollow', NPC_CAMP_LEVELS[0].troops),
    });
    expect(r.outcome).toBe('DEFENDER_WON');
  });

  it('exército inicial vence o acampamento 1 perdendo cerca de 20%', () => {
    const r = resolveBattle({
      mode: 'npc',
      attacker: buildPlayerSide({
        troops: { infantry_t1: 80, archer_t1: 40 },
        commander: { heroTypeId: 'hero_aldric', level: 1 },
        woundedRate: COMBAT.WOUNDED_RATE.attackerVsNpc,
      }),
      defender: buildNpcSide('npc_hollow', NPC_CAMP_LEVELS[0].troops),
    });
    expect(r.outcome).toBe('ATTACKER_WON');
    const lossPct = r.attacker.totalCasualties / 120;
    expect(lossPct).toBeGreaterThan(0.1);
    expect(lossPct).toBeLessThan(0.3);
  });

  it('PvP simétrico sem zerar: empate de vida vai para o defensor', () => {
    const side = { troops: { infantry_t3: 1000 }, woundedRate: 0.5 };
    const r = resolveBattle({ mode: 'pvp', attacker: side, defender: side });
    expect(r.rounds).toBe(5);
    expect(r.outcome).toBe('DEFENDER_WON');
  });

  it('Última Unção move metade dos mortos para feridos', () => {
    const base = { troops: { infantry_t1: 200 }, woundedRate: 0.4 };
    const enemy = { troops: { archer_t1: 200 }, woundedRate: 0.4 };
    const without = resolveBattle({ mode: 'pvp', attacker: base, defender: enemy });
    const withRite = resolveBattle({ mode: 'pvp', attacker: { ...base, abilities: ['last_rite'] }, defender: enemy });
    const s0 = without.attacker.stacks[0];
    const s1 = withRite.attacker.stacks[0];
    expect(s1.casualties).toBe(s0.casualties);
    expect(s1.wounded).toBe(s0.wounded + Math.floor(s0.dead * 0.5));
  });
});
