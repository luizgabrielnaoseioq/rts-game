// GDD 12 e 15 — marchas: distância, velocidade, tempo, carga, limites, posição.
import type { Coord, IsoDate } from '../contracts/common';
import { KEEP_LEVELS } from '../config/progression';
import { DEFAULT_SPEED, MIN_MARCH_SECONDS, type SpeedSettings } from '../config/speed';
import { TROOPS } from '../config/troops';
import type { TroopCounts, TroopTypeId } from '../ids';
import { dist } from '../world/geometry';

function liveEntries(troops: TroopCounts): [TroopTypeId, number][] {
  return (Object.entries(troops) as [TroopTypeId, number | undefined][])
    .filter(([id, n]) => TROOPS[id] && (n ?? 0) > 0)
    .map(([id, n]) => [id, n ?? 0]);
}

/** Distância euclidiana entre centros de casa. */
export function distance(a: Coord, b: Coord): number {
  return dist(a, b);
}

/**
 * Velocidade (casas/min) = menor velocidade entre as tropas × (1 + bônus de velocidade) × GAME_SPEED.
 * Sem tropas → 0.
 */
export function marchSpeed(troops: TroopCounts, speedBonus = 0, speed: SpeedSettings = DEFAULT_SPEED): number {
  const list = liveEntries(troops);
  if (list.length === 0) return 0;
  const slowest = Math.min(...list.map(([id]) => TROOPS[id].speed));
  return slowest * (1 + speedBonus) * speed.gameSpeed;
}

/** tempoViagem = max(MIN_MARCH_SECONDS, distância / velocidade × 60) s → ms. Volta leva o mesmo tempo. */
export function travelMs(distanceTiles: number, speedTilesPerMin: number): number {
  if (speedTilesPerMin <= 0) return Number.POSITIVE_INFINITY;
  const sec = Math.max(MIN_MARCH_SECONDS, (distanceTiles / speedTilesPerMin) * 60);
  return Math.round(sec * 1000);
}

/** carga = Σ(qtd × cargaUnidade) × (1 + bônus de carga), arredondada pra baixo. */
export function carryCapacity(troops: TroopCounts, loadBonus = 0): number {
  const raw = liveEntries(troops).reduce((s, [id, n]) => s + n * TROOPS[id].load, 0);
  return Math.floor(raw * (1 + loadBonus) + 1e-9);
}

function keepRow(keepLevel: number) {
  return KEEP_LEVELS[Math.max(1, Math.min(keepLevel, KEEP_LEVELS.length)) - 1];
}

/** Marchas simultâneas pela Cidadela (também limitadas por heróis livres — conferir no back). */
export function maxMarches(keepLevel: number): number {
  return keepRow(keepLevel).maxMarches;
}

/** Capacidade de marcha (máx. de tropas por marcha). */
export function marchCapacity(keepLevel: number): number {
  return keepRow(keepLevel).marchCapacity;
}

/** Secundários permitidos pela Cidadela (0, 1 ou 2). */
export function maxSecondaryHeroes(keepLevel: number): number {
  return keepRow(keepLevel).secondaryHeroes;
}

export interface MarchLeg {
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  legStartAt: IsoDate | number;
  legEndAt: IsoDate | number;
}

const toMs = (v: IsoDate | number) => (typeof v === 'number' ? v : Date.parse(v));

/** Posição interpolada da marcha no instante `nowMs` (relógio do servidor estimado). */
export function positionAt(m: MarchLeg, nowMs: number): Coord {
  const start = toMs(m.legStartAt);
  const end = toMs(m.legEndAt);
  const t = end <= start ? 1 : Math.min(1, Math.max(0, (nowMs - start) / (end - start)));
  return { x: m.fromX + (m.toX - m.fromX) * t, y: m.fromY + (m.toY - m.fromY) * t };
}

/** Recall na ida: volta do ponto atual, tempo = tempo já andado. */
export function recallLeg(m: MarchLeg, origin: Coord, nowMs: number): { from: Coord; to: Coord; durationMs: number } {
  const start = toMs(m.legStartAt);
  return { from: positionAt(m, nowMs), to: origin, durationMs: Math.max(0, nowMs - start) };
}
