import { Injectable } from '@nestjs/common';
import type { Hero } from '@prisma/client';
import { duplicateFragmentXp, HERO_IDS, type HeroTypeId } from '@wn/shared';
import type { Tx } from '../../common/prisma/prisma.service';
import type { EmitBuffer } from '../realtime/emit-buffer';
import { heroLevel, toHeroDto } from './mappers';

export interface HeroOwnerCtx {
  playerId: string;
  heroHallLevel: number;
  defenseHeroId: string | null;
}

/** XP, nível e fragmentos de herói (sempre com a cidade do dono travada). */
@Injectable()
export class HeroXpService {
  async addXp(tx: Tx, owner: HeroOwnerCtx, hero: Hero, xp: number, emit: EmitBuffer): Promise<Hero> {
    if (xp <= 0) return hero;
    const total = hero.xp + Math.floor(xp);
    const updated = await tx.hero.update({
      where: { id: hero.id },
      data: { xp: total, level: heroLevel(total, owner.heroHallLevel) },
    });
    emit.toPlayer(owner.playerId, 'hero:updated', { hero: toHeroDto(updated, owner.heroHallLevel, owner.defenseHeroId) });
    return updated;
  }

  /**
   * Entrega fragmentos (GDD 9.1): herói já liberado → 100 XP por fragmento; senão acumula.
   * Devolve a XP convertida.
   */
  async grantFragments(tx: Tx, owner: HeroOwnerCtx, heroTypeId: HeroTypeId, count: number, emit: EmitBuffer): Promise<number> {
    if (!HERO_IDS.includes(heroTypeId) || count <= 0) return 0;
    const hero = await tx.hero.findUnique({ where: { playerId_heroTypeId: { playerId: owner.playerId, heroTypeId } } });
    if (hero) {
      const xp = duplicateFragmentXp(count);
      await this.addXp(tx, owner, hero, xp, emit);
      return xp;
    }
    await tx.heroFragment.upsert({
      where: { playerId_heroTypeId: { playerId: owner.playerId, heroTypeId } },
      create: { playerId: owner.playerId, heroTypeId, count },
      update: { count: { increment: count } },
    });
    return 0;
  }
}
