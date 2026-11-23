import { Body, Controller, Get, HttpCode, Param, Post } from '@nestjs/common';
import {
  idSchema,
  summonSchema,
  unlockHeroSchema,
  useItemSchema,
  type HeroDto,
  type HeroFragmentDto,
  type InventoryItemDto,
  type SummonRequest,
  type SummonResponse,
  type TavernStatusDto,
  type UnlockHeroRequest,
  type UseItemBody,
} from '@wn/shared';
import { CurrentUser, type AuthUser } from '../../common/auth/auth';
import { ZodPipe } from '../../common/pipes/zod.pipe';
import { HeroesService } from './heroes.service';

@Controller()
export class HeroesController {
  constructor(private readonly heroes: HeroesService) {}

  @Get('heroes')
  list(@CurrentUser() u: AuthUser): Promise<HeroDto[]> {
    return this.heroes.list(u.playerId);
  }

  @Get('heroes/fragments')
  fragments(@CurrentUser() u: AuthUser): Promise<HeroFragmentDto[]> {
    return this.heroes.fragments(u.playerId);
  }

  @Post('heroes/unlock')
  @HttpCode(200)
  unlock(@CurrentUser() u: AuthUser, @Body(new ZodPipe(unlockHeroSchema)) body: UnlockHeroRequest): Promise<HeroDto> {
    return this.heroes.unlock(u.playerId, body.heroTypeId);
  }

  @Post('heroes/:id/use-item')
  @HttpCode(200)
  useItem(
    @CurrentUser() u: AuthUser,
    @Param('id', new ZodPipe(idSchema)) id: string,
    @Body(new ZodPipe(useItemSchema)) body: UseItemBody,
  ): Promise<HeroDto> {
    return this.heroes.useItem(u.playerId, id, body);
  }

  @Get('tavern')
  tavern(@CurrentUser() u: AuthUser): Promise<TavernStatusDto> {
    return this.heroes.tavern(u.playerId);
  }

  @Post('tavern/summon')
  @HttpCode(200)
  summon(@CurrentUser() u: AuthUser, @Body(new ZodPipe(summonSchema)) body: SummonRequest): Promise<SummonResponse> {
    return this.heroes.summon(u.playerId, body.free);
  }

  @Get('inventory')
  inventory(@CurrentUser() u: AuthUser): Promise<InventoryItemDto[]> {
    return this.heroes.inventory(u.playerId);
  }
}
