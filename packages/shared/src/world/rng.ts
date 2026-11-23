// RNG determinístico (sem Math.random).

export type Rng = () => number;

/** PRNG mulberry32: devolve números em [0, 1). */
export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Hash de string → uint32 (cyrb53 truncado; estável em qualquer runtime). */
export function hashString(str: string): number {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (h1 ^ h2) >>> 0;
}

/** Hash de inteiros (ex.: seed + x + y) → uint32. */
export function hashInts(...values: number[]): number {
  let h = 0x811c9dc5;
  for (const v of values) {
    h = Math.imul(h ^ (v | 0), 0x01000193);
    h ^= h >>> 13;
    h = Math.imul(h, 0x5bd1e995);
    h ^= h >>> 15;
  }
  return h >>> 0;
}

/** RNG a partir de partes (strings/números), ex.: createRng('vharos-1', 'spawns'). */
export function createRng(...parts: (string | number)[]): Rng {
  return mulberry32(hashString(parts.join('|')));
}

/** Inteiro em [min, max] (inclusive). */
export function randInt(rng: Rng, min: number, max: number): number {
  return min + Math.floor(rng() * (max - min + 1));
}

/** Escolha ponderada. Lança se a soma dos pesos for 0. */
export function pickWeighted<T>(rng: Rng, entries: readonly T[], weightOf: (e: T) => number): T {
  const total = entries.reduce((s, e) => s + weightOf(e), 0);
  if (total <= 0) throw new Error('pickWeighted: soma de pesos zero');
  let r = rng() * total;
  for (const e of entries) {
    r -= weightOf(e);
    if (r < 0) return e;
  }
  return entries[entries.length - 1];
}

/** Fisher–Yates in-place, determinístico. */
export function shuffleInPlace<T>(rng: Rng, arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = arr[i];
    arr[i] = arr[j];
    arr[j] = tmp;
  }
  return arr;
}
