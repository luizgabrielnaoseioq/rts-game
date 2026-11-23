import type { ErrorCode } from '@wn/shared';

/** ErrorCode do back -> texto pt-BR para a tela. */
export const ERROR_TEXT: Record<ErrorCode, string> = {
  VALIDATION_FAILED: 'Dados inválidos. Confira os campos.',
  UNAUTHORIZED: 'Sua sessão expirou. Entre de novo.',
  FORBIDDEN: 'Você não pode fazer isso.',
  NOT_FOUND: 'Não encontrado.',
  RATE_LIMITED: 'Calma! Muitas tentativas. Espere um pouco.',
  USERNAME_TAKEN: 'Esse nome de usuário já existe.',
  INVALID_CREDENTIALS: 'Usuário ou senha incorretos.',
  WORLD_FULL: 'O mundo está cheio. Não há lugar para uma nova Casa.',
  INSUFFICIENT_RESOURCES: 'Recursos insuficientes.',
  BUILD_QUEUE_FULL: 'A fila de obras está cheia.',
  REQUIREMENT_NOT_MET: 'Requisitos não atendidos.',
  MAX_LEVEL_REACHED: 'Nível máximo alcançado.',
  SLOT_TYPE_NOT_ALLOWED: 'Esse prédio não cabe nesse lote.',
  NOTHING_TO_CANCEL: 'Não há nada para cancelar.',
  TRAINING_QUEUE_FULL: 'A fila do quartel está cheia.',
  HEALING_QUEUE_FULL: 'A fila da enfermaria está cheia.',
  NOT_ENOUGH_WOUNDED: 'Não há feridos suficientes.',
  BATCH_TOO_LARGE: 'Lote grande demais para o nível do quartel.',
  TROOP_LOCKED: 'Essa tropa ainda não foi liberada pelo quartel.',
  COMMANDER_REQUIRED: 'Escolha um comandante para a marcha.',
  HERO_CANNOT_LEAD: 'Esse herói não pode comandar.',
  HERO_BUSY: 'Herói ocupado em outra marcha.',
  HERO_LOCKED: 'Herói ainda não liberado.',
  HERO_MAX_LEVEL: 'O herói já está no nível máximo.',
  NOT_ENOUGH_FRAGMENTS: 'Fragmentos insuficientes.',
  TOO_MANY_HEROES: 'Heróis demais para essa marcha.',
  NOT_ENOUGH_TROOPS: 'Tropas insuficientes em casa.',
  NO_TROOPS: 'Escolha pelo menos uma tropa.',
  MARCH_CAPACITY_EXCEEDED: 'Tropas acima da capacidade de marcha da Cidadela.',
  MARCH_LIMIT_REACHED: 'Todas as marchas estão ocupadas.',
  TARGET_INVALID: 'Não há nada desse tipo nessa casa.',
  TARGET_OWN_CITY: 'Não dá para atacar a própria cidade.',
  TARGET_SHIELDED: 'O alvo está protegido por escudo.',
  TARGET_DEPLETED: 'O nó de recurso está esgotado.',
  TARGET_LEVEL_TOO_LOW: 'A Cidadela do alvo é baixa demais para atacar.',
  REINFORCE_CAPACITY_FULL: 'A cidade já tem reforços demais.',
  MARCH_NOT_RECALLABLE: 'Essa marcha não pode ser chamada de volta.',
  CHEST_ALREADY_OPENED: 'Esse baú já foi aberto.',
  DAILY_CHEST_NOT_READY: 'A Oferenda do Braseiro ainda não está pronta.',
  FREE_SUMMON_NOT_READY: 'O chamado grátis ainda não está disponível.',
  NOT_ENOUGH_ITEMS: 'Itens insuficientes.',
  ITEM_NOT_USABLE: 'Esse item não pode ser usado assim.',
  INTERNAL: 'Erro no servidor. Tente de novo.',
};

export function errorText(code: string | undefined | null): string {
  if (!code) return 'Algo deu errado.';
  return (ERROR_TEXT as Record<string, string>)[code] ?? 'Algo deu errado.';
}
