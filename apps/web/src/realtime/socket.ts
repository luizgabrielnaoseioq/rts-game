import type { ChunkId, ClientToServerEvents, ServerToClientEvents } from '@wn/shared';
import { MAX_SUBSCRIBED_CHUNKS } from '@wn/shared';
import { io, type Socket } from 'socket.io-client';
import { ensureAccessToken, refreshSession } from '../api/http';
import { WS_URL } from '../lib/env';
import { useUiStore } from '../stores/ui';
import { bindHandlers } from './handlers';
import { startTimeSync, stopTimeSync, syncNow } from './timeSync';

export type GameSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

let socket: GameSocket | null = null;
let wantedChunks: ChunkId[] = [];
let connectedOnce = false;
let onReconnect: (() => void) | null = null;

export function getSocket(): GameSocket | null {
  return socket;
}

/** Chamado a cada reconexão (não na primeira): ressincroniza o estado perdido. */
export function setReconnectHandler(fn: () => void): void {
  onReconnect = fn;
}

function isAuthError(err: Error & { data?: unknown }): boolean {
  const data = err.data as { code?: string } | undefined;
  return data?.code === 'UNAUTHORIZED' || /unauth|jwt|token/i.test(err.message);
}

/** Renova o token e reconecta (token expirado no handshake ou durante a sessão). */
export async function reconnectWithFreshToken(): Promise<void> {
  const ok = await refreshSession();
  if (!ok || !socket) return;
  socket.disconnect();
  socket.connect();
}

export function connectSocket(): GameSocket {
  if (socket) {
    if (!socket.connected) socket.connect();
    return socket;
  }
  const s: GameSocket = io(WS_URL, {
    transports: ['websocket'],
    autoConnect: false,
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 8000,
    // Função: roda em cada (re)conexão, então sempre manda o token atual.
    auth: (cb) => {
      void ensureAccessToken().then((token) => cb({ token: token ?? '' }));
    },
  });
  socket = s;

  s.on('connect', () => {
    useUiStore.getState().setSocketConnected(true);
    syncNow();
    startTimeSync();
    if (wantedChunks.length > 0) emitSubscribe();
    if (connectedOnce) onReconnect?.();
    connectedOnce = true;
  });

  s.on('disconnect', (reason) => {
    useUiStore.getState().setSocketConnected(false);
    stopTimeSync();
    // Servidor derrubou de propósito (ex.: token inválido): o cliente não reconecta sozinho.
    if (reason === 'io server disconnect') void reconnectWithFreshToken();
  });

  s.on('connect_error', (err) => {
    useUiStore.getState().setSocketConnected(false);
    if (isAuthError(err as Error & { data?: unknown })) void reconnectWithFreshToken();
  });

  bindHandlers(s);
  s.connect();
  return s;
}

export function disconnectSocket(): void {
  stopTimeSync();
  if (socket) {
    socket.removeAllListeners();
    socket.disconnect();
  }
  socket = null;
  wantedChunks = [];
  connectedOnce = false;
  useUiStore.getState().setSocketConnected(false);
}

function emitSubscribe(): void {
  if (!socket?.connected) return;
  const ids = wantedChunks.slice(0, MAX_SUBSCRIBED_CHUNKS);
  socket.emit('chunks:subscribe', { chunkIds: ids }, (r) => {
    if (!r.ok) console.warn('[socket] chunks:subscribe falhou', r.code);
  });
}

/** Substitui o conjunto de salas de chunk (máx. 36, os primeiros têm prioridade). */
export function subscribeChunks(ids: ChunkId[]): void {
  const next = ids.slice(0, MAX_SUBSCRIBED_CHUNKS);
  const same = next.length === wantedChunks.length && next.every((id, i) => wantedChunks[i] === id);
  if (same) return;
  wantedChunks = next;
  emitSubscribe();
}
