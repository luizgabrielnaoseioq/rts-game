import { Injectable, OnModuleInit } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  BIOMES,
  biomeAt,
  campPower,
  chunkBounds,
  chunkOf,
  chunksCrossedBySegment,
  distance,
  generateTerrain,
  makeCampSpawn,
  makeNodeSpawn,
  marchSpeed,
  npcFactionForLevel,
  pickRespawnTile,
  terrainTile,
  travelMs,
  createRng,
  type Biome,
  type CampTypeId,
  type ChunkId,
  type ChunksResponse,
  type ChunkStateDto,
  type MapMarchDto,
  type TileDetailDto,
  type WorldInfoDto,
} from '@wn/shared';
import { lockCamp, lockNode } from '../../common/db/locks';
import { PrismaService, type Tx } from '../../common/prisma/prisma.service';
import { RESOURCE_TYPE, toMapCamp, toMapCity, toMapMarch, toMapNode } from '../../core/game/mappers';
import type { EmitBuffer } from '../../core/realtime/emit-buffer';
import { EventQueue } from '../../core/scheduler/event-queue';
import { WorldService, type WorldCtx } from '../../core/world.service';

const NODE_OCCUPANT_INCLUDE = { occupiedBy: { select: { player: { select: { displayName: true } } } } } as const;

@Injectable()
export class WorldQueryService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly world: WorldService,
    private readonly queue: EventQueue,
  ) {}

  onModuleInit(): void {
    this.queue.register('NPC_CAMP_RESPAWN', (tx, ev, emit) => this.respawnCamp(tx, ev.payload as { campId: string; generation: number }, emit));
    this.queue.register('RESOURCE_NODE_RESPAWN', (tx, ev, emit) =>
      this.respawnNode(tx, ev.payload as { nodeId: string; generation: number }, emit),
    );
  }

  async info(): Promise<WorldInfoDto> {
    const w = await this.world.get();
    return {
      id: w.id,
      name: w.name,
      seed: w.seed,
      width: w.width,
      height: w.height,
      chunkSize: w.chunkSize,
      gameSpeed: w.speed.gameSpeed,
      economySpeed: w.speed.economySpeed,
      configVersion: w.configVersion,
      serverTime: new Date().toISOString(),
    };
  }

  /** Entidades dos chunks pedidos + marchas cuja perna atual cruza algum deles. */
  async chunks(chunkIds: ChunkId[], viewerPlayerId: string): Promise<ChunksResponse> {
    const w = await this.world.get();
    const bounds = chunkIds.map((id) => chunkBounds(id, w.chunkSize, w.width, w.height));
    const box = {
      minX: Math.min(...bounds.map((b) => b.minX)),
      maxX: Math.max(...bounds.map((b) => b.maxX)),
      minY: Math.min(...bounds.map((b) => b.minY)),
      maxY: Math.max(...bounds.map((b) => b.maxY)),
    };
    const inBox = { worldId: w.id, x: { gte: box.minX, lte: box.maxX }, y: { gte: box.minY, lte: box.maxY } };
    const [cities, nodes, camps, marches] = await Promise.all([
      this.prisma.city.findMany({ where: inBox, include: { player: true } }),
      this.prisma.resourceNode.findMany({ where: inBox, include: NODE_OCCUPANT_INCLUDE }),
      this.prisma.npcCamp.findMany({ where: inBox }),
      this.prisma.march.findMany({ where: { worldId: w.id, state: { not: 'COMPLETED' } }, include: { player: { select: { displayName: true } } } }),
    ]);
    const now = Date.now();
    const byId = new Map<string, ChunkStateDto>(chunkIds.map((id) => [id, { chunkId: id, cities: [], resourceNodes: [], npcCamps: [] }]));
    const at = (x: number, y: number) => byId.get(chunkOf(x, y, w.chunkSize));
    for (const c of cities) at(c.x, c.y)?.cities.push(toMapCity(c, now));
    for (const n of nodes) at(n.x, n.y)?.resourceNodes.push(toMapNode(n, n.occupiedBy?.player.displayName ?? null));
    for (const c of camps) at(c.x, c.y)?.npcCamps.push(toMapCamp(c));
    const wanted = new Set<string>(chunkIds);
    const visible: MapMarchDto[] = [];
    for (const m of marches) {
      const crossed = chunksCrossedBySegment({ x: m.fromX, y: m.fromY }, { x: m.toX, y: m.toY }, w.chunkSize);
      if (crossed.some((c) => wanted.has(c))) visible.push(toMapMarch(m, m.player.displayName, viewerPlayerId));
    }
    return { chunks: [...byId.values()], marches: visible, serverTime: new Date().toISOString() };
  }

  /** Popup do clique no mapa. */
  async tile(x: number, y: number, viewerPlayerId: string): Promise<TileDetailDto> {
    const w = await this.world.get();
    const where = { worldId_x_y: { worldId: w.id, x, y } };
    const [city, node, camp, myCity] = await Promise.all([
      this.prisma.city.findUnique({ where, include: { player: true } }),
      this.prisma.resourceNode.findUnique({ where, include: NODE_OCCUPANT_INCLUDE }),
      this.prisma.npcCamp.findUnique({ where }),
      this.prisma.city.findUnique({ where: { playerId: viewerPlayerId }, select: { x: true, y: true } }),
    ]);
    const terrain = terrainTile(generateTerrain(w.seed, w.width, w.height), x, y);
    // Prévia com a velocidade base (infantaria, sem bônus).
    const baseSpeed = marchSpeed({ infantry_t1: 1 }, 0, w.speed);
    return {
      x,
      y,
      biome: biomeAt(w.seed, x, y, w.height),
      obstacle: terrain.obstacle,
      chunkId: chunkOf(x, y, w.chunkSize),
      city: city ? toMapCity(city) : null,
      resourceNode: node ? toMapNode(node, node.occupiedBy?.player.displayName ?? null) : null,
      npcCamp: camp ? { ...toMapCamp(camp), recommendedPower: campPower(camp.level) } : null,
      travelMsFromMyCity: myCity ? travelMs(distance(myCity, { x, y }), baseSpeed) : null,
    };
  }

  /** Casas ocupadas (cidade/nó/acampamento) para escolher onde a entidade reaparece. */
  private async occupied(tx: Tx, w: WorldCtx): Promise<Set<string>> {
    const sel = { where: { worldId: w.id }, select: { x: true, y: true } } as const;
    const [a, b, c] = await Promise.all([tx.city.findMany(sel), tx.resourceNode.findMany(sel), tx.npcCamp.findMany(sel)]);
    return new Set([...a, ...b, ...c].map((p) => `${p.x}:${p.y}`));
  }

  /** NPC_CAMP_RESPAWN (GDD 10): volta cheio, em outra casa livre do mesmo bioma. */
  async respawnCamp(tx: Tx, p: { campId: string; generation: number }, emit: EmitBuffer): Promise<void> {
    if (!(await lockCamp(tx, p.campId))) return;
    const camp = await tx.npcCamp.findUniqueOrThrow({ where: { id: p.campId } });
    if (camp.generation !== p.generation || camp.status === 'ACTIVE') return; // idempotente
    const w = await this.world.get();
    const biome = BIOMES_OF_FACTION[camp.campTypeId as CampTypeId] ?? biomeAt(w.seed, camp.x, camp.y, w.height);
    const occupied = await this.occupied(tx, w);
    const salt = `camp:${camp.id}:${camp.generation}`;
    const pos = pickRespawnTile(w.seed, biome, salt, (x, y) => !occupied.has(`${x}:${y}`), w.width, w.height) ?? { x: camp.x, y: camp.y };
    const spawn = makeCampSpawn(pos.x, pos.y, biome, w.height, createRng(w.seed, 'respawn-level', salt));
    const updated = await tx.npcCamp.update({
      where: { id: camp.id },
      data: {
        x: pos.x,
        y: pos.y,
        level: spawn.level,
        campTypeId: npcFactionForLevel(spawn.level),
        status: 'ACTIVE',
        currentTroops: Prisma.DbNull,
        defeatedAt: null,
        respawnAt: null,
        generation: { increment: 1 },
      },
    });
    if (pos.x !== camp.x || pos.y !== camp.y) {
      emit.toChunks([chunkOf(camp.x, camp.y, w.chunkSize)], 'map:entity-updated', { kind: 'removed', entityKind: 'npcCamp', id: camp.id, x: camp.x, y: camp.y });
    }
    emit.toChunks([chunkOf(pos.x, pos.y, w.chunkSize)], 'map:entity-updated', { kind: 'npcCamp', entity: toMapCamp(updated) });
  }

  /** RESOURCE_NODE_RESPAWN (GDD 12): reaparece cheio em outra casa livre do mesmo bioma. */
  async respawnNode(tx: Tx, p: { nodeId: string; generation: number }, emit: EmitBuffer): Promise<void> {
    if (!(await lockNode(tx, p.nodeId))) return;
    const node = await tx.resourceNode.findUniqueOrThrow({ where: { id: p.nodeId } });
    if (node.generation !== p.generation || node.status === 'AVAILABLE') return; // idempotente
    const w = await this.world.get();
    const biome: Biome = biomeAt(w.seed, node.x, node.y, w.height);
    const occupied = await this.occupied(tx, w);
    const salt = `node:${node.id}:${node.generation}`;
    const pos = pickRespawnTile(w.seed, biome, salt, (x, y) => !occupied.has(`${x}:${y}`), w.width, w.height) ?? { x: node.x, y: node.y };
    const spawn = makeNodeSpawn(pos.x, pos.y, biome, w.height, createRng(w.seed, 'respawn-node', salt));
    const updated = await tx.resourceNode.update({
      where: { id: node.id },
      data: {
        x: pos.x,
        y: pos.y,
        resourceType: RESOURCE_TYPE[spawn.resourceType],
        level: spawn.level,
        maxAmount: spawn.maxAmount,
        remaining: spawn.maxAmount,
        status: 'AVAILABLE',
        occupiedByMarchId: null,
        respawnAt: null,
        generation: { increment: 1 },
      },
    });
    if (pos.x !== node.x || pos.y !== node.y) {
      emit.toChunks([chunkOf(node.x, node.y, w.chunkSize)], 'map:entity-updated', { kind: 'removed', entityKind: 'resourceNode', id: node.id, x: node.x, y: node.y });
    }
    emit.toChunks([chunkOf(pos.x, pos.y, w.chunkSize)], 'map:entity-updated', { kind: 'resourceNode', entity: toMapNode(updated, null) });
  }
}

/** Bioma de cada facção NPC (GDD 2.2). */
const BIOMES_OF_FACTION: Record<CampTypeId, Biome> = Object.fromEntries(
  (Object.entries(BIOMES) as [Biome, (typeof BIOMES)[Biome]][]).map(([biome, def]) => [def.faction, biome]),
) as Record<CampTypeId, Biome>;

