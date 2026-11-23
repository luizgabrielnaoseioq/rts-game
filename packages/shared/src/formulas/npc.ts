// GDD 10 — acampamentos NPC.
import { NPC_CAMP_LEVELS } from '../config/npcCamps';
import { DEFAULT_SPEED, type SpeedSettings } from '../config/speed';
import type { TroopCounts } from '../ids';
import { troopsPower } from './training';

export function campLevelDef(level: number) {
  return NPC_CAMP_LEVELS[Math.max(1, Math.min(level, NPC_CAMP_LEVELS.length)) - 1];
}

/** Tropas cheias do acampamento no nível (composição da facção). */
export function campTroops(level: number): TroopCounts {
  return { ...campLevelDef(level).troops };
}

/** XP fixa que o acampamento dá aos heróis (principal 100%, secundários 50%). */
export function campHeroXp(level: number): number {
  return campLevelDef(level).heroXp;
}

/** respawn = 30 × nível segundos / GAME_SPEED (ms). */
export function campRespawnMs(level: number, speed: SpeedSettings = DEFAULT_SPEED): number {
  return Math.round((campLevelDef(level).respawnSec * 1000) / speed.gameSpeed);
}

/** Poder recomendado (prévia do popup). */
export function campPower(level: number): number {
  return campLevelDef(level).power;
}

/** healthRatio do mapa: tropas restantes / cheio (não revela composição). */
export function campHealthRatio(level: number, current: TroopCounts | null | undefined): number {
  if (!current) return 1;
  const full = troopsPower(campTroops(level));
  return full > 0 ? Math.max(0, Math.min(1, troopsPower(current) / full)) : 0;
}
