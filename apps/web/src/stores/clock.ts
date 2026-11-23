import { create } from 'zustand';

interface ClockState {
  /** serverTime − Date.now() estimado (ms). */
  offset: number;
  /** Melhor RTT visto (o offset do time:sync com menor RTT vale mais). */
  rtt: number | null;
  synced: boolean;
  setFromSync: (serverTime: number, t0: number, t1: number) => void;
  /** Estimativa grosseira a partir de um serverTime de resposta REST (só antes do time:sync). */
  hintFromIso: (serverTimeIso: string) => void;
}

export const useClockStore = create<ClockState>()((set, get) => ({
  offset: 0,
  rtt: null,
  synced: false,
  setFromSync: (serverTime, t0, t1) => {
    const rtt = Math.max(0, t1 - t0);
    const offset = serverTime - (t0 + rtt / 2);
    const prev = get();
    // Aceita se é o primeiro, se o RTT é parecido/melhor, ou se o desvio é grande (relógio mudou).
    if (!prev.synced || prev.rtt == null || rtt <= prev.rtt * 1.5 || Math.abs(offset - prev.offset) > 2000) {
      set({ offset, rtt, synced: true });
    }
  },
  hintFromIso: (iso) => {
    if (get().synced) return;
    const t = Date.parse(iso);
    if (!Number.isNaN(t)) set({ offset: t - Date.now() });
  },
}));

/** Relógio do servidor estimado (epoch ms). Usável fora do React (Phaser). */
export function serverNow(): number {
  return Date.now() + useClockStore.getState().offset;
}
