import type { ChunkId, Id, MapMarchDto, ServerToClientEvents } from '@wn/shared';

export type ServerEvent = keyof ServerToClientEvents;
export type EventPayload<E extends ServerEvent> = Parameters<ServerToClientEvents[E]>[0];

export interface Emission {
  rooms: string[];
  except: string[];
  event: ServerEvent;
  payload: unknown;
}

export interface EmissionSink {
  emitRaw(e: Emission): void;
}

export const playerRoom = (playerId: Id) => `player:${playerId}`;
export const chunkRoom = (chunkId: ChunkId | string) => `chunk:${chunkId}`;

/**
 * Emissões acumuladas durante a transação; só saem no flush (depois do commit).
 * Rollback = nada é emitido.
 */
export class EmitBuffer {
  private readonly items: Emission[] = [];

  toPlayer<E extends ServerEvent>(playerId: Id, event: E, payload: EventPayload<E>): void {
    this.items.push({ rooms: [playerRoom(playerId)], except: [], event, payload });
  }

  toChunks<E extends ServerEvent>(chunkIds: readonly string[], event: E, payload: EventPayload<E>, exceptPlayerId?: Id): void {
    if (chunkIds.length === 0) return;
    this.items.push({
      rooms: [...new Set(chunkIds)].map(chunkRoom),
      except: exceptPlayerId ? [playerRoom(exceptPlayerId)] : [],
      event,
      payload,
    });
  }

  /** Para o dono e para as salas dos chunks (sem duplicar sockets). */
  toPlayerAndChunks<E extends ServerEvent>(playerId: Id, chunkIds: readonly string[], event: E, payload: EventPayload<E>): void {
    this.items.push({ rooms: [playerRoom(playerId), ...[...new Set(chunkIds)].map(chunkRoom)], except: [], event, payload });
  }

  /** march:created/updated: o dono recebe isMine=true; os outros nos chunks, isMine=false. */
  march(event: 'march:created' | 'march:updated', dto: MapMarchDto, chunkIds: readonly string[]): void {
    this.toPlayer(dto.ownerId, event, { march: { ...dto, isMine: true } });
    this.toChunks(chunkIds, event, { march: { ...dto, isMine: false } }, dto.ownerId);
  }

  get size(): number {
    return this.items.length;
  }

  flush(sink: EmissionSink): void {
    for (const e of this.items.splice(0)) sink.emitRaw(e);
  }
}
