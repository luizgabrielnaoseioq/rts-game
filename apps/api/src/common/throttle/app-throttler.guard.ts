import { ExecutionContext, Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

/** Rate limit por jogador (quando autenticado) ou por IP. */
@Injectable()
export class AppThrottlerGuard extends ThrottlerGuard {
  /** Só HTTP: o socket tem o próprio limite (token bucket no gateway). */
  override async canActivate(context: ExecutionContext): Promise<boolean> {
    if (context.getType() !== 'http') return true;
    return super.canActivate(context);
  }

  protected override async getTracker(req: Record<string, any>): Promise<string> {
    const playerId = (req.user as { playerId?: string } | undefined)?.playerId;
    return playerId ? `p:${playerId}` : `ip:${req.ip ?? 'unknown'}`;
  }
}
