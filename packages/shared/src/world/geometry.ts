import type { Coord } from '../contracts/common';

/** Distância euclidiana entre centros de casa. */
export function dist(a: Coord, b: Coord): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

/** Distância de Chebyshev (raio quadrado). */
export function chebyshev(a: Coord, b: Coord): number {
  return Math.max(Math.abs(b.x - a.x), Math.abs(b.y - a.y));
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function lerpCoord(a: Coord, b: Coord, t: number): Coord {
  return { x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t) };
}

export function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

export function inBounds(x: number, y: number, width: number, height: number): boolean {
  return Number.isInteger(x) && Number.isInteger(y) && x >= 0 && y >= 0 && x < width && y < height;
}
