import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { GameError } from '../errors/game-error';
import { IS_PUBLIC, type AccessTokenPayload, type AuthUser } from './auth';

/** Guard global: exige Bearer válido, exceto em rotas @Public(). */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    if (ctx.getType() !== 'http') return true;
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [ctx.getHandler(), ctx.getClass()]);
    if (isPublic) return true;
    const req = ctx.switchToHttp().getRequest<{ headers: Record<string, string | undefined>; user?: AuthUser }>();
    const header = req.headers['authorization'] ?? '';
    const [scheme, token] = header.split(' ');
    if (scheme !== 'Bearer' || !token) throw new GameError('UNAUTHORIZED', undefined, 'Missing bearer token');
    try {
      const p = await this.jwt.verifyAsync<AccessTokenPayload>(token);
      req.user = { userId: p.sub, playerId: p.pid };
      return true;
    } catch {
      throw new GameError('UNAUTHORIZED', undefined, 'Invalid or expired token');
    }
  }
}
