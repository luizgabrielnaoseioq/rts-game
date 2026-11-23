import { Body, Controller, Get, HttpCode, Param, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { createMarchSchema, idSchema, type CreateMarchBody, type MarchDto } from '@wn/shared';
import { CurrentUser, type AuthUser } from '../../common/auth/auth';
import { ZodPipe } from '../../common/pipes/zod.pipe';
import { MarchesService } from './marches.service';

@Controller('marches')
export class MarchesController {
  constructor(private readonly marches: MarchesService) {}

  /** Marchas ativas do jogador. */
  @Get()
  list(@CurrentUser() u: AuthUser): Promise<MarchDto[]> {
    return this.marches.list(u.playerId);
  }

  @Get(':id')
  get(@CurrentUser() u: AuthUser, @Param('id', new ZodPipe(idSchema)) id: string): Promise<MarchDto> {
    return this.marches.get(u.playerId, id);
  }

  @Post()
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  create(@CurrentUser() u: AuthUser, @Body(new ZodPipe(createMarchSchema)) body: CreateMarchBody): Promise<MarchDto> {
    return this.marches.create(u.playerId, body);
  }

  @Post(':id/recall')
  @HttpCode(200)
  recall(@CurrentUser() u: AuthUser, @Param('id', new ZodPipe(idSchema)) id: string): Promise<MarchDto> {
    return this.marches.recall(u.playerId, id);
  }
}
