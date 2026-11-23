import { Injectable } from '@nestjs/common';
import { dailyAvailableAt, isShielded, type PlayerListItemDto, type PlayerSelfDto } from '@wn/shared';
import { GameError } from '../../common/errors/game-error';
import { PrismaService, type Tx } from '../../common/prisma/prisma.service';
import { WorldService } from '../../core/world.service';

@Injectable()
export class PlayerService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly world: WorldService,
  ) {}

  async selfDto(playerId: string, db: Tx | PrismaService = this.prisma): Promise<PlayerSelfDto> {
    const p = await db.player.findUnique({ where: { id: playerId }, include: { user: true, city: { select: { id: true } } } });
    if (!p || !p.city) throw new GameError('NOT_FOUND', { entity: 'player' });
    const now = Date.now();
    const shielded = isShielded(p.shieldUntil, now);
    return {
      id: p.id,
      username: p.user.username,
      displayName: p.displayName,
      cityId: p.city.id,
      bannerColor: p.bannerColor,
      shieldUntil: shielded ? p.shieldUntil!.toISOString() : null,
      shieldKind: shielded ? p.shieldKind : null,
      dailyChestAvailableAt: new Date(dailyAvailableAt(p.lastDailyChestAt?.getTime() ?? null, now)).toISOString(),
      freeSummonAvailableAt: new Date(dailyAvailableAt(p.lastFreeSummonAt?.getTime() ?? null, now)).toISOString(),
      summonCount: p.summonCount,
      power: p.power,
      createdAt: p.createdAt.toISOString(),
    };
  }

  /** Ranking simples por poder. */
  async ranking(): Promise<PlayerListItemDto[]> {
    const w = await this.world.get();
    const players = await this.prisma.player.findMany({
      where: { worldId: w.id, city: { isNot: null } },
      include: { city: true },
      orderBy: [{ power: 'desc' }, { createdAt: 'asc' }],
      take: 200,
    });
    return players.map((p) => ({
      id: p.id,
      displayName: p.displayName,
      cityId: p.city!.id,
      cityName: p.city!.name,
      cityLevel: p.city!.level,
      power: p.power,
      x: p.city!.x,
      y: p.city!.y,
    }));
  }
}
