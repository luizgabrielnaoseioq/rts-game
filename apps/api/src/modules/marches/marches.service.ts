import { Injectable } from '@nestjs/common';
import {
  canAttackByKeepLevel,
  carryCapacity,
  distance,
  HEROES,
  isShielded,
  marchCapacity,
  marchHeroBonuses,
  marchSpeed,
  maxMarches,
  maxSecondaryHeroes,
  recallLeg,
  travelMs,
  troopCount,
  type CreateMarchBody,
  type HeroTypeId,
  type MarchDto,
  type TroopCounts,
  type TroopTypeId,
} from '@wn/shared';
import { lockCity, lockMarch } from '../../common/db/locks';
import { GameError } from '../../common/errors/game-error';
import { PrismaService, type Tx } from '../../common/prisma/prisma.service';
import { CityTickService } from '../../core/game/city-tick.service';
import { heroLevel, MARCH_FULL_INCLUDE, toMapMarch, toMarchDto } from '../../core/game/mappers';
import { EventQueue } from '../../core/scheduler/event-queue';
import { TxService } from '../../core/tx.service';
import { WorldService } from '../../core/world.service';
import { ACTIVE_MARCH_STATES, legChunks, MarchEngine } from './march-engine.service';

type Target =
  | { kind: 'RESOURCE_NODE'; id: string }
  | { kind: 'NPC_CAMP'; id: string }
  | { kind: 'CITY'; id: string; ownerId: string };

@Injectable()
export class MarchesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly txs: TxService,
    private readonly tick: CityTickService,
    private readonly queue: EventQueue,
    private readonly world: WorldService,
    private readonly engine: MarchEngine,
  ) {}

  async list(playerId: string): Promise<MarchDto[]> {
    const ms = await this.prisma.march.findMany({
      where: { playerId, state: { in: [...ACTIVE_MARCH_STATES] } },
      include: MARCH_FULL_INCLUDE,
      orderBy: { createdAt: 'asc' },
    });
    return ms.map(toMarchDto);
  }

  async get(playerId: string, marchId: string): Promise<MarchDto> {
    const m = await this.prisma.march.findFirst({ where: { id: marchId, playerId }, include: MARCH_FULL_INCLUDE });
    if (!m) throw new GameError('NOT_FOUND', { entity: 'march' });
    return toMarchDto(m);
  }

  /** ARQUITETURA 5.4 + GDD 12/14. O alvo é resolvido pela coordenada, nunca por id do cliente. */
  create(playerId: string, body: CreateMarchBody): Promise<MarchDto> {
    return this.txs.run(async (tx, emit) => {
      const w = await this.world.get();
      const city = await tx.city.findUnique({ where: { playerId }, select: { id: true } });
      if (!city) throw new GameError('NOT_FOUND', { entity: 'city' });
      await lockCity(tx, city.id);
      const now = Date.now();
      const ctx = await this.tick.advance(tx, city.id, now, emit);
      const keep = ctx.levels.keep ?? 1;

      // 1) Alvo
      const target = await this.resolveTarget(tx, w.id, body, playerId, keep, now);

      // 2) Heróis
      if (body.secondaryHeroIds.length > maxSecondaryHeroes(keep)) {
        throw new GameError('TOO_MANY_HEROES', { max: maxSecondaryHeroes(keep) });
      }
      const heroIds = [body.commanderHeroId, ...body.secondaryHeroIds];
      const heroes = await tx.hero.findMany({ where: { id: { in: heroIds }, playerId } });
      if (heroes.length !== heroIds.length) throw new GameError('NOT_FOUND', { entity: 'hero' });
      const commander = heroes.find((h) => h.id === body.commanderHeroId)!;
      if (!HEROES[commander.heroTypeId as HeroTypeId]?.canLead) throw new GameError('HERO_CANNOT_LEAD');
      const busy = heroes.filter((h) => h.activeMarchId);
      if (busy.length) throw new GameError('HERO_BUSY', { heroIds: busy.map((h) => h.id) });

      // 3) Tropas
      const troops = body.troops as TroopCounts;
      for (const [id, n] of Object.entries(troops) as [TroopTypeId, number][]) {
        if ((ctx.troopsHome[id] ?? 0) < n) throw new GameError('NOT_ENOUGH_TROOPS', { troopTypeId: id, available: ctx.troopsHome[id] ?? 0 });
      }
      const total = troopCount(troops);
      if (total <= 0) throw new GameError('NO_TROOPS');
      if (total > marchCapacity(keep)) throw new GameError('MARCH_CAPACITY_EXCEEDED', { max: marchCapacity(keep) });

      // 4) Limite de marchas
      const active = await tx.march.count({ where: { playerId, state: { in: [...ACTIVE_MARCH_STATES] } } });
      if (active >= maxMarches(keep)) throw new GameError('MARCH_LIMIT_REACHED', { max: maxMarches(keep) });

      // 5) Reforço: capacidade de marcha da Cidadela do anfitrião (soma de todos os reforços).
      if (body.type === 'REINFORCE' && target.kind === 'CITY') {
        const host = await tx.city.findUniqueOrThrow({ where: { id: target.id }, select: { level: true } });
        const agg = await tx.marchTroop.aggregate({
          where: { march: { targetCityId: target.id, type: 'REINFORCE', state: { in: ['OUTBOUND', 'STATIONED'] } } },
          _sum: { alive: true },
        });
        if ((agg._sum.alive ?? 0) + total > marchCapacity(host.level)) throw new GameError('REINFORCE_CAPACITY_FULL', { max: marchCapacity(host.level) });
      }

      // 6) Atacar alguém quebra o próprio escudo (novato ou trégua).
      if (body.type === 'ATTACK_PLAYER') {
        const me = await tx.player.findUniqueOrThrow({ where: { id: playerId } });
        if (me.shieldUntil) {
          await tx.player.update({ where: { id: playerId }, data: { shieldUntil: null, shieldKind: null } });
          emit.toPlayer(playerId, 'shield:changed', { shieldUntil: null, shieldKind: null });
          await this.tick.emitMapCity(tx, ctx, emit);
        }
      }

      // 7) Cálculos (shared)
      const hall = ctx.levels.hero_hall ?? 0;
      const ref = (id: string) => {
        const h = heroes.find((x) => x.id === id)!;
        return { heroTypeId: h.heroTypeId as HeroTypeId, level: heroLevel(h.xp, hall) };
      };
      const { bonuses } = marchHeroBonuses(ref(body.commanderHeroId), body.secondaryHeroIds.map(ref));
      const speed = marchSpeed(troops, bonuses.marchSpeed, ctx.speed);
      const carry = carryCapacity(troops, bonuses.load);
      const from = { x: ctx.x, y: ctx.y };
      const to = { x: body.targetX, y: body.targetY };
      const legEndAt = new Date(now + travelMs(distance(from, to), speed));

      // 8) Escritas
      for (const [id, n] of Object.entries(troops) as [TroopTypeId, number][]) {
        ctx.troopsHome[id] = (ctx.troopsHome[id] ?? 0) - n;
        await this.tick.saveStack(tx, ctx, id);
      }
      const march = await tx.march.create({
        data: {
          worldId: w.id,
          playerId,
          originCityId: ctx.id,
          type: body.type,
          state: 'OUTBOUND',
          targetKind: target.kind,
          targetX: to.x,
          targetY: to.y,
          targetResourceNodeId: target.kind === 'RESOURCE_NODE' ? target.id : null,
          targetNpcCampId: target.kind === 'NPC_CAMP' ? target.id : null,
          targetCityId: target.kind === 'CITY' ? target.id : null,
          fromX: from.x,
          fromY: from.y,
          toX: to.x,
          toY: to.y,
          legStartAt: new Date(now),
          legEndAt,
          speed,
          carryCapacity: carry,
          troops: { create: (Object.entries(troops) as [TroopTypeId, number][]).map(([troopTypeId, n]) => ({ troopTypeId, sent: n, alive: n })) },
          heroes: { create: heroIds.map((heroId, slot) => ({ heroId, slot })) },
        },
        include: MARCH_FULL_INCLUDE,
      });
      await tx.hero.updateMany({ where: { id: { in: heroIds } }, data: { activeMarchId: march.id } });
      await this.queue.schedule(tx, {
        type: 'MARCH_ARRIVE',
        runAt: legEndAt,
        payload: { marchId: march.id, version: 0 },
        dedupeKey: `march:${march.id}:v0:arrive`,
        marchId: march.id,
      });

      // 9) Emissões pós-commit
      emit.march('march:created', toMapMarch(march, march.player.displayName), legChunks(march));
      this.tick.emitTroops(ctx, emit);
      if (body.type === 'ATTACK_PLAYER' && target.kind === 'CITY') {
        emit.toPlayer(target.ownerId, 'attack:incoming', {
          marchId: march.id,
          attackerName: march.player.displayName,
          fromX: from.x,
          fromY: from.y,
          arriveAt: legEndAt.toISOString(),
        });
      }
      const fresh = await tx.march.findUniqueOrThrow({ where: { id: march.id }, include: MARCH_FULL_INCLUDE });
      return toMarchDto(fresh);
    });
  }

  private async resolveTarget(tx: Tx, worldId: string, body: CreateMarchBody, playerId: string, myKeep: number, now: number): Promise<Target> {
    const where = { worldId_x_y: { worldId, x: body.targetX, y: body.targetY } };
    switch (body.type) {
      case 'GATHER': {
        const node = await tx.resourceNode.findUnique({ where });
        if (!node) throw new GameError('TARGET_INVALID');
        // Ocupado não bloqueia a saída (pode liberar até a chegada).
        if (node.status !== 'AVAILABLE' || node.remaining <= 0) throw new GameError('TARGET_DEPLETED');
        return { kind: 'RESOURCE_NODE', id: node.id };
      }
      case 'ATTACK_NPC': {
        const camp = await tx.npcCamp.findUnique({ where });
        if (!camp) throw new GameError('TARGET_INVALID');
        if (camp.status !== 'ACTIVE') throw new GameError('TARGET_DEPLETED');
        return { kind: 'NPC_CAMP', id: camp.id };
      }
      case 'ATTACK_PLAYER':
      case 'REINFORCE': {
        const city = await tx.city.findUnique({ where, include: { player: true } });
        if (!city) throw new GameError('TARGET_INVALID');
        if (city.playerId === playerId) throw new GameError('TARGET_OWN_CITY');
        if (body.type === 'ATTACK_PLAYER') {
          if (isShielded(city.player.shieldUntil, now)) throw new GameError('TARGET_SHIELDED', { shieldUntil: city.player.shieldUntil?.toISOString() });
          if (!canAttackByKeepLevel(myKeep, city.level)) throw new GameError('TARGET_LEVEL_TOO_LOW');
        }
        return { kind: 'CITY', id: city.id, ownerId: city.playerId };
      }
    }
  }

  /** OUTBOUND → volta do ponto atual; GATHERING → volta com o coletado; STATIONED → volta normal. */
  recall(playerId: string, marchId: string): Promise<MarchDto> {
    return this.txs.run(async (tx, emit) => {
      const pre = await tx.march.findFirst({ where: { id: marchId, playerId }, select: { originCityId: true } });
      if (!pre) throw new GameError('NOT_FOUND', { entity: 'march' });
      await lockCity(tx, pre.originCityId);
      await lockMarch(tx, marchId);
      const m = (await this.engine.loadMarch(tx, marchId))!;
      const now = Date.now();
      const ctx = await this.tick.advance(tx, m.originCityId, now, emit);

      if (m.state === 'OUTBOUND') {
        await this.queue.cancelForMarch(tx, m.id);
        const leg = recallLeg(
          { fromX: m.fromX, fromY: m.fromY, toX: m.toX, toY: m.toY, legStartAt: m.legStartAt.getTime(), legEndAt: m.legEndAt.getTime() },
          { x: ctx.x, y: ctx.y },
          now,
        );
        const version = m.version + 1;
        const legEndAt = new Date(now + leg.durationMs);
        const updated = await tx.march.update({
          where: { id: m.id },
          data: { state: 'RETURNING', version, fromX: leg.from.x, fromY: leg.from.y, toX: ctx.x, toY: ctx.y, legStartAt: new Date(now), legEndAt },
          include: MARCH_FULL_INCLUDE,
        });
        await this.queue.schedule(tx, {
          type: 'MARCH_RETURN',
          runAt: legEndAt,
          payload: { marchId: m.id, version },
          dedupeKey: `march:${m.id}:v${version}:return`,
          marchId: m.id,
        });
        // A perna nova é parte da antiga: os mesmos chunks já viam a marcha.
        emit.march('march:updated', toMapMarch(updated, updated.player.displayName), legChunks(m));
        if (m.type === 'ATTACK_PLAYER' && m.targetCityId) {
          const target = await tx.city.findUnique({ where: { id: m.targetCityId }, select: { playerId: true } });
          if (target) emit.toPlayer(target.playerId, 'attack:cancelled', { marchId: m.id });
        }
      } else if (m.state === 'GATHERING') {
        await this.queue.cancelForMarch(tx, m.id);
        await this.engine.finishGather(tx, m, now, true, ctx, emit);
      } else if (m.state === 'STATIONED') {
        await this.queue.cancelForMarch(tx, m.id);
        await this.engine.startReturn(tx, m, { x: m.targetX, y: m.targetY }, now, emit);
      } else {
        throw new GameError('MARCH_NOT_RECALLABLE', { state: m.state });
      }
      const fresh = await tx.march.findUniqueOrThrow({ where: { id: m.id }, include: MARCH_FULL_INCLUDE });
      return toMarchDto(fresh);
    });
  }
}

