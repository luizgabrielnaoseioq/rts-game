import type {
  BuildingDto,
  BuildingLevels,
  CityStateDto,
  Id,
  IsoDate,
  Resources,
  TroopCounts,
} from '@wn/shared';
import { eraForKeep } from '@wn/shared';
import { create } from 'zustand';

interface CityStore {
  city: CityStateDto | null;
  loading: boolean;
  setCity: (c: CityStateDto) => void;
  setLoading: (v: boolean) => void;
  applyResources: (p: { resources: Resources; resourcesAt: IsoDate; productionPerHour: Resources; capacity: Resources }) => void;
  applyTroops: (p: { troopsHome: TroopCounts; wounded: TroopCounts }) => void;
  applyBuildingCompleted: (building: BuildingDto, cityLevel: number) => void;
  removeTrainingJob: (jobId: Id) => void;
  removeHealingJob: (jobId: Id) => void;
  clear: () => void;
}

export const useCityStore = create<CityStore>()((set) => ({
  city: null,
  loading: false,
  setCity: (c) => set({ city: c, loading: false }),
  setLoading: (v) => set({ loading: v }),
  applyResources: (p) =>
    set((s) =>
      s.city
        ? {
            city: {
              ...s.city,
              resources: p.resources,
              resourcesAt: p.resourcesAt,
              productionPerHour: p.productionPerHour,
              capacity: p.capacity,
            },
          }
        : {},
    ),
  applyTroops: (p) => set((s) => (s.city ? { city: { ...s.city, troopsHome: p.troopsHome, wounded: p.wounded } } : {})),
  applyBuildingCompleted: (building, cityLevel) =>
    set((s) => {
      if (!s.city) return {};
      const others = s.city.buildings.filter((b) => b.slot !== building.slot);
      const buildings = [...others, building].sort((a, b) => a.slot - b.slot);
      const active = buildings.filter((b) => b.upgradeEndsAt != null).length;
      return {
        city: {
          ...s.city,
          buildings,
          level: cityLevel,
          era: eraForKeep(cityLevel),
          buildQueue: { ...s.city.buildQueue, active },
        },
      };
    }),
  removeTrainingJob: (jobId) =>
    set((s) => (s.city ? { city: { ...s.city, trainingQueue: s.city.trainingQueue.filter((j) => j.id !== jobId) } } : {})),
  removeHealingJob: (jobId) =>
    set((s) => (s.city ? { city: { ...s.city, healingQueue: s.city.healingQueue.filter((j) => j.id !== jobId) } } : {})),
  clear: () => set({ city: null, loading: false }),
}));

/** Níveis por tipo a partir da lista de prédios. */
export function levelsOf(city: Pick<CityStateDto, 'buildings'> | null): BuildingLevels {
  const out: BuildingLevels = {};
  if (!city) return out;
  for (const b of city.buildings) out[b.typeId] = Math.max(out[b.typeId] ?? 0, b.level);
  return out;
}
