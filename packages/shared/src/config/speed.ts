// GDD seção 4 — configuração global de ritmo.

/** Divide todos os timers: obra, treino, cura, viagem, coleta, respawn. */
export const GAME_SPEED = 1;
/** Multiplica produção passiva e velocidade de coleta. */
export const ECONOMY_SPEED = 1;
/** Escudos contam em tempo real (protege quem está offline). */
export const SHIELD_USES_GAME_SPEED = false;
/** Marcha nunca leva menos que isso (depois do GAME_SPEED). */
export const MIN_MARCH_SECONDS = 10;
/** Reset do baú diário e do chamado grátis às 00:00. */
export const DAILY_RESET_TZ = 'America/Sao_Paulo';
/** Brasília sem horário de verão: UTC−3 fixo. */
export const DAILY_RESET_UTC_OFFSET_MINUTES = -180;
/** Seed padrão da geração do mapa. */
export const WORLD_SEED = 'vharos-1';

/** Velocidades efetivas de um mundo (vêm do World no banco; padrão = constantes acima). */
export interface SpeedSettings {
  gameSpeed: number;
  economySpeed: number;
}

export const DEFAULT_SPEED: SpeedSettings = {
  gameSpeed: GAME_SPEED,
  economySpeed: ECONOMY_SPEED,
};

export const SPEED_CONFIG = {
  GAME_SPEED,
  ECONOMY_SPEED,
  SHIELD_USES_GAME_SPEED,
  MIN_MARCH_SECONDS,
  DAILY_RESET_TZ,
  DAILY_RESET_UTC_OFFSET_MINUTES,
  WORLD_SEED,
} as const;
