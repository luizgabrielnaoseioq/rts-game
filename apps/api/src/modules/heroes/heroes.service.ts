import { Injectable } from '@nestjs/common';
import {
  dailyAvailableAt,
  duplicateFragmentXp,
  fragmentsToUnlock,
  HERO_HALL,
  HERO_IDS,
  HERO_XP_CURVE,
  isDailyAvailable,
  ITEMS,
  rollSummon,
  summonCost,
  totalXpForLevel,
  type HeroDto,
  type HeroFragmentDto,
  type HeroTypeId,
  type InventoryItemDto,
  type ItemId,
  type SummonResponse,
  type TavernStatusDto,
  type Rng,
  type UseItemBody,
} from '@wn/shared';
import { randomBytes } from 'node:crypto';
import { lockCity, lockPlayer } from '../../common/db/locks';
import { GameError } from '../../common/errors/game-error';
import { PrismaService, type Tx } from '../../common/prisma/prisma.service';
import { CityTickService, type CityCtx } from '../../core/game/city-tick.service';
import { HeroXpService } from '../../core/game/hero-xp.service';
import { heroLevel, toHeroDto } from '../../core/game/mappers';
import type { EmitBuffer } from '../../core/realtime/emit-buffer';
import { TxService } from '../../core/tx.service';

/** RNG do servidor para sorteios (taverna/baús), direto do crypto. O cliente nunca sorteia. */
export function serverRng(): Rng {
  return () => randomBytes(6).readUIntBE(0, 6) / 2 ** 48;
}

@Injectable()
export class HeroesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly txs: TxService,
    private readonly tick: CityTickService,
    private readonly xp: HeroXpService,
  ) {}

  private async withCity<T>(playerId: string, fn: (tx: Tx, ctx: CityCtx, emit: EmitBuffer, now: number) => Promise<T>): Promise<T> {
    return this.txs.run(async (tx, emit) => {
      const c = await tx.city.findUnique({ where: { playerId }, select: { id: true } });
      if (!c) throw new GameError('NOT_FOUND', { entity: 'city' });
      await lockCity(tx, c.id);
      const now = Date.now();
      const ctx = await this.tick.advance(tx, c.id, now, emit);
      return fn(tx, ctx, emit, now);
    });
  }

  async list(playerId: string): Promise<HeroDto[]> {
    const city = await this.prisma.city.findUnique({ where: { playerId }, include: { buildings: { where: { typeId: 'hero_hall' } } } });
    const hall = city?.buildings[0]?.level ?? 0;
    const heroes = await this.prisma.hero.findMany({ where: { playerId }, orderBy: { createdAt: 'asc' } });
    return heroes.map((h) => toHeroDto(h, hall, city?.defenseHeroId ?? null));
  }

  /** Usa tomo de XP no herói (GDD 11.1). XP acima do nível máx. fica acumulada. */
  useItem(playerId: string, heroId: string, body: UseItemBody): Promise<HeroDto> {
    return this.withCity(playerId, async (tx, ctx, emit) => {
      const def = ITEMS[body.itemId as ItemId];
      if (def.effect.kind !== 'hero_xp') throw new GameError('ITEM_NOT_USABLE');
      const hero = await tx.hero.findFirst({ where: { id: heroId, playerId } });
      if (!hero) throw new GameError('NOT_FOUND', { entity: 'hero' });
      if (hero.xp >= totalXpForLevel(HERO_XP_CURVE.levelCap)) throw new GameError('HERO_MAX_LEVEL');
      const inv = await tx.inventoryItem.findUnique({ where: { playerId_itemId: { playerId, itemId: body.itemId } } });
      if (!inv || inv.quantity < body.quantity) throw new GameError('NOT_ENOUGH_ITEMS', { available: inv?.quantity ?? 0 });
      await tx.inventoryItem.update({ where: { playerId_itemId: { playerId, itemId: body.itemId } }, data: { quantity: { decrement: body.quantity } } });
      const owner = { playerId, heroHallLevel: ctx.levels.hero_hall ?? 0, defenseHeroId: ctx.defenseHeroId };
      const updated = await this.xp.addXp(tx, owner, hero, def.effect.xp * body.quantity, emit);
      return toHeroDto(updated, owner.heroHallLevel, owner.defenseHeroId);
    });
  }

  async fragments(playerId: string): Promise<HeroFragmentDto[]> {
    const [frags, heroes] = await Promise.all([
      this.prisma.heroFragment.findMany({ where: { playerId } }),
      this.prisma.hero.findMany({ where: { playerId }, select: { heroTypeId: true } }),
    ]);
    const owned = new Set(heroes.map((h) => h.heroTypeId));
    return HERO_IDS.map((heroTypeId) => ({
      heroTypeId,
      count: frags.find((f) => f.heroTypeId === heroTypeId)?.count ?? 0,
      required: fragmentsToUnlock(heroTypeId),
      unlocked: owned.has(heroTypeId),
    }));
  }

  /** Libera herói gastando fragmentos. */
  unlock(playerId: string, heroTypeId: HeroTypeId): Promise<HeroDto> {
    return this.withCity(playerId, async (tx, ctx, emit) => {
      const required = fragmentsToUnlock(heroTypeId);
      if (required == null) throw new GameError('HERO_LOCKED', { reason: 'not_unlockable_by_fragments' });
      const exists = await tx.hero.findUnique({ where: { playerId_heroTypeId: { playerId, heroTypeId } } });
      if (exists) throw new GameError('VALIDATION_FAILED', { reason: 'already_unlocked' });
      const frag = await tx.heroFragment.findUnique({ where: { playerId_heroTypeId: { playerId, heroTypeId } } });
      if (!frag || frag.count < required) throw new GameError('NOT_ENOUGH_FRAGMENTS', { have: frag?.count ?? 0, required });
      // Fragmentos excedentes viram XP do herói recém-liberado (GDD 9.1).
      const extraXp = duplicateFragmentXp(frag.count - required);
      await tx.heroFragment.update({ where: { playerId_heroTypeId: { playerId, heroTypeId } }, data: { count: 0 } });
      const hall = ctx.levels.hero_hall ?? 0;
      const hero = await tx.hero.create({ data: { playerId, heroTypeId, xp: extraXp, level: heroLevel(extraXp, hall) } });
      const dto = toHeroDto(hero, hall, ctx.defenseHeroId);
      emit.toPlayer(playerId, 'hero:updated', { hero: dto });
      return dto;
    });
  }

  private tavernStatus(p: { lastFreeSummonAt: Date | null; summonCount: number }, hallLevel: number, now: number): TavernStatusDto {
    const every = HERO_HALL.epicPityEvery;
    return {
      summonCostGold: summonCost(hallLevel),
      freeSummonAvailableAt: new Date(dailyAvailableAt(p.lastFreeSummonAt?.getTime() ?? null, now)).toISOString(),
      summonCount: p.summonCount,
      summonsUntilEpic: every - (p.summonCount % every),
    };
  }

  async tavern(playerId: string): Promise<TavernStatusDto> {
    const p = await this.prisma.player.findUnique({ where: { id: playerId } });
    const city = await this.prisma.city.findUnique({ where: { playerId }, include: { buildings: { where: { typeId: 'hero_hall' } } } });
    if (!p) throw new GameError('NOT_FOUND', { entity: 'player' });
    return this.tavernStatus(p, city?.buildings[0]?.level ?? 0, Date.now());
  }

  /** Chamado na taverna (GDD 9.1): 5 fragmentos; 1 grátis/dia; todo 10º com garantia de Épico. */
  summon(playerId: string, free: boolean): Promise<SummonResponse> {
    return this.withCity(playerId, async (tx, ctx, emit, now) => {
      const hall = ctx.levels.hero_hall ?? 0;
      if (hall < 1) throw new GameError('REQUIREMENT_NOT_MET', { missing: [{ typeId: 'hero_hall', level: 1 }] });
      await lockPlayer(tx, playerId);
      const p = await tx.player.findUniqueOrThrow({ where: { id: playerId } });
      if (free) {
        if (!isDailyAvailable(p.lastFreeSummonAt?.getTime() ?? null, now)) throw new GameError('FREE_SUMMON_NOT_READY');
      } else {
        const cost = summonCost(hall);
        if (ctx.resources.gold + 1e-9 < cost) {
          throw new GameError('INSUFFICIENT_RESOURCES', { missing: { food: 0, wood: 0, stone: 0, gold: Math.ceil(cost - ctx.resources.gold) } });
        }
        ctx.resources = { ...ctx.resources, gold: ctx.resources.gold - cost };
        await this.tick.saveResources(tx, ctx);
        this.tick.emitResources(ctx, emit);
      }
      const summonNumber = p.summonCount + 1;
      const updated = await tx.player.update({
        where: { id: playerId },
        data: { summonCount: summonNumber, ...(free ? { lastFreeSummonAt: new Date(now) } : {}) },
      });
      const rolled = rollSummon(serverRng(), summonNumber);
      const owner = { playerId, heroHallLevel: hall, defenseHeroId: ctx.defenseHeroId };
      const fragments: SummonResponse['fragments'] = [];
      for (const [heroTypeId, count] of Object.entries(rolled) as [HeroTypeId, number][]) {
        const convertedXp = await this.xp.grantFragments(tx, owner, heroTypeId, count, emit);
        fragments.push({ heroTypeId, count, convertedXp });
      }
      return { fragments, tavern: this.tavernStatus(updated, hall, now) };
    });
  }

  async inventory(playerId: string): Promise<InventoryItemDto[]> {
    const items = await this.prisma.inventoryItem.findMany({ where: { playerId, quantity: { gt: 0 } }, orderBy: { itemId: 'asc' } });
    return items.map((i) => ({ itemId: i.itemId as ItemId, quantity: i.quantity }));
  }
}
