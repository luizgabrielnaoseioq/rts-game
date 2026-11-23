// GDD 13 — combate determinístico (resolveBattle). Função pura: mesma entrada, mesmo resultado.
import type { BattleOutcome, TroopClass } from '../contracts/common';
import { COMBAT } from '../config/balance';
import { WALL } from '../config/buildings';
import { HERO_ABILITIES, type HeroAbilityId } from '../config/heroes';
import { NPC_FACTIONS } from '../config/npcCamps';
import { TRIANGLE, TROOPS } from '../config/troops';
import type { CampTypeId, TroopCounts, TroopTypeId } from '../ids';
import { emptyClassBonus, marchHeroBonuses, type ClassBonus, type HeroRef } from './heroes';

export interface CombatBonuses {
  attack: ClassBonus;
  defense: ClassBonus;
  hp: ClassBonus;
}

export interface CombatSideInput {
  troops: TroopCounts;
  bonuses?: Partial<CombatBonuses>;
  /** Habilidades ativas (só do comandante principal / comandante de defesa). */
  abilities?: readonly HeroAbilityId[];
  /** Fração das baixas que vira ferido (COMBAT.WOUNDED_RATE). */
  woundedRate: number;
}

export interface BattleInput {
  /** 'npc': atacante só vence se zerar o acampamento. 'pvp': desempate por vida restante. */
  mode: 'npc' | 'pvp';
  attacker: CombatSideInput;
  defender: CombatSideInput;
}

export interface StackResult {
  troopTypeId: TroopTypeId;
  initial: number;
  /** Quantidade final (fracionária durante a luta). */
  final: number;
  /** round(inicial − final) */
  casualties: number;
  wounded: number;
  dead: number;
  /** inicial − baixas */
  survivors: number;
}

export interface SideResult {
  stacks: StackResult[];
  survivors: TroopCounts;
  wounded: TroopCounts;
  dead: TroopCounts;
  totalCasualties: number;
  totalWounded: number;
  totalDead: number;
  /** Poder das baixas (XP do lado oposto em PvP). */
  casualtiesPower: number;
  /** Σ qtd×VIDA×(1+bônus) final / inicial. */
  hpRatio: number;
}

export interface RoundSnapshot {
  round: number;
  attacker: TroopCounts;
  defender: TroopCounts;
}

export interface BattleResult {
  outcome: BattleOutcome;
  rounds: number;
  /** Quantidades (fracionárias) no fim de cada rodada. */
  roundLog: RoundSnapshot[];
  attacker: SideResult;
  defender: SideResult;
}

interface Stack {
  id: TroopTypeId;
  cls: TroopClass;
  atk: number;
  def: number;
  hp: number;
  initial: number;
  qty: number;
}

function toStacks(troops: TroopCounts): Stack[] {
  return (Object.entries(troops) as [TroopTypeId, number | undefined][])
    .filter(([id, n]) => TROOPS[id] && (n ?? 0) > 0)
    .map(([id, n]) => {
      const t = TROOPS[id];
      return { id, cls: t.class, atk: t.attack, def: t.defense, hp: t.hp, initial: n ?? 0, qty: n ?? 0 };
    });
}

function fullBonuses(b?: Partial<CombatBonuses>): CombatBonuses {
  return { attack: b?.attack ?? emptyClassBonus(), defense: b?.defense ?? emptyClassBonus(), hp: b?.hp ?? emptyClassBonus() };
}

/** bônusRodada(r, classe): Investida, Chuva de Brasas, Ceifa. */
function roundDamageBonus(abilities: readonly HeroAbilityId[], round: number, cls: TroopClass): number {
  let v = 0;
  for (const a of abilities) {
    const e = HERO_ABILITIES[a].effect;
    if (e.kind === 'roundDamage' && e.round === round && (e.target === 'all' || e.target === cls)) v += e.value;
  }
  return v;
}

/** danoRecebido(r): Parede de Escudos (−0,25 na rodada 1). */
function damageTakenMod(abilities: readonly HeroAbilityId[], round: number): number {
  let v = 0;
  for (const a of abilities) {
    const e = HERO_ABILITIES[a].effect;
    if (e.kind === 'damageTaken' && e.round === round) v += e.value;
  }
  return v;
}

function deadToWoundedRate(abilities: readonly HeroAbilityId[]): number {
  let v = 0;
  for (const a of abilities) {
    const e = HERO_ABILITIES[a].effect;
    if (e.kind === 'deadToWounded') v += e.value;
  }
  return v;
}

const sumQty = (s: Stack[]) => s.reduce((acc, x) => acc + x.qty, 0);

/** Dano que o lado X (atacando) causa em cada pilha do lado Y nesta rodada. */
function damageOn(
  from: Stack[],
  fromBonus: CombatBonuses,
  fromAbilities: readonly HeroAbilityId[],
  to: Stack[],
  toBonus: CombatBonuses,
  toAbilities: readonly HeroAbilityId[],
  round: number,
): number[] {
  const dmg = to.map(() => 0);
  const totalTo = sumQty(to);
  if (totalTo <= 0) return dmg;
  const taken = 1 + damageTakenMod(toAbilities, round);
  for (const s of from) {
    if (s.qty <= 0) continue;
    const out = s.qty * s.atk * (1 + fromBonus.attack[s.cls]) * (1 + roundDamageBonus(fromAbilities, round, s.cls));
    to.forEach((t, i) => {
      if (t.qty <= 0) return;
      const share = t.qty / totalTo;
      const tri = TRIANGLE[s.cls][t.cls];
      const mitig = COMBAT.DEF_K / (COMBAT.DEF_K + t.def * (1 + toBonus.defense[t.cls]));
      dmg[i] += out * share * tri * mitig * taken;
    });
  }
  return dmg;
}

function hpPool(stacks: Stack[], bonus: CombatBonuses, which: 'initial' | 'qty'): number {
  return stacks.reduce((acc, s) => acc + s[which] * s.hp * (1 + bonus.hp[s.cls]), 0);
}

function snapshot(stacks: Stack[]): TroopCounts {
  const out: TroopCounts = {};
  for (const s of stacks) out[s.id] = s.qty;
  return out;
}

function finishSide(stacks: Stack[], bonus: CombatBonuses, input: CombatSideInput): SideResult {
  const lastRite = deadToWoundedRate(input.abilities ?? []);
  const res: SideResult = {
    stacks: [],
    survivors: {},
    wounded: {},
    dead: {},
    totalCasualties: 0,
    totalWounded: 0,
    totalDead: 0,
    casualtiesPower: 0,
    hpRatio: 0,
  };
  for (const s of stacks) {
    const casualties = Math.round(s.initial - s.qty);
    let wounded = Math.floor(casualties * input.woundedRate);
    let dead = casualties - wounded;
    if (lastRite > 0) {
      const moved = Math.floor(dead * lastRite);
      wounded += moved;
      dead -= moved;
    }
    const survivors = s.initial - casualties;
    res.stacks.push({ troopTypeId: s.id, initial: s.initial, final: s.qty, casualties, wounded, dead, survivors });
    res.survivors[s.id] = survivors;
    res.wounded[s.id] = wounded;
    res.dead[s.id] = dead;
    res.totalCasualties += casualties;
    res.totalWounded += wounded;
    res.totalDead += dead;
    res.casualtiesPower += casualties * TROOPS[s.id].power;
  }
  const initialPool = hpPool(stacks, bonus, 'initial');
  res.hpRatio = initialPool > 0 ? hpPool(stacks, bonus, 'qty') / initialPool : 0;
  return res;
}

/**
 * Resolve uma batalha (GDD 13.2). Os dois lados batem ao mesmo tempo em cada rodada,
 * usando as quantidades do início da rodada; para antes se um lado zerar.
 */
export function resolveBattle(input: BattleInput): BattleResult {
  const A = toStacks(input.attacker.troops);
  const D = toStacks(input.defender.troops);
  const aBonus = fullBonuses(input.attacker.bonuses);
  const dBonus = fullBonuses(input.defender.bonuses);
  const aAbil = input.attacker.abilities ?? [];
  const dAbil = input.defender.abilities ?? [];
  const roundLog: RoundSnapshot[] = [];
  let rounds = 0;

  // Cidade (ou acampamento) sem tropas: atacante vence sem rodadas.
  if (sumQty(D) <= 0) {
    return {
      outcome: sumQty(A) > 0 ? 'ATTACKER_WON' : 'DEFENDER_WON',
      rounds: 0,
      roundLog,
      attacker: finishSide(A, aBonus, input.attacker),
      defender: finishSide(D, dBonus, input.defender),
    };
  }

  for (let r = 1; r <= COMBAT.MAX_ROUNDS; r++) {
    if (sumQty(A) <= 0 || sumQty(D) <= 0) break;
    const dmgOnD = damageOn(A, aBonus, aAbil, D, dBonus, dAbil, r);
    const dmgOnA = damageOn(D, dBonus, dAbil, A, aBonus, aAbil, r);
    D.forEach((t, i) => {
      if (t.qty <= 0) return;
      t.qty -= Math.min(t.qty, dmgOnD[i] / (t.hp * (1 + dBonus.hp[t.cls])));
    });
    A.forEach((t, i) => {
      if (t.qty <= 0) return;
      t.qty -= Math.min(t.qty, dmgOnA[i] / (t.hp * (1 + aBonus.hp[t.cls])));
    });
    rounds = r;
    roundLog.push({ round: r, attacker: snapshot(A), defender: snapshot(D) });
  }

  const attacker = finishSide(A, aBonus, input.attacker);
  const defender = finishSide(D, dBonus, input.defender);
  const aZero = sumQty(A) <= 0;
  const dZero = sumQty(D) <= 0;

  let outcome: BattleOutcome;
  if (dZero && !aZero) outcome = 'ATTACKER_WON';
  else if (aZero || input.mode === 'npc') outcome = 'DEFENDER_WON';
  // PvP, os dois sobraram: atacante vence só se a fração de vida dele for MAIOR; empate = defensor.
  else outcome = attacker.hpRatio > defender.hpRatio ? 'ATTACKER_WON' : 'DEFENDER_WON';

  return { outcome, rounds, roundLog, attacker, defender };
}

// ── Montagem dos lados ──

/** Lado do jogador (marcha ou defesa da cidade): heróis + muralha (só defensor de cidade). */
export function buildPlayerSide(params: {
  troops: TroopCounts;
  commander: HeroRef | null;
  secondaries?: readonly HeroRef[];
  /** Nível da Muralha (só quando defende a própria cidade). */
  wallLevel?: number;
  woundedRate: number;
}): CombatSideInput {
  const { bonuses, abilities } = marchHeroBonuses(params.commander, params.secondaries ?? []);
  const wall = params.wallLevel ?? 0;
  const add = (c: ClassBonus, v: number): ClassBonus => ({ infantry: c.infantry + v, archer: c.archer + v, cavalry: c.cavalry + v });
  return {
    troops: params.troops,
    bonuses: {
      attack: bonuses.attack,
      defense: add(bonuses.defense, WALL.defensePerLevel * wall),
      hp: add(bonuses.hp, WALL.hpPerLevel * wall),
    },
    abilities,
    woundedRate: params.woundedRate,
  };
}

/** Lado do acampamento NPC: só o bônus da facção (Pálida +10% DEF/VIDA), sem herói nem muralha. */
export function buildNpcSide(campTypeId: CampTypeId, troops: TroopCounts): CombatSideInput {
  const f = NPC_FACTIONS[campTypeId].bonuses;
  const flat = (v: number): ClassBonus => ({ infantry: v, archer: v, cavalry: v });
  return {
    troops,
    bonuses: { attack: emptyClassBonus(), defense: flat(f.defense), hp: flat(f.hp) },
    abilities: [],
    woundedRate: COMBAT.WOUNDED_RATE.npc,
  };
}
