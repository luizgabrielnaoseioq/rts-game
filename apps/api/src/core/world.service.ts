import { Injectable } from '@nestjs/common';
import type { SpeedSettings } from '@wn/shared';
import { PrismaService } from '../common/prisma/prisma.service';
import { GameError } from '../common/errors/game-error';
import { env } from '../config/env';

export interface WorldCtx {
  id: string;
  name: string;
  seed: string;
  width: number;
  height: number;
  chunkSize: number;
  configVersion: string;
  speed: SpeedSettings;
}

/**
 * Mundo único (cache em memória). Escolhe o World da WORLD_SEED; sem ele, o primeiro ACTIVE.
 * Velocidade: World.gameSpeed/economySpeed, ou os overrides de env (só dev/teste).
 * Mudou a velocidade no banco → reiniciar a API.
 */
@Injectable()
export class WorldService {
  private cached: WorldCtx | null = null;

  constructor(private readonly prisma: PrismaService) {}

  async get(): Promise<WorldCtx> {
    if (this.cached) return this.cached;
    const w =
      (await this.prisma.world.findFirst({ where: { seed: env.WORLD_SEED, status: 'ACTIVE' } })) ??
      (await this.prisma.world.findFirst({ where: { status: 'ACTIVE' }, orderBy: { startedAt: 'asc' } }));
    if (!w) throw new GameError('INTERNAL', undefined, 'World not seeded: run pnpm db:seed');
    this.cached = {
      id: w.id,
      name: w.name,
      seed: w.seed,
      width: w.width,
      height: w.height,
      chunkSize: w.chunkSize,
      configVersion: w.configVersion,
      speed: {
        gameSpeed: env.GAME_SPEED_OVERRIDE ?? w.gameSpeed,
        economySpeed: env.ECONOMY_SPEED_OVERRIDE ?? w.economySpeed,
      },
    };
    return this.cached;
  }
}
