// Agendador: idempotência, DONE na mesma transação, emissão só pós-commit, backoff e FAILED.
// Banco em memória (sem tocar no Postgres): $transaction faz snapshot e desfaz em caso de erro.
import { beforeAll, describe, expect, it, vi } from 'vitest';

type Row = {
  id: string;
  type: string;
  status: 'PENDING' | 'DONE' | 'CANCELLED' | 'FAILED';
  runAt: Date;
  payload: unknown;
  dedupeKey: string;
  marchId: string | null;
  attempts: number;
  lastError: string | null;
  processedAt: Date | null;
};

function fakeDb() {
  let rows: Row[] = [];
  let seq = 0;
  const locked = new Set<string>();
  const api = {
    rows: () => rows,
    scheduledEvent: {
      createMany: async ({ data }: { data: Omit<Row, 'id' | 'status' | 'attempts' | 'lastError' | 'processedAt'>[] }) => {
        let count = 0;
        for (const d of data) {
          if (rows.some((r) => r.dedupeKey === d.dedupeKey)) continue;
          rows.push({ ...d, id: `e${++seq}`, status: 'PENDING', attempts: 0, lastError: null, processedAt: null } as Row);
          count++;
        }
        return { count };
      },
      update: async ({ where, data }: { where: { id: string }; data: Partial<Row> }) => {
        const r = rows.find((x) => x.id === where.id)!;
        Object.assign(r, data);
        return r;
      },
      updateMany: async ({ where, data }: { where: Partial<Row>; data: Partial<Row> }) => {
        const hit = rows.filter((r) => Object.entries(where).every(([k, v]) => (r as Record<string, unknown>)[k] === v));
        hit.forEach((r) => Object.assign(r, data));
        return { count: hit.length };
      },
    },
    $queryRaw: async (_s: TemplateStringsArray, now: Date) => {
      const ev = rows
        .filter((r) => r.status === 'PENDING' && r.runAt <= now && !locked.has(r.id))
        .sort((a, b) => a.runAt.getTime() - b.runAt.getTime() || a.id.localeCompare(b.id))[0];
      if (!ev) return [];
      locked.add(ev.id);
      return [{ ...ev }];
    },
    $transaction: async <T>(fn: (tx: unknown) => Promise<T>) => {
      const snapshot = rows.map((r) => ({ ...r }));
      try {
        return await fn(api);
      } catch (e) {
        rows = snapshot;
        throw e;
      } finally {
        locked.clear();
      }
    },
  };
  return api;
}

let SchedulerService: typeof import('./scheduler.service').SchedulerService;
let EventQueue: typeof import('./event-queue').EventQueue;

beforeAll(async () => {
  process.env.DATABASE_URL ??= 'postgresql://x:x@localhost:1/x';
  process.env.JWT_ACCESS_SECRET ??= 'test-secret-test-secret-test-secret-0000';
  ({ SchedulerService } = await import('./scheduler.service'));
  ({ EventQueue } = await import('./event-queue'));
});

function setup() {
  const db = fakeDb();
  const queue = new EventQueue();
  const sink = { emitRaw: vi.fn() };
  const scheduler = new SchedulerService(db as never, queue, sink as never);
  return { db, queue, sink, scheduler };
}

describe('agendador', () => {
  it('dedupeKey impede agendar duas vezes', async () => {
    const { db, queue } = setup();
    const e = { type: 'MARCH_ARRIVE' as const, runAt: new Date(1000), payload: { marchId: 'm1', version: 0 }, dedupeKey: 'march:m1:v0:arrive' };
    await queue.schedule(db as never, e);
    await queue.schedule(db as never, e);
    expect(db.rows()).toHaveLength(1);
  });

  it('processa em ordem de runAt, marca DONE e emite só depois do commit; handler idempotente por versão', async () => {
    const { db, queue, sink, scheduler } = setup();
    const march = { version: 1, arrivals: 0 };
    queue.register('MARCH_ARRIVE', async (_tx, ev, emit) => {
      const p = ev.payload as { version: number };
      if (p.version !== march.version) return; // evento velho (ex.: recall) = no-op
      march.arrivals++;
      march.version++;
      emit.toPlayer('p1', 'march:arrived', { marchId: 'm1', result: 'BATTLE' });
    });
    await queue.schedule(db as never, { type: 'MARCH_ARRIVE', runAt: new Date(2000), payload: { version: 1 }, dedupeKey: 'v1' });
    await queue.schedule(db as never, { type: 'MARCH_ARRIVE', runAt: new Date(1000), payload: { version: 0 }, dedupeKey: 'v0' });

    expect(await scheduler.tick(new Date(5000))).toBe(2);
    expect(db.rows().every((r) => r.status === 'DONE')).toBe(true);
    expect(march.arrivals).toBe(1); // o v0 foi no-op
    expect(sink.emitRaw).toHaveBeenCalledTimes(1);
    expect(await scheduler.tick(new Date(5000))).toBe(0); // nada de novo: não reprocessa
  });

  it('não pega evento do futuro', async () => {
    const { db, queue, scheduler } = setup();
    queue.register('BUILDING_COMPLETE', async () => undefined);
    await queue.schedule(db as never, { type: 'BUILDING_COMPLETE', runAt: new Date(10_000), payload: {}, dedupeKey: 'b' });
    expect(await scheduler.tick(new Date(9_999))).toBe(0);
    expect(db.rows()[0].status).toBe('PENDING');
  });

  it('erro no handler desfaz tudo, não emite, faz backoff e vira FAILED após 5 tentativas', async () => {
    const { db, queue, sink, scheduler } = setup();
    queue.register('GATHER_COMPLETE', async (tx, _ev, emit) => {
      // efeito parcial que precisa ser desfeito
      await (tx as ReturnType<typeof fakeDb>).scheduledEvent.createMany({
        data: [{ type: 'MARCH_RETURN', runAt: new Date(0), payload: {}, dedupeKey: 'partial', marchId: null }],
      });
      emit.toPlayer('p1', 'march:removed', { marchId: 'm1' });
      throw new Error('boom');
    });
    await queue.schedule(db as never, { type: 'GATHER_COMPLETE', runAt: new Date(0), payload: {}, dedupeKey: 'g' });
    const far = new Date(Date.now() + 3_600_000);
    for (let i = 0; i < 5; i++) await scheduler.processOne(far);
    const ev = db.rows().find((r) => r.dedupeKey === 'g')!;
    expect(ev.status).toBe('FAILED');
    expect(ev.attempts).toBe(5);
    expect(ev.lastError).toBe('boom');
    expect(db.rows().some((r) => r.dedupeKey === 'partial')).toBe(false);
    expect(sink.emitRaw).not.toHaveBeenCalled();
  });

  it('cancel só afeta PENDING', async () => {
    const { db, queue } = setup();
    await queue.schedule(db as never, { type: 'MARCH_ARRIVE', runAt: new Date(0), payload: {}, dedupeKey: 'x', marchId: 'm9' });
    await queue.cancelForMarch(db as never, 'm9');
    expect(db.rows()[0].status).toBe('CANCELLED');
  });
});
