import { Injectable, OnModuleInit } from '@nestjs/common';
import {
  buildingForSlot,
  cancelRefund,
  checkUpgrade,
  hasResources,
  healingCost,
  healingDurationMs,
  isTroopUnlocked,
  ITEMS,
  maxBatch,
  missingResources,
  QUEUES,
  subtractResources,
  addResources,
  trainingCost,
  trainingDurationMs,
  upgradeCost,
  type BuildingTypeId,
  type CityStateDto,
  type HealTroopsBody,
  type MapCityDto,
  type Resources,
  type TrainTroopsBody,
  type TroopTypeId,
  type UseSpeedupBody,
} from '@wn/shared';
import { lockCity } from '../../common/db/locks';
import { GameError } from '../../common/errors/game-error';
import { PrismaService, type Tx } from '../../common/prisma/prisma.service';
import { CityTickService, type CityCtx } from '../../core/game/city-tick.service';
import { toHeroDto, toMapCity } from '../../core/game/mappers';
import type { EmitBuffer } from '../../core/realtime/emit-buffer';
import { EventQueue } from '../../core/scheduler/event-queue';
import { TxService } from '../../core/tx.service';

@Injectable()
export class CityService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly txs: TxService,
    private readonly tick: CityTickService,
    private readonly queue: EventQueue,
  ) {}

  /** BUILDING/TRAINING/HEALING_COMPLETE: só trava e avança a cidade até runAt (idempotente). */
  onModuleInit(): void {
    const handler = async (tx: Tx, ev: { payload: unknown; runAt: Date }, emit: EmitBuffer) => {
      const { cityId } = ev.payload as { cityId: string };
      if (!(await lockCity(tx, cityId))) return;
      await this.tick.advance(tx, cityId, ev.runAt.getTime(), emit);
    };
    this.queue.register('BUILDING_COMPLETE', handler);
    this.queue.register('TRAINING_COMPLETE', handler);
    this.queue.register('HEALING_COMPLETE', handler);
  }

  async cityIdOf(db: Tx | PrismaService, playerId: string): Promise<string> {
    const c = await db.city.findUnique({ where: { playerId }, select: { id: true } });
    if (!c) throw new GameError('NOT_FOUND', { entity: 'city' });
    return c.id;
  }

  /** Abre transação, trava e avança a cidade do jogador até agora, roda `fn` e devolve o CityStateDto. */
  private async mutate(playerId: string, fn: (tx: Tx, ctx: CityCtx, emit: EmitBuffer, now: number) => Promise<void>): Promise<CityStateDto> {
    return this.txs.run(async (tx, emit) => {
      const cityId = await this.cityIdOf(tx, playerId);
      await lockCity(tx, cityId);
      const now = Date.now();
      const ctx = await this.tick.advance(tx, cityId, now, emit);
      await fn(tx, ctx, emit, now);
      return this.tick.toDto(tx, ctx);
    });
  }

  getCity(playerId: string): Promise<CityStateDto> {
    return this.mutate(playerId, async () => undefined);
  }

  rename(playerId: string, name: string): Promise<CityStateDto> {
    return this.mutate(playerId, async (tx, ctx, emit) => {
      await tx.city.update({ where: { id: ctx.id }, data: { name } });
      ctx.name = name;
      await this.tick.emitMapCity(tx, ctx, emit);
    });
  }

  async publicCity(cityId: string): Promise<MapCityDto> {
    const c = await this.prisma.city.findUnique({ where: { id: cityId }, include: { player: true } });
    if (!c) throw new GameError('NOT_FOUND', { entity: 'city' });
    return toMapCity(c);
  }

  /** "Sem comida não se treina nem constrói" (GDD 6). */
  private requireFood(res: Resources): void {
    if (res.food < 1) throw new GameError('INSUFFICIENT_RESOURCES', { missing: { food: 1, wood: 0, stone: 0, gold: 0 }, reason: 'no_food' });
  }

  private debit(ctx: CityCtx, cost: Partial<Resources>): void {
    ctx.resources = subtractResources(ctx.resources, cost);
  }

  /** ARQUITETURA 5.2 — constrói (nível 0) ou sobe o prédio do lote. */
  upgrade(playerId: string, slot: number, typeId?: BuildingTypeId): Promise<CityStateDto> {
    return this.mutate(playerId, async (tx, ctx, _emit, now) => {
      const slotType = buildingForSlot(slot);
      if (!slotType || (typeId && typeId !== slotType)) throw new GameError('SLOT_TYPE_NOT_ALLOWED', { slot, allowed: slotType });
      const b = ctx.buildings.find((x) => x.slot === slot);
      if (!b) throw new GameError('NOT_FOUND', { entity: 'building', slot });
      const check = checkUpgrade({
        typeId: slotType,
        levels: ctx.levels,
        resources: ctx.resources,
        activeUpgrades: ctx.buildings.filter((x) => x.upgradeEndsAt).length,
        alreadyUpgrading: !!b.upgradeEndsAt,
        speed: ctx.speed,
      });
      if (!check.ok) throw new GameError(check.code, check.details);
      this.requireFood(ctx.resources);
      this.debit(ctx, check.cost);
      await this.tick.saveResources(tx, ctx);
      const endsAt = new Date(now + check.durationMs);
      b.upgradeStartedAt = new Date(now);
      b.upgradeEndsAt = endsAt;
      await tx.building.update({ where: { id: b.id }, data: { upgradeStartedAt: b.upgradeStartedAt, upgradeEndsAt: endsAt } });
      await this.scheduleBuilding(tx, ctx.id, b.id, check.targetLevel, endsAt);
    });
  }

  private scheduleBuilding(tx: Tx, cityId: string, buildingId: string, level: number, endsAt: Date): Promise<void> {
    return this.queue.schedule(tx, {
      type: 'BUILDING_COMPLETE',
      runAt: endsAt,
      payload: { cityId, buildingId, level },
      dedupeKey: `building:${buildingId}:L${level}:${endsAt.getTime()}`,
    });
  }

  /** Cancelar obra devolve 50% do custo (GDD 7). */
  cancelUpgrade(playerId: string, slot: number): Promise<CityStateDto> {
    return this.mutate(playerId, async (tx, ctx) => {
      const b = ctx.buildings.find((x) => x.slot === slot);
      if (!b || !b.upgradeEndsAt) throw new GameError('NOTHING_TO_CANCEL');
      const refund = cancelRefund(upgradeCost(b.typeId as BuildingTypeId, b.level + 1));
      ctx.resources = addResources(ctx.resources, refund);
      await this.tick.saveResources(tx, ctx);
      b.upgradeStartedAt = null;
      b.upgradeEndsAt = null;
      await tx.building.update({ where: { id: b.id }, data: { upgradeStartedAt: null, upgradeEndsAt: null } });
      // O evento agendado vira no-op (advance não acha nada vencido).
    });
  }

  /** ARQUITETURA 5.3 — entra no fim da fila do quartel. */
  train(playerId: string, body: TrainTroopsBody): Promise<CityStateDto> {
    return this.mutate(playerId, async (tx, ctx, _emit, now) => {
      const troopTypeId = body.troopTypeId as TroopTypeId;
      const barracks = ctx.levels.barracks ?? 0;
      if (barracks < 1 || !isTroopUnlocked(troopTypeId, barracks)) throw new GameError('TROOP_LOCKED', { barracksLevel: barracks });
      if (body.count > maxBatch(barracks)) throw new GameError('BATCH_TOO_LARGE', { max: maxBatch(barracks) });
      if (ctx.trainingQueue.length >= QUEUES.trainingQueueSize) throw new GameError('TRAINING_QUEUE_FULL', { max: QUEUES.trainingQueueSize });
      const cost = trainingCost(troopTypeId, body.count);
      if (!hasResources(ctx.resources, cost)) throw new GameError('INSUFFICIENT_RESOURCES', { missing: missingResources(ctx.resources, cost) });
      this.requireFood(ctx.resources);
      this.debit(ctx, cost);
      await this.tick.saveResources(tx, ctx);
      const last = ctx.trainingQueue[ctx.trainingQueue.length - 1];
      const startsAt = new Date(Math.max(now, last ? last.endsAt.getTime() : 0));
      const endsAt = new Date(startsAt.getTime() + trainingDurationMs(troopTypeId, body.count, barracks, ctx.speed));
      const job = await tx.trainingJob.create({ data: { cityId: ctx.id, troopTypeId, count: body.count, startsAt, endsAt } });
      ctx.trainingQueue.push(job);
      await this.queue.schedule(tx, {
        type: 'TRAINING_COMPLETE',
        runAt: endsAt,
        payload: { cityId: ctx.id, jobId: job.id },
        dedupeKey: `training:${job.id}:${endsAt.getTime()}`,
      });
    });
  }

  /** Cura na Enfermaria: 40% do custo e do tempo de treino (GDD 8). */
  heal(playerId: string, body: HealTroopsBody): Promise<CityStateDto> {
    return this.mutate(playerId, async (tx, ctx, emit, now) => {
      const troopTypeId = body.troopTypeId as TroopTypeId;
      if ((ctx.wounded[troopTypeId] ?? 0) < body.count) throw new GameError('NOT_ENOUGH_WOUNDED', { available: ctx.wounded[troopTypeId] ?? 0 });
      if (ctx.healingQueue.length >= QUEUES.healingQueueSize) throw new GameError('HEALING_QUEUE_FULL', { max: QUEUES.healingQueueSize });
      const cost = healingCost(troopTypeId, body.count);
      if (!hasResources(ctx.resources, cost)) throw new GameError('INSUFFICIENT_RESOURCES', { missing: missingResources(ctx.resources, cost) });
      this.debit(ctx, cost);
      await this.tick.saveResources(tx, ctx);
      ctx.wounded[troopTypeId] = (ctx.wounded[troopTypeId] ?? 0) - body.count;
      await this.tick.saveStack(tx, ctx, troopTypeId);
      const last = ctx.healingQueue[ctx.healingQueue.length - 1];
      const startsAt = new Date(Math.max(now, last ? last.endsAt.getTime() : 0));
      const endsAt = new Date(startsAt.getTime() + healingDurationMs(troopTypeId, body.count, ctx.speed));
      const job = await tx.healingJob.create({ data: { cityId: ctx.id, troopTypeId, count: body.count, startsAt, endsAt } });
      ctx.healingQueue.push(job);
      await this.queue.schedule(tx, {
        type: 'HEALING_COMPLETE',
        runAt: endsAt,
        payload: { cityId: ctx.id, jobId: job.id },
        dedupeKey: `healing:${job.id}:${endsAt.getTime()}`,
      });
      this.tick.emitTroops(ctx, emit);
    });
  }

  /** Acelerador do inventário em obra, treino ou cura (não vale para marcha). */
  speedup(playerId: string, body: UseSpeedupBody): Promise<CityStateDto> {
    return this.mutate(playerId, async (tx, ctx, emit, now) => {
      const def = ITEMS[body.itemId];
      if (def.effect.kind !== 'speedup') throw new GameError('ITEM_NOT_USABLE');
      const inv = await tx.inventoryItem.findUnique({ where: { playerId_itemId: { playerId, itemId: body.itemId } } });
      if (!inv || inv.quantity < body.quantity) throw new GameError('NOT_ENOUGH_ITEMS', { available: inv?.quantity ?? 0 });
      const deltaMs = def.effect.seconds * 1000 * body.quantity;
      const target = body.target;

      if (target.kind === 'building') {
        const b = ctx.buildings.find((x) => x.slot === target.slot);
        if (!b || !b.upgradeEndsAt) throw new GameError('NOTHING_TO_CANCEL', { reason: 'not_upgrading' });
        const endsAt = new Date(Math.max(now, b.upgradeEndsAt.getTime() - deltaMs));
        b.upgradeEndsAt = endsAt;
        await tx.building.update({ where: { id: b.id }, data: { upgradeEndsAt: endsAt } });
        await this.scheduleBuilding(tx, ctx.id, b.id, b.level + 1, endsAt);
      } else {
        const isTraining = target.kind === 'training';
        const jobs = isTraining ? ctx.trainingQueue : ctx.healingQueue;
        const idx = jobs.findIndex((j) => j.id === target.jobId);
        if (idx < 0) throw new GameError('NOT_FOUND', { entity: target.kind });
        const job = jobs[idx];
        // Tira do job alvo e adianta os seguintes da fila (são sequenciais).
        const shift = Math.min(deltaMs, job.endsAt.getTime() - Math.max(now, job.startsAt.getTime()));
        for (let i = idx; i < jobs.length; i++) {
          const j = jobs[i];
          const startsAt = i === idx ? j.startsAt : new Date(j.startsAt.getTime() - shift);
          const endsAt = new Date(j.endsAt.getTime() - shift);
          j.startsAt = startsAt;
          j.endsAt = endsAt;
          const data = { startsAt, endsAt };
          if (isTraining) await tx.trainingJob.update({ where: { id: j.id }, data });
          else await tx.healingJob.update({ where: { id: j.id }, data });
          await this.queue.schedule(tx, {
            type: isTraining ? 'TRAINING_COMPLETE' : 'HEALING_COMPLETE',
            runAt: endsAt,
            payload: { cityId: ctx.id, jobId: j.id },
            dedupeKey: `${isTraining ? 'training' : 'healing'}:${j.id}:${endsAt.getTime()}`,
          });
        }
      }
      await tx.inventoryItem.update({ where: { playerId_itemId: { playerId, itemId: body.itemId } }, data: { quantity: { decrement: body.quantity } } });
      // Se o acelerador já zerou o timer, conclui agora.
      const after = await this.tick.advance(tx, ctx.id, now, emit);
      Object.assign(ctx, after);
    });
  }

  /** Comandante de defesa (escolhido no Salão dos Heróis). null = nenhum. */
  setDefenseHero(playerId: string, heroId: string | null): Promise<CityStateDto> {
    return this.mutate(playerId, async (tx, ctx, emit) => {
      const prev = ctx.defenseHeroId;
      if (heroId) {
        if ((ctx.levels.hero_hall ?? 0) < 1) throw new GameError('REQUIREMENT_NOT_MET', { missing: [{ typeId: 'hero_hall', level: 1 }] });
        const hero = await tx.hero.findFirst({ where: { id: heroId, playerId } });
        if (!hero) throw new GameError('NOT_FOUND', { entity: 'hero' });
      }
      await tx.city.update({ where: { id: ctx.id }, data: { defenseHeroId: heroId } });
      ctx.defenseHeroId = heroId;
      const hall = ctx.levels.hero_hall ?? 0;
      for (const id of [prev, heroId]) {
        if (!id) continue;
        const h = await tx.hero.findUnique({ where: { id } });
        if (h) emit.toPlayer(playerId, 'hero:updated', { hero: toHeroDto(h, hall, heroId) });
      }
    });
  }
}

