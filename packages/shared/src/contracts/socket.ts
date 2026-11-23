// Eventos Socket.IO tipados (ARQUITETURA 4.4).
import type { TroopCounts, TroopTypeId } from '../ids';
import type { ChunkId, Id, IsoDate, Resources, ShieldKind } from './common';
import type { ErrorCode } from './errors';
import type {
  BuildingDto,
  ChestDto,
  HeroDto,
  MapCityDto,
  MapMarchDto,
  MapNpcCampDto,
  MapResourceNodeDto,
  ReportSummaryDto,
} from './rest';

export type MapEntityUpdate =
  | { kind: 'city'; entity: MapCityDto }
  | { kind: 'resourceNode'; entity: MapResourceNodeDto }
  | { kind: 'npcCamp'; entity: MapNpcCampDto }
  /** Entidade saiu do lugar (respawn em outra casa) ou sumiu. */
  | { kind: 'removed'; entityKind: 'city' | 'resourceNode' | 'npcCamp'; id: Id; x: number; y: number };

export type MarchArrivalResult =
  | 'GATHERING'
  | 'BATTLE'
  | 'STATIONED'
  | 'TARGET_GONE'
  | 'TARGET_SHIELDED'
  | 'NODE_OCCUPIED';

export interface ServerToClientEvents {
  // mapa (salas de chunk; marchas também vão para player:{dono})
  'march:created': (p: { march: MapMarchDto }) => void;
  /** Nova perna/estado: chegou, coletando, estacionada, voltando, recall. */
  'march:updated': (p: { march: MapMarchDto }) => void;
  /** Voltou para casa. */
  'march:removed': (p: { marchId: Id }) => void;
  'map:entity-updated': (p: MapEntityUpdate) => void;

  // pessoais (player:{id})
  'march:arrived': (p: { marchId: Id; result: MarchArrivalResult }) => void;
  'attack:incoming': (p: { marchId: Id; attackerName: string; fromX: number; fromY: number; arriveAt: IsoDate }) => void;
  /** Atacante deu recall. */
  'attack:cancelled': (p: { marchId: Id }) => void;
  'report:new': (p: { report: ReportSummaryDto }) => void;
  'city:resources': (p: { resources: Resources; resourcesAt: IsoDate; productionPerHour: Resources; capacity: Resources }) => void;
  'city:troops': (p: { troopsHome: TroopCounts; wounded: TroopCounts }) => void;
  'building:completed': (p: { building: BuildingDto; cityLevel: number }) => void;
  'training:completed': (p: { jobId: Id; troopTypeId: TroopTypeId; count: number }) => void;
  'healing:completed': (p: { jobId: Id; troopTypeId: TroopTypeId; count: number }) => void;
  'hero:updated': (p: { hero: HeroDto }) => void;
  'chest:new': (p: { chest: ChestDto }) => void;
  'shield:changed': (p: { shieldUntil: IsoDate | null; shieldKind: ShieldKind | null }) => void;

  // sistema
  /** Ex.: token expirado -> cliente renova e reconecta. */
  'server:error': (p: { code: ErrorCode }) => void;
}

export interface ClientToServerEvents {
  'chunks:subscribe': (
    p: { chunkIds: ChunkId[] }, // máx. 36
    ack: (r: { ok: true; chunkIds: ChunkId[] } | { ok: false; code: ErrorCode }) => void,
  ) => void;
  /** epoch ms */
  'time:sync': (ack: (r: { serverTime: number }) => void) => void;
}

export interface SocketData {
  userId: Id;
  playerId: Id;
  chunkIds: ChunkId[];
}

export const MAX_SUBSCRIBED_CHUNKS = 36;
