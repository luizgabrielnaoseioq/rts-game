import { Injectable } from '@nestjs/common';
import { chebyshev, CITY_SPAWN, citySpawnCandidates, equatorY, isCitySpawnValid, type Coord } from '@wn/shared';
import { randomInt } from 'node:crypto';
import { advisoryXactLock } from '../../common/db/locks';
import { GameError } from '../../common/errors/game-error';
import type { Tx } from '../../common/prisma/prisma.service';
import type { WorldCtx } from '../../core/world.service';

const RANDOM_TRIES = 300;

/**
 * Posição da cidade nova (GDD 5.2): casa livre com d ≤ 14, ≥ 8 casas (Chebyshev) de outra cidade
 * e ≥ 2 de nó/acampamento. Serializado por advisory lock do mundo.
 */
@Injectable()
export class PlacementService {
  async place(tx: Tx, world: WorldCtx): Promise<Coord> {
    await advisoryXactLock(tx, `city-placement:${world.id}`);
    const [cities, nodes, camps] = await Promise.all([
      tx.city.findMany({ where: { worldId: world.id }, select: { x: true, y: true } }),
      tx.resourceNode.findMany({ where: { worldId: world.id }, select: { x: true, y: true } }),
      tx.npcCamp.findMany({ where: { worldId: world.id }, select: { x: true, y: true } }),
    ]);
    const entities = [...nodes, ...camps];
    const candidates = citySpawnCandidates(world.seed, world.width, world.height);
    const valid = (c: Coord) =>
      isCitySpawnValid(
        c,
        cities.filter((o) => chebyshev(c, o) < CITY_SPAWN.minCityDistance),
        entities.filter((o) => chebyshev(c, o) < CITY_SPAWN.minEntityDistance),
      );

    for (let i = 0; i < RANDOM_TRIES && candidates.length > 0; i++) {
      const c = candidates[randomInt(candidates.length)];
      if (valid(c)) return c;
    }
    // Varredura a partir do centro.
    const center = { x: (world.width - 1) / 2, y: equatorY(world.height) };
    const sorted = [...candidates].sort((a, b) => chebyshev(a, center) - chebyshev(b, center) || a.y - b.y || a.x - b.x);
    for (const c of sorted) if (valid(c)) return c;
    throw new GameError('WORLD_FULL');
  }
}
