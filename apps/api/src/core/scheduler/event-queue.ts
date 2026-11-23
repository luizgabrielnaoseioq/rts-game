import { Injectable } from '@nestjs/common';
import type { Prisma, ScheduledEvent, ScheduledEventType } from '@prisma/client';
import type { Tx } from '../../common/prisma/prisma.service';
import type { EmitBuffer } from '../realtime/emit-buffer';

export interface ScheduleInput {
  type: ScheduledEventType;
  runAt: Date;
  payload: Prisma.InputJsonValue;
  /** Único: agendar duas vezes a mesma chave é no-op. */
  dedupeKey: string;
  marchId?: string;
}

/** Handler de evento: roda dentro da transação do agendador; tempo lógico = event.runAt. */
export type EventHandler = (tx: Tx, event: ScheduledEvent, emit: EmitBuffer) => Promise<void>;

/** Fila de eventos no Postgres (outbox transacional; trocável por BullMQ sem mudar handlers). */
@Injectable()
export class EventQueue {
  private readonly handlers = new Map<ScheduledEventType, EventHandler>();

  async schedule(tx: Tx, e: ScheduleInput): Promise<void> {
    await tx.scheduledEvent.createMany({
      data: [{ type: e.type, runAt: e.runAt, payload: e.payload, dedupeKey: e.dedupeKey, marchId: e.marchId ?? null }],
      skipDuplicates: true,
    });
  }

  async cancel(tx: Tx, dedupeKey: string): Promise<void> {
    await tx.scheduledEvent.updateMany({ where: { dedupeKey, status: 'PENDING' }, data: { status: 'CANCELLED', processedAt: new Date() } });
  }

  async cancelForMarch(tx: Tx, marchId: string): Promise<void> {
    await tx.scheduledEvent.updateMany({ where: { marchId, status: 'PENDING' }, data: { status: 'CANCELLED', processedAt: new Date() } });
  }

  register(type: ScheduledEventType, handler: EventHandler): void {
    this.handlers.set(type, handler);
  }

  handler(type: ScheduledEventType): EventHandler | undefined {
    return this.handlers.get(type);
  }
}
