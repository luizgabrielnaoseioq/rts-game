import type {
  AuthResponse,
  ChestDto,
  ChunkId,
  ChunksResponse,
  CityStateDto,
  CreateMarchRequest,
  DailyChestStatusDto,
  HealTroopsRequest,
  HealthResponse,
  HeroDto,
  HeroFragmentDto,
  Id,
  InventoryItemDto,
  LoginRequest,
  MapCityDto,
  MarchDto,
  OpenChestResponse,
  Page,
  PlayerListItemDto,
  PlayerSelfDto,
  RegisterRequest,
  ReportDetailDto,
  ReportSummaryDto,
  SetDefenseHeroRequest,
  SummonRequest,
  SummonResponse,
  TavernStatusDto,
  TileDetailDto,
  TrainTroopsRequest,
  UnlockHeroRequest,
  UpgradeBuildingRequest,
  UseItemRequest,
  UseSpeedupRequest,
  WorldInfoDto,
} from '@wn/shared';
import { request } from './http';

// Rotas da ARQUITETURA 4.3. As marcadas "(assumida)" não estão na tabela e seguem os DTOs do shared.

export const api = {
  health: () => request<HealthResponse>('/health', { auth: false }),

  // ── auth ──
  register: (b: RegisterRequest) => request<AuthResponse>('/auth/register', { method: 'POST', body: b, auth: false }),
  login: (b: LoginRequest) => request<AuthResponse>('/auth/login', { method: 'POST', body: b, auth: false }),
  logout: (refreshToken: string) =>
    request<void>('/auth/logout', { method: 'POST', body: { refreshToken }, auth: true }),

  // ── jogador ──
  me: () => request<PlayerSelfDto>('/me'),
  players: () => request<PlayerListItemDto[]>('/players'),

  // ── mundo ──
  world: () => request<WorldInfoDto>('/world'),
  chunks: (ids: ChunkId[], signal?: AbortSignal) =>
    request<ChunksResponse>(`/world/chunks?ids=${encodeURIComponent(ids.join(','))}`, { signal }),
  tile: (x: number, y: number) => request<TileDetailDto>(`/world/tiles/${x}/${y}`),
  cityPublic: (id: Id) => request<MapCityDto>(`/cities/${id}`),

  // ── cidade ──
  city: () => request<CityStateDto>('/city'),
  renameCity: (name: string) => request<CityStateDto>('/city', { method: 'PATCH', body: { name } }),
  upgrade: (slot: number, b: UpgradeBuildingRequest) =>
    request<CityStateDto>(`/city/buildings/${slot}/upgrade`, { method: 'POST', body: b }),
  train: (b: TrainTroopsRequest) => request<CityStateDto>('/city/troops/train', { method: 'POST', body: b }),
  /** (assumida) */
  heal: (b: HealTroopsRequest) => request<CityStateDto>('/city/troops/heal', { method: 'POST', body: b }),
  /** (assumida) */
  speedup: (b: UseSpeedupRequest) => request<CityStateDto>('/city/speedup', { method: 'POST', body: b }),
  /** (assumida) */
  setDefenseHero: (b: SetDefenseHeroRequest) => request<CityStateDto>('/city/defense-hero', { method: 'PUT', body: b }),

  // ── heróis, taverna, inventário ──
  heroes: () => request<HeroDto[]>('/heroes'),
  useItemOnHero: (heroId: Id, b: UseItemRequest) =>
    request<HeroDto>(`/heroes/${heroId}/use-item`, { method: 'POST', body: b }),
  /** (assumida) */
  fragments: () => request<HeroFragmentDto[]>('/heroes/fragments'),
  /** (assumida) */
  unlockHero: (b: UnlockHeroRequest) => request<HeroDto>('/heroes/unlock', { method: 'POST', body: b }),
  /** (assumida) */
  tavern: () => request<TavernStatusDto>('/tavern'),
  /** (assumida) */
  summon: (b: SummonRequest) => request<SummonResponse>('/tavern/summon', { method: 'POST', body: b }),
  inventory: () => request<InventoryItemDto[]>('/inventory'),

  // ── marchas ──
  marches: () => request<MarchDto[]>('/marches'),
  march: (id: Id) => request<MarchDto>(`/marches/${id}`),
  createMarch: (b: CreateMarchRequest) => request<MarchDto>('/marches', { method: 'POST', body: b }),
  recall: (id: Id) => request<MarchDto>(`/marches/${id}/recall`, { method: 'POST' }),

  // ── relatórios ──
  reports: (cursor?: string | null, limit = 20) =>
    request<Page<ReportSummaryDto>>(`/reports?limit=${limit}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`),
  report: (id: Id) => request<ReportDetailDto>(`/reports/${id}`),
  readReport: (id: Id) => request<void>(`/reports/${id}/read`, { method: 'POST' }),

  // ── baús ──
  chests: () => request<ChestDto[]>('/chests'),
  daily: () => request<DailyChestStatusDto>('/chests/daily'),
  claimDaily: () => request<ChestDto>('/chests/daily/claim', { method: 'POST' }),
  openChest: (id: Id) => request<OpenChestResponse>(`/chests/${id}/open`, { method: 'POST' }),
};
