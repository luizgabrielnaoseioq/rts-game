// GDD 9 — XP, nível, bônus de herói, taverna.
import type { HeroRarity, TroopClass } from '../contracts/common';
import { TROOP_CLASSES } from '../contracts/common';
import { HERO_HALL } from '../config/buildings';
import { roundHalfUp } from '../config/curves';
import { HERO_ABILITIES, HERO_IDS, HERO_RARITIES, HERO_RULES, HERO_XP_CURVE, HEROES, type HeroAbilityId } from '../config/heroes';
import { pickWeighted, type Rng } from '../world/rng';
import type { HeroTypeId } from '../ids';

export type ClassBonus = Record<TroopClass, number>;

/** Bônus (frações: 0,10 = +10%). */
export interface HeroBonuses {
  attack: ClassBonus;
  defense: ClassBonus;
  hp: ClassBonus;
  marchSpeed: number;
  load: number;
  gather: number;
  loot: number;
}

export function emptyClassBonus(): ClassBonus {
  return { infantry: 0, archer: 0, cavalry: 0 };
}

export function emptyHeroBonuses(): HeroBonuses {
  return { attack: emptyClassBonus(), defense: emptyClassBonus(), hp: emptyClassBonus(), marchSpeed: 0, load: 0, gather: 0, loot: 0 };
}

export function addHeroBonuses(a: HeroBonuses, b: HeroBonuses): HeroBonuses {
  const add = (x: ClassBonus, y: ClassBonus): ClassBonus => ({
    infantry: x.infantry + y.infantry,
    archer: x.archer + y.archer,
    cavalry: x.cavalry + y.cavalry,
  });
  return {
    attack: add(a.attack, b.attack),
    defense: add(a.defense, b.defense),
    hp: add(a.hp, b.hp),
    marchSpeed: a.marchSpeed + b.marchSpeed,
    load: a.load + b.load,
    gather: a.gather + b.gather,
    loot: a.loot + b.loot,
  };
}

/**
 * Passiva do herói no nível (base + porNível × (N − 1)), × share (1 = principal, 0,5 = secundário).
 * Arredonda em 1e-9 para evitar lixo de ponto flutuante (0,1 + 0,01×4 = 0,14).
 */
export function heroBonuses(heroTypeId: HeroTypeId, level: number, share = 1): HeroBonuses {
  const out = emptyHeroBonuses();
  const clean = (v: number) => Math.round(v * 1e9) / 1e9;
  for (const p of HEROES[heroTypeId].passive) {
    const v = clean((p.base + p.perLevel * (level - 1)) * share);
    if (p.stat === 'attack' || p.stat === 'defense' || p.stat === 'hp') {
      const targets: readonly TroopClass[] = p.target === 'all' ? TROOP_CLASSES : [p.target];
      for (const c of targets) out[p.stat][c] += v;
    } else {
      out[p.stat] += v;
    }
  }
  return out;
}

export interface HeroRef {
  heroTypeId: HeroTypeId;
  level: number;
}

export interface MarchHeroBonuses {
  bonuses: HeroBonuses;
  /** Habilidade do principal (secundários não usam habilidade). */
  abilities: HeroAbilityId[];
}

/**
 * Bônus somados de uma marcha (ou da defesa): principal 100% + habilidade; secundários 50% sem habilidade.
 * Lombo de Mula (habilidade fora de combate) entra como +20% de carga.
 */
export function marchHeroBonuses(commander: HeroRef | null, secondaries: readonly HeroRef[] = []): MarchHeroBonuses {
  let bonuses = emptyHeroBonuses();
  const abilities: HeroAbilityId[] = [];
  if (commander) {
    bonuses = addHeroBonuses(bonuses, heroBonuses(commander.heroTypeId, commander.level, 1));
    const ability = HEROES[commander.heroTypeId].ability;
    abilities.push(ability);
    const eff = HERO_ABILITIES[ability].effect;
    if (eff.kind === 'load') bonuses.load += eff.value;
  }
  for (const s of secondaries) {
    bonuses = addHeroBonuses(bonuses, heroBonuses(s.heroTypeId, s.level, HERO_RULES.secondaryPassiveShare));
  }
  return { bonuses, abilities };
}

// ── XP e nível ──

/** XP para subir do nível N para N+1 = round(100 × 1,3^(N−1)). */
export function xpToNext(level: number): number {
  return roundHalfUp(HERO_XP_CURVE.base * HERO_XP_CURVE.factor ** (level - 1));
}

/** XP total acumulada para estar no nível (nível 1 = 0). */
export function totalXpForLevel(level: number): number {
  let total = 0;
  for (let l = 1; l < level; l++) total += xpToNext(l);
  return total;
}

/** Nível máximo de herói = max(2, 2 × nívelSalão), teto 20. */
export function maxHeroLevel(heroHallLevel: number): number {
  return Math.min(HERO_HALL.heroLevelCap, Math.max(HERO_HALL.minMaxHeroLevel, HERO_HALL.maxHeroLevelPerHallLevel * heroHallLevel));
}

/** Nível pela XP total, limitado pelo máximo (XP acima do máximo fica acumulada). */
export function levelFromXp(totalXp: number, maxLevel: number = HERO_XP_CURVE.levelCap): number {
  let level = 1;
  let acc = 0;
  while (level < maxLevel) {
    const need = xpToNext(level);
    if (acc + need > totalXp) break;
    acc += need;
    level++;
  }
  return level;
}

/** XP que falta para o próximo nível (null se no máximo). */
export function xpForNextLevel(totalXp: number, maxLevel: number = HERO_XP_CURVE.levelCap): number | null {
  const level = levelFromXp(totalXp, maxLevel);
  if (level >= maxLevel) return null;
  return totalXpForLevel(level + 1) - totalXp;
}

/** Divide XP entre heróis da marcha: principal 100%, secundários 50% (arredonda pra baixo). */
export function splitXp(xp: number, role: 'commander' | 'secondary'): number {
  return Math.floor(role === 'commander' ? xp : xp * HERO_RULES.secondaryXpShare);
}

/** Coleta = 1 XP por 50 recursos coletados. */
export function gatherXp(amount: number): number {
  return Math.floor(amount / HERO_RULES.gatherResourcesPerXp);
}

// ── Taverna e fragmentos ──

/** Custo do chamado = round(300 × (1 − 0,03 × nívelSalão)) ouro. */
export function summonCost(heroHallLevel: number): number {
  return roundHalfUp(HERO_HALL.summonBaseGold * (1 - HERO_HALL.summonDiscountPerLevel * heroHallLevel));
}

/** O chamado nº `summonNumber` (1-based, pago ou grátis) tem garantia de Épico? (todo 10º) */
export function isPitySummon(summonNumber: number): boolean {
  return summonNumber > 0 && summonNumber % HERO_HALL.epicPityEvery === 0;
}

const RARITIES: readonly HeroRarity[] = ['common', 'rare', 'epic'];

/** Sorteia o herói de 1 fragmento aleatório: raridade (50/38/12), depois uniforme na raridade. */
export function rollFragmentHero(rng: Rng, forceRarity?: HeroRarity): HeroTypeId {
  const rarity = forceRarity ?? pickWeighted(rng, RARITIES, (r) => HERO_RARITIES[r].fragmentWeight);
  const pool = HERO_IDS.filter((id) => HEROES[id].rarity === rarity);
  return pool[Math.floor(rng() * pool.length)];
}

/**
 * Fragmentos de um chamado (5). No chamado de garantia (todo 10º), o 1º fragmento é forçado Épico.
 * Devolve contagem por herói.
 */
export function rollSummon(rng: Rng, summonNumber: number): Partial<Record<HeroTypeId, number>> {
  const out: Partial<Record<HeroTypeId, number>> = {};
  for (let i = 0; i < HERO_HALL.fragmentsPerSummon; i++) {
    const force = i === 0 && isPitySummon(summonNumber) ? 'epic' : undefined;
    const id = rollFragmentHero(rng, force);
    out[id] = (out[id] ?? 0) + 1;
  }
  return out;
}

/** Fragmentos para liberar (null = não se libera por fragmento). */
export function fragmentsToUnlock(heroTypeId: HeroTypeId): number | null {
  const o = HEROES[heroTypeId].obtain;
  return o.kind === 'fragments' ? o.fragments : null;
}

/** Fragmento de herói já liberado vira 100 XP. */
export function duplicateFragmentXp(count: number): number {
  return count * HERO_RULES.duplicateFragmentXp;
}
