// GDD seção 15 — progressão da Cidadela e eras.
import type { EraId } from '../contracts/common';
import { roundHalfUp } from './curves';

export interface EraDef {
  id: EraId;
  name: string;
  roman: string;
  keepLevels: readonly [number, number];
  description: string;
}

export const ERAS: Record<EraId, EraDef> = {
  era_ash: {
    id: 'era_ash',
    name: 'Era da Cinza',
    roman: 'I',
    keepLevels: [1, 3],
    description: 'Tropas T1; cidade com paliçada de madeira.',
  },
  era_iron: {
    id: 'era_iron',
    name: 'Era do Ferro',
    roman: 'II',
    keepLevels: [4, 7],
    description: 'Tropas T2 (Quartel 4); cidade com muro de pedra.',
  },
  era_ember: {
    id: 'era_ember',
    name: 'Era da Brasa',
    roman: 'III',
    keepLevels: [8, 10],
    description: 'Tropas T3 (Quartel 8); cidade de ferro negro com braseiro aceso.',
  },
};

/** capacidadeMarcha(nv) = round(300 × 1,3^(nv−1) / 10) × 10 */
export const MARCH_CAPACITY_CURVE = { base: 300, factor: 1.3, roundTo: 10 } as const;

export function marchCapacityForKeep(keepLevel: number): number {
  const { base, factor, roundTo } = MARCH_CAPACITY_CURVE;
  return roundHalfUp((base * factor ** (keepLevel - 1)) / roundTo) * roundTo;
}

export interface KeepLevelDef {
  level: number;
  era: EraId;
  /** Texto do que libera (pt-BR). */
  unlocks: string;
  maxMarches: number;
  marchCapacity: number;
  secondaryHeroes: number;
  buildQueues: number;
}

const KEEP_ROWS: readonly [number, EraId, string, number, number, number][] = [
  // nível, era, libera, marchas simult., secundários, filas de obra
  [1, 'era_ash', 'Fazenda, Serraria, Quartel; tropas T1', 1, 0, 1],
  [2, 'era_ash', 'Pedreira, Armazém, Muralha, Enfermaria, Salão; herói Dorrik', 2, 0, 1],
  [3, 'era_ash', 'Mina de Ouro', 2, 1, 1],
  [4, 'era_iron', 'Tropas T2 (com Quartel 4)', 2, 1, 1],
  [5, 'era_iron', 'Fim do escudo de novato', 3, 1, 1],
  [6, 'era_iron', '2ª fila de obra', 3, 2, 2],
  [7, 'era_iron', '—', 4, 2, 2],
  [8, 'era_ember', 'Tropas T3 (com Quartel 8)', 4, 2, 2],
  [9, 'era_ember', '—', 5, 2, 2],
  [10, 'era_ember', 'Título "Guardião da Chama" (cosmético)', 5, 2, 2],
];

/** Índice 0 = Cidadela 1. */
export const KEEP_LEVELS: KeepLevelDef[] = KEEP_ROWS.map(([level, era, unlocks, maxMarches, secondaryHeroes, buildQueues]) => ({
  level,
  era,
  unlocks,
  maxMarches,
  marchCapacity: marchCapacityForKeep(level),
  secondaryHeroes,
  buildQueues,
}));

export const KEEP_MAX_LEVEL = KEEP_LEVELS.length;
