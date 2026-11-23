import { Body, Controller, Get, HttpCode, Param, Patch, Post, Put } from '@nestjs/common';
import {
  healTroopsSchema,
  idSchema,
  renameCitySchema,
  setDefenseHeroSchema,
  slotParamSchema,
  trainTroopsSchema,
  upgradeBuildingSchema,
  useSpeedupSchema,
  type CityStateDto,
  type HealTroopsBody,
  type MapCityDto,
  type RenameCityRequest,
  type SetDefenseHeroRequest,
  type TrainTroopsBody,
  type UpgradeBuildingRequest,
  type UseSpeedupBody,
} from '@wn/shared';
import { CurrentUser, type AuthUser } from '../../common/auth/auth';
import { ZodPipe } from '../../common/pipes/zod.pipe';
import { CityService } from './city.service';

@Controller()
export class CityController {
  constructor(private readonly city: CityService) {}

  /** Finaliza obras/treinos/curas vencidos (lazy) antes de responder. */
  @Get('city')
  get(@CurrentUser() u: AuthUser): Promise<CityStateDto> {
    return this.city.getCity(u.playerId);
  }

  @Patch('city')
  rename(@CurrentUser() u: AuthUser, @Body(new ZodPipe(renameCitySchema)) body: RenameCityRequest): Promise<CityStateDto> {
    return this.city.rename(u.playerId, body.name);
  }

  @Get('cities/:id')
  publicCity(@Param('id', new ZodPipe(idSchema)) id: string): Promise<MapCityDto> {
    return this.city.publicCity(id);
  }

  @Post('city/buildings/:slot/upgrade')
  @HttpCode(200)
  upgrade(
    @CurrentUser() u: AuthUser,
    @Param('slot', new ZodPipe(slotParamSchema)) slot: number,
    @Body(new ZodPipe(upgradeBuildingSchema)) body: UpgradeBuildingRequest,
  ): Promise<CityStateDto> {
    return this.city.upgrade(u.playerId, slot, body.typeId);
  }

  @Post('city/buildings/:slot/cancel')
  @HttpCode(200)
  cancel(@CurrentUser() u: AuthUser, @Param('slot', new ZodPipe(slotParamSchema)) slot: number): Promise<CityStateDto> {
    return this.city.cancelUpgrade(u.playerId, slot);
  }

  @Post('city/troops/train')
  @HttpCode(200)
  train(@CurrentUser() u: AuthUser, @Body(new ZodPipe(trainTroopsSchema)) body: TrainTroopsBody): Promise<CityStateDto> {
    return this.city.train(u.playerId, body);
  }

  @Post('city/troops/heal')
  @HttpCode(200)
  heal(@CurrentUser() u: AuthUser, @Body(new ZodPipe(healTroopsSchema)) body: HealTroopsBody): Promise<CityStateDto> {
    return this.city.heal(u.playerId, body);
  }

  @Post('city/speedup')
  @HttpCode(200)
  speedup(@CurrentUser() u: AuthUser, @Body(new ZodPipe(useSpeedupSchema)) body: UseSpeedupBody): Promise<CityStateDto> {
    return this.city.speedup(u.playerId, body);
  }

  @Put('city/defense-hero')
  setDefenseHero(@CurrentUser() u: AuthUser, @Body(new ZodPipe(setDefenseHeroSchema)) body: SetDefenseHeroRequest): Promise<CityStateDto> {
    return this.city.setDefenseHero(u.playerId, body.heroId);
  }
}
