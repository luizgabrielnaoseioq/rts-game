import { useClockStore } from '../stores/clock';
import { getSocket } from './socket';

const INTERVAL_MS = 60_000;
let timer: number | null = null;

/** time:sync: mede o RTT e guarda offset = serverTime − (t0 + rtt/2). */
export function syncNow(): void {
  const s = getSocket();
  if (!s?.connected) return;
  // Duas amostras seguidas: a de menor RTT tende a ganhar (ver clock.setFromSync).
  for (let i = 0; i < 2; i++) {
    const t0 = Date.now();
    s.emit('time:sync', (r) => {
      const t1 = Date.now();
      if (r && typeof r.serverTime === 'number') useClockStore.getState().setFromSync(r.serverTime, t0, t1);
    });
  }
}

export function startTimeSync(): void {
  stopTimeSync();
  timer = window.setInterval(syncNow, INTERVAL_MS);
}

export function stopTimeSync(): void {
  if (timer != null) window.clearInterval(timer);
  timer = null;
}
