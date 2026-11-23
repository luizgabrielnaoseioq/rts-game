import type { ApiError, AuthResponse, ErrorCode } from '@wn/shared';
import { errorText } from '../i18n/errors';
import { API_BASE } from '../lib/env';
import { useAuthStore } from '../stores/auth';

/** Erro de API já com o texto pt-BR pronto para a tela. */
export class ApiRequestError extends Error {
  readonly status: number;
  readonly code: ErrorCode;
  readonly details?: Record<string, unknown>;
  constructor(status: number, code: ErrorCode, details?: Record<string, unknown>, technical?: string) {
    super(errorText(code));
    this.name = 'ApiRequestError';
    this.status = status;
    this.code = code;
    this.details = details;
    if (technical) this.cause = technical;
  }
}

/** Texto pt-BR de qualquer erro (rede, API, desconhecido). */
export function describeError(err: unknown): string {
  if (err instanceof ApiRequestError) return err.message;
  if (err instanceof TypeError) return 'Sem conexão com o servidor.';
  return 'Algo deu errado.';
}

async function parseError(res: Response): Promise<ApiRequestError> {
  let body: Partial<ApiError> | null = null;
  try {
    body = (await res.json()) as Partial<ApiError>;
  } catch {
    body = null;
  }
  const code: ErrorCode =
    (body?.code as ErrorCode | undefined) ??
    (res.status === 401 ? 'UNAUTHORIZED' : res.status === 404 ? 'NOT_FOUND' : res.status === 429 ? 'RATE_LIMITED' : 'INTERNAL');
  return new ApiRequestError(res.status, code, body?.details, body?.message);
}

// ── refresh do token (uma chamada por vez) ──

let refreshing: Promise<boolean> | null = null;

/** Renova o access token com o refresh token. true = conseguiu. */
export function refreshSession(): Promise<boolean> {
  if (refreshing) return refreshing;
  const refreshToken = useAuthStore.getState().refreshToken;
  if (!refreshToken) return Promise.resolve(false);
  refreshing = (async () => {
    try {
      const res = await fetch(`${API_BASE}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      });
      if (!res.ok) {
        // Refresh inválido/revogado: sessão acabou. Erro de rede/servidor: mantém o token para tentar depois.
        if (res.status === 401 || res.status === 403) useAuthStore.getState().clear();
        return false;
      }
      useAuthStore.getState().setSession((await res.json()) as AuthResponse);
      return true;
    } catch {
      return false;
    } finally {
      refreshing = null;
    }
  })();
  return refreshing;
}

/** Garante um access token válido (renova se faltar menos de 20 s). */
export async function ensureAccessToken(): Promise<string | null> {
  const s = useAuthStore.getState();
  if (s.accessToken && (s.accessTokenExpiresAt == null || s.accessTokenExpiresAt - Date.now() > 20_000)) {
    return s.accessToken;
  }
  if (!s.refreshToken) return s.accessToken;
  await refreshSession();
  return useAuthStore.getState().accessToken;
}

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  /** Rota pública (sem Bearer, sem refresh). */
  auth?: boolean;
  signal?: AbortSignal;
}

export async function request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, auth = true, signal } = opts;

  const doFetch = async (token: string | null) => {
    const headers: Record<string, string> = {};
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (auth && token) headers.Authorization = `Bearer ${token}`;
    return fetch(`${API_BASE}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal,
    });
  };

  let res = await doFetch(auth ? await ensureAccessToken() : null);

  // 401 numa rota autenticada: renova uma vez e repete.
  if (auth && res.status === 401) {
    const ok = await refreshSession();
    if (ok) res = await doFetch(useAuthStore.getState().accessToken);
  }

  if (!res.ok) {
    const err = await parseError(res);
    if (auth && err.status === 401) useAuthStore.getState().clear();
    throw err;
  }
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  return (text ? JSON.parse(text) : undefined) as T;
}
