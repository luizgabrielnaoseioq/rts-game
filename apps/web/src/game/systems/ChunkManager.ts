import { MAX_SUBSCRIBED_CHUNKS, chunkIdsInRect, parseChunkId, type ChunkId } from '@wn/shared';
import { api } from '../../api/endpoints';
import { subscribeChunks } from '../../realtime/socket';
import { useClockStore } from '../../stores/clock';
import { useMarchStore } from '../../stores/marches';
import { useUiStore } from '../../stores/ui';
import { useWorldStore } from '../../stores/world';
import type { ViewRect } from './CameraController';

/**
 * Carrega entidades por chunk visível (+ margem 1), inscreve nas salas do socket
 * e solta do store os chunks a mais de 2 de distância (ARQUITETURA 6.3).
 */
export class ChunkManager {
  private inFlight = new Set<string>();
  private lastView: ViewRect | null = null;
  private unsub: () => void;

  constructor(
    private chunkSize: number,
    private width: number,
    private height: number,
  ) {
    // Socket voltou: o que mudou enquanto estava fora pode estar velho -> recarrega os chunks visíveis.
    this.unsub = useUiStore.subscribe((s, prev) => {
      if (s.socketConnected && !prev.socketConnected && this.lastView) this.refresh(this.lastView, true);
    });
  }

  destroy(): void {
    this.unsub();
  }

  onView(view: ViewRect): void {
    // Canvas ainda sem tamanho: ignora (senão despejaria os chunks certos).
    if (!(view.width > 0) || !(view.height > 0)) return;
    this.lastView = view;
    this.refresh(view, false);
  }

  private refresh(view: ViewRect, force: boolean): void {
    const rect = { x: view.x, y: view.y, width: view.width, height: view.height };
    const visible = chunkIdsInRect(rect, 0, this.chunkSize, this.width, this.height);
    const wanted = chunkIdsInRect(rect, 1, this.chunkSize, this.width, this.height);

    // Prioridade: perto do centro da tela.
    const ccx = (view.x + view.width / 2) / this.chunkSize;
    const ccy = (view.y + view.height / 2) / this.chunkSize;
    const dist = (id: ChunkId) => {
      const p = parseChunkId(id);
      return p ? Math.hypot(p.cx + 0.5 - ccx, p.cy + 0.5 - ccy) : 99;
    };
    const visibleSet = new Set<string>(visible);
    const ordered = [...wanted].sort((a, b) => {
      const va = visibleSet.has(a) ? 0 : 1;
      const vb = visibleSet.has(b) ? 0 : 1;
      return va - vb || dist(a) - dist(b);
    });

    subscribeChunks(ordered.slice(0, MAX_SUBSCRIBED_CHUNKS));

    const loaded = useWorldStore.getState().loadedChunks;
    const toFetch = ordered.filter((id) => !this.inFlight.has(id) && (force || !loaded[id]));
    for (let i = 0; i < toFetch.length; i += MAX_SUBSCRIBED_CHUNKS) this.fetch(toFetch.slice(i, i + MAX_SUBSCRIBED_CHUNKS));

    this.evict(visible);
  }

  private fetch(ids: ChunkId[]): void {
    if (ids.length === 0) return;
    ids.forEach((id) => this.inFlight.add(id));
    api
      .chunks(ids)
      .then((r) => {
        useClockStore.getState().hintFromIso(r.serverTime);
        useWorldStore.getState().mergeChunks(r.chunks);
        useMarchStore.getState().mergeMap(r.marches);
      })
      .catch((err: unknown) => console.warn('[chunks] falhou', err))
      .finally(() => ids.forEach((id) => this.inFlight.delete(id)));
  }

  /** Solta chunks a mais de 2 de distância do retângulo visível. */
  private evict(visible: ChunkId[]): void {
    if (visible.length === 0) return;
    const ps = visible.map((v) => parseChunkId(v)).filter((p): p is { cx: number; cy: number } => !!p);
    const minX = Math.min(...ps.map((p) => p.cx));
    const maxX = Math.max(...ps.map((p) => p.cx));
    const minY = Math.min(...ps.map((p) => p.cy));
    const maxY = Math.max(...ps.map((p) => p.cy));
    const drop: ChunkId[] = [];
    for (const id of Object.keys(useWorldStore.getState().loadedChunks)) {
      const p = parseChunkId(id);
      if (!p) continue;
      const dx = p.cx < minX ? minX - p.cx : p.cx > maxX ? p.cx - maxX : 0;
      const dy = p.cy < minY ? minY - p.cy : p.cy > maxY ? p.cy - maxY : 0;
      if (Math.max(dx, dy) > 2) drop.push(id as ChunkId);
    }
    useWorldStore.getState().dropChunks(drop);
  }
}
