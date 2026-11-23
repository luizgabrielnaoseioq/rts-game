import { Controller, Get, HttpCode, Param, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { idSchema, type ChestDto, type DailyChestStatusDto, type OpenChestResponse } from '@wn/shared';
import { CurrentUser, type AuthUser } from '../../common/auth/auth';
import { ZodPipe } from '../../common/pipes/zod.pipe';
import { ChestsService } from './chests.service';

@Controller('chests')
export class ChestsController {
  constructor(private readonly chests: ChestsService) {}

  @Get()
  list(@CurrentUser() u: AuthUser): Promise<ChestDto[]> {
    return this.chests.list(u.playerId);
  }

  @Get('daily')
  daily(@CurrentUser() u: AuthUser): Promise<DailyChestStatusDto> {
    return this.chests.dailyStatus(u.playerId);
  }

  @Post('daily/claim')
  @HttpCode(200)
  claim(@CurrentUser() u: AuthUser): Promise<ChestDto> {
    return this.chests.claimDaily(u.playerId);
  }

  @Post(':id/open')
  @HttpCode(200)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  open(@CurrentUser() u: AuthUser, @Param('id', new ZodPipe(idSchema)) id: string): Promise<OpenChestResponse> {
    return this.chests.open(u.playerId, id);
  }
}
