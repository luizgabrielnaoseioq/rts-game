import { Injectable } from '@nestjs/common';
import { PrismaService, type Tx } from '../common/prisma/prisma.service';
import { EmitBuffer } from './realtime/emit-buffer';
import { RealtimeService } from './realtime/realtime.service';

/** Transação de jogo: as emissões WS só saem depois do commit. */
@Injectable()
export class TxService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeService,
  ) {}

  async run<T>(fn: (tx: Tx, emit: EmitBuffer) => Promise<T>): Promise<T> {
    const emit = new EmitBuffer();
    const result = await this.prisma.$transaction((tx) => fn(tx, emit), { timeout: 15_000, maxWait: 5_000 });
    emit.flush(this.realtime);
    return result;
  }
}
