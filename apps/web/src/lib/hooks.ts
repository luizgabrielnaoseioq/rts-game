import { useEffect, useState, useSyncExternalStore } from 'react';
import { projectResources, type Resources } from '@wn/shared';
import { serverNow, useClockStore } from '../stores/clock';
import { useCityStore } from '../stores/city';

// Um único relógio compartilhado por intervalo (evita um setInterval por contador na tela).
const tickers = new Map<number, { listeners: Set<() => void>; timer: number | null; value: number }>();

function getTicker(ms: number) {
  let t = tickers.get(ms);
  if (!t) {
    t = { listeners: new Set(), timer: null, value: Date.now() };
    tickers.set(ms, t);
  }
  return t;
}

function subscribeTicker(ms: number, cb: () => void): () => void {
  const t = getTicker(ms);
  t.listeners.add(cb);
  if (t.timer == null) {
    t.timer = window.setInterval(() => {
      t.value = Date.now();
      t.listeners.forEach((l) => l());
    }, ms);
  }
  return () => {
    t.listeners.delete(cb);
    if (t.listeners.size === 0 && t.timer != null) {
      window.clearInterval(t.timer);
      t.timer = null;
    }
  };
}

/** Date.now() local que re-renderiza a cada `ms`. */
export function useNow(ms = 1000): number {
  return useSyncExternalStore(
    (cb) => subscribeTicker(ms, cb),
    () => getTicker(ms).value,
  );
}

/** Relógio do servidor estimado, re-renderizando a cada `ms`. */
export function useServerNow(ms = 1000): number {
  const local = useNow(ms);
  const offset = useClockStore((s) => s.offset);
  return local + offset;
}

/** Recursos projetados em tempo real (ARQUITETURA 6.2: projectResources(city, serverNow())). */
export function useProjectedResources(ms = 250): Resources | null {
  const city = useCityStore((s) => s.city);
  const now = useServerNow(ms);
  if (!city) return null;
  return projectResources(city, now);
}

/** Roda uma Promise e guarda dados/erro/carregando. */
export function useAsync<T>(fn: () => Promise<T>, deps: unknown[]): { data: T | null; error: unknown; loading: boolean; reload: () => void } {
  const [state, setState] = useState<{ data: T | null; error: unknown; loading: boolean }>({ data: null, error: null, loading: true });
  const [n, setN] = useState(0);
  useEffect(() => {
    let alive = true;
    setState((s) => ({ ...s, loading: true, error: null }));
    fn()
      .then((data) => alive && setState({ data, error: null, loading: false }))
      .catch((error: unknown) => alive && setState({ data: null, error, loading: false }));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, n]);
  return { ...state, reload: () => setN((x) => x + 1) };
}

export { serverNow };
