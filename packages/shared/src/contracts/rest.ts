// DTOs REST (ARQUITETURA 4.2, ajustados ao GDD).
import type { HeroBonuses } from '../formulas/heroes';
import type {
  BuildingTypeId,
  CampTypeId,
  ChestTypeId,
  HeroTypeId,
  ItemId,
  TroopCounts,
  TroopTypeId,
} from '../ids';
import type {
  BattleOutcome,
  Biome,
  ChestSource,
  ChunkId,
  EraId,
  Id,
  IsoDate,
  MarchState,
  MarchTargetKind,
  MarchType,
  ObstacleKind,
  ReportKind,
  ReportRole,
  ResourceKey,
  Resources,
  ShieldKind,
} from './common';


// ── Health ──
export interface HealthResponse {
  ok: true;
  configVersion: string;
  time: IsoDate;
}

// ── Auth ──
export interface RegisterRequest {
  username: string;
  password: string;
  cityName: string;
}
export interface LoginRequest {
  username: string;
  password: string;
}
export interface RefreshRequest {
  refreshToken: string;
}
export interface AuthResponse {
  accessToken: string;
  accessTokenExpiresAt: IsoDate;
  refreshToken: string;
  player: PlayerSelfDto;
}

// ── Jogador ──
export interface PlayerSelfDto {
  id: Id;
  username: string;
  displayName: string;
  cityId: Id;
  /** Cor do escudo heráldico (índice 0..11). */
  bannerColor: number;
  shieldUntil: IsoDate | null;
  shieldKind: ShieldKind | null;
  /** <= serverTime => pode pegar */
  dailyChestAvailableAt: IsoDate;
  /** Chamado grátis da taverna. */
  freeSummonAvailableAt: IsoDate;
  /** Total de chamados feitos (garantia de Épico a cada 10). */
  summonCount: number;
  power: number;
  createdAt: IsoDate;
}
export interface PlayerListItemDto {
  id: Id;
  displayName: string;
  cityId: Id;
  cityName: string;
  cityLevel: number;
  power: number;
  x: number;
  y: number;
}

// ── Mundo ──
export interface WorldInfoDto {
  id: Id;
  name: string;
  seed: string;
  width: number;
  height: number;
  chunkSize: number;
  /** GAME_SPEED do mundo (divide timers). */
  gameSpeed: number;
  /** ECONOMY_SPEED do mundo (produção e coleta). */
  economySpeed: number;
  /** Front compara com CONFIG_VERSION do bundle e avisa "recarregue a página". */
  configVersion: string;
  serverTime: IsoDate;
}
export interface MapCityDto {
  id: Id;
  x: number;
  y: number;
  name: string;
  level: number;
  era: EraId;
  ownerId: Id;
  ownerName: string;
  bannerColor: number;
  shielded: boolean;
  power: number;
}
export interface MapResourceNodeDto {
  id: Id;
  x: number;
  y: number;
  resourceType: ResourceKey;
  level: number;
  remaining: number;
  maxAmount: number;
  status: 'AVAILABLE' | 'DEPLETED';
  occupiedByPlayerName: string | null;
  respawnAt: IsoDate | null;
}
export interface MapNpcCampDto {
  id: Id;
  x: number;
  y: number;
  campTypeId: CampTypeId;
  level: number;
  status: 'ACTIVE' | 'DEFEATED';
  /** 0..1 (tropas restantes / cheio) — não revela composição */
  healthRatio: number;
  respawnAt: IsoDate | null;
}
/** Visão pública de uma marcha no mapa (sem composição de tropas de outros jogadores). */
export interface MapMarchDto {
  id: Id;
  ownerId: Id;
  ownerName: string;
  isMine: boolean;
  type: MarchType;
  state: MarchState;
  targetKind: MarchTargetKind;
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  legStartAt: IsoDate;
  legEndAt: IsoDate;
}
export interface ChunkStateDto {
  chunkId: ChunkId;
  cities: MapCityDto[];
  resourceNodes: MapResourceNodeDto[];
  npcCamps: MapNpcCampDto[];
}
export interface ChunksResponse {
  chunks: ChunkStateDto[];
  /** Marchas cuja perna atual cruza algum dos chunks pedidos (sem duplicar). */
  marches: MapMarchDto[];
  serverTime: IsoDate;
}
export interface TileDetailDto {
  x: number;
  y: number;
  biome: Biome;
  obstacle: ObstacleKind | null;
  chunkId: ChunkId;
  city: MapCityDto | null;
  resourceNode: MapResourceNodeDto | null;
  npcCamp: (MapNpcCampDto & { recommendedPower: number }) | null;
  /** Prévia com a velocidade base. */
  travelMsFromMyCity: number | null;
}

// ── Cidade ──
export interface BuildingDto {
  id: Id;
  slot: number;
  typeId: BuildingTypeId;
  level: number;
  upgradeStartedAt: IsoDate | null;
  upgradeEndsAt: IsoDate | null;
}
export interface TrainingJobDto {
  id: Id;
  troopTypeId: TroopTypeId;
  count: number;
  startsAt: IsoDate;
  endsAt: IsoDate;
}
export type HealingJobDto = TrainingJobDto;
export interface CityStateDto {
  id: Id;
  name: string;
  x: number;
  y: number;
  level: number;
  era: EraId;
  /** Valor já liquidado em resourcesAt. */
  resources: Resources;
  resourcesAt: IsoDate;
  /** Líquida (já com ECONOMY_SPEED e manutenção) — front projeta com projectResources. */
  productionPerHour: Resources;
  upkeepPerHour: number;
  capacity: Resources;
  protected: Resources;
  buildings: BuildingDto[];
  troopsHome: TroopCounts;
  wounded: TroopCounts;
  infirmary: { used: number; capacity: number };
  trainingQueue: TrainingJobDto[];
  healingQueue: HealingJobDto[];
  buildQueue: { active: number; max: number };
  marchSlots: { active: number; max: number };
  marchCapacity: number;
  defenseHeroId: Id | null;
  serverTime: IsoDate;
}
export interface RenameCityRequest {
  name: string;
}
/** O slot define o tipo (cada lote aceita 1 prédio); typeId opcional serve de conferência. */
export interface UpgradeBuildingRequest {
  typeId?: BuildingTypeId;
}
export interface TrainTroopsRequest {
  troopTypeId: TroopTypeId;
  count: number;
}
export interface HealTroopsRequest {
  troopTypeId: TroopTypeId;
  count: number;
}
export interface SetDefenseHeroRequest {
  heroId: Id | null;
}
export type SpeedupTarget =
  | { kind: 'building'; slot: number }
  | { kind: 'training'; jobId: Id }
  | { kind: 'healing'; jobId: Id };
export interface UseSpeedupRequest {
  itemId: ItemId;
  quantity: number;
  target: SpeedupTarget;
}

// ── Heróis, taverna e inventário ──
export interface HeroDto {
  id: Id;
  heroTypeId: HeroTypeId;
  level: number;
  xp: number;
  /** null = nível máximo */
  xpForNextLevel: number | null;
  maxLevel: number;
  canLead: boolean;
  activeMarchId: Id | null;
  isDefenseCommander: boolean;
  /** Calculado no shared a partir de tipo + nível (100%, como principal). */
  bonuses: HeroBonuses;
}
export interface HeroFragmentDto {
  heroTypeId: HeroTypeId;
  count: number;
  /** null = não se libera por fragmento */
  required: number | null;
  unlocked: boolean;
}
export interface TavernStatusDto {
  summonCostGold: number;
  freeSummonAvailableAt: IsoDate;
  summonCount: number;
  /** Quantos chamados faltam para a garantia de Épico. */
  summonsUntilEpic: number;
}
export interface SummonRequest {
  free: boolean;
}
export interface SummonResponse {
  fragments: { heroTypeId: HeroTypeId; count: number; convertedXp: number }[];
  tavern: TavernStatusDto;
}
export interface UnlockHeroRequest {
  heroTypeId: HeroTypeId;
}
export interface UseItemRequest {
  itemId: ItemId;
  quantity: number;
}
export interface InventoryItemDto {
  itemId: ItemId;
  quantity: number;
}

// ── Marchas ──
export interface CreateMarchRequest {
  type: MarchType;
  targetX: number;
  targetY: number;
  commanderHeroId: Id;
  /** 0..2, limitado pela Cidadela */
  secondaryHeroIds: Id[];
  troops: TroopCounts;
}
export interface MarchDto extends MapMarchDto {
  originCityId: Id;
  targetX: number;
  targetY: number;
  targetId: Id | null;
  troops: { troopTypeId: TroopTypeId; sent: number; alive: number; wounded: number }[];
  heroes: { heroId: Id; heroTypeId: HeroTypeId; slot: 0 | 1 | 2 }[];
  /** Casas por minuto. */
  speed: number;
  carryCapacity: number;
  gatherEndsAt: IsoDate | null;
  loot: Resources;
  chestTypeId: ChestTypeId | null;
  createdAt: IsoDate;
}

// ── Relatórios ──
export interface ReportSummaryDto {
  id: Id;
  kind: ReportKind;
  role: ReportRole;
  outcome: BattleOutcome | null;
  x: number;
  y: number;
  createdAt: IsoDate;
  readAt: IsoDate | null;
  /** Jogador ou nome do acampamento. */
  opponentName: string | null;
}
export interface BattleSideReport {
  name: string;
  playerId: Id | null;
  heroes: { heroTypeId: HeroTypeId; level: number; xpGained: number }[];
  troops: { troopTypeId: TroopTypeId; before: number; lost: number; wounded: number; dead: number; after: number }[];
  powerBefore: number;
  powerAfter: number;
}
export interface BattleRoundDto {
  round: number;
  attacker: TroopCounts;
  defender: TroopCounts;
}
export interface BattleReportPayload {
  rounds: number;
  roundLog: BattleRoundDto[];
  attacker: BattleSideReport;
  defender: BattleSideReport;
  /** O que o atacante levou. */
  loot: Resources;
  chestTypeId: ChestTypeId | null;
  /** Trégua aplicada ao defensor (PvP, atacante venceu). */
  defenderTruceUntil: IsoDate | null;
}
export interface GatherReportPayload {
  resourceType: ResourceKey;
  amount: number;
  nodeLevel: number;
  durationMs: number;
  recalled: boolean;
  xpGained: number;
}
export type ReportDetailDto = ReportSummaryDto &
  (
    | { kind: 'GATHER'; payload: GatherReportPayload }
    | { kind: 'BATTLE_NPC' | 'BATTLE_PVP'; payload: BattleReportPayload }
  );
export interface Page<T> {
  items: T[];
  nextCursor: string | null;
}

// ── Baús ──
export interface ChestDto {
  id: Id;
  chestTypeId: ChestTypeId;
  source: ChestSource;
  createdAt: IsoDate;
}
export type ChestRewardDto =
  | { kind: 'resources'; resources: Partial<Resources> }
  | { kind: 'item'; itemId: ItemId; quantity: number }
  /** convertedXp > 0 quando o herói já estava liberado (100 XP por fragmento). */
  | { kind: 'heroFragments'; heroTypeId: HeroTypeId; count: number; convertedXp?: number };
export interface OpenChestResponse {
  chestId: Id;
  rewards: ChestRewardDto[];
  city: CityStateDto;
}
export interface DailyChestStatusDto {
  available: boolean;
  availableAt: IsoDate;
}
