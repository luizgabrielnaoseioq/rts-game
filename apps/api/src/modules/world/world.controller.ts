import { Controller, Get, Param, Query } from '@nestjs/common';
import { chunkIdsQuerySchema, tileParamsSchema, type ChunkId, type ChunksResponse, type TileDetailDto, type WorldInfoDto } from '@wn/shared';
import { CurrentUser, type AuthUser } from '../../common/auth/auth';
import { ZodPipe } from '../../common/pipes/zod.pipe';
import { WorldQueryService } from './world.service';

@Controller('world')
export class WorldController {
  constructor(private readonly world: WorldQueryService) {}

  /** Seed/tamanho/velocidades: o cliente gera o terreno localmente. */
  @Get()
  info(): Promise<WorldInfoDto> {
    return this.world.info();
  }

  /** GET /world/chunks?ids=3:4,3:5 (máx. 36) */
  @Get('chunks')
  chunks(@CurrentUser() u: AuthUser, @Query('ids', new ZodPipe(chunkIdsQuerySchema)) ids: string[]): Promise<ChunksResponse> {
    return this.world.chunks(ids as ChunkId[], u.playerId);
  }

  @Get('tiles/:x/:y')
  tile(@CurrentUser() u: AuthUser, @Param(new ZodPipe(tileParamsSchema)) p: { x: number; y: number }): Promise<TileDetailDto> {
    return this.world.tile(p.x, p.y, u.playerId);
  }
}
