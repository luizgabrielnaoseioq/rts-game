// GDD 5 / 5.1 — bioma por latitude.
import type { Biome } from '../contracts/common';
import { BIOMES, WORLD } from '../config/world';

/** Linha do equador (59,5 num mundo de 120). */
export function equatorY(height: number = WORLD.height): number {
  return (height - 1) / 2;
}

/** Distância de linha ao equador: d = floor(|y − 59,5|) → 0 a 59. */
export function latitudeD(y: number, height: number = WORLD.height): number {
  return Math.floor(Math.abs(y - equatorY(height)));
}

export function biomeForD(d: number): Biome {
  if (d <= BIOMES.vale.dRange[1]) return 'vale';
  if (d <= BIOMES.waste.dRange[1]) return 'waste';
  return 'frost';
}

/**
 * Bioma da casa. O GDD define bandas retas por latitude (sem ruído na fronteira);
 * `seed` e `x` ficam na assinatura para o gerador poder evoluir sem mudar quem chama.
 */
export function biomeAt(_seed: string, _x: number, y: number, height: number = WORLD.height): Biome {
  return biomeForD(latitudeD(y, height));
}
