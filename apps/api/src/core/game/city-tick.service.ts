import { Injectable } from '@nestjs/common';
import type { Building, HealingJob, TrainingJob } from '@prisma/client';
import {
  addTroops,
  buildingsPower,
  buildQueueSize,
  capacity,
  chunkOf,
  eraForKeep,
  HEROES,
  infirmaryCapacity,
  marchCapacity,
  maxMarches,
  newbieShieldEndsByKeep,
  productionPerHour,
  protectedResources,
  settle,
  totalXpForLevel,
  troopCount,
  troopsPower,
  troopUpkeepPerHour,
  type BuildingLevels,
  type BuildingTypeId,
  type CityStateDto,
  type HeroTypeId,
  type Resources,
  type SpeedSettings,
  type TroopCounts,
  type TroopTypeId,
} from '@wn/shared';
import { GameError } from '../../common/errors/game-error';
import type { Tx } from '../../common/prisma/prisma.service';
import type { EmitBuffer } from '../realtime/emit-buffer';
import { WorldService } from '../world.service';
import { toBuildingDto, toHeroDto, toMapCity } from './mappers';

/** Estado da cidade carregado dentro da transação (com a cidade travada). */
export interface CityCtx {
  id: string;
  playerId: string;
  worldId: string;
  name: string;
  x: number;
  y: number;
  level: number;
  defenseHeroId: string | null;
  resources: Resources;
  /** epoch ms em que `resources` vale. */
  resourcesAt: number;
  buildings: Building[];
  levels: BuildingLevels;
  /** Tropas em casa e feridos na Enfermaria. */
  troopsHome: TroopCounts;
  wounded: TroopCounts;
  /** Vivas em marchas que saíram desta cidade (pagam manutenção). */
  marching: TroopCounts;
  trainingQueue: TrainingJob[];
  healingQueue: HealingJob[];
  speed: SpeedSettings;
}

export interface CityRates {
  production: Resources;
  capacity: Resources;
  upkeep: number;
}

const KIND_ORDER = { building: 0, training: 1, healing: 2 } as const;

@Injectable()
export class CityTickService {
  constructor(private readonly world: WorldService) {}

  async load(tx: Tx, cityId: string): Promise<CityCtx> {
    const city = await tx.city.findUnique({
      where: { id: cityId },
      include: {
        buildings: { orderBy: { slot: 'asc' } },
        troops: true,
        trainingJobs: { where: { completedAt: null }, orderBy: { startsAt: 'asc' } },
        healingJobs: { where: { completedAt: null }, orderBy: { startsAt: 'asc' } },
      },
    });
    if (!city) throw new GameError('NOT_FOUND', { entity: 'city' });
    const marchTroops = await tx.marchTroop.findMany({
      where: { march: { originCityId: cityId, state: { not: 'COMPLETED' } } },
      select: { troopTypeId: true, alive: true },
    });
    const w = await this.world.get();
    const levels: BuildingLevels = {};
    for (const b of city.buildings) levels[b.typeId as BuildingTypeId] = b.level;
    const troopsHome: TroopCounts = {};
    const wounded: TroopCounts = {};
    for (const t of city.troops) {
      if (t.count > 0) troopsHome[t.troopTypeId as TroopTypeId] = t.count;
      if (t.wounded > 0) wounded[t.troopTypeId as TroopTypeId] = t.wounded;
    }
    const marching: TroopCounts = {};
    for (const t of marchTroops) marching[t.troopTypeId as TroopTypeId] = (marching[t.troopTypeId as TroopTypeId] ?? 0) + t.alive;
    return {
      id: city.id,
      playerId: city.playerId,
      worldId: city.worldId,
      name: city.name,
      x: city.x,
      y: city.y,
      level: city.level,
      defenseHeroId: city.defenseHeroId,
      resources: { food: city.food, wood: city.wood, stone: city.stone, gold: city.gold },
      resourcesAt: city.resourcesUpdatedAt.getTime(),
      buildings: city.buildings,
      levels,
      troopsHome,
      wounded,
      marching,
      trainingQueue: city.trainingJobs,
      healingQueue: city.healingJobs,
      speed: w.speed,
    };
  }

  rates(ctx: CityCtx): CityRates {
    const upkeep = troopUpkeepPerHour(addTroops(ctx.troopsHome, ctx.marching));
    return {
      production: productionPerHour(ctx.levels, { upkeepPerHour: upkeep, speed: ctx.speed }),
      capacity: capacity(ctx.levels.warehouse ?? 0),
      upkeep,
    };
  }

  private settleTo(ctx: CityCtx, atMs: number): void {
    const r = this.rates(ctx);
    const s = settle({ resources: ctx.resources, at: ctx.resourcesAt }, r.production, r.capacity, atMs);
    ctx.resources = s.resources;
    ctx.resourcesAt = s.at;
  }

  /**
   * Finalização preguiçosa (ARQUITETURA 5): conclui obras/treinos/curas vencidos até `atMs`, em ordem,
   * liquidando os recursos com as taxas de antes de cada item; grava tudo. A cidade já deve estar travada.
   */
  async advance(tx: Tx, cityId: string, atMs: number, emit: EmitBuffer): Promise<CityCtx> {
    const ctx = await this.load(tx, cityId);
    type Item =
      | { at: number; kind: 'building'; b: Building }
      | { at: number; kind: 'training'; job: TrainingJob }
      | { at: number; kind: 'healing'; job: HealingJob };
    const items: Item[] = [];
    for (const b of ctx.buildings) if (b.upgradeEndsAt && b.upgradeEndsAt.getTime() <= atMs) items.push({ at: b.upgradeEndsAt.getTime(), kind: 'building', b });
    for (const job of ctx.trainingQueue) if (job.endsAt.getTime() <= atMs) items.push({ at: job.endsAt.getTime(), kind: 'training', job });
    for (const job of ctx.healingQueue) if (job.endsAt.getTime() <= atMs) items.push({ at: job.endsAt.getTime(), kind: 'healing', job });
    items.sort((a, b) => a.at - b.at || KIND_ORDER[a.kind] - KIND_ORDER[b.kind]);

    const oldKeep = ctx.levels.keep ?? 0;
    const oldHall = ctx.levels.hero_hall ?? 0;
    const changedTroops = new Set<TroopTypeId>();

    for (const it of items) {
      this.settleTo(ctx, it.at);
      if (it.kind === 'building') {
        const b = it.b;
        b.level += 1;
        b.upgradeStartedAt = null;
        b.upgradeEndsAt = null;
        ctx.levels[b.typeId as BuildingTypeId] = b.level;
        await tx.building.update({ where: { id: b.id }, data: { level: b.level, upgradeStartedAt: null, upgradeEndsAt: null } });
      } else {
        const id = it.job.troopTypeId as TroopTypeId;
        ctx.troopsHome[id] = (ctx.troopsHome[id] ?? 0) + it.job.count;
        changedTroops.add(id);
        if (it.kind === 'training') {
          await tx.trainingJob.update({ where: { id: it.job.id }, data: { completedAt: it.job.endsAt } });
          ctx.trainingQueue = ctx.trainingQueue.filter((j) => j.id !== it.job.id);
        } else {
          await tx.healingJob.update({ where: { id: it.job.id }, data: { completedAt: it.job.endsAt } });
          ctx.healingQueue = ctx.healingQueue.filter((j) => j.id !== it.job.id);
        }
      }
    }
    this.settleTo(ctx, atMs);
    ctx.level = ctx.levels.keep ?? ctx.level;
    await this.saveResources(tx, ctx);
    for (const id of changedTroops) await this.saveStack(tx, ctx, id);

    if (items.length === 0) return ctx;

    // Efeitos colaterais
    const newKeep = ctx.levels.keep ?? 0;
    if (newKeep !== oldKeep) await this.onKeepLevel(tx, ctx, newKeep, emit);
    const newHall = ctx.levels.hero_hall ?? 0;
    if (newHall !== oldHall) await this.syncHeroLevels(tx, ctx, emit);
    await this.recomputePower(tx, ctx.playerId);

    for (const it of items) {
      if (it.kind === 'building') emit.toPlayer(ctx.playerId, 'building:completed', { building: toBuildingDto(it.b), cityLevel: ctx.level });
      else if (it.kind === 'training')
        emit.toPlayer(ctx.playerId, 'training:completed', { jobId: it.job.id, troopTypeId: it.job.troopTypeId as TroopTypeId, count: it.job.count });
      else emit.toPlayer(ctx.playerId, 'healing:completed', { jobId: it.job.id, troopTypeId: it.job.troopTypeId as TroopTypeId, count: it.job.count });
    }
    if (changedTroops.size > 0) this.emitTroops(ctx, emit);
    this.emitResources(ctx, emit);
    if (newKeep !== oldKeep) await this.emitMapCity(tx, ctx, emit);
    return ctx;
  }

  private async onKeepLevel(tx: Tx, ctx: CityCtx, keep: number, emit: EmitBuffer): Promise<void> {
    // GDD 9: Dorrik grátis ao chegar na Cidadela 2.
    for (const [heroTypeId, def] of Object.entries(HEROES) as [HeroTypeId, (typeof HEROES)[HeroTypeId]][]) {
      if (def.obtain.kind !== 'keep_level' || keep < def.obtain.keepLevel) continue;
      const exists = await tx.hero.findUnique({ where: { playerId_heroTypeId: { playerId: ctx.playerId, heroTypeId } } });
      if (exists) continue;
      const hero = await tx.hero.create({ data: { playerId: ctx.playerId, heroTypeId, level: 1, xp: totalXpForLevel(1) } });
      await tx.heroFragment.deleteMany({ where: { playerId: ctx.playerId, heroTypeId } });
      emit.toPlayer(ctx.playerId, 'hero:updated', { hero: toHeroDto(hero, ctx.levels.hero_hall ?? 0, ctx.defenseHeroId) });
    }
    // GDD 14: escudo de novato acaba na Cidadela 5.
    if (newbieShieldEndsByKeep(keep)) {
      const p = await tx.player.findUnique({ where: { id: ctx.playerId }, select: { shieldKind: true } });
      if (p?.shieldKind === 'NEWBIE') {
        await tx.player.update({ where: { id: ctx.playerId }, data: { shieldUntil: null, shieldKind: null } });
        emit.toPlayer(ctx.playerId, 'shield:changed', { shieldUntil: null, shieldKind: null });
      }
    }
  }

  /** Salão subiu → nível máximo dos heróis mudou: recalcula o cache de nível. */
  async syncHeroLevels(tx: Tx, ctx: CityCtx, emit: EmitBuffer): Promise<void> {
    const hall = ctx.levels.hero_hall ?? 0;
    const heroes = await tx.hero.findMany({ where: { playerId: ctx.playerId } });
    for (const h of heroes) {
      const dto = toHeroDto(h, hall, ctx.defenseHeroId);
      if (dto.level !== h.level) await tx.hero.update({ where: { id: h.id }, data: { level: dto.level } });
      emit.toPlayer(ctx.playerId, 'hero:updated', { hero: dto });
    }
  }

  async saveResources(tx: Tx, ctx: CityCtx): Promise<void> {
    await tx.city.update({
      where: { id: ctx.id },
      data: {
        food: ctx.resources.food,
        wood: ctx.resources.wood,
        stone: ctx.resources.stone,
        gold: ctx.resources.gold,
        resourcesUpdatedAt: new Date(ctx.resourcesAt),
        level: ctx.level,
      },
    });
  }

  /** Grava a pilha (em casa + feridos) de um tipo de tropa a partir do ctx. */
  async saveStack(tx: Tx, ctx: CityCtx, troopTypeId: TroopTypeId): Promise<void> {
    const count = ctx.troopsHome[troopTypeId] ?? 0;
    const wounded = ctx.wounded[troopTypeId] ?? 0;
    await tx.troopStack.upsert({
      where: { cityId_troopTypeId: { cityId: ctx.id, troopTypeId } },
      create: { cityId: ctx.id, troopTypeId, count, wounded },
      update: { count, wounded },
    });
  }

  /** Poder (cache do ranking) = tropas (em casa + em marcha) × poder + 20 × Σ níveis. */
  async recomputePower(tx: Tx, playerId: string): Promise<number> {
    const city = await tx.city.findUnique({ where: { playerId }, include: { buildings: true, troops: true } });
    if (!city) return 0;
    const marching = await tx.marchTroop.findMany({
      where: { march: { playerId, state: { not: 'COMPLETED' } } },
      select: { troopTypeId: true, alive: true },
    });
    let troops: TroopCounts = {};
    for (const t of city.troops) troops = addTroops(troops, { [t.troopTypeId]: t.count });
    for (const t of marching) troops = addTroops(troops, { [t.troopTypeId]: t.alive });
    const levels: BuildingLevels = {};
    for (const b of city.buildings) levels[b.typeId as BuildingTypeId] = b.level;
    const power = troopsPower(troops) + buildingsPower(levels);
    await tx.player.update({ where: { id: playerId }, data: { power } });
    return power;
  }

  infirmaryUsed(ctx: CityCtx): number {
    return troopCount(ctx.wounded) + ctx.healingQueue.reduce((s, j) => s + j.count, 0);
  }

  infirmaryCapacity(ctx: CityCtx): number {
    return infirmaryCapacity(ctx.levels.infirmary ?? 0);
  }

  emitResources(ctx: CityCtx, emit: EmitBuffer): void {
    const r = this.rates(ctx);
    emit.toPlayer(ctx.playerId, 'city:resources', {
      resources: ctx.resources,
      resourcesAt: new Date(ctx.resourcesAt).toISOString(),
      productionPerHour: r.production,
      capacity: r.capacity,
    });
  }

  emitTroops(ctx: CityCtx, emit: EmitBuffer): void {
    emit.toPlayer(ctx.playerId, 'city:troops', { troopsHome: { ...ctx.troopsHome }, wounded: { ...ctx.wounded } });
  }

  /** map:entity-updated da cidade (nível/poder/escudo mudaram) para a sala do chunk. */
  async emitMapCity(tx: Tx, ctx: { id: string; x: number; y: number }, emit: EmitBuffer): Promise<void> {
    const city = await tx.city.findUnique({ where: { id: ctx.id }, include: { player: true } });
    if (!city) return;
    emit.toChunks([chunkOf(city.x, city.y)], 'map:entity-updated', { kind: 'city', entity: toMapCity(city) });
  }

  /** CityStateDto completo a partir do ctx (já avançado). */
  async toDto(tx: Tx, ctx: CityCtx): Promise<CityStateDto> {
    const r = this.rates(ctx);
    const activeMarches = await tx.march.count({ where: { playerId: ctx.playerId, state: { not: 'COMPLETED' } } });
    const keep = ctx.levels.keep ?? 1;
    return {
      id: ctx.id,
      name: ctx.name,
      x: ctx.x,
      y: ctx.y,
      level: ctx.level,
      era: eraForKeep(ctx.level),
      resources: { ...ctx.resources },
      resourcesAt: new Date(ctx.resourcesAt).toISOString(),
      productionPerHour: r.production,
      upkeepPerHour: r.upkeep,
      capacity: r.capacity,
      protected: protectedResources(ctx.levels.warehouse ?? 0),
      buildings: ctx.buildings.map(toBuildingDto),
      troopsHome: { ...ctx.troopsHome },
      wounded: { ...ctx.wounded },
      infirmary: { used: this.infirmaryUsed(ctx), capacity: this.infirmaryCapacity(ctx) },
      trainingQueue: ctx.trainingQueue.map((j) => ({
        id: j.id,
        troopTypeId: j.troopTypeId as TroopTypeId,
        count: j.count,
        startsAt: j.startsAt.toISOString(),
        endsAt: j.endsAt.toISOString(),
      })),
      healingQueue: ctx.healingQueue.map((j) => ({
        id: j.id,
        troopTypeId: j.troopTypeId as TroopTypeId,
        count: j.count,
        startsAt: j.startsAt.toISOString(),
        endsAt: j.endsAt.toISOString(),
      })),
      buildQueue: { active: ctx.buildings.filter((b) => b.upgradeEndsAt).length, max: buildQueueSize(keep) },
      marchSlots: { active: activeMarches, max: maxMarches(keep) },
      marchCapacity: marchCapacity(keep),
      defenseHeroId: ctx.defenseHeroId,
      serverTime: new Date().toISOString(),
    };
  }
}

