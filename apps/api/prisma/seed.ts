// Cria o World e materializa nós/acampamentos a partir da seed (idempotente).
// Roda com: pnpm --filter api db:seed (precisa do @wn/shared buildado).
import { PrismaClient, ResourceType } from '@prisma/client';
import { CONFIG_VERSION, WORLD, WORLD_SEED, generateSpawns, type ResourceKey } from '@wn/shared';

const prisma = new PrismaClient();

const RESOURCE_TYPE: Record<ResourceKey, ResourceType> = {
  food: ResourceType.FOOD,
  wood: ResourceType.WOOD,
  stone: ResourceType.STONE,
  gold: ResourceType.GOLD,
};

async function main(): Promise<void> {
  const seed = process.env.WORLD_SEED || WORLD_SEED;
  const gameSpeed = Number(process.env.WORLD_GAME_SPEED || 1);
  const economySpeed = Number(process.env.WORLD_ECONOMY_SPEED || 1);

  let world = await prisma.world.findFirst({ where: { seed } });
  if (!world) {
    world = await prisma.world.create({
      data: {
        name: 'Vharos',
        seed,
        width: WORLD.width,
        height: WORLD.height,
        chunkSize: WORLD.chunkSize,
        gameSpeed,
        economySpeed,
        configVersion: CONFIG_VERSION,
      },
    });
    console.log(`World criado: ${world.id} (seed "${seed}", config ${CONFIG_VERSION})`);
  } else {
    console.log(`World já existe: ${world.id} (seed "${seed}")`);
  }

  const [nodeCount, campCount] = await Promise.all([
    prisma.resourceNode.count({ where: { worldId: world.id } }),
    prisma.npcCamp.count({ where: { worldId: world.id } }),
  ]);

  // Só materializa quando está vazio: depois do primeiro respawn as entidades mudam de casa,
  // e recriar pela seed duplicaria o mundo.
  const spawns = generateSpawns(seed, world.width, world.height);

  if (nodeCount === 0) {
    const r = await prisma.resourceNode.createMany({
      data: spawns.resourceNodes.map((n) => ({
        worldId: world.id,
        x: n.x,
        y: n.y,
        resourceType: RESOURCE_TYPE[n.resourceType],
        level: n.level,
        maxAmount: n.maxAmount,
        remaining: n.maxAmount,
      })),
      skipDuplicates: true,
    });
    console.log(`Nós de recurso criados: ${r.count}`);
  } else {
    console.log(`Nós de recurso já existem: ${nodeCount}`);
  }

  if (campCount === 0) {
    const r = await prisma.npcCamp.createMany({
      data: spawns.npcCamps.map((c) => ({
        worldId: world.id,
        x: c.x,
        y: c.y,
        campTypeId: c.campTypeId,
        level: c.level,
      })),
      skipDuplicates: true,
    });
    console.log(`Acampamentos NPC criados: ${r.count}`);
  } else {
    console.log(`Acampamentos NPC já existem: ${campCount}`);
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
