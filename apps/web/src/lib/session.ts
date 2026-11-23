import { CONFIG_VERSION, type AuthResponse } from '@wn/shared';
import { api } from '../api/endpoints';
import { describeError, refreshSession } from '../api/http';
import { connectSocket, disconnectSocket, setReconnectHandler } from '../realtime/socket';
import { useAuthStore } from '../stores/auth';
import { useCityStore } from '../stores/city';
import { useClockStore } from '../stores/clock';
import { useGameStore } from '../stores/game';
import { useMarchStore } from '../stores/marches';
import { toast, useUiStore } from '../stores/ui';
import { useWorldStore } from '../stores/world';

let started = false;

/** Carrega city/marchas (o que pode ter mudado enquanto o socket estava fora). */
export async function resyncState(): Promise<void> {
  const [city, marches, me] = await Promise.allSettled([api.city(), api.marches(), api.me()]);
  if (city.status === 'fulfilled') {
    useClockStore.getState().hintFromIso(city.value.serverTime);
    useCityStore.getState().setCity(city.value);
  }
  if (marches.status === 'fulfilled') useMarchStore.getState().setMine(marches.value);
  if (me.status === 'fulfilled') useAuthStore.getState().setPlayer(me.value);
}

/** Depois do login/cadastro/refresh: carrega o estado e liga o socket. */
export async function startGame(): Promise<void> {
  if (started) return;
  started = true;
  useCityStore.getState().setLoading(true);

  const world = api.world().then((w) => {
    useClockStore.getState().hintFromIso(w.serverTime);
    useWorldStore.getState().setInfo(w);
    useUiStore.getState().setConfigMismatch(w.configVersion !== CONFIG_VERSION);
  });
  const rest = [
    world,
    resyncState(),
    api.heroes().then((h) => useGameStore.getState().setHeroes(h)),
    api.inventory().then((i) => useGameStore.getState().setInventory(i)),
    api.chests().then((c) => useGameStore.getState().setChests(c)),
    api.daily().then((d) => useGameStore.getState().setDaily(d)),
    api.reports(null, 20).then((p) => useGameStore.getState().setReports(p.items, p.nextCursor, false)),
  ];
  const results = await Promise.allSettled(rest);
  useCityStore.getState().setLoading(false);
  const failed = results.find((r): r is PromiseRejectedResult => r.status === 'rejected');
  if (failed) toast({ kind: 'warn', title: 'Parte do estado não carregou', body: describeError(failed.reason) });

  setReconnectHandler(() => void resyncState());
  connectSocket();
}

export async function enterWithAuth(r: AuthResponse): Promise<void> {
  useAuthStore.getState().setSession(r);
  await startGame();
}

/** Abertura do app: tenta recuperar a sessão pelo refresh token salvo. */
export async function bootSession(): Promise<void> {
  const { refreshToken } = useAuthStore.getState();
  if (!refreshToken) {
    useAuthStore.getState().setAnonymous();
    return;
  }
  const ok = await refreshSession();
  if (!ok) {
    useAuthStore.getState().setAnonymous();
    return;
  }
  await startGame();
}

function resetGameState(): void {
  disconnectSocket();
  started = false;
  useCityStore.getState().clear();
  useWorldStore.getState().clear();
  useMarchStore.getState().clear();
  useGameStore.getState().clear();
}

export async function logout(): Promise<void> {
  const rt = useAuthStore.getState().refreshToken;
  if (rt) await api.logout(rt).catch(() => undefined);
  useAuthStore.getState().clear();
}

// Sessão caiu (logout ou refresh revogado): desliga o socket e limpa o estado do jogo.
useAuthStore.subscribe((s, prev) => {
  if (prev.status === 'authenticated' && s.status !== 'authenticated') resetGameState();
});
