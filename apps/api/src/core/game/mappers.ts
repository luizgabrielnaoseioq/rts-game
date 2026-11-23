// Prisma → DTOs do shared (contratos com o front).
import type { Building, Hero, March, MarchHero, MarchTroop, NpcCamp, ResourceNode, ResourceType } from '@prisma/client';
import {
  campHealthRatio,
  eraForKeep,
  heroBonuses,
  HEROES,
  isShielded,
  levelFromXp,
  maxHeroLevel,
  xpForNextLevel,
  type BuildingDto,
  type BuildingTypeId,
  type CampTypeId,
  type ChestTypeId,
  type HeroDto,
  type HeroTypeId,
  type MapCityDto,
  type MapMarchDto,
  type MapNpcCampDto,
  type MapResourceNodeDto,
  type MarchDto,
  type ResourceKey,
  type TroopCounts,
  type TroopTypeId,
} from '@wn/shared';

export const iso = (d: Date | null | undefined): string | null => (d ? d.toISOString() : null);

export const RESOURCE_KEY: Record<ResourceType, ResourceKey> = { FOOD: 'food', WOOD: 'wood', STONE: 'stone', GOLD: 'gold' };
export const RESOURCE_TYPE: Record<ResourceKey, ResourceType> = { food: 'FOOD', wood: 'WOOD', stone: 'STONE', gold: 'GOLD' };

export function toBuildingDto(b: Building): BuildingDto {
  return {
    id: b.id,
    slot: b.slot,
    typeId: b.typeId as BuildingTypeId,
    level: b.level,
    upgradeStartedAt: iso(b.upgradeStartedAt),
    upgradeEndsAt: iso(b.upgradeEndsAt),
  };
}

export interface CityWithOwner {
  id: string;
  x: number;
  y: number;
  name: string;
  level: number;
  playerId: string;
  player: { displayName: string; bannerColor: number; shieldUntil: Date | null; power: number };
}

export function toMapCity(c: CityWithOwner, nowMs: number = Date.now()): MapCityDto {
  return {
    id: c.id,
    x: c.x,
    y: c.y,
    name: c.name,
    level: c.level,
    era: eraForKeep(c.level),
    ownerId: c.playerId,
    ownerName: c.player.displayName,
    bannerColor: c.player.bannerColor,
    shielded: isShielded(c.player.shieldUntil, nowMs),
    power: c.player.power,
  };
}

export function toMapNode(n: ResourceNode, occupiedByPlayerName: string | null): MapResourceNodeDto {
  return {
    id: n.id,
    x: n.x,
    y: n.y,
    resourceType: RESOURCE_KEY[n.resourceType],
    level: n.level,
    remaining: n.remaining,
    maxAmount: n.maxAmount,
    status: n.status,
    occupiedByPlayerName: n.status === 'AVAILABLE' ? occupiedByPlayerName : null,
    respawnAt: iso(n.respawnAt),
  };
}

export function toMapCamp(c: NpcCamp): MapNpcCampDto {
  return {
    id: c.id,
    x: c.x,
    y: c.y,
    campTypeId: c.campTypeId as CampTypeId,
    level: c.level,
    status: c.status,
    healthRatio: c.status === 'DEFEATED' ? 0 : campHealthRatio(c.level, c.currentTroops as TroopCounts | null),
    respawnAt: iso(c.respawnAt),
  };
}

export function toMapMarch(m: March, ownerName: string, viewerPlayerId?: string): MapMarchDto {
  return {
    id: m.id,
    ownerId: m.playerId,
    ownerName,
    isMine: viewerPlayerId === m.playerId,
    type: m.type,
    state: m.state,
    targetKind: m.targetKind,
    fromX: m.fromX,
    fromY: m.fromY,
    toX: m.toX,
    toY: m.toY,
    legStartAt: m.legStartAt.toISOString(),
    legEndAt: m.legEndAt.toISOString(),
  };
}

export type MarchFull = March & {
  troops: MarchTroop[];
  heroes: (MarchHero & { hero: Hero })[];
  player: { displayName: string };
};

export const MARCH_FULL_INCLUDE = {
  troops: true,
  heroes: { include: { hero: true } },
  player: { select: { displayName: true } },
} as const;

export function toMarchDto(m: MarchFull): MarchDto {
  return {
    ...toMapMarch(m, m.player.displayName, m.playerId),
    originCityId: m.originCityId,
    targetX: m.targetX,
    targetY: m.targetY,
    targetId: m.targetResourceNodeId ?? m.targetNpcCampId ?? m.targetCityId ?? null,
    troops: m.troops
      .map((t) => ({ troopTypeId: t.troopTypeId as TroopTypeId, sent: t.sent, alive: t.alive, wounded: t.wounded }))
      .sort((a, b) => a.troopTypeId.localeCompare(b.troopTypeId)),
    heroes: m.heroes
      .map((h) => ({ heroId: h.heroId, heroTypeId: h.hero.heroTypeId as HeroTypeId, slot: h.slot as 0 | 1 | 2 }))
      .sort((a, b) => a.slot - b.slot),
    speed: m.speed,
    carryCapacity: m.carryCapacity,
    gatherEndsAt: iso(m.gatherEndsAt),
    loot: { food: m.lootFood, wood: m.lootWood, stone: m.lootStone, gold: m.lootGold },
    chestTypeId: (m.chestTypeId as ChestTypeId | null) ?? null,
    createdAt: m.createdAt.toISOString(),
  };
}

/** Nível efetivo = pela XP, limitado pelo Salão dos Heróis. */
export function heroLevel(xp: number, heroHallLevel: number): number {
  return levelFromXp(xp, maxHeroLevel(heroHallLevel));
}

export function toHeroDto(h: Hero, heroHallLevel: number, defenseHeroId: string | null): HeroDto {
  const typeId = h.heroTypeId as HeroTypeId;
  const maxLevel = maxHeroLevel(heroHallLevel);
  const level = levelFromXp(h.xp, maxLevel);
  return {
    id: h.id,
    heroTypeId: typeId,
    level,
    xp: h.xp,
    xpForNextLevel: xpForNextLevel(h.xp, maxLevel),
    maxLevel,
    canLead: HEROES[typeId]?.canLead ?? false,
    activeMarchId: h.activeMarchId,
    isDefenseCommander: defenseHeroId === h.id,
    bonuses: heroBonuses(typeId, level),
  };
}
