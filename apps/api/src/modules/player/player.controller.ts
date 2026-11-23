import { Controller, Get } from '@nestjs/common';
import type { PlayerListItemDto, PlayerSelfDto } from '@wn/shared';
import { CurrentUser, type AuthUser } from '../../common/auth/auth';
import { PlayerService } from './player.service';

@Controller()
export class PlayerController {
  constructor(private readonly players: PlayerService) {}

  @Get('me')
  me(@CurrentUser() user: AuthUser): Promise<PlayerSelfDto> {
    return this.players.selfDto(user.playerId);
  }

  @Get('players')
  list(): Promise<PlayerListItemDto[]> {
    return this.players.ranking();
  }
}
