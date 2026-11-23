import { Injectable } from '@nestjs/common';
import {
  chunkOf,
  CITY_LAYOUT,
  newbieShieldUntil,
  START_KIT,
  totalXpForLevel,
  type AuthResponse,
  type LoginBody,
  type RefreshBody,
  type RegisterBody,
  type TroopTypeId,
} from '@wn/shared';
import * as bcrypt from 'bcryptjs';
import { randomInt } from 'node:crypto';
import { GameError } from '../../common/errors/game-error';
import { PrismaService } from '../../common/prisma/prisma.service';
import { env } from '../../config/env';
import { CityTickService } from '../../core/game/city-tick.service';
import { toMapCity } from '../../core/game/mappers';
import { TxService } from '../../core/tx.service';
import { WorldService } from '../../core/world.service';
import { PlayerService } from '../player/player.service';
import { PlacementService } from './placement.service';
import { hashToken, TokensService } from './tokens.service';

/** Hash fixo usado quando o usuário não existe (tempo de resposta parecido no login). */
const DUMMY_HASH = bcrypt.hashSync('dummy-password-for-timing', 10);

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly txs: TxService,
    private readonly world: WorldService,
    private readonly tokens: TokensService,
    private readonly placement: PlacementService,
    private readonly players: PlayerService,
    private readonly cityTick: CityTickService,
  ) {}

  /** ARQUITETURA 5.1: user + player + cidade + prédios + start kit + herói + escudo de novato. */
  async register(body: RegisterBody): Promise<AuthResponse> {
    const world = await this.world.get();
    const usernameNormalized = body.username.toLowerCase();
    const passwordHash = await bcrypt.hash(body.password, env.BCRYPT_ROUNDS);
    return this.txs.run(async (tx, emit) => {
      const taken =
        (await tx.user.findUnique({ where: { usernameNormalized } })) ??
        (await tx.player.findFirst({ where: { worldId: world.id, displayName: { equals: body.username, mode: 'insensitive' } } }));
      if (taken) throw new GameError('USERNAME_TAKEN');

      const now = new Date();
      const user = await tx.user.create({ data: { username: body.username, usernameNormalized, passwordHash, lastLoginAt: now } });
      const player = await tx.player.create({
        data: {
          userId: user.id,
          worldId: world.id,
          displayName: body.username,
          bannerColor: randomInt(12),
          shieldUntil: START_KIT.newbieShield ? new Date(newbieShieldUntil(now.getTime(), world.speed)) : null,
          shieldKind: START_KIT.newbieShield ? 'NEWBIE' : null,
        },
      });
      const pos = await this.placement.place(tx, world);
      const r = START_KIT.resources;
      const city = await tx.city.create({
        data: {
          worldId: world.id,
          playerId: player.id,
          name: body.cityName,
          x: pos.x,
          y: pos.y,
          level: START_KIT.buildings.keep ?? 1,
          food: r.food,
          wood: r.wood,
          stone: r.stone,
          gold: r.gold,
          resourcesUpdatedAt: now,
        },
      });
      // Um lote por slot do layout (nível 0 = não construído).
      await tx.building.createMany({
        data: CITY_LAYOUT.map((s) => ({ cityId: city.id, slot: s.slot, typeId: s.typeId, level: START_KIT.buildings[s.typeId] ?? 0 })),
      });
      await tx.troopStack.createMany({
        data: (Object.entries(START_KIT.troops) as [TroopTypeId, number][]).map(([troopTypeId, count]) => ({ cityId: city.id, troopTypeId, count })),
      });
      for (const h of START_KIT.heroes) {
        await tx.hero.create({ data: { playerId: player.id, heroTypeId: h.heroTypeId, level: h.level, xp: totalXpForLevel(h.level) } });
      }
      for (const chestTypeId of START_KIT.chests) {
        await tx.chest.create({ data: { playerId: player.id, chestTypeId, source: 'STARTER' } });
      }
      await this.cityTick.recomputePower(tx, player.id);
      const full = await tx.city.findUniqueOrThrow({ where: { id: city.id }, include: { player: true } });
      emit.toChunks([chunkOf(city.x, city.y)], 'map:entity-updated', { kind: 'city', entity: toMapCity(full) });

      const t = await this.tokens.issue(tx, user.id, player.id);
      return { ...t, player: await this.players.selfDto(player.id, tx) };
    });
  }

  async login(body: LoginBody): Promise<AuthResponse> {
    const user = await this.prisma.user.findUnique({ where: { usernameNormalized: body.username.toLowerCase() }, include: { player: true } });
    const ok = await bcrypt.compare(body.password, user?.passwordHash ?? DUMMY_HASH);
    if (!user || !ok || !user.player) throw new GameError('INVALID_CREDENTIALS');
    const player = user.player;
    return this.txs.run(async (tx) => {
      await tx.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
      const t = await this.tokens.issue(tx, user.id, player.id);
      return { ...t, player: await this.players.selfDto(player.id, tx) };
    });
  }

  /** Rotaciona o refresh. Reuso de token revogado → revoga todos do usuário. */
  async refresh(body: RefreshBody): Promise<AuthResponse> {
    const tokenHash = hashToken(body.refreshToken);
    const result = await this.txs.run(async (tx) => {
      const rt = await tx.refreshToken.findUnique({ where: { tokenHash }, include: { user: { include: { player: true } } } });
      if (!rt) return { error: 'invalid' as const };
      if (rt.revokedAt) {
        await tx.refreshToken.updateMany({ where: { userId: rt.userId, revokedAt: null }, data: { revokedAt: new Date() } });
        return { error: 'reused' as const };
      }
      if (rt.expiresAt.getTime() <= Date.now() || !rt.user.player) return { error: 'expired' as const };
      await tx.refreshToken.update({ where: { id: rt.id }, data: { revokedAt: new Date() } });
      const t = await this.tokens.issue(tx, rt.userId, rt.user.player.id);
      return { ok: { ...t, player: await this.players.selfDto(rt.user.player.id, tx) } };
    });
    if ('error' in result) throw new GameError('UNAUTHORIZED', undefined, `Refresh token ${result.error}`);
    return result.ok;
  }

  async logout(body: RefreshBody): Promise<void> {
    await this.prisma.refreshToken.updateMany({ where: { tokenHash: hashToken(body.refreshToken), revokedAt: null }, data: { revokedAt: new Date() } });
  }
}
