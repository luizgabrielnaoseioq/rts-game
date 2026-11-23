import { Injectable } from '@nestjs/common';
import type { Chest, Prisma } from '@prisma/client';
import {
  addResources,
  dailyAvailableAt,
  isDailyAvailable,
  rewardResources,
  rollChest,
  type ChestDto,
  type ChestRewardDto,
  type ChestTypeId,
  type DailyChestStatusDto,
  type OpenChestResponse,
} from '@wn/shared';
import { lockChest, lockCity, lockPlayer } from '../../common/db/locks';
import { GameError } from '../../common/errors/game-error';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CityTickService } from '../../core/game/city-tick.service';
import { HeroXpService } from '../../core/game/hero-xp.service';
import { TxService } from '../../core/tx.service';
import { serverRng } from '../heroes/heroes.service';

export function toChestDto(c: Chest): ChestDto {
  return { id: c.id, chestTypeId: c.chestTypeId as ChestTypeId, source: c.source, createdAt: c.createdAt.toISOString() };
}

@Injectable()
export class ChestsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly txs: TxService,
    private readonly tick: CityTickService,
    private readonly xp: HeroXpService,
  ) {}

  /** Baús fechados. */
  async list(playerId: string): Promise<ChestDto[]> {
    const chests = await this.prisma.chest.findMany({ where: { playerId, openedAt: null }, orderBy: { createdAt: 'asc' } });
    return chests.map(toChestDto);
  }

  async dailyStatus(playerId: string): Promise<DailyChestStatusDto> {
    const p = await this.prisma.player.findUnique({ where: { id: playerId }, select: { lastDailyChestAt: true } });
    if (!p) throw new GameError('NOT_FOUND', { entity: 'player' });
    const now = Date.now();
    const last = p.lastDailyChestAt?.getTime() ?? null;
    return { available: isDailyAvailable(last, now), availableAt: new Date(dailyAvailableAt(last, now)).toISOString() };
  }

  /** Oferenda do Braseiro: 1 por dia (reset 00:00 de Brasília). */
  claimDaily(playerId: string): Promise<ChestDto> {
    return this.txs.run(async (tx, emit) => {
      await lockPlayer(tx, playerId);
      const p = await tx.player.findUniqueOrThrow({ where: { id: playerId } });
      const now = Date.now();
      if (!isDailyAvailable(p.lastDailyChestAt?.getTime() ?? null, now)) {
        throw new GameError('DAILY_CHEST_NOT_READY', { availableAt: new Date(dailyAvailableAt(p.lastDailyChestAt!.getTime(), now)).toISOString() });
      }
      await tx.player.update({ where: { id: playerId }, data: { lastDailyChestAt: new Date(now) } });
      const chest = await tx.chest.create({ data: { playerId, chestTypeId: 'chest_daily', source: 'DAILY' } });
      const dto = toChestDto(chest);
      emit.toPlayer(playerId, 'chest:new', { chest: dto });
      return dto;
    });
  }

  /** ARQUITETURA 5.6: sorteio no servidor (crypto); aplica recursos, itens e fragmentos. */
  open(playerId: string, chestId: string): Promise<OpenChestResponse> {
    return this.txs.run(async (tx, emit) => {
      const city = await tx.city.findUnique({ where: { playerId }, select: { id: true } });
      if (!city) throw new GameError('NOT_FOUND', { entity: 'city' });
      await lockCity(tx, city.id);
      if (!(await lockChest(tx, chestId, playerId))) throw new GameError('NOT_FOUND', { entity: 'chest' });
      const chest = await tx.chest.findUniqueOrThrow({ where: { id: chestId } });
      if (chest.openedAt) throw new GameError('CHEST_ALREADY_OPENED');
      const now = Date.now();
      const ctx = await this.tick.advance(tx, city.id, now, emit);

      const rolled = rollChest(chest.chestTypeId as ChestTypeId, serverRng(), { keepLevel: ctx.levels.keep ?? 1 });
      const rewards: ChestRewardDto[] = [];
      const owner = { playerId, heroHallLevel: ctx.levels.hero_hall ?? 0, defenseHeroId: ctx.defenseHeroId };
      for (const r of rolled) {
        if (r.kind === 'item') {
          await tx.inventoryItem.upsert({
            where: { playerId_itemId: { playerId, itemId: r.itemId } },
            create: { playerId, itemId: r.itemId, quantity: r.quantity },
            update: { quantity: { increment: r.quantity } },
          });
          rewards.push(r);
        } else if (r.kind === 'heroFragments') {
          const convertedXp = await this.xp.grantFragments(tx, owner, r.heroTypeId, r.count, emit);
          rewards.push({ ...r, convertedXp });
        } else {
          rewards.push(r);
        }
      }
      // Recursos de baú podem passar da capacidade.
      ctx.resources = addResources(ctx.resources, rewardResources(rewards));
      await this.tick.saveResources(tx, ctx);
      this.tick.emitResources(ctx, emit);
      await tx.chest.update({ where: { id: chest.id }, data: { openedAt: new Date(now), rewards: rewards as unknown as Prisma.InputJsonValue } });
      return { chestId: chest.id, rewards, city: await this.tick.toDto(tx, ctx) };
    });
  }
}
