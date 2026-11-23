import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';

export interface AuthUser {
  userId: string;
  playerId: string;
}

/** Payload do access token. */
export interface AccessTokenPayload {
  sub: string;
  pid: string;
  exp?: number;
}

export const IS_PUBLIC = 'isPublic';
/** Rota sem JWT. */
export const Public = () => SetMetadata(IS_PUBLIC, true);

/** Jogador autenticado (sempre do JWT, nunca do body). */
export const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext): AuthUser => {
  const req = ctx.switchToHttp().getRequest<{ user: AuthUser }>();
  return req.user;
});

/** '1h' | '30m' | '45s' | '2d' | '3600' → segundos. */
export function parseTtlSeconds(ttl: string): number {
  const m = /^(\d+)\s*([smhd]?)$/i.exec(ttl.trim());
  if (!m) return 3600;
  const n = Number(m[1]);
  const unit = m[2].toLowerCase();
  return unit === 'm' ? n * 60 : unit === 'h' ? n * 3600 : unit === 'd' ? n * 86400 : n;
}
