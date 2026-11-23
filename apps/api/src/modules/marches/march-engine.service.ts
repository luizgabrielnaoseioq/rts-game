import { Injectable, OnModuleInit } from '@nestjs/common';
import { Prisma, type ScheduledEvent } from '@prisma/client';
import {
  addTroops,
  admitWounded,
  buildNpcSide,
  buildPlayerSide,
  campHeroXp,
  campRespawnMs,
  campTroops,
  carryCapacity,
  chunkOf,
  chunksCrossedBySegment,
  COMBAT,
  distance,
  distributeLoot,
  gatheredAmount,
  gatherDurationMs,
  gatherRatePerMin,
  gatherXp,
  isShielded,
  lootable,
  marchCapacity,
  marchHeroBonuses,
  nodeRespawnMs,
  npcChestForLevel,
  NPC_FACTIONS,
  protectedResources,
  resolveBattle,
  splitXp,
  subtractResources,
  addResources,
  sumResources,
  travelMs,
  truceUntil,
  type BattleReportPayload,
  type CampTypeId,
  type ChestTypeId,
  type Coord,
  type HeroRef,
  type HeroTypeId,
  type MarchArrivalResult,
  type Resources,
  type SideResult,
  type TroopCounts,
  type TroopTypeId,
} from '@wn/shared';
import { lockCamp, lockCitiesOrdered, lockCity, lockMarch, lockNode } from '../../common/db/locks';
import type { Tx } from '../../common/prisma/prisma.service';
import { CityTickService, type CityCtx } from '../../core/game/city-tick.service';
import { HeroXpService, type HeroOwnerCtx } from '../../core/game/hero-xp.service';
import { heroLevel, MARCH_FULL_INCLUDE, RESOURCE_KEY, toHeroDto, toMapCamp, toMapCity, toMapMarch, toMapNode, type MarchFull } from '../../core/game/mappers';
import { roundLogDto, sideReport, splitProportional, writeReport, type TroopLine } from '../../core/game/reports';
import type { EmitBuffer } from '../../core/realtime/emit-buffer';
import { EventQueue } from '../../core/scheduler/event-queue';
import { WorldService } from '../../core/world.service';

type MarchPayload = { marchId: string; version: number };

export const ACTIVE_MARCH_STATES = ['OUTBOUND', 'GATHERING', 'STATIONED', 'RETURNING'] as const;

export function aliveTroops(m: MarchFull): TroopCounts {
  const out: TroopCounts = {};
  for (const t of m.troops) if (t.alive > 0) out[t.troopTypeId as TroopTypeId] = t.alive;
  return out;
}

export function legChunks(m: { fromX: number; fromY: number; toX: number; toY: number }): string[] {
  return chunksCrossedBySegment({ x: m.fromX, y: m.fromY }, { x: m.toX, y: m.toY });
}

function lootOf(m: MarchFull): Resources {
  return { food: m.lootFood, wood: m.lootWood, stone: m.lootStone, gold: m.lootGold };
}

/**
 * Motor das marchas (ARQUITETURA 5.5): chegada, coleta, combate (NPC e PvP), reforço, retorno.
 * Todos os handlers usam T = event.runAt e são idempotentes (version da marcha).
 * Ordem de locks: cidades (por id) → marchas (por id) → nó/acampamento.
 */
@Injectable()
export class MarchEngine implements OnModuleInit {
  constructor(
    private readonly queue: EventQueue,
    private readonly tick: CityTickService,
    private readonly xp: HeroXpService,
    private readonly world: WorldService,
  ) {}

  onModuleInit(): void {
    this.queue.register('MARCH_ARRIVE', (tx, ev, emit) => this.onArrive(tx, ev, emit));
    this.queue.register('GATHER_COMPLETE', (tx, ev, emit) => this.onGatherComplete(tx, ev, emit));
    this.queue.register('MARCH_RETURN', (tx, ev, emit) => this.onReturn(tx, ev, emit));
  }

  loadMarch(tx: Tx, marchId: string): Promise<MarchFull | null> {
    return tx.march.findUnique({ where: { id: marchId }, include: MARCH_FULL_INCLUDE });
  }

  /** Heróis da marcha como HeroRef (nível pela XP e pelo Salão do dono). */
  heroRefs(m: MarchFull, hallLevel: number): { commander: HeroRef | null; secondaries: HeroRef[] } {
    const sorted = [...m.heroes].sort((a, b) => a.slot - b.slot);
    const ref = (h: (typeof sorted)[number]): HeroRef => ({ heroTypeId: h.hero.heroTypeId as HeroTypeId, level: heroLevel(h.hero.xp, hallLevel) });
    const cmd = sorted.find((h) => h.slot === 0);
    return { commander: cmd ? ref(cmd) : null, secondaries: sorted.filter((h) => h.slot !== 0).map(ref) };
  }

  owner(ctx: CityCtx): HeroOwnerCtx {
    return { playerId: ctx.playerId, heroHallLevel: ctx.levels.hero_hall ?? 0, defenseHeroId: ctx.defenseHeroId };
  }

  /** XP para os heróis da marcha: principal 100%, secundários 50%. */
  async grantMarchXp(tx: Tx, m: MarchFull, ctx: CityCtx, xp: number, emit: EmitBuffer): Promise<{ heroTypeId: HeroTypeId; level: number; xpGained: number }[]> {
    const out: { heroTypeId: HeroTypeId; level: number; xpGained: number }[] = [];
    const hall = ctx.levels.hero_hall ?? 0;
    for (const mh of [...m.heroes].sort((a, b) => a.slot - b.slot)) {
      const gained = xp > 0 ? splitXp(xp, mh.slot === 0 ? 'commander' : 'secondary') : 0;
      const updated = gained > 0 ? await this.xp.addXp(tx, this.owner(ctx), mh.hero, gained, emit) : mh.hero;
      out.push({ heroTypeId: mh.hero.heroTypeId as HeroTypeId, level: heroLevel(updated.xp, hall), xpGained: gained });
    }
    return out;
  }

  private emitMarch(emit: EmitBuffer, m: MarchFull, event: 'march:created' | 'march:updated'): void {
    emit.march(event, toMapMarch(m, m.player.displayName), legChunks(m));
  }

  // ─────────────── perna de volta / conclusão ───────────────

  /** Inicia a volta para a cidade de origem a partir de `from` no instante T. */
  async startReturn(tx: Tx, m: MarchFull, from: Coord, T: number, emit: EmitBuffer, extra: Prisma.MarchUpdateInput = {}): Promise<MarchFull> {
    const origin = await tx.city.findUniqueOrThrow({ where: { id: m.originCityId }, select: { x: true, y: true } });
    const dur = from.x === origin.x && from.y === origin.y ? 0 : travelMs(distance(from, origin), m.speed);
    const version = m.version + 1;
    const legEndAt = new Date(T + dur);
    const updated = await tx.march.update({
      where: { id: m.id },
      data: {
        ...extra,
        state: 'RETURNING',
        version,
        fromX: from.x,
        fromY: from.y,
        toX: origin.x,
        toY: origin.y,
        legStartAt: new Date(T),
        legEndAt,
      },
      include: MARCH_FULL_INCLUDE,
    });
    await this.queue.schedule(tx, {
      type: 'MARCH_RETURN',
      runAt: legEndAt,
      payload: { marchId: m.id, version },
      dedupeKey: `march:${m.id}:v${version}:return`,
      marchId: m.id,
    });
    this.emitMarch(emit, updated, 'march:updated');
    return updated;
  }

  /** Ninguém sobrou (nem ferido): marcha termina na hora, heróis voltam livres. */
  async completeNow(tx: Tx, m: MarchFull, T: number, ctx: CityCtx, emit: EmitBuffer): Promise<void> {
    await tx.march.update({ where: { id: m.id }, data: { state: 'COMPLETED', completedAt: new Date(T), version: m.version + 1 } });
    await this.freeHeroes(tx, m, ctx, emit);
    emit.toPlayerAndChunks(m.playerId, legChunks(m), 'march:removed', { marchId: m.id });
  }

  private async freeHeroes(tx: Tx, m: MarchFull, ctx: CityCtx, emit: EmitBuffer): Promise<void> {
    await tx.hero.updateMany({ where: { activeMarchId: m.id }, data: { activeMarchId: null } });
    const heroes = await tx.hero.findMany({ where: { id: { in: m.heroes.map((h) => h.heroId) } } });
    for (const h of heroes) emit.toPlayer(m.playerId, 'hero:updated', { hero: toHeroDto(h, ctx.levels.hero_hall ?? 0, ctx.defenseHeroId) });
  }

  private async afterBattle(tx: Tx, m: MarchFull, T: number, ctx: CityCtx, emit: EmitBuffer, extra: Prisma.MarchUpdateInput = {}): Promise<void> {
    const alive = m.troops.reduce((s, t) => s + t.alive, 0);
    const wounded = m.troops.reduce((s, t) => s + t.wounded, 0);
    if (alive + wounded <= 0) {
      if (Object.keys(extra).length) await tx.march.update({ where: { id: m.id }, data: extra });
      await this.completeNow(tx, m, T, ctx, emit);
    } else {
      await this.startReturn(tx, m, { x: m.targetX, y: m.targetY }, T, emit, extra);
    }
  }

  // ─────────────── MARCH_ARRIVE ───────────────

  async onArrive(tx: Tx, ev: ScheduledEvent, emit: EmitBuffer): Promise<void> {
    const p = ev.payload as MarchPayload;
    const T = ev.runAt.getTime();
    const pre = await tx.march.findUnique({ where: { id: p.marchId }, select: { originCityId: true, targetCityId: true, type: true, state: true, version: true } });
    if (!pre || pre.version !== p.version || pre.state !== 'OUTBOUND') return;

    // Cidades envolvidas (origem, alvo e origens dos reforços estacionados no alvo).
    const cityIds = [pre.originCityId];
    let reinforcementIds: string[] = [];
    if (pre.type === 'ATTACK_PLAYER' && pre.targetCityId) {
      cityIds.push(pre.targetCityId);
      const rs = await tx.march.findMany({
        where: { targetCityId: pre.targetCityId, type: 'REINFORCE', state: 'STATIONED' },
        select: { id: true, originCityId: true },
      });
      reinforcementIds = rs.map((r) => r.id);
      cityIds.push(...rs.map((r) => r.originCityId));
    }
    await lockCitiesOrdered(tx, cityIds);
    for (const id of [p.marchId, ...reinforcementIds].sort()) await lockMarch(tx, id);

    const m = await this.loadMarch(tx, p.marchId);
    if (!m || m.version !== p.version || m.state !== 'OUTBOUND') return;
    const ctx = await this.tick.advance(tx, m.originCityId, T, emit);

    switch (m.type) {
      case 'GATHER':
        return this.arriveGather(tx, m, T, ctx, emit);
      case 'ATTACK_NPC':
        return this.arriveNpc(tx, m, T, ctx, emit);
      case 'ATTACK_PLAYER':
        return this.arrivePvp(tx, m, T, ctx, reinforcementIds, emit);
      case 'REINFORCE':
        return this.arriveReinforce(tx, m, T, emit);
    }
  }

  private async bounce(tx: Tx, m: MarchFull, T: number, result: MarchArrivalResult, emit: EmitBuffer): Promise<void> {
    emit.toPlayer(m.playerId, 'march:arrived', { marchId: m.id, result });
    await this.startReturn(tx, m, { x: m.targetX, y: m.targetY }, T, emit);
  }

  private async arriveGather(tx: Tx, m: MarchFull, T: number, ctx: CityCtx, emit: EmitBuffer): Promise<void> {
    const node = m.targetResourceNodeId && (await lockNode(tx, m.targetResourceNodeId)) ? await tx.resourceNode.findUnique({ where: { id: m.targetResourceNodeId } }) : null;
    if (!node || node.status !== 'AVAILABLE' || node.x !== m.targetX || node.y !== m.targetY || node.remaining <= 0) return this.bounce(tx, m, T, 'TARGET_GONE', emit);
    if (node.occupiedByMarchId && node.occupiedByMarchId !== m.id) return this.bounce(tx, m, T, 'NODE_OCCUPIED', emit);

    const refs = this.heroRefs(m, ctx.levels.hero_hall ?? 0);
    const { bonuses } = marchHeroBonuses(refs.commander, refs.secondaries);
    const rate = gatherRatePerMin(RESOURCE_KEY[node.resourceType], node.level, bonuses.gather, ctx.speed);
    const dur = gatherDurationMs(m.carryCapacity, node.remaining, rate);
    const endsAt = new Date(T + (Number.isFinite(dur) ? dur : 0));
    const version = m.version + 1;
    const updatedNode = await tx.resourceNode.update({ where: { id: node.id }, data: { occupiedByMarchId: m.id } });
    const updated = await tx.march.update({
      where: { id: m.id },
      data: {
        state: 'GATHERING',
        version,
        fromX: m.targetX,
        fromY: m.targetY,
        toX: m.targetX,
        toY: m.targetY,
        legStartAt: new Date(T),
        legEndAt: endsAt,
        gatherStartedAt: new Date(T),
        gatherEndsAt: endsAt,
      },
      include: MARCH_FULL_INCLUDE,
    });
    await this.queue.schedule(tx, {
      type: 'GATHER_COMPLETE',
      runAt: endsAt,
      payload: { marchId: m.id, version },
      dedupeKey: `march:${m.id}:v${version}:gather`,
      marchId: m.id,
    });
    this.emitMarch(emit, updated, 'march:updated');
    emit.toPlayer(m.playerId, 'march:arrived', { marchId: m.id, result: 'GATHERING' });
    emit.toChunks([chunkOf(node.x, node.y)], 'map:entity-updated', { kind: 'resourceNode', entity: toMapNode(updatedNode, m.player.displayName) });
  }

  // ─────────────── GATHER_COMPLETE (e recall durante a coleta) ───────────────

  async onGatherComplete(tx: Tx, ev: ScheduledEvent, emit: EmitBuffer): Promise<void> {
    const p = ev.payload as MarchPayload;
    const T = ev.runAt.getTime();
    const pre = await tx.march.findUnique({ where: { id: p.marchId }, select: { originCityId: true, version: true, state: true } });
    if (!pre || pre.version !== p.version || pre.state !== 'GATHERING') return;
    await lockCity(tx, pre.originCityId);
    await lockMarch(tx, p.marchId);
    const m = await this.loadMarch(tx, p.marchId);
    if (!m || m.version !== p.version || m.state !== 'GATHERING') return;
    const ctx = await this.tick.advance(tx, m.originCityId, T, emit);
    await this.finishGather(tx, m, T, false, ctx, emit);
  }

  /** Calcula o coletado até T, libera o nó, grava o relatório e inicia a volta. */
  async finishGather(tx: Tx, m: MarchFull, T: number, recalled: boolean, ctx: CityCtx, emit: EmitBuffer): Promise<MarchFull> {
    const world = await this.world.get();
    const node = m.targetResourceNodeId && (await lockNode(tx, m.targetResourceNodeId)) ? await tx.resourceNode.findUnique({ where: { id: m.targetResourceNodeId } }) : null;
    let gathered = 0;
    const started = m.gatherStartedAt?.getTime() ?? T;
    const ends = m.gatherEndsAt?.getTime() ?? T;
    if (node && node.occupiedByMarchId === m.id) {
      const target = Math.max(0, Math.min(node.remaining, m.carryCapacity));
      const total = ends - started;
      // Taxa derivada da própria coleta agendada (o nó é exclusivo durante a coleta).
      gathered = total > 0 ? gatheredAmount(T - started, (target * 60_000) / total, target) : target;
      const remaining = node.remaining - gathered;
      const depleted = remaining <= 0;
      const respawnAt = depleted ? new Date(T + nodeRespawnMs(world.speed)) : null;
      const updatedNode = await tx.resourceNode.update({
        where: { id: node.id },
        data: { remaining: Math.max(0, remaining), occupiedByMarchId: null, ...(depleted ? { status: 'DEPLETED', respawnAt } : {}) },
      });
      if (depleted && respawnAt) {
        await this.queue.schedule(tx, {
          type: 'RESOURCE_NODE_RESPAWN',
          runAt: respawnAt,
          payload: { nodeId: node.id, generation: node.generation },
          dedupeKey: `node:${node.id}:g${node.generation}:respawn`,
        });
      }
      emit.toChunks([chunkOf(node.x, node.y)], 'map:entity-updated', { kind: 'resourceNode', entity: toMapNode(updatedNode, null) });
    }
    const resourceType = node ? RESOURCE_KEY[node.resourceType] : 'food';
    const heroesXp = await this.grantMarchXp(tx, m, ctx, gatherXp(gathered), emit);
    const xpGained = heroesXp.reduce((s, h) => s + h.xpGained, 0);
    await writeReport(
      tx,
      {
        worldId: m.worldId,
        kind: 'GATHER',
        outcome: null,
        x: m.targetX,
        y: m.targetY,
        marchId: m.id,
        attackerPlayerId: m.playerId,
        defenderPlayerId: null,
        payload: { resourceType, amount: gathered, nodeLevel: node?.level ?? 0, durationMs: Math.max(0, T - started), recalled, xpGained },
        recipients: [{ playerId: m.playerId, role: 'GATHERER' }],
        at: new Date(T),
      },
      emit,
    );
    const lootField = { food: 'lootFood', wood: 'lootWood', stone: 'lootStone', gold: 'lootGold' } as const;
    const extra = { [lootField[resourceType]]: { increment: gathered }, gatherEndsAt: new Date(T) } as Prisma.MarchUpdateInput;
    return this.startReturn(tx, m, { x: m.targetX, y: m.targetY }, T, emit, extra);
  }

  // ─────────────── Ataque a NPC ───────────────

  private async arriveNpc(tx: Tx, m: MarchFull, T: number, ctx: CityCtx, emit: EmitBuffer): Promise<void> {
    const world = await this.world.get();
    const camp = m.targetNpcCampId && (await lockCamp(tx, m.targetNpcCampId)) ? await tx.npcCamp.findUnique({ where: { id: m.targetNpcCampId } }) : null;
    if (!camp || camp.status !== 'ACTIVE' || camp.x !== m.targetX || camp.y !== m.targetY) return this.bounce(tx, m, T, 'TARGET_GONE', emit);

    const campTypeId = camp.campTypeId as CampTypeId;
    const refs = this.heroRefs(m, ctx.levels.hero_hall ?? 0);
    const before = aliveTroops(m);
    const defBefore = (camp.currentTroops as TroopCounts | null) ?? campTroops(camp.level);
    const res = resolveBattle({
      mode: 'npc',
      attacker: buildPlayerSide({ troops: before, commander: refs.commander, secondaries: refs.secondaries, woundedRate: COMBAT.WOUNDED_RATE.attackerVsNpc }),
      defender: buildNpcSide(campTypeId, defBefore),
    });
    const won = res.outcome === 'ATTACKER_WON';
    await this.applyAttackerLosses(tx, m, res.attacker);

    let chestTypeId: string | null = null;
    if (won) {
      const respawnAt = new Date(T + campRespawnMs(camp.level, world.speed));
      const updatedCamp = await tx.npcCamp.update({
        where: { id: camp.id },
        data: { status: 'DEFEATED', defeatedAt: new Date(T), respawnAt, currentTroops: Prisma.DbNull },
      });
      await this.queue.schedule(tx, {
        type: 'NPC_CAMP_RESPAWN',
        runAt: respawnAt,
        payload: { campId: camp.id, generation: camp.generation },
        dedupeKey: `camp:${camp.id}:g${camp.generation}:respawn`,
      });
      chestTypeId = npcChestForLevel(camp.level);
      emit.toChunks([chunkOf(camp.x, camp.y)], 'map:entity-updated', { kind: 'npcCamp', entity: toMapCamp(updatedCamp) });
    }
    // GDD 10: derrota do jogador → acampamento volta cheio (perdas do NPC não ficam salvas).

    const heroesXp = await this.grantMarchXp(tx, m, ctx, won ? campHeroXp(camp.level) : 0, emit);
    const faction = NPC_FACTIONS[campTypeId];
    const payload: BattleReportPayload = {
      rounds: res.rounds,
      roundLog: roundLogDto(res.roundLog),
      attacker: sideReport(m.player.displayName, m.playerId, heroesXp, this.lines(res.attacker)),
      defender: sideReport(`${faction?.name ?? campTypeId} (nv ${camp.level})`, null, [], this.lines(res.defender)),
      loot: { food: 0, wood: 0, stone: 0, gold: 0 },
      chestTypeId: (chestTypeId as BattleReportPayload['chestTypeId']) ?? null,
      defenderTruceUntil: null,
    };
    await writeReport(
      tx,
      {
        worldId: m.worldId,
        kind: 'BATTLE_NPC',
        outcome: res.outcome,
        x: m.targetX,
        y: m.targetY,
        marchId: m.id,
        attackerPlayerId: m.playerId,
        defenderPlayerId: null,
        payload,
        recipients: [{ playerId: m.playerId, role: 'ATTACKER' }],
        at: new Date(T),
      },
      emit,
    );
    emit.toPlayer(m.playerId, 'march:arrived', { marchId: m.id, result: 'BATTLE' });
    await this.tick.recomputePower(tx, m.playerId);

    const fresh = (await this.loadMarch(tx, m.id))!;
    const refreshedBonuses = marchHeroBonuses(refs.commander, refs.secondaries).bonuses;
    await this.afterBattle(tx, fresh, T, ctx, emit, {
      chestTypeId,
      carryCapacity: carryCapacity(aliveTroops(fresh), refreshedBonuses.load),
    });
  }

  private lines(side: SideResult, overrides?: Map<TroopTypeId, { wounded: number; dead: number }>): TroopLine[] {
    return side.stacks.map((s) => {
      const o = overrides?.get(s.troopTypeId);
      return {
        troopTypeId: s.troopTypeId,
        before: s.initial,
        lost: s.casualties,
        wounded: o ? o.wounded : s.wounded,
        dead: o ? o.dead : s.dead,
        after: s.survivors,
      };
    });
  }

  /** Atacante: vivos = sobreviventes; feridos voltam com a marcha. */
  private async applyAttackerLosses(tx: Tx, m: MarchFull, side: SideResult): Promise<void> {
    for (const s of side.stacks) {
      const t = m.troops.find((x) => x.troopTypeId === s.troopTypeId);
      if (!t) continue;
      await tx.marchTroop.update({
        where: { marchId_troopTypeId: { marchId: m.id, troopTypeId: s.troopTypeId } },
        data: { alive: s.survivors, wounded: t.wounded + s.wounded },
      });
    }
  }

  // ─────────────── Ataque a jogador (PvP) ───────────────

  private async arrivePvp(tx: Tx, m: MarchFull, T: number, ctx: CityCtx, reinforcementIds: string[], emit: EmitBuffer): Promise<void> {
    const targetCity = m.targetCityId ? await tx.city.findUnique({ where: { id: m.targetCityId } }) : null;
    if (!targetCity || targetCity.x !== m.targetX || targetCity.y !== m.targetY) return this.bounce(tx, m, T, 'TARGET_GONE', emit);
    const def = await this.tick.advance(tx, targetCity.id, T, emit);
    const defPlayer = await tx.player.findUniqueOrThrow({ where: { id: def.playerId } });
    if (isShielded(defPlayer.shieldUntil, T)) return this.bounce(tx, m, T, 'TARGET_SHIELDED', emit);

    // Reforços estacionados (ainda STATIONED depois do lock).
    const reinfs: MarchFull[] = [];
    for (const id of reinforcementIds) {
      const r = await this.loadMarch(tx, id);
      if (r && r.state === 'STATIONED' && r.targetCityId === targetCity.id) reinfs.push(r);
    }
    const reinfCtx = new Map<string, CityCtx>();
    for (const r of reinfs) if (!reinfCtx.has(r.originCityId)) reinfCtx.set(r.originCityId, await this.tick.advance(tx, r.originCityId, T, emit));

    // Comandante de defesa: só se estiver em casa.
    const defHero = def.defenseHeroId ? await tx.hero.findUnique({ where: { id: def.defenseHeroId } }) : null;
    const defHeroHome = defHero && !defHero.activeMarchId ? defHero : null;
    const defHall = def.levels.hero_hall ?? 0;
    const defRef: HeroRef | null = defHeroHome ? { heroTypeId: defHeroHome.heroTypeId as HeroTypeId, level: heroLevel(defHeroHome.xp, defHall) } : null;

    const home = { ...def.troopsHome };
    let defTroops: TroopCounts = { ...home };
    for (const r of reinfs) defTroops = addTroops(defTroops, aliveTroops(r));

    const refs = this.heroRefs(m, ctx.levels.hero_hall ?? 0);
    const atkBonuses = marchHeroBonuses(refs.commander, refs.secondaries).bonuses;
    const before = aliveTroops(m);
    const res = resolveBattle({
      mode: 'pvp',
      attacker: buildPlayerSide({ troops: before, commander: refs.commander, secondaries: refs.secondaries, woundedRate: COMBAT.WOUNDED_RATE.attackerVsPlayer }),
      defender: buildPlayerSide({ troops: defTroops, commander: defRef, wallLevel: def.levels.wall ?? 0, woundedRate: COMBAT.WOUNDED_RATE.defender }),
    });
    const won = res.outcome === 'ATTACKER_WON';
    await this.applyAttackerLosses(tx, m, res.attacker);

    // Perdas do defensor repartidas entre a guarnição e cada reforço, por tipo.
    const overrides = new Map<TroopTypeId, { wounded: number; dead: number }>();
    let infUsed = this.tick.infirmaryUsed(def);
    const infCap = this.tick.infirmaryCapacity(def);
    for (const s of res.defender.stacks) {
      const id = s.troopTypeId;
      const weights = [home[id] ?? 0, ...reinfs.map((r) => r.troops.find((t) => t.troopTypeId === id)?.alive ?? 0)];
      const cas = splitProportional(s.casualties, weights);
      const wnd = splitProportional(s.wounded, cas);
      // Guarnição: feridos vão para a Enfermaria (o que não cabe morre).
      const adm = admitWounded(wnd[0], infUsed, infCap);
      infUsed += adm.admitted;
      def.troopsHome[id] = Math.max(0, (home[id] ?? 0) - cas[0]);
      def.wounded[id] = (def.wounded[id] ?? 0) + adm.admitted;
      if (cas[0] > 0) await this.tick.saveStack(tx, def, id);
      let woundedTotal = adm.admitted;
      // Reforços: feridos voltam com a marcha e entram na Enfermaria do dono.
      for (let i = 0; i < reinfs.length; i++) {
        if (cas[i + 1] <= 0) continue;
        const t = reinfs[i].troops.find((x) => x.troopTypeId === id)!;
        t.alive -= cas[i + 1];
        t.wounded += wnd[i + 1];
        woundedTotal += wnd[i + 1];
        await tx.marchTroop.update({ where: { marchId_troopTypeId: { marchId: reinfs[i].id, troopTypeId: id } }, data: { alive: t.alive, wounded: t.wounded } });
      }
      overrides.set(id, { wounded: woundedTotal, dead: s.casualties - woundedTotal });
    }

    // Saque e trégua (atacante venceu).
    let loot: Resources = { food: 0, wood: 0, stone: 0, gold: 0 };
    let truce: Date | null = null;
    if (won) {
      const survivors: TroopCounts = {};
      for (const s of res.attacker.stacks) if (s.survivors > 0) survivors[s.troopTypeId] = s.survivors;
      const freeCarry = carryCapacity(survivors, atkBonuses.load) - sumResources({ food: m.lootFood, wood: m.lootWood, stone: m.lootStone, gold: m.lootGold });
      loot = distributeLoot(lootable(def.resources, protectedResources(def.levels.warehouse ?? 0), atkBonuses.loot), freeCarry);
      def.resources = subtractResources(def.resources, loot);
      truce = new Date(truceUntil(T));
      await tx.player.update({ where: { id: def.playerId }, data: { shieldUntil: truce, shieldKind: 'TRUCE' } });
      emit.toPlayer(def.playerId, 'shield:changed', { shieldUntil: truce.toISOString(), shieldKind: 'TRUCE' });
    }
    await this.tick.saveResources(tx, def);

    // XP: atacante ganha o poder das baixas do defensor; comandante de defesa, o das baixas do atacante.
    const heroesXp = await this.grantMarchXp(tx, m, ctx, res.defender.casualtiesPower, emit);
    let defHeroesXp: { heroTypeId: HeroTypeId; level: number; xpGained: number }[] = [];
    if (defHeroHome) {
      const gained = res.attacker.casualtiesPower;
      const updated = await this.xp.addXp(tx, { playerId: def.playerId, heroHallLevel: defHall, defenseHeroId: def.defenseHeroId }, defHeroHome, gained, emit);
      defHeroesXp = [{ heroTypeId: defHeroHome.heroTypeId as HeroTypeId, level: heroLevel(updated.xp, defHall), xpGained: gained }];
    }

    const payload: BattleReportPayload = {
      rounds: res.rounds,
      roundLog: roundLogDto(res.roundLog),
      attacker: sideReport(m.player.displayName, m.playerId, heroesXp, this.lines(res.attacker)),
      defender: sideReport(defPlayer.displayName, defPlayer.id, defHeroesXp, this.lines(res.defender, overrides)),
      loot,
      chestTypeId: null,
      defenderTruceUntil: truce ? truce.toISOString() : null,
    };
    await writeReport(
      tx,
      {
        worldId: m.worldId,
        kind: 'BATTLE_PVP',
        outcome: res.outcome,
        x: m.targetX,
        y: m.targetY,
        marchId: m.id,
        attackerPlayerId: m.playerId,
        defenderPlayerId: defPlayer.id,
        payload,
        recipients: [
          { playerId: m.playerId, role: 'ATTACKER' },
          { playerId: defPlayer.id, role: 'DEFENDER' },
          ...reinfs.map((r) => ({ playerId: r.playerId, role: 'DEFENDER' as const })),
        ],
        at: new Date(T),
      },
      emit,
    );

    emit.toPlayer(m.playerId, 'march:arrived', { marchId: m.id, result: 'BATTLE' });
    this.tick.emitResources(def, emit);
    this.tick.emitTroops(def, emit);
    for (const pid of new Set([m.playerId, def.playerId, ...reinfs.map((r) => r.playerId)])) await this.tick.recomputePower(tx, pid);
    const mapCity = await tx.city.findUniqueOrThrow({ where: { id: def.id }, include: { player: true } });
    emit.toChunks([chunkOf(def.x, def.y)], 'map:entity-updated', { kind: 'city', entity: toMapCity(mapCity, T) });

    // Reforços sem ninguém vivo voltam (com feridos) ou acabam.
    for (const r of reinfs) {
      const fresh = (await this.loadMarch(tx, r.id))!;
      if (fresh.troops.some((t) => t.alive > 0)) continue;
      await this.afterBattle(tx, fresh, T, reinfCtx.get(r.originCityId)!, emit, { carryCapacity: 0 });
    }

    const fresh = (await this.loadMarch(tx, m.id))!;
    await this.afterBattle(tx, fresh, T, ctx, emit, {
      lootFood: { increment: loot.food },
      lootWood: { increment: loot.wood },
      lootStone: { increment: loot.stone },
      lootGold: { increment: loot.gold },
      carryCapacity: carryCapacity(aliveTroops(fresh), atkBonuses.load),
    });
  }

  // ─────────────── Reforço ───────────────

  private async arriveReinforce(tx: Tx, m: MarchFull, T: number, emit: EmitBuffer): Promise<void> {
    const city = m.targetCityId ? await tx.city.findUnique({ where: { id: m.targetCityId } }) : null;
    if (!city || city.x !== m.targetX || city.y !== m.targetY || city.playerId === m.playerId) return this.bounce(tx, m, T, 'TARGET_GONE', emit);
    const stationed = await tx.marchTroop.aggregate({
      where: { march: { targetCityId: city.id, type: 'REINFORCE', state: 'STATIONED' } },
      _sum: { alive: true },
    });
    const mine = m.troops.reduce((s, t) => s + t.alive, 0);
    if ((stationed._sum.alive ?? 0) + mine > marchCapacity(city.level)) return this.bounce(tx, m, T, 'TARGET_GONE', emit);
    const updated = await tx.march.update({
      where: { id: m.id },
      data: { state: 'STATIONED', version: m.version + 1, fromX: m.targetX, fromY: m.targetY, toX: m.targetX, toY: m.targetY, legStartAt: new Date(T), legEndAt: new Date(T) },
      include: MARCH_FULL_INCLUDE,
    });
    this.emitMarch(emit, updated, 'march:updated');
    emit.toPlayer(m.playerId, 'march:arrived', { marchId: m.id, result: 'STATIONED' });
  }

  // ─────────────── MARCH_RETURN ───────────────

  async onReturn(tx: Tx, ev: ScheduledEvent, emit: EmitBuffer): Promise<void> {
    const p = ev.payload as MarchPayload;
    const T = ev.runAt.getTime();
    const pre = await tx.march.findUnique({ where: { id: p.marchId }, select: { originCityId: true, version: true, state: true } });
    if (!pre || pre.version !== p.version || pre.state !== 'RETURNING') return;
    await lockCity(tx, pre.originCityId);
    await lockMarch(tx, p.marchId);
    const m = await this.loadMarch(tx, p.marchId);
    if (!m || m.version !== p.version || m.state !== 'RETURNING') return;
    const ctx = await this.tick.advance(tx, m.originCityId, T, emit);

    // Tropas vivas voltam pra casa; feridos entram na Enfermaria (o que não cabe morre).
    let used = this.tick.infirmaryUsed(ctx);
    const cap = this.tick.infirmaryCapacity(ctx);
    for (const t of m.troops) {
      const id = t.troopTypeId as TroopTypeId;
      const adm = admitWounded(t.wounded, used, cap);
      used += adm.admitted;
      if (t.alive <= 0 && adm.admitted <= 0) continue;
      ctx.troopsHome[id] = (ctx.troopsHome[id] ?? 0) + t.alive;
      ctx.wounded[id] = (ctx.wounded[id] ?? 0) + adm.admitted;
      ctx.marching[id] = Math.max(0, (ctx.marching[id] ?? 0) - t.alive);
      await this.tick.saveStack(tx, ctx, id);
    }
    // Saque/coleta (pode passar da capacidade).
    ctx.resources = addResources(ctx.resources, lootOf(m));
    await this.tick.saveResources(tx, ctx);
    if (m.chestTypeId) {
      const chest = await tx.chest.create({ data: { playerId: m.playerId, chestTypeId: m.chestTypeId, source: 'NPC_VICTORY', sourceRef: m.id, createdAt: new Date(T) } });
      emit.toPlayer(m.playerId, 'chest:new', { chest: { id: chest.id, chestTypeId: chest.chestTypeId as ChestTypeId, source: chest.source, createdAt: chest.createdAt.toISOString() } });
    }
    await tx.march.update({ where: { id: m.id }, data: { state: 'COMPLETED', completedAt: new Date(T), version: m.version + 1 } });
    await this.freeHeroes(tx, m, ctx, emit);
    await this.tick.recomputePower(tx, m.playerId);
    emit.toPlayerAndChunks(m.playerId, legChunks(m), 'march:removed', { marchId: m.id });
    this.tick.emitResources(ctx, emit);
    this.tick.emitTroops(ctx, emit);
  }
}

