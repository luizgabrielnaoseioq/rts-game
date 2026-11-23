import {
  BIOMES,
  BUILDINGS,
  ERAS,
  HEROES,
  ITEMS,
  CHESTS,
  NPC_FACTIONS,
  OBSTACLES,
  RESOURCES,
  TROOPS,
  type BattleOutcome,
  type Biome,
  type BuildingTypeId,
  type CampTypeId,
  type ChestSource,
  type ChestTypeId,
  type EraId,
  type HeroTypeId,
  type ItemId,
  type MarchArrivalResult,
  type MarchState,
  type MarchType,
  type ObstacleKind,
  type ReportKind,
  type ResourceKey,
  type TroopTypeId,
} from '@wn/shared';

// Nomes vêm da config do shared; aqui só o que não está lá.

export const buildingName = (id: BuildingTypeId) => BUILDINGS[id]?.name ?? id;
export const troopName = (id: TroopTypeId) => TROOPS[id]?.name ?? id;
export const heroName = (id: HeroTypeId) => HEROES[id]?.name ?? id;
export const itemName = (id: ItemId) => ITEMS[id]?.name ?? id;
export const chestName = (id: ChestTypeId) => CHESTS[id]?.name ?? id;
export const resourceName = (k: ResourceKey) => RESOURCES[k].name;
export const biomeName = (b: Biome) => BIOMES[b]?.name ?? b;
export const eraName = (e: EraId) => ERAS[e]?.name ?? e;
export const factionName = (id: CampTypeId) => NPC_FACTIONS[id]?.name ?? id;
export const obstacleName = (o: ObstacleKind) => OBSTACLES[o]?.name ?? o;

export const MARCH_TYPE_LABEL: Record<MarchType, string> = {
  GATHER: 'Coleta',
  ATTACK_NPC: 'Ataque a acampamento',
  ATTACK_PLAYER: 'Ataque a cidade',
  REINFORCE: 'Reforço',
};

export const MARCH_STATE_LABEL: Record<MarchState, string> = {
  OUTBOUND: 'A caminho',
  GATHERING: 'Coletando',
  STATIONED: 'Estacionada',
  RETURNING: 'Voltando',
  COMPLETED: 'Concluída',
};

export const ARRIVAL_LABEL: Record<MarchArrivalResult, string> = {
  GATHERING: 'Sua marcha chegou e começou a coletar.',
  BATTLE: 'Sua marcha chegou e entrou em combate.',
  STATIONED: 'Sua marcha chegou e está estacionada.',
  TARGET_GONE: 'O alvo sumiu antes da chegada. A marcha está voltando.',
  TARGET_SHIELDED: 'O alvo ergueu um escudo. A marcha está voltando.',
  NODE_OCCUPIED: 'O nó já estava ocupado. A marcha está voltando vazia.',
};

export const REPORT_KIND_LABEL: Record<ReportKind, string> = {
  GATHER: 'Coleta',
  BATTLE_NPC: 'Batalha contra acampamento',
  BATTLE_PVP: 'Batalha contra Casa',
};

export const OUTCOME_LABEL: Record<BattleOutcome, string> = {
  ATTACKER_WON: 'Atacante venceu',
  DEFENDER_WON: 'Defensor venceu',
  DRAW: 'Empate',
};

export const CHEST_SOURCE_LABEL: Record<ChestSource, string> = {
  STARTER: 'Inicial',
  DAILY: 'Diário',
  NPC_VICTORY: 'Vitória contra acampamento',
  ADMIN: 'Presente',
};

/**
 * 12 cores de estandarte (índice = PlayerSelfDto.bannerColor).
 * O shared ainda não define essa paleta; ver relatório.
 */
export const BANNER_COLORS: readonly string[] = [
  '#B3261E', // vermelho-brasa
  '#C9A24A', // ouro
  '#2E6B9E', // azul-aço
  '#4F7A3A', // verde-musgo
  '#6B3FA0', // púrpura
  '#D97A1E', // laranja
  '#1E7F7A', // verde-mar
  '#8A8F98', // prata
  '#7A2E4F', // vinho
  '#3B3B8F', // índigo
  '#A6612E', // cobre
  '#2B2B2B', // negro
];

export function bannerColor(index: number | null | undefined): string {
  if (index == null || !Number.isFinite(index)) return BANNER_COLORS[0];
  const n = BANNER_COLORS.length;
  return BANNER_COLORS[((Math.floor(index) % n) + n) % n];
}
