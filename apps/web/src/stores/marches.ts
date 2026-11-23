import type { Id, IsoDate, MapMarchDto, MarchDto } from '@wn/shared';
import { create } from 'zustand';

export interface IncomingAttack {
  marchId: Id;
  attackerName: string;
  fromX: number;
  fromY: number;
  arriveAt: IsoDate;
}

interface MarchStore {
  /** Visão pública de todas as marchas conhecidas (mapa). */
  map: Record<Id, MapMarchDto>;
  /** Detalhe das minhas marchas ativas. */
  mine: Record<Id, MarchDto>;
  incoming: Record<Id, IncomingAttack>;
  setMine: (list: MarchDto[]) => void;
  upsertMine: (m: MarchDto) => void;
  upsertMap: (m: MapMarchDto) => void;
  mergeMap: (list: MapMarchDto[]) => void;
  remove: (id: Id) => void;
  addIncoming: (a: IncomingAttack) => void;
  removeIncoming: (id: Id) => void;
  clear: () => void;
}

export const useMarchStore = create<MarchStore>()((set) => ({
  map: {},
  mine: {},
  incoming: {},
  setMine: (list) =>
    set((s) => {
      const mine: Record<Id, MarchDto> = {};
      const map = { ...s.map };
      // Marchas minhas que sumiram da lista do servidor já acabaram.
      for (const id of Object.keys(s.mine)) if (!list.some((m) => m.id === id)) delete map[id];
      for (const m of list) {
        if (m.state === 'COMPLETED') continue;
        mine[m.id] = m;
        map[m.id] = m;
      }
      return { mine, map };
    }),
  upsertMine: (m) =>
    set((s) => {
      if (m.state === 'COMPLETED') {
        const { [m.id]: _a, ...mine } = s.mine;
        const { [m.id]: _b, ...map } = s.map;
        return { mine, map };
      }
      return { mine: { ...s.mine, [m.id]: m }, map: { ...s.map, [m.id]: m } };
    }),
  upsertMap: (m) =>
    set((s) => {
      if (m.state === 'COMPLETED') {
        const { [m.id]: _a, ...map } = s.map;
        return { map };
      }
      const prevMine = s.mine[m.id];
      // Atualiza a perna da minha marcha mantendo o detalhe (tropas, carga...).
      const mine = prevMine ? { ...s.mine, [m.id]: { ...prevMine, ...m } } : s.mine;
      return { map: { ...s.map, [m.id]: m }, mine };
    }),
  mergeMap: (list) =>
    set((s) => {
      const map = { ...s.map };
      for (const m of list) if (m.state !== 'COMPLETED') map[m.id] = s.mine[m.id] ? { ...s.mine[m.id], ...m } : m;
      return { map };
    }),
  remove: (id) =>
    set((s) => {
      const { [id]: _a, ...map } = s.map;
      const { [id]: _b, ...mine } = s.mine;
      return { map, mine };
    }),
  addIncoming: (a) => set((s) => ({ incoming: { ...s.incoming, [a.marchId]: a } })),
  removeIncoming: (id) =>
    set((s) => {
      const { [id]: _a, ...incoming } = s.incoming;
      return { incoming };
    }),
  clear: () => set({ map: {}, mine: {}, incoming: {} }),
}));
