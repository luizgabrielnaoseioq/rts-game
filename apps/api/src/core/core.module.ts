import { Global, Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { env } from '../config/env';
import { CityTickService } from './game/city-tick.service';
import { HeroXpService } from './game/hero-xp.service';
import { RealtimeGateway } from './realtime/realtime.gateway';
import { RealtimeService } from './realtime/realtime.service';
import { EventQueue } from './scheduler/event-queue';
import { SchedulerService } from './scheduler/scheduler.service';
import { TxService } from './tx.service';
import { WorldService } from './world.service';

/** Infra de jogo compartilhada: transação + emissão, mundo, fila de eventos, agendador, gateway. */
@Global()
@Module({
  imports: [JwtModule.register({ global: true, secret: env.JWT_ACCESS_SECRET })],
  providers: [RealtimeService, RealtimeGateway, TxService, WorldService, EventQueue, SchedulerService, CityTickService, HeroXpService],
  exports: [RealtimeService, TxService, WorldService, EventQueue, SchedulerService, CityTickService, HeroXpService],
})
export class CoreModule {}
