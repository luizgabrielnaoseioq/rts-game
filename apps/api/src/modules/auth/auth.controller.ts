import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { loginSchema, refreshSchema, registerSchema, type AuthResponse, type LoginBody, type RefreshBody, type RegisterBody } from '@wn/shared';
import { Public } from '../../common/auth/auth';
import { ZodPipe } from '../../common/pipes/zod.pipe';
import { AuthService } from './auth.service';

const AUTH_LIMIT = { default: { limit: 5, ttl: 60_000 } };

@Public()
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('register')
  @Throttle(AUTH_LIMIT)
  register(@Body(new ZodPipe(registerSchema)) body: RegisterBody): Promise<AuthResponse> {
    return this.auth.register(body);
  }

  @Post('login')
  @HttpCode(200)
  @Throttle(AUTH_LIMIT)
  login(@Body(new ZodPipe(loginSchema)) body: LoginBody): Promise<AuthResponse> {
    return this.auth.login(body);
  }

  @Post('refresh')
  @HttpCode(200)
  refresh(@Body(new ZodPipe(refreshSchema)) body: RefreshBody): Promise<AuthResponse> {
    return this.auth.refresh(body);
  }

  /** Revoga o refresh token (pública: funciona mesmo com o access expirado). */
  @Post('logout')
  @HttpCode(204)
  async logout(@Body(new ZodPipe(refreshSchema)) body: RefreshBody): Promise<void> {
    await this.auth.logout(body);
  }
}
