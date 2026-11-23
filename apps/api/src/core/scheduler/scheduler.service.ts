import { Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import type { ScheduledEvent } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { env } from '../../config/env';
import { EmitBuffer } from '../realtime/emit-buffer';
import { RealtimeService } from '../realtime/realtime.service';
import { EventQueue } from './event-queue';

const MAX_ATTEMPTS = 5;

/**
 * Loop do agendador (ARQUITETURA 5.10): a cada SCHEDULER_INTERVAL_MS processa até SCHEDULER_BATCH
 * eventos vencidos, cada um na sua transação, com FOR UPDATE SKIP LOCKED.
 * O evento vira DONE na mesma transação das mudanças de jogo; emissões só depois do commit.
 */
@Injectable()
export class SchedulerService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger('Scheduler');
  private timer: NodeJS.Timeout | null = null;
  private running = false;
  private stopped = false;
  private lastWarn = '';

  constructor(
    private readonly prisma: PrismaService,
    private readonly queue: EventQueue,
    private readonly realtime: RealtimeService,
  ) {}

  onApplicationBootstrap(): void {
    if (!env.SCHEDULER_ENABLED) {
      this.logger.log('desligado (SCHEDULER_ENABLED != true)');
      return;
    }
    this.timer = setInterval(() => void this.tick(), env.SCHEDULER_INTERVAL_MS);
    this.logger.log(`ligado: a cada ${env.SCHEDULER_INTERVAL_MS} ms, até ${env.SCHEDULER_BATCH} eventos`);
  }

  onModuleDestroy(): void {
    this.stopped = true;
    if (this.timer) clearInterval(this.timer);
  }

  /** Um ciclo do loop (público para testes). Devolve quantos eventos foram tratados. */
  async tick(now: Date = new Date()): Promise<number> {
    if (this.running || this.stopped) return 0;
    this.running = true;
    let n = 0;
    try {
      while (n < env.SCHEDULER_BATCH && !this.stopped) {
        const handled = await this.processOne(now);
        if (!handled) break;
        n++;
      }
    } catch (err) {
      // Banco fora do ar / tabelas inexistentes: tenta de novo no próximo tick.
      this.logger.warn(`tick falhou: ${(err as Error).message.split('\n')[0]}`);
    } finally {
      if (n > 0) this.lastWarn = '';
      this.running = false;
    }
    return n;
  }

  /** Processa o próximo evento vencido. false = nada a fazer. */
  async processOne(now: Date = new Date()): Promise<boolean> {
    const emit = new EmitBuffer();
    let picked: ScheduledEvent | null = null;
    try {
      const done = await this.prisma.$transaction(
        async (tx) => {
          const rows = await tx.$queryRaw<ScheduledEvent[]>`
            SELECT * FROM scheduled_events
            WHERE status = 'PENDING' AND "runAt" <= ${now}
            ORDER BY "runAt", id
            LIMIT 1
            FOR UPDATE SKIP LOCKED`;
          const ev = rows[0];
          if (!ev) return false;
          picked = ev;
          const handler = this.queue.handler(ev.type);
          if (!handler) throw new Error(`sem handler para ${ev.type}`);
          await handler(tx, ev, emit);
          await tx.scheduledEvent.update({ where: { id: ev.id }, data: { status: 'DONE', processedAt: new Date() } });
          return true;
        },
        { timeout: 15_000, maxWait: 5_000 },
      );
      if (done) emit.flush(this.realtime);
      return done;
    } catch (err) {
      const ev = picked as ScheduledEvent | null;
      if (!ev) throw err;
      await this.recordFailure(ev, err as Error);
      return true;
    }
  }

  private async recordFailure(ev: ScheduledEvent, err: Error): Promise<void> {
    const attempts = ev.attempts + 1;
    const final = attempts >= MAX_ATTEMPTS;
    const backoffMs = Math.min(60_000, 1000 * 2 ** attempts);
    this.logger.error(`evento ${ev.type} ${ev.id} falhou (tentativa ${attempts}): ${err.message}`, final ? err.stack : undefined);
    await this.prisma.scheduledEvent.update({
      where: { id: ev.id },
      data: {
        attempts,
        lastError: err.message.slice(0, 2000),
        ...(final ? { status: 'FAILED', processedAt: new Date() } : { runAt: new Date(Date.now() + backoffMs) }),
      },
    });
  }
}
