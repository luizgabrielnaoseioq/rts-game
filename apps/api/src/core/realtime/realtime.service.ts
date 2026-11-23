import { Injectable, Logger } from '@nestjs/common';
import type { ClientToServerEvents, ServerToClientEvents, SocketData } from '@wn/shared';
import type { Server } from 'socket.io';
import type { Emission, EmissionSink } from './emit-buffer';

export type GameServer = Server<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>;

/** Ponte entre os serviços de domínio e o Socket.IO (o gateway registra o server no init). */
@Injectable()
export class RealtimeService implements EmissionSink {
  private readonly logger = new Logger('Realtime');
  private server: GameServer | null = null;

  attach(server: GameServer): void {
    this.server = server;
  }

  emitRaw(e: Emission): void {
    if (!this.server || e.rooms.length === 0) return;
    try {
      let op = this.server.to(e.rooms);
      if (e.except.length > 0) op = op.except(e.except);
      (op.emit as (ev: string, p: unknown) => boolean)(e.event, e.payload);
    } catch (err) {
      this.logger.warn(`emit ${e.event} falhou: ${(err as Error).message}`);
    }
  }
}
