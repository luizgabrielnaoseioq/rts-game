import type {
  ChunkId,
  ChunkStateDto,
  Id,
  MapCityDto,
  MapEntityUpdate,
  MapNpcCampDto,
  MapResourceNodeDto,
  SpeedSettings,
  WorldInfoDto,
} from '@wn/shared';
import { chunkOf } from '@wn/shared';
import { create } from 'zustand';

/** Entidades do mapa por id + quais chunks estão carregados. */
interface WorldStore {
  info: WorldInfoDto | null;
  cities: Record<Id, MapCityDto>;
  nodes: Record<Id, MapResourceNodeDto>;
  camps: Record<Id, MapNpcCampDto>;
  loadedChunks: Record<string, true>;
  setInfo: (info: WorldInfoDto) => void;
  mergeChunks: (chunks: ChunkStateDto[]) => void;
  dropChunks: (ids: ChunkId[]) => void;
  applyEntity: (u: MapEntityUpdate) => void;
  clear: () => void;
}

function inLoaded(loaded: Record<string, true>, x: number, y: number, chunkSize: number): boolean {
  return !!loaded[chunkOf(x, y, chunkSize)];
}

export const useWorldStore = create<WorldStore>()((set, get) => ({
  info: null,
  cities: {},
  nodes: {},
  camps: {},
  loadedChunks: {},

  setInfo: (info) => set({ info }),

  mergeChunks: (chunks) =>
    set((s) => {
      const size = s.info?.chunkSize ?? 16;
      const ids = new Set(chunks.map((c) => c.chunkId as string));
      const keep = <T extends { x: number; y: number }>(rec: Record<Id, T>) => {
        const out: Record<Id, T> = {};
        for (const [id, e] of Object.entries(rec)) if (!ids.has(chunkOf(e.x, e.y, size))) out[id] = e;
        return out;
      };
      const cities = keep(s.cities);
      const nodes = keep(s.nodes);
      const camps = keep(s.camps);
      const loadedChunks = { ...s.loadedChunks };
      for (const c of chunks) {
        loadedChunks[c.chunkId] = true;
        for (const e of c.cities) cities[e.id] = e;
        for (const e of c.resourceNodes) nodes[e.id] = e;
        for (const e of c.npcCamps) camps[e.id] = e;
      }
      return { cities, nodes, camps, loadedChunks };
    }),

  dropChunks: (drop) =>
    set((s) => {
      if (drop.length === 0) return {};
      const size = s.info?.chunkSize ?? 16;
      const ids = new Set<string>(drop);
      const keep = <T extends { x: number; y: number }>(rec: Record<Id, T>) => {
        const out: Record<Id, T> = {};
        for (const [id, e] of Object.entries(rec)) if (!ids.has(chunkOf(e.x, e.y, size))) out[id] = e;
        return out;
      };
      const loadedChunks = { ...s.loadedChunks };
      for (const id of drop) delete loadedChunks[id];
      return { cities: keep(s.cities), nodes: keep(s.nodes), camps: keep(s.camps), loadedChunks };
    }),

  applyEntity: (u) => {
    const s = get();
    const size = s.info?.chunkSize ?? 16;
    if (u.kind === 'removed') {
      if (u.entityKind === 'city') {
        const { [u.id]: _gone, ...rest } = s.cities;
        set({ cities: rest });
      } else if (u.entityKind === 'resourceNode') {
        const { [u.id]: _gone, ...rest } = s.nodes;
        set({ nodes: rest });
      } else {
        const { [u.id]: _gone, ...rest } = s.camps;
        set({ camps: rest });
      }
      return;
    }
    const e = u.entity;
    // Entidade fora dos chunks carregados: ignora (vem no próximo GET do chunk).
    const known =
      (u.kind === 'city' && s.cities[e.id]) ||
      (u.kind === 'resourceNode' && s.nodes[e.id]) ||
      (u.kind === 'npcCamp' && s.camps[e.id]);
    if (!known && !inLoaded(s.loadedChunks, e.x, e.y, size)) return;
    if (u.kind === 'city') set({ cities: { ...s.cities, [u.entity.id]: u.entity } });
    else if (u.kind === 'resourceNode') set({ nodes: { ...s.nodes, [u.entity.id]: u.entity } });
    else set({ camps: { ...s.camps, [u.entity.id]: u.entity } });
  },

  clear: () => set({ info: null, cities: {}, nodes: {}, camps: {}, loadedChunks: {} }),
}));

/** Velocidades do mundo para as prévias (fórmulas do shared). */
export function worldSpeed(): SpeedSettings {
  const info = useWorldStore.getState().info;
  return { gameSpeed: info?.gameSpeed ?? 1, economySpeed: info?.economySpeed ?? 1 };
}

export function useWorldSpeed(): SpeedSettings {
  const game = useWorldStore((s) => s.info?.gameSpeed ?? 1);
  const eco = useWorldStore((s) => s.info?.economySpeed ?? 1);
  return { gameSpeed: game, economySpeed: eco };
}
