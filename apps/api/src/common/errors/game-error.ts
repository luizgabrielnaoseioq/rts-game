import { ERROR_HTTP_STATUS, type ErrorCode } from '@wn/shared';

/** Erro de regra de jogo: vira ApiError { statusCode, code, message, details } no filtro. */
export class GameError extends Error {
  readonly statusCode: number;

  constructor(
    readonly code: ErrorCode,
    readonly details?: Record<string, unknown>,
    message?: string,
    statusCode?: number,
  ) {
    super(message ?? code);
    this.statusCode = statusCode ?? ERROR_HTTP_STATUS[code];
  }
}

export function fail(code: ErrorCode, details?: Record<string, unknown>, message?: string): never {
  throw new GameError(code, details, message);
}
