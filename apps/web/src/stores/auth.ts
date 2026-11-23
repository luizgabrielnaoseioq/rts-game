import type { AuthResponse, IsoDate, PlayerSelfDto, ShieldKind } from '@wn/shared';
import { create } from 'zustand';

const REFRESH_KEY = 'wn.refreshToken';

function readRefresh(): string | null {
  try {
    return localStorage.getItem(REFRESH_KEY);
  } catch {
    return null;
  }
}

function writeRefresh(token: string | null): void {
  try {
    if (token) localStorage.setItem(REFRESH_KEY, token);
    else localStorage.removeItem(REFRESH_KEY);
  } catch {
    // modo privado: segue só em memória
  }
}

export type AuthStatus = 'booting' | 'anonymous' | 'authenticated';

interface AuthState {
  status: AuthStatus;
  /** Access token só em memória. */
  accessToken: string | null;
  accessTokenExpiresAt: number | null;
  /** Refresh token espelhado no localStorage. */
  refreshToken: string | null;
  player: PlayerSelfDto | null;

  setSession: (r: AuthResponse) => void;
  setPlayer: (p: PlayerSelfDto) => void;
  patchPlayer: (p: Partial<PlayerSelfDto>) => void;
  setShield: (shieldUntil: IsoDate | null, shieldKind: ShieldKind | null) => void;
  setAnonymous: () => void;
  clear: () => void;
}

export const useAuthStore = create<AuthState>()((set) => ({
  status: 'booting',
  accessToken: null,
  accessTokenExpiresAt: null,
  refreshToken: readRefresh(),
  player: null,

  setSession: (r) => {
    writeRefresh(r.refreshToken);
    const exp = Date.parse(r.accessTokenExpiresAt);
    set({
      status: 'authenticated',
      accessToken: r.accessToken,
      accessTokenExpiresAt: Number.isNaN(exp) ? null : exp,
      refreshToken: r.refreshToken,
      player: r.player,
    });
  },
  setPlayer: (p) => set({ player: p }),
  patchPlayer: (p) => set((s) => (s.player ? { player: { ...s.player, ...p } } : {})),
  setShield: (shieldUntil, shieldKind) =>
    set((s) => (s.player ? { player: { ...s.player, shieldUntil, shieldKind } } : {})),
  setAnonymous: () => set({ status: 'anonymous', accessToken: null, accessTokenExpiresAt: null, player: null }),
  clear: () => {
    writeRefresh(null);
    set({ status: 'anonymous', accessToken: null, accessTokenExpiresAt: null, refreshToken: null, player: null });
  },
}));
