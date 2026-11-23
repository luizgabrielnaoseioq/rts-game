import { JwtService } from '@nestjs/jwt';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
} from '@nestjs/websockets';
import { chunksSubscribeSchema, type ChunkId, type ClientToServerEvents, type ServerToClientEvents, type SocketData } from '@wn/shared';
import type { Socket } from 'socket.io';
import type { AccessTokenPayload } from '../../common/auth/auth';
import { env } from '../../config/env';
import { chunkRoom, playerRoom } from './emit-buffer';
import { RealtimeService, type GameServer } from './realtime.service';

type GameSocket = Socket<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>;

/** Token bucket simples: 10 mensagens/s por socket. */
const RATE = { capacity: 10, refillPerSec: 10 };

@WebSocketGateway({ cors: { origin: env.CORS_ORIGINS, credentials: true }, transports: ['websocket'] })
export class RealtimeGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
  private readonly expiryTimers = new Map<string, NodeJS.Timeout>();
  private readonly tokenExp = new Map<string, number>();

  constructor(
    private readonly realtime: RealtimeService,
    private readonly jwt: JwtService,
  ) {}

  afterInit(server: GameServer): void {
    this.realtime.attach(server);
    // Handshake: JWT inválido/vencido → connect_error com err.data.code === 'UNAUTHORIZED'.
    server.use((socket, next) => {
      const token = (socket.handshake.auth as { token?: unknown } | undefined)?.token;
      const reject = () => {
        const err = new Error('unauthorized') as Error & { data?: { code: 'UNAUTHORIZED' } };
        err.data = { code: 'UNAUTHORIZED' };
        next(err);
      };
      if (typeof token !== 'string' || !token) return reject();
      this.jwt
        .verifyAsync<AccessTokenPayload>(token)
        .then((p) => {
          socket.data.userId = p.sub;
          socket.data.playerId = p.pid;
          socket.data.chunkIds = [];
          this.tokenExp.set(socket.id, p.exp ?? 0);
          next();
        })
        .catch(reject);
    });
  }

  async handleConnection(socket: GameSocket): Promise<void> {
    const payload = { pid: socket.data.playerId, exp: this.tokenExp.get(socket.id) };
    this.tokenExp.delete(socket.id);
    if (!payload.pid) {
      socket.disconnect(true);
      return;
    }
    await socket.join(playerRoom(payload.pid));

    // Token expira com o socket aberto: avisa e desconecta (o cliente renova e reconecta).
    if (payload.exp) {
      const ms = payload.exp * 1000 - Date.now();
      const t = setTimeout(() => {
        socket.emit('server:error', { code: 'UNAUTHORIZED' });
        socket.disconnect(true);
      }, Math.max(0, Math.min(ms, 2_147_000_000)));
      this.expiryTimers.set(socket.id, t);
    }

    // Rate limit por socket.
    let tokens = RATE.capacity;
    let last = Date.now();
    socket.use((_packet, next) => {
      const now = Date.now();
      tokens = Math.min(RATE.capacity, tokens + ((now - last) / 1000) * RATE.refillPerSec);
      last = now;
      if (tokens < 1) {
        socket.emit('server:error', { code: 'RATE_LIMITED' });
        return;
      }
      tokens -= 1;
      next();
    });
  }

  handleDisconnect(socket: GameSocket): void {
    const t = this.expiryTimers.get(socket.id);
    if (t) clearTimeout(t);
    this.expiryTimers.delete(socket.id);
  }

  /** Substitui o conjunto de salas de chunk do socket (máx. 36). */
  @SubscribeMessage('chunks:subscribe')
  async onChunksSubscribe(
    @ConnectedSocket() socket: GameSocket,
    @MessageBody() body: unknown,
  ): Promise<{ ok: true; chunkIds: ChunkId[] } | { ok: false; code: 'VALIDATION_FAILED' | 'UNAUTHORIZED' }> {
    if (!socket.data.playerId) return { ok: false, code: 'UNAUTHORIZED' };
    const parsed = chunksSubscribeSchema.safeParse(body);
    if (!parsed.success) return { ok: false, code: 'VALIDATION_FAILED' };
    const next = [...new Set(parsed.data.chunkIds)] as ChunkId[];
    const prev = socket.data.chunkIds ?? [];
    for (const id of prev) if (!next.includes(id)) await socket.leave(chunkRoom(id));
    for (const id of next) if (!prev.includes(id)) await socket.join(chunkRoom(id));
    socket.data.chunkIds = next;
    return { ok: true, chunkIds: next };
  }

  /** Sincronização de relógio: devolve epoch ms do servidor. */
  @SubscribeMessage('time:sync')
  onTimeSync(): { serverTime: number } {
    return { serverTime: Date.now() };
  }
}
