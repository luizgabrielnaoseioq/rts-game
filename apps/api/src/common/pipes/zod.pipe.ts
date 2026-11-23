import { PipeTransform } from '@nestjs/common';
import type { ZodType } from 'zod';
import { GameError } from '../errors/game-error';

/** Valida body/query/params com os schemas zod do shared. Falha → VALIDATION_FAILED. */
export class ZodPipe<T> implements PipeTransform<unknown, T> {
  constructor(private readonly schema: ZodType<T>) {}

  transform(value: unknown): T {
    const r = this.schema.safeParse(value ?? {});
    if (!r.success) {
      throw new GameError('VALIDATION_FAILED', {
        issues: r.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      });
    }
    return r.data;
  }
}
