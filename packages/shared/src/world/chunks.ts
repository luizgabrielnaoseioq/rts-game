import type { ChunkId, Coord } from '../contracts/common';
import { WORLD } from '../config/world';

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function toChunkId(cx: number, cy: number): ChunkId {
  return `${cx}:${cy}` as ChunkId;
}

export function parseChunkId(id: string): { cx: number; cy: number } | null {
  const m = /^(\d+):(\d+)$/.exec(id);
  if (!m) return null;
  return { cx: Number(m[1]), cy: Number(m[2]) };
}

export function chunkOf(x: number, y: number, chunkSize: number = WORLD.chunkSize): ChunkId {
  return toChunkId(Math.floor(x / chunkSize), Math.floor(y / chunkSize));
}

export function chunksPerAxis(size: number = WORLD.width, chunkSize: number = WORLD.chunkSize): number {
  return Math.ceil(size / chunkSize);
}

export function isValidChunkId(
  id: string,
  width: number = WORLD.width,
  height: number = WORLD.height,
  chunkSize: number = WORLD.chunkSize,
): id is ChunkId {
  const p = parseChunkId(id);
  return !!p && p.cx < chunksPerAxis(width, chunkSize) && p.cy < chunksPerAxis(height, chunkSize);
}

/** Retângulo (em casas) coberto pelo chunk, já recortado nos limites do mundo. */
export function chunkBounds(
  id: ChunkId,
  chunkSize: number = WORLD.chunkSize,
  width: number = WORLD.width,
  height: number = WORLD.height,
): { minX: number; minY: number; maxX: number; maxY: number } {
  const p = parseChunkId(id);
  if (!p) throw new Error(`ChunkId inválido: ${id}`);
  return {
    minX: p.cx * chunkSize,
    minY: p.cy * chunkSize,
    maxX: Math.min(width - 1, (p.cx + 1) * chunkSize - 1),
    maxY: Math.min(height - 1, (p.cy + 1) * chunkSize - 1),
  };
}

/** Chunks que tocam o retângulo (em casas), com margem opcional em chunks. */
export function chunkIdsInRect(
  rect: Rect,
  margin = 0,
  chunkSize: number = WORLD.chunkSize,
  width: number = WORLD.width,
  height: number = WORLD.height,
): ChunkId[] {
  const maxCx = chunksPerAxis(width, chunkSize) - 1;
  const maxCy = chunksPerAxis(height, chunkSize) - 1;
  const cx0 = Math.max(0, Math.floor(rect.x / chunkSize) - margin);
  const cy0 = Math.max(0, Math.floor(rect.y / chunkSize) - margin);
  const cx1 = Math.min(maxCx, Math.floor((rect.x + rect.width) / chunkSize) + margin);
  const cy1 = Math.min(maxCy, Math.floor((rect.y + rect.height) / chunkSize) + margin);
  const out: ChunkId[] = [];
  for (let cy = cy0; cy <= cy1; cy++) for (let cx = cx0; cx <= cx1; cx++) out.push(toChunkId(cx, cy));
  return out;
}

/** Chunks cruzados pelo segmento from→to (amostragem a cada ¼ de casa, sem duplicar). */
export function chunksCrossedBySegment(from: Coord, to: Coord, chunkSize: number = WORLD.chunkSize): ChunkId[] {
  const len = Math.hypot(to.x - from.x, to.y - from.y);
  const steps = Math.max(1, Math.ceil(len * 4));
  const seen = new Set<ChunkId>();
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const x = from.x + (to.x - from.x) * t;
    const y = from.y + (to.y - from.y) * t;
    seen.add(chunkOf(Math.max(0, Math.floor(x + 0.5)), Math.max(0, Math.floor(y + 0.5)), chunkSize));
  }
  return [...seen];
}
