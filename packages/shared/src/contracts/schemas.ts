// Schemas zod dos bodies/params (back valida; front reaproveita nos formulários).
import { z } from 'zod';
import { BUILDING_IDS } from '../config/buildings';
import { CITY_SLOT_COUNT } from '../config/cityLayout';
import { HERO_IDS } from '../config/heroes';
import { ITEM_IDS } from '../config/items';
import { TROOP_IDS } from '../config/troops';
import { WORLD } from '../config/world';
import { isValidChunkId } from '../world/chunks';
import { MAX_SUBSCRIBED_CHUNKS } from './socket';

const enumOf = <T extends string>(values: readonly T[]) => z.enum(values as unknown as [T, ...T[]]);

export const idSchema = z.string().min(1).max(64);
export const buildingTypeIdSchema = enumOf(BUILDING_IDS);
export const troopTypeIdSchema = enumOf(TROOP_IDS);
export const heroTypeIdSchema = enumOf(HERO_IDS);
export const itemIdSchema = enumOf(ITEM_IDS);
export const marchTypeSchema = z.enum(['GATHER', 'ATTACK_NPC', 'ATTACK_PLAYER', 'REINFORCE']);

const TROOP_ID_SET = new Set<string>(TROOP_IDS);

/** { [troopTypeId]: count } só com ids conhecidos e contagens inteiras 1..100.000. */
export const troopCountsSchema = z
  .record(z.string(), z.number().int().min(1).max(100_000))
  .refine((obj) => Object.keys(obj).every((k) => TROOP_ID_SET.has(k)), { message: 'unknown troop type' })
  .refine((obj) => Object.keys(obj).length > 0, { message: 'no troops' });

// ── Auth ──
export const usernameSchema = z
  .string()
  .min(3)
  .max(20)
  .regex(/^[a-zA-Z0-9_]+$/);
export const passwordSchema = z.string().min(8).max(72);
export const cityNameSchema = z.string().trim().min(3).max(24);

export const registerSchema = z.object({ username: usernameSchema, password: passwordSchema, cityName: cityNameSchema }).strict();
export const loginSchema = z.object({ username: z.string().min(1).max(20), password: z.string().min(1).max(72) }).strict();
export const refreshSchema = z.object({ refreshToken: z.string().min(16).max(256) }).strict();

// ── Cidade ──
export const renameCitySchema = z.object({ name: cityNameSchema }).strict();
export const slotParamSchema = z.coerce.number().int().min(0).max(CITY_SLOT_COUNT - 1);
export const upgradeBuildingSchema = z.object({ typeId: buildingTypeIdSchema.optional() }).strict();
export const trainTroopsSchema = z.object({ troopTypeId: troopTypeIdSchema, count: z.number().int().min(1).max(100_000) }).strict();
export const healTroopsSchema = z.object({ troopTypeId: troopTypeIdSchema, count: z.number().int().min(1).max(100_000) }).strict();
export const setDefenseHeroSchema = z.object({ heroId: idSchema.nullable() }).strict();
export const useSpeedupSchema = z
  .object({
    itemId: itemIdSchema,
    quantity: z.number().int().min(1).max(1000),
    target: z.discriminatedUnion('kind', [
      z.object({ kind: z.literal('building'), slot: z.number().int().min(0).max(CITY_SLOT_COUNT - 1) }).strict(),
      z.object({ kind: z.literal('training'), jobId: idSchema }).strict(),
      z.object({ kind: z.literal('healing'), jobId: idSchema }).strict(),
    ]),
  })
  .strict();

// ── Heróis e itens ──
export const useItemSchema = z.object({ itemId: itemIdSchema, quantity: z.number().int().min(1).max(1000) }).strict();
export const summonSchema = z.object({ free: z.boolean() }).strict();
export const unlockHeroSchema = z.object({ heroTypeId: heroTypeIdSchema }).strict();

// ── Mundo e marchas ──
export const coordXSchema = z.number().int().min(0).max(WORLD.width - 1);
export const coordYSchema = z.number().int().min(0).max(WORLD.height - 1);
export const tileParamsSchema = z.object({
  x: z.coerce.number().int().min(0).max(WORLD.width - 1),
  y: z.coerce.number().int().min(0).max(WORLD.height - 1),
});

/** ?ids=3:4,3:5 (máx. 36) */
export const chunkIdsQuerySchema = z
  .string()
  .min(1)
  .transform((s) => [...new Set(s.split(',').map((x) => x.trim()).filter(Boolean))])
  .refine((ids) => ids.length > 0 && ids.length <= MAX_SUBSCRIBED_CHUNKS, { message: 'too many chunks' })
  .refine((ids) => ids.every((id) => isValidChunkId(id)), { message: 'invalid chunk id' });

export const chunksSubscribeSchema = z
  .object({
    chunkIds: z
      .array(z.string())
      .max(MAX_SUBSCRIBED_CHUNKS)
      .refine((ids) => ids.every((id) => isValidChunkId(id)), { message: 'invalid chunk id' }),
  })
  .strict();

export const createMarchSchema = z
  .object({
    type: marchTypeSchema,
    targetX: coordXSchema,
    targetY: coordYSchema,
    commanderHeroId: idSchema,
    secondaryHeroIds: z.array(idSchema).max(2),
    troops: troopCountsSchema,
  })
  .strict()
  .refine((m) => new Set([m.commanderHeroId, ...m.secondaryHeroIds]).size === m.secondaryHeroIds.length + 1, {
    message: 'duplicate hero',
    path: ['secondaryHeroIds'],
  });

export const reportsQuerySchema = z.object({
  cursor: z.string().max(128).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export const idParamSchema = z.object({ id: idSchema });

export type RegisterBody = z.infer<typeof registerSchema>;
export type LoginBody = z.infer<typeof loginSchema>;
export type RefreshBody = z.infer<typeof refreshSchema>;
export type CreateMarchBody = z.infer<typeof createMarchSchema>;
export type TrainTroopsBody = z.infer<typeof trainTroopsSchema>;
export type HealTroopsBody = z.infer<typeof healTroopsSchema>;
export type UseItemBody = z.infer<typeof useItemSchema>;
export type UseSpeedupBody = z.infer<typeof useSpeedupSchema>;
