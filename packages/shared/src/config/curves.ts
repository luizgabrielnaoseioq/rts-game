// Helpers de curva usados pelas tabelas do GDD.

/**
 * Math.round "meio pra cima" tolerante a erro de ponto flutuante.
 * Ex.: 150 × 1,45 = 217,49999999999997 em double, mas o GDD (conta decimal) dá 218.
 */
export function roundHalfUp(value: number): number {
  return Math.round(value + Math.abs(value) * 1e-12 + 1e-9);
}

/** round(base × fator^(nível−1)) — curva padrão do GDD. */
export function curve(base: number, factor: number, level: number): number {
  return roundHalfUp(base * factor ** (level - 1));
}

/** Mesmo que `curve`, sem arredondar. */
export function curveRaw(base: number, factor: number, level: number): number {
  return base * factor ** (level - 1);
}

/** [1, 2, ..., n] */
export function levelsUpTo(n: number): number[] {
  return Array.from({ length: n }, (_, i) => i + 1);
}
