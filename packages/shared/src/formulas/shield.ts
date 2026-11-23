// GDD 14 — escudos e regras de PvP.
import type { IsoDate } from '../contracts/common';
import { PVP, SHIELDS } from '../config/balance';
import { SHIELD_USES_GAME_SPEED, DEFAULT_SPEED, type SpeedSettings } from '../config/speed';

const toMs = (v: IsoDate | number | Date | null | undefined): number | null =>
  v == null ? null : typeof v === 'number' ? v : v instanceof Date ? v.getTime() : Date.parse(v);

function shieldDuration(ms: number, speed: SpeedSettings): number {
  return SHIELD_USES_GAME_SPEED ? Math.round(ms / speed.gameSpeed) : ms;
}

export function isShielded(shieldUntil: IsoDate | number | Date | null | undefined, nowMs: number): boolean {
  const until = toMs(shieldUntil);
  return until != null && until > nowMs;
}

/** Escudo de novato: 24 h reais desde a criação. */
export function newbieShieldUntil(createdAtMs: number, speed: SpeedSettings = DEFAULT_SPEED): number {
  return createdAtMs + shieldDuration(SHIELDS.newbie.durationMs, speed);
}

/** Escudo de novato acaba ao chegar na Cidadela 5. */
export function newbieShieldEndsByKeep(keepLevel: number): boolean {
  return keepLevel >= SHIELDS.newbie.endsAtKeepLevel;
}

/** Trégua: 30 min reais quando o atacante vence contra você. Não acumula (substitui). */
export function truceUntil(nowMs: number, speed: SpeedSettings = DEFAULT_SPEED): number {
  return nowMs + shieldDuration(SHIELDS.truce.durationMs, speed);
}

/** Mandar attack_player quebra qualquer escudo próprio (novato ou trégua). */
export const shieldBreaksOnAttack = SHIELDS.newbie.breaksOnAttack && SHIELDS.truce.breaksOnAttack;

/** Não pode atacar cidade com Cidadela 4+ níveis abaixo da sua. */
export function canAttackByKeepLevel(attackerKeep: number, defenderKeep: number): boolean {
  return attackerKeep - defenderKeep <= PVP.maxKeepLevelsBelow;
}
