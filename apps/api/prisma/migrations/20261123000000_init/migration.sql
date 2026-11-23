-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('PLAYER', 'ADMIN');

-- CreateEnum
CREATE TYPE "WorldStatus" AS ENUM ('ACTIVE', 'PAUSED', 'ENDED');

-- CreateEnum
CREATE TYPE "ResourceType" AS ENUM ('FOOD', 'WOOD', 'STONE', 'GOLD');

-- CreateEnum
CREATE TYPE "ResourceNodeStatus" AS ENUM ('AVAILABLE', 'DEPLETED');

-- CreateEnum
CREATE TYPE "NpcCampStatus" AS ENUM ('ACTIVE', 'DEFEATED');

-- CreateEnum
CREATE TYPE "MarchType" AS ENUM ('GATHER', 'ATTACK_NPC', 'ATTACK_PLAYER', 'REINFORCE');

-- CreateEnum
CREATE TYPE "MarchState" AS ENUM ('OUTBOUND', 'GATHERING', 'STATIONED', 'RETURNING', 'COMPLETED');

-- CreateEnum
CREATE TYPE "MarchTargetKind" AS ENUM ('RESOURCE_NODE', 'NPC_CAMP', 'CITY');

-- CreateEnum
CREATE TYPE "ReportKind" AS ENUM ('GATHER', 'BATTLE_NPC', 'BATTLE_PVP');

-- CreateEnum
CREATE TYPE "ReportRole" AS ENUM ('ATTACKER', 'DEFENDER', 'GATHERER');

-- CreateEnum
CREATE TYPE "BattleOutcome" AS ENUM ('ATTACKER_WON', 'DEFENDER_WON', 'DRAW');

-- CreateEnum
CREATE TYPE "ChestSource" AS ENUM ('STARTER', 'DAILY', 'NPC_VICTORY', 'ADMIN');

-- CreateEnum
CREATE TYPE "ScheduledEventType" AS ENUM ('BUILDING_COMPLETE', 'TRAINING_COMPLETE', 'HEALING_COMPLETE', 'MARCH_ARRIVE', 'GATHER_COMPLETE', 'MARCH_RETURN', 'NPC_CAMP_RESPAWN', 'RESOURCE_NODE_RESPAWN');

-- CreateEnum
CREATE TYPE "ShieldKind" AS ENUM ('NEWBIE', 'TRUCE');

-- CreateEnum
CREATE TYPE "ScheduledEventStatus" AS ENUM ('PENDING', 'DONE', 'CANCELLED', 'FAILED');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "usernameNormalized" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'PLAYER',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastLoginAt" TIMESTAMPTZ(3),

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refresh_tokens" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "revokedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "worlds" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "seed" TEXT NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "chunkSize" INTEGER NOT NULL DEFAULT 16,
    "gameSpeed" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "economySpeed" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "configVersion" TEXT NOT NULL,
    "status" "WorldStatus" NOT NULL DEFAULT 'ACTIVE',
    "startedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "worlds_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "players" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "worldId" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "bannerColor" INTEGER NOT NULL DEFAULT 0,
    "shieldUntil" TIMESTAMPTZ(3),
    "shieldKind" "ShieldKind",
    "lastDailyChestAt" TIMESTAMPTZ(3),
    "lastFreeSummonAt" TIMESTAMPTZ(3),
    "summonCount" INTEGER NOT NULL DEFAULT 0,
    "power" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "players_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cities" (
    "id" TEXT NOT NULL,
    "worldId" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "x" INTEGER NOT NULL,
    "y" INTEGER NOT NULL,
    "level" INTEGER NOT NULL DEFAULT 1,
    "food" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "wood" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "stone" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "gold" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "resourcesUpdatedAt" TIMESTAMPTZ(3) NOT NULL,
    "defenseHeroId" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "buildings" (
    "id" TEXT NOT NULL,
    "cityId" TEXT NOT NULL,
    "slot" INTEGER NOT NULL,
    "typeId" TEXT NOT NULL,
    "level" INTEGER NOT NULL DEFAULT 0,
    "upgradeStartedAt" TIMESTAMPTZ(3),
    "upgradeEndsAt" TIMESTAMPTZ(3),
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "buildings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "troop_stacks" (
    "cityId" TEXT NOT NULL,
    "troopTypeId" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "wounded" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "troop_stacks_pkey" PRIMARY KEY ("cityId","troopTypeId")
);

-- CreateTable
CREATE TABLE "training_jobs" (
    "id" TEXT NOT NULL,
    "cityId" TEXT NOT NULL,
    "troopTypeId" TEXT NOT NULL,
    "count" INTEGER NOT NULL,
    "startsAt" TIMESTAMPTZ(3) NOT NULL,
    "endsAt" TIMESTAMPTZ(3) NOT NULL,
    "completedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "training_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "healing_jobs" (
    "id" TEXT NOT NULL,
    "cityId" TEXT NOT NULL,
    "troopTypeId" TEXT NOT NULL,
    "count" INTEGER NOT NULL,
    "startsAt" TIMESTAMPTZ(3) NOT NULL,
    "endsAt" TIMESTAMPTZ(3) NOT NULL,
    "completedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "healing_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "heroes" (
    "id" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "heroTypeId" TEXT NOT NULL,
    "level" INTEGER NOT NULL DEFAULT 1,
    "xp" INTEGER NOT NULL DEFAULT 0,
    "activeMarchId" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "heroes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hero_fragments" (
    "playerId" TEXT NOT NULL,
    "heroTypeId" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "hero_fragments_pkey" PRIMARY KEY ("playerId","heroTypeId")
);

-- CreateTable
CREATE TABLE "inventory_items" (
    "playerId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "inventory_items_pkey" PRIMARY KEY ("playerId","itemId")
);

-- CreateTable
CREATE TABLE "resource_nodes" (
    "id" TEXT NOT NULL,
    "worldId" TEXT NOT NULL,
    "x" INTEGER NOT NULL,
    "y" INTEGER NOT NULL,
    "resourceType" "ResourceType" NOT NULL,
    "level" INTEGER NOT NULL,
    "maxAmount" INTEGER NOT NULL,
    "remaining" INTEGER NOT NULL,
    "status" "ResourceNodeStatus" NOT NULL DEFAULT 'AVAILABLE',
    "occupiedByMarchId" TEXT,
    "respawnAt" TIMESTAMPTZ(3),
    "generation" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "resource_nodes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "npc_camps" (
    "id" TEXT NOT NULL,
    "worldId" TEXT NOT NULL,
    "x" INTEGER NOT NULL,
    "y" INTEGER NOT NULL,
    "campTypeId" TEXT NOT NULL,
    "level" INTEGER NOT NULL,
    "status" "NpcCampStatus" NOT NULL DEFAULT 'ACTIVE',
    "currentTroops" JSONB,
    "defeatedAt" TIMESTAMPTZ(3),
    "respawnAt" TIMESTAMPTZ(3),
    "generation" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "npc_camps_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "marches" (
    "id" TEXT NOT NULL,
    "worldId" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "originCityId" TEXT NOT NULL,
    "type" "MarchType" NOT NULL,
    "state" "MarchState" NOT NULL,
    "targetKind" "MarchTargetKind" NOT NULL,
    "targetX" INTEGER NOT NULL,
    "targetY" INTEGER NOT NULL,
    "targetResourceNodeId" TEXT,
    "targetNpcCampId" TEXT,
    "targetCityId" TEXT,
    "fromX" DOUBLE PRECISION NOT NULL,
    "fromY" DOUBLE PRECISION NOT NULL,
    "toX" DOUBLE PRECISION NOT NULL,
    "toY" DOUBLE PRECISION NOT NULL,
    "legStartAt" TIMESTAMPTZ(3) NOT NULL,
    "legEndAt" TIMESTAMPTZ(3) NOT NULL,
    "speed" DOUBLE PRECISION NOT NULL,
    "carryCapacity" INTEGER NOT NULL,
    "gatherStartedAt" TIMESTAMPTZ(3),
    "gatherEndsAt" TIMESTAMPTZ(3),
    "lootFood" INTEGER NOT NULL DEFAULT 0,
    "lootWood" INTEGER NOT NULL DEFAULT 0,
    "lootStone" INTEGER NOT NULL DEFAULT 0,
    "lootGold" INTEGER NOT NULL DEFAULT 0,
    "chestTypeId" TEXT,
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMPTZ(3),

    CONSTRAINT "marches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "march_troops" (
    "marchId" TEXT NOT NULL,
    "troopTypeId" TEXT NOT NULL,
    "sent" INTEGER NOT NULL,
    "alive" INTEGER NOT NULL,
    "wounded" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "march_troops_pkey" PRIMARY KEY ("marchId","troopTypeId")
);

-- CreateTable
CREATE TABLE "march_heroes" (
    "marchId" TEXT NOT NULL,
    "heroId" TEXT NOT NULL,
    "slot" INTEGER NOT NULL,

    CONSTRAINT "march_heroes_pkey" PRIMARY KEY ("marchId","slot")
);

-- CreateTable
CREATE TABLE "reports" (
    "id" TEXT NOT NULL,
    "worldId" TEXT NOT NULL,
    "kind" "ReportKind" NOT NULL,
    "outcome" "BattleOutcome",
    "x" INTEGER NOT NULL,
    "y" INTEGER NOT NULL,
    "marchId" TEXT,
    "attackerPlayerId" TEXT,
    "defenderPlayerId" TEXT,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "report_recipients" (
    "reportId" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "role" "ReportRole" NOT NULL,
    "readAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "report_recipients_pkey" PRIMARY KEY ("reportId","playerId")
);

-- CreateTable
CREATE TABLE "chests" (
    "id" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "chestTypeId" TEXT NOT NULL,
    "source" "ChestSource" NOT NULL,
    "sourceRef" TEXT,
    "openedAt" TIMESTAMPTZ(3),
    "rewards" JSONB,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scheduled_events" (
    "id" TEXT NOT NULL,
    "type" "ScheduledEventType" NOT NULL,
    "status" "ScheduledEventStatus" NOT NULL DEFAULT 'PENDING',
    "runAt" TIMESTAMPTZ(3) NOT NULL,
    "payload" JSONB NOT NULL,
    "dedupeKey" TEXT NOT NULL,
    "marchId" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMPTZ(3),

    CONSTRAINT "scheduled_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_usernameNormalized_key" ON "users"("usernameNormalized");

-- CreateIndex
CREATE UNIQUE INDEX "refresh_tokens_tokenHash_key" ON "refresh_tokens"("tokenHash");

-- CreateIndex
CREATE INDEX "refresh_tokens_userId_idx" ON "refresh_tokens"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "players_userId_key" ON "players"("userId");

-- CreateIndex
CREATE INDEX "players_worldId_power_idx" ON "players"("worldId", "power");

-- CreateIndex
CREATE UNIQUE INDEX "players_worldId_displayName_key" ON "players"("worldId", "displayName");

-- CreateIndex
CREATE UNIQUE INDEX "cities_playerId_key" ON "cities"("playerId");

-- CreateIndex
CREATE UNIQUE INDEX "cities_defenseHeroId_key" ON "cities"("defenseHeroId");

-- CreateIndex
CREATE UNIQUE INDEX "cities_worldId_x_y_key" ON "cities"("worldId", "x", "y");

-- CreateIndex
CREATE INDEX "buildings_cityId_upgradeEndsAt_idx" ON "buildings"("cityId", "upgradeEndsAt");

-- CreateIndex
CREATE UNIQUE INDEX "buildings_cityId_slot_key" ON "buildings"("cityId", "slot");

-- CreateIndex
CREATE INDEX "training_jobs_cityId_completedAt_endsAt_idx" ON "training_jobs"("cityId", "completedAt", "endsAt");

-- CreateIndex
CREATE INDEX "healing_jobs_cityId_completedAt_endsAt_idx" ON "healing_jobs"("cityId", "completedAt", "endsAt");

-- CreateIndex
CREATE INDEX "heroes_activeMarchId_idx" ON "heroes"("activeMarchId");

-- CreateIndex
CREATE UNIQUE INDEX "heroes_playerId_heroTypeId_key" ON "heroes"("playerId", "heroTypeId");

-- CreateIndex
CREATE UNIQUE INDEX "resource_nodes_occupiedByMarchId_key" ON "resource_nodes"("occupiedByMarchId");

-- CreateIndex
CREATE UNIQUE INDEX "resource_nodes_worldId_x_y_key" ON "resource_nodes"("worldId", "x", "y");

-- CreateIndex
CREATE INDEX "npc_camps_status_respawnAt_idx" ON "npc_camps"("status", "respawnAt");

-- CreateIndex
CREATE UNIQUE INDEX "npc_camps_worldId_x_y_key" ON "npc_camps"("worldId", "x", "y");

-- CreateIndex
CREATE INDEX "marches_worldId_state_idx" ON "marches"("worldId", "state");

-- CreateIndex
CREATE INDEX "marches_playerId_state_idx" ON "marches"("playerId", "state");

-- CreateIndex
CREATE INDEX "marches_targetCityId_state_idx" ON "marches"("targetCityId", "state");

-- CreateIndex
CREATE INDEX "march_heroes_heroId_idx" ON "march_heroes"("heroId");

-- CreateIndex
CREATE UNIQUE INDEX "march_heroes_marchId_heroId_key" ON "march_heroes"("marchId", "heroId");

-- CreateIndex
CREATE INDEX "reports_worldId_createdAt_idx" ON "reports"("worldId", "createdAt");

-- CreateIndex
CREATE INDEX "report_recipients_playerId_createdAt_idx" ON "report_recipients"("playerId", "createdAt");

-- CreateIndex
CREATE INDEX "chests_playerId_openedAt_idx" ON "chests"("playerId", "openedAt");

-- CreateIndex
CREATE UNIQUE INDEX "scheduled_events_dedupeKey_key" ON "scheduled_events"("dedupeKey");

-- CreateIndex
CREATE INDEX "scheduled_events_status_runAt_idx" ON "scheduled_events"("status", "runAt");

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "players" ADD CONSTRAINT "players_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "players" ADD CONSTRAINT "players_worldId_fkey" FOREIGN KEY ("worldId") REFERENCES "worlds"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cities" ADD CONSTRAINT "cities_worldId_fkey" FOREIGN KEY ("worldId") REFERENCES "worlds"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cities" ADD CONSTRAINT "cities_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "players"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cities" ADD CONSTRAINT "cities_defenseHeroId_fkey" FOREIGN KEY ("defenseHeroId") REFERENCES "heroes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "buildings" ADD CONSTRAINT "buildings_cityId_fkey" FOREIGN KEY ("cityId") REFERENCES "cities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "troop_stacks" ADD CONSTRAINT "troop_stacks_cityId_fkey" FOREIGN KEY ("cityId") REFERENCES "cities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "training_jobs" ADD CONSTRAINT "training_jobs_cityId_fkey" FOREIGN KEY ("cityId") REFERENCES "cities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "healing_jobs" ADD CONSTRAINT "healing_jobs_cityId_fkey" FOREIGN KEY ("cityId") REFERENCES "cities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "heroes" ADD CONSTRAINT "heroes_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "players"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "heroes" ADD CONSTRAINT "heroes_activeMarchId_fkey" FOREIGN KEY ("activeMarchId") REFERENCES "marches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hero_fragments" ADD CONSTRAINT "hero_fragments_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "players"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_items" ADD CONSTRAINT "inventory_items_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "players"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "resource_nodes" ADD CONSTRAINT "resource_nodes_worldId_fkey" FOREIGN KEY ("worldId") REFERENCES "worlds"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "resource_nodes" ADD CONSTRAINT "resource_nodes_occupiedByMarchId_fkey" FOREIGN KEY ("occupiedByMarchId") REFERENCES "marches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "npc_camps" ADD CONSTRAINT "npc_camps_worldId_fkey" FOREIGN KEY ("worldId") REFERENCES "worlds"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "marches" ADD CONSTRAINT "marches_worldId_fkey" FOREIGN KEY ("worldId") REFERENCES "worlds"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "marches" ADD CONSTRAINT "marches_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "players"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "marches" ADD CONSTRAINT "marches_originCityId_fkey" FOREIGN KEY ("originCityId") REFERENCES "cities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "marches" ADD CONSTRAINT "marches_targetResourceNodeId_fkey" FOREIGN KEY ("targetResourceNodeId") REFERENCES "resource_nodes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "marches" ADD CONSTRAINT "marches_targetNpcCampId_fkey" FOREIGN KEY ("targetNpcCampId") REFERENCES "npc_camps"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "marches" ADD CONSTRAINT "marches_targetCityId_fkey" FOREIGN KEY ("targetCityId") REFERENCES "cities"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "march_troops" ADD CONSTRAINT "march_troops_marchId_fkey" FOREIGN KEY ("marchId") REFERENCES "marches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "march_heroes" ADD CONSTRAINT "march_heroes_marchId_fkey" FOREIGN KEY ("marchId") REFERENCES "marches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "march_heroes" ADD CONSTRAINT "march_heroes_heroId_fkey" FOREIGN KEY ("heroId") REFERENCES "heroes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reports" ADD CONSTRAINT "reports_worldId_fkey" FOREIGN KEY ("worldId") REFERENCES "worlds"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "report_recipients" ADD CONSTRAINT "report_recipients_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "reports"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "report_recipients" ADD CONSTRAINT "report_recipients_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "players"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chests" ADD CONSTRAINT "chests_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "players"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scheduled_events" ADD CONSTRAINT "scheduled_events_marchId_fkey" FOREIGN KEY ("marchId") REFERENCES "marches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

