import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';
import { JwtAuthGuard } from './common/auth/jwt-auth.guard';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { PrismaModule } from './common/prisma/prisma.module';
import { AppThrottlerGuard } from './common/throttle/app-throttler.guard';
import { CoreModule } from './core/core.module';
import { AuthController } from './modules/auth/auth.controller';
import { AuthService } from './modules/auth/auth.service';
import { PlacementService } from './modules/auth/placement.service';
import { TokensService } from './modules/auth/tokens.service';
import { ChestsController } from './modules/chests/chests.controller';
import { ChestsService } from './modules/chests/chests.service';
import { CityController } from './modules/city/city.controller';
import { CityService } from './modules/city/city.service';
import { HealthController } from './modules/health/health.controller';
import { HeroesController } from './modules/heroes/heroes.controller';
import { HeroesService } from './modules/heroes/heroes.service';
import { MarchEngine } from './modules/marches/march-engine.service';
import { MarchesController } from './modules/marches/marches.controller';
import { MarchesService } from './modules/marches/marches.service';
import { PlayerController } from './modules/player/player.controller';
import { PlayerService } from './modules/player/player.service';
import { ReportsController } from './modules/reports/reports.controller';
import { ReportsService } from './modules/reports/reports.service';
import { WorldController } from './modules/world/world.controller';
import { WorldQueryService } from './modules/world/world.service';

@Module({
  imports: [
    PrismaModule,
    CoreModule,
    // Global: 120 req/min por jogador (ou IP). Login/cadastro 5/min; marchas e abrir baú 30/min.
    ThrottlerModule.forRoot({ throttlers: [{ name: 'default', ttl: 60_000, limit: 120 }] }),
  ],
  controllers: [
    HealthController,
    AuthController,
    PlayerController,
    WorldController,
    CityController,
    HeroesController,
    MarchesController,
    ReportsController,
    ChestsController,
  ],
  providers: [
    // Ordem importa: autentica antes do rate limit (que usa o jogador como chave).
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: AppThrottlerGuard },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    TokensService,
    PlacementService,
    AuthService,
    PlayerService,
    WorldQueryService,
    CityService,
    HeroesService,
    MarchEngine,
    MarchesService,
    ReportsService,
    ChestsService,
  ],
})
export class AppModule {}
