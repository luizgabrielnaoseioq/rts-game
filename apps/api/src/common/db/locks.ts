// Locks pessimistas. Ordem fixa em todo o código: cidades (por id) → marchas (por id) → nó/acampamento/baú.
import type { Tx } from '../prisma/prisma.service';

type IdRow = { id: string };

export async function lockCity(tx: Tx, cityId: string): Promise<boolean> {
  const rows = await tx.$queryRaw<IdRow[]>`SELECT id FROM cities WHERE id = ${cityId} FOR UPDATE`;
  return rows.length > 0;
}

/** Trava várias cidades em ordem de id (PvP, reforços), evitando deadlock. */
export async function lockCitiesOrdered(tx: Tx, cityIds: readonly string[]): Promise<void> {
  for (const id of [...new Set(cityIds)].sort()) await lockCity(tx, id);
}

export async function lockMarch(tx: Tx, marchId: string): Promise<boolean> {
  const rows = await tx.$queryRaw<IdRow[]>`SELECT id FROM marches WHERE id = ${marchId} FOR UPDATE`;
  return rows.length > 0;
}

export async function lockNode(tx: Tx, nodeId: string): Promise<boolean> {
  const rows = await tx.$queryRaw<IdRow[]>`SELECT id FROM resource_nodes WHERE id = ${nodeId} FOR UPDATE`;
  return rows.length > 0;
}

export async function lockCamp(tx: Tx, campId: string): Promise<boolean> {
  const rows = await tx.$queryRaw<IdRow[]>`SELECT id FROM npc_camps WHERE id = ${campId} FOR UPDATE`;
  return rows.length > 0;
}

export async function lockPlayer(tx: Tx, playerId: string): Promise<boolean> {
  const rows = await tx.$queryRaw<IdRow[]>`SELECT id FROM players WHERE id = ${playerId} FOR UPDATE`;
  return rows.length > 0;
}

export async function lockChest(tx: Tx, chestId: string, playerId: string): Promise<boolean> {
  const rows = await tx.$queryRaw<IdRow[]>`SELECT id FROM chests WHERE id = ${chestId} AND "playerId" = ${playerId} FOR UPDATE`;
  return rows.length > 0;
}

/** Serializa um trecho por chave dentro da transação (ex.: posicionamento de cidade). */
export async function advisoryXactLock(tx: Tx, key: string): Promise<void> {
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${key}))::text AS ok`;
}
