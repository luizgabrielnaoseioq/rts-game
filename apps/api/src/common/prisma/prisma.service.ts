import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';

export type Tx = Prisma.TransactionClient;

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }

  /**
   * Transação de jogo. Na etapa 2 entra o EmitBuffer (emissões só depois do commit),
   * mantendo esta assinatura: runInTx((tx, emit) => ...).
   */
  async runInTx<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
    return this.$transaction((tx) => fn(tx), { timeout: 10_000, maxWait: 5_000 });
  }
}
