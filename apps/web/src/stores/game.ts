import type {
  ChestDto,
  DailyChestStatusDto,
  HeroDto,
  HeroFragmentDto,
  Id,
  InventoryItemDto,
  ReportSummaryDto,
  TavernStatusDto,
} from '@wn/shared';
import { create } from 'zustand';

// Heróis, inventário, baús e relatórios (estado pessoal que vem do REST + socket).

interface GameStore {
  heroes: HeroDto[];
  fragments: HeroFragmentDto[];
  tavern: TavernStatusDto | null;
  inventory: InventoryItemDto[];
  chests: ChestDto[];
  daily: DailyChestStatusDto | null;
  reports: ReportSummaryDto[];
  reportsCursor: string | null;
  reportsLoaded: boolean;
  setHeroes: (h: HeroDto[]) => void;
  upsertHero: (h: HeroDto) => void;
  setFragments: (f: HeroFragmentDto[]) => void;
  setTavern: (t: TavernStatusDto) => void;
  setInventory: (i: InventoryItemDto[]) => void;
  setChests: (c: ChestDto[]) => void;
  addChest: (c: ChestDto) => void;
  removeChest: (id: Id) => void;
  setDaily: (d: DailyChestStatusDto) => void;
  setReports: (items: ReportSummaryDto[], cursor: string | null, append: boolean) => void;
  addReport: (r: ReportSummaryDto) => void;
  markReportRead: (id: Id, at: string) => void;
  clear: () => void;
}

export const useGameStore = create<GameStore>()((set) => ({
  heroes: [],
  fragments: [],
  tavern: null,
  inventory: [],
  chests: [],
  daily: null,
  reports: [],
  reportsCursor: null,
  reportsLoaded: false,
  setHeroes: (heroes) => set({ heroes }),
  upsertHero: (h) =>
    set((s) => {
      const i = s.heroes.findIndex((x) => x.id === h.id);
      if (i < 0) return { heroes: [...s.heroes, h] };
      const heroes = s.heroes.slice();
      heroes[i] = h;
      return { heroes };
    }),
  setFragments: (fragments) => set({ fragments }),
  setTavern: (tavern) => set({ tavern }),
  setInventory: (inventory) => set({ inventory: inventory.filter((i) => i.quantity > 0) }),
  setChests: (chests) => set({ chests }),
  addChest: (c) => set((s) => (s.chests.some((x) => x.id === c.id) ? {} : { chests: [c, ...s.chests] })),
  removeChest: (id) => set((s) => ({ chests: s.chests.filter((c) => c.id !== id) })),
  setDaily: (daily) => set({ daily }),
  setReports: (items, cursor, append) =>
    set((s) => {
      if (!append) return { reports: items, reportsCursor: cursor, reportsLoaded: true };
      const seen = new Set(s.reports.map((r) => r.id));
      return { reports: [...s.reports, ...items.filter((r) => !seen.has(r.id))], reportsCursor: cursor, reportsLoaded: true };
    }),
  addReport: (r) => set((s) => (s.reports.some((x) => x.id === r.id) ? {} : { reports: [r, ...s.reports] })),
  markReportRead: (id, at) =>
    set((s) => ({ reports: s.reports.map((r) => (r.id === id && !r.readAt ? { ...r, readAt: at } : r)) })),
  clear: () =>
    set({
      heroes: [],
      fragments: [],
      tavern: null,
      inventory: [],
      chests: [],
      daily: null,
      reports: [],
      reportsCursor: null,
      reportsLoaded: false,
    }),
}));
