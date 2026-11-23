import { z } from 'zod';

const bool = z
  .string()
  .optional()
  .transform((v) => v === 'true' || v === '1');

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().positive().default(5001),
  DATABASE_URL: z.string().min(1),
  JWT_ACCESS_SECRET: z.string().min(32),
  JWT_ACCESS_TTL: z.string().default('1h'),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(30),
  CORS_ORIGINS: z
    .string()
    .default('http://localhost:5000')
    .transform((s) => s.split(',').map((o) => o.trim()).filter(Boolean)),
  BCRYPT_ROUNDS: z.coerce.number().int().min(4).max(15).default(12),
  SCHEDULER_ENABLED: bool,
  SCHEDULER_INTERVAL_MS: z.coerce.number().int().positive().default(1000),
  SCHEDULER_BATCH: z.coerce.number().int().positive().default(50),
  WORLD_SEED: z.string().default('vharos-1'),
  WORLD_GAME_SPEED: z.coerce.number().positive().default(1),
  WORLD_ECONOMY_SPEED: z.coerce.number().positive().default(1),
  /** Só dev/teste: sobrescreve World.gameSpeed/economySpeed lidos do banco (lido no boot). */
  GAME_SPEED_OVERRIDE: z.coerce.number().positive().optional(),
  ECONOMY_SPEED_OVERRIDE: z.coerce.number().positive().optional(),
  LOG_LEVEL: z.enum(['error', 'warn', 'info', 'debug', 'verbose']).default('info'),
});

export type Env = z.infer<typeof envSchema>;

/** Valida process.env no boot; falha cedo com a lista do que está errado. */
function loadEnv(): Env {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Variáveis de ambiente inválidas:\n${issues}`);
  }
  return parsed.data;
}

export const env: Env = loadEnv();
