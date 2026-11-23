// GDD 4 — reset diário às 00:00 America/Sao_Paulo (UTC−3 fixo, sem horário de verão).
import { DAILY_RESET_UTC_OFFSET_MINUTES } from '../config/speed';

const DAY_MS = 86_400_000;
const OFFSET_MS = DAILY_RESET_UTC_OFFSET_MINUTES * 60_000;

/** Último reset (epoch ms) em ou antes de `nowMs`. */
export function lastDailyReset(nowMs: number): number {
  const local = nowMs + OFFSET_MS;
  return Math.floor(local / DAY_MS) * DAY_MS - OFFSET_MS;
}

/** Próximo reset (epoch ms) depois de `nowMs`. */
export function nextDailyReset(nowMs: number): number {
  return lastDailyReset(nowMs) + DAY_MS;
}

/** Baú diário / chamado grátis disponível se o último uso foi antes do último reset. */
export function isDailyAvailable(lastClaimMs: number | null | undefined, nowMs: number): boolean {
  return lastClaimMs == null || lastClaimMs < lastDailyReset(nowMs);
}

/** Quando fica disponível (<= now significa já disponível). */
export function dailyAvailableAt(lastClaimMs: number | null | undefined, nowMs: number): number {
  return isDailyAvailable(lastClaimMs, nowMs) ? lastDailyReset(nowMs) : nextDailyReset(nowMs);
}
