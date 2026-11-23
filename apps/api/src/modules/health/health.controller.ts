import { Controller, Get } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { CONFIG_VERSION, type HealthResponse } from '@wn/shared';
import { Public } from '../../common/auth/auth';

@Public()
@SkipThrottle()
@Controller('health')
export class HealthController {
  @Get()
  check(): HealthResponse {
    return { ok: true, configVersion: CONFIG_VERSION, time: new Date().toISOString() };
  }
}
