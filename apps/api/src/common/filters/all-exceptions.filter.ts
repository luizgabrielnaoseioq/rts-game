import { ArgumentsHost, Catch, ExceptionFilter, HttpException, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { ApiError, ErrorCode } from '@wn/shared';
import type { Response } from 'express';
import { GameError } from '../errors/game-error';

const STATUS_CODE: Record<number, ErrorCode> = {
  400: 'VALIDATION_FAILED',
  401: 'UNAUTHORIZED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  413: 'VALIDATION_FAILED',
  415: 'VALIDATION_FAILED',
  429: 'RATE_LIMITED',
};

const logger = new Logger('Exceptions');

/** Converte qualquer exceção no formato ApiError do shared (sem stack). */
export function toApiError(exception: unknown): ApiError {
  if (exception instanceof GameError) {
    return {
      statusCode: exception.statusCode,
      code: exception.code,
      message: exception.message,
      ...(exception.details ? { details: exception.details } : {}),
    };
  }
  if (exception instanceof HttpException) {
    const statusCode = exception.getStatus();
    const code = STATUS_CODE[statusCode] ?? (statusCode >= 500 ? 'INTERNAL' : 'VALIDATION_FAILED');
    if (statusCode >= 500) logger.error(exception.message, exception.stack);
    return { statusCode, code, message: exception.message };
  }
  if (exception instanceof Prisma.PrismaClientKnownRequestError && exception.code === 'P2002') {
    // Corrida em unique (ex.: dois cadastros com o mesmo nome ao mesmo tempo).
    const target = String((exception.meta as { target?: unknown } | undefined)?.target ?? '');
    if (/username|displayName/i.test(target)) {
      return { statusCode: 409, code: 'USERNAME_TAKEN', message: 'Username already taken' };
    }
  }
  // Erros de parse do body (express/body-parser) chegam com status 400.
  const maybe = exception as { status?: number; type?: string; message?: string } | null;
  if (maybe && typeof maybe.status === 'number' && maybe.status >= 400 && maybe.status < 500) {
    return { statusCode: maybe.status, code: STATUS_CODE[maybe.status] ?? 'VALIDATION_FAILED', message: maybe.message ?? 'Bad request' };
  }
  logger.error(exception instanceof Error ? exception.message : String(exception), exception instanceof Error ? exception.stack : undefined);
  return { statusCode: 500, code: 'INTERNAL', message: 'Internal error' };
}

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    if (host.getType() !== 'http') return;
    const res = host.switchToHttp().getResponse<Response>();
    const body = toApiError(exception);
    res.status(body.statusCode).json(body);
  }
}
