// Gravação de relatórios e resumo (ReportSummaryDto).
import type { BattleOutcome, Prisma, Report, ReportKind, ReportRecipient, ReportRole } from '@prisma/client';
import {
  TROOPS,
  type BattleReportPayload,
  type BattleRoundDto,
  type BattleSideReport,
  type GatherReportPayload,
  type HeroTypeId,
  type ReportSummaryDto,
  type RoundSnapshot,
  type TroopCounts,
  type TroopTypeId,
} from '@wn/shared';
import type { Tx } from '../../common/prisma/prisma.service';
import type { EmitBuffer } from '../realtime/emit-buffer';

export function opponentNameFor(kind: ReportKind, role: ReportRole, payload: unknown): string | null {
  if (kind === 'GATHER') return null;
  const p = payload as BattleReportPayload;
  return role === 'DEFENDER' ? p.attacker?.name ?? null : p.defender?.name ?? null;
}

export function toReportSummary(r: Report, rec: ReportRecipient): ReportSummaryDto {
  return {
    id: r.id,
    kind: r.kind,
    role: rec.role,
    outcome: r.outcome,
    x: r.x,
    y: r.y,
    createdAt: r.createdAt.toISOString(),
    readAt: rec.readAt ? rec.readAt.toISOString() : null,
    opponentName: opponentNameFor(r.kind, rec.role, r.payload),
  };
}

export interface NewReport {
  worldId: string;
  kind: ReportKind;
  outcome: BattleOutcome | null;
  x: number;
  y: number;
  marchId: string | null;
  attackerPlayerId: string | null;
  defenderPlayerId: string | null;
  payload: BattleReportPayload | GatherReportPayload;
  recipients: { playerId: string; role: ReportRole }[];
  at: Date;
}

/** Cria o relatório e emite report:new para cada destinatário (pós-commit). */
export async function writeReport(tx: Tx, r: NewReport, emit: EmitBuffer): Promise<Report> {
  const seen = new Set<string>();
  const recipients = r.recipients.filter((x) => (seen.has(x.playerId) ? false : (seen.add(x.playerId), true)));
  const report = await tx.report.create({
    data: {
      worldId: r.worldId,
      kind: r.kind,
      outcome: r.outcome,
      x: r.x,
      y: r.y,
      marchId: r.marchId,
      attackerPlayerId: r.attackerPlayerId,
      defenderPlayerId: r.defenderPlayerId,
      payload: r.payload as unknown as Prisma.InputJsonValue,
      createdAt: r.at,
      recipients: { create: recipients.map((x) => ({ playerId: x.playerId, role: x.role, createdAt: r.at })) },
    },
    include: { recipients: true },
  });
  for (const rec of report.recipients) emit.toPlayer(rec.playerId, 'report:new', { report: toReportSummary(report, rec) });
  return report;
}

export interface TroopLine {
  troopTypeId: TroopTypeId;
  before: number;
  lost: number;
  wounded: number;
  dead: number;
  after: number;
}

export function sideReport(
  name: string,
  playerId: string | null,
  heroes: { heroTypeId: HeroTypeId; level: number; xpGained: number }[],
  troops: TroopLine[],
): BattleSideReport {
  const power = (key: 'before' | 'after') => troops.reduce((s, t) => s + t[key] * (TROOPS[t.troopTypeId]?.power ?? 0), 0);
  return { name, playerId, heroes, troops, powerBefore: power('before'), powerAfter: power('after') };
}

const round2 = (c: TroopCounts): TroopCounts => {
  const out: TroopCounts = {};
  for (const [k, v] of Object.entries(c) as [TroopTypeId, number][]) out[k] = Math.round(v * 100) / 100;
  return out;
};

export function roundLogDto(log: readonly RoundSnapshot[]): BattleRoundDto[] {
  return log.map((r) => ({ round: r.round, attacker: round2(r.attacker), defender: round2(r.defender) }));
}

/** Divide `total` em inteiros proporcionais aos pesos (maior resto). */
export function splitProportional(total: number, weights: readonly number[]): number[] {
  const sum = weights.reduce((s, w) => s + w, 0);
  if (sum <= 0 || total <= 0) return weights.map(() => 0);
  const raw = weights.map((w) => (total * w) / sum);
  const out = raw.map(Math.floor);
  let rest = total - out.reduce((s, v) => s + v, 0);
  const order = raw.map((v, i) => ({ i, frac: v - Math.floor(v) })).sort((a, b) => b.frac - a.frac || a.i - b.i);
  for (const { i } of order) {
    if (rest <= 0) break;
    if (out[i] < weights[i]) {
      out[i]++;
      rest--;
    }
  }
  return out;
}
