// GDD 15 — eras.
import type { EraId } from '../contracts/common';
import { ERAS } from '../config/progression';

export function eraForKeep(keepLevel: number): EraId {
  for (const era of Object.values(ERAS)) {
    if (keepLevel >= era.keepLevels[0] && keepLevel <= era.keepLevels[1]) return era.id;
  }
  return keepLevel < 1 ? 'era_ash' : 'era_ember';
}
