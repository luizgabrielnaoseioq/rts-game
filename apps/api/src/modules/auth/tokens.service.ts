import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { createHash, randomBytes } from 'node:crypto';
import { parseTtlSeconds, type AccessTokenPayload } from '../../common/auth/auth';
import type { Tx } from '../../common/prisma/prisma.service';
import { env } from '../../config/env';

export interface IssuedTokens {
  accessToken: string;
  accessTokenExpiresAt: string;
  refreshToken: string;
}

export const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

/** Access JWT curto + refresh opaco (32 bytes; só o sha256 vai pro banco). */
@Injectable()
export class TokensService {
  constructor(private readonly jwt: JwtService) {}

  async issue(tx: Tx, userId: string, playerId: string): Promise<IssuedTokens> {
    const ttlSec = parseTtlSeconds(env.JWT_ACCESS_TTL);
    const exp = Math.floor(Date.now() / 1000) + ttlSec;
    const payload: AccessTokenPayload = { sub: userId, pid: playerId, exp };
    const accessToken = await this.jwt.signAsync(payload);
    const refreshToken = randomBytes(32).toString('base64url');
    await tx.refreshToken.create({
      data: {
        userId,
        tokenHash: hashToken(refreshToken),
        expiresAt: new Date(Date.now() + env.REFRESH_TOKEN_TTL_DAYS * 86_400_000),
      },
    });
    return { accessToken, accessTokenExpiresAt: new Date(exp * 1000).toISOString(), refreshToken };
  }
}
