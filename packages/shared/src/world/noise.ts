// Value noise 2D determinístico.
import { hashInts } from './rng';

function lattice(seed: number, x: number, y: number): number {
  return hashInts(seed, x, y) / 4294967296;
}

function smooth(t: number): number {
  return t * t * (3 - 2 * t);
}

/** Value noise em [0, 1). `scale` = tamanho da célula em casas. */
export function valueNoise2D(seed: number, x: number, y: number, scale = 8): number {
  const fx = x / scale;
  const fy = y / scale;
  const x0 = Math.floor(fx);
  const y0 = Math.floor(fy);
  const tx = smooth(fx - x0);
  const ty = smooth(fy - y0);
  const a = lattice(seed, x0, y0);
  const b = lattice(seed, x0 + 1, y0);
  const c = lattice(seed, x0, y0 + 1);
  const d = lattice(seed, x0 + 1, y0 + 1);
  const top = a + (b - a) * tx;
  const bottom = c + (d - c) * tx;
  return top + (bottom - top) * ty;
}

/** Soma de oitavas (fBm), normalizada em [0, 1). */
export function fbm2D(seed: number, x: number, y: number, scale = 12, octaves = 3): number {
  let amp = 1;
  let total = 0;
  let norm = 0;
  let s = scale;
  for (let o = 0; o < octaves; o++) {
    total += valueNoise2D(seed + o * 1013, x, y, s) * amp;
    norm += amp;
    amp *= 0.5;
    s /= 2;
  }
  return total / norm;
}
