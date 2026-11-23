import { Injectable } from '@nestjs/common';
import type { Page, ReportDetailDto, ReportSummaryDto } from '@wn/shared';
import { GameError } from '../../common/errors/game-error';
import { PrismaService } from '../../common/prisma/prisma.service';
import { toReportSummary } from '../../core/game/reports';

/** Cursor = "<createdAt ISO>|<reportId>" (ordem: mais novo primeiro). */
function parseCursor(c?: string): { at: Date; id: string } | null {
  if (!c) return null;
  const [at, id] = c.split('|');
  const d = new Date(at);
  return id && !Number.isNaN(d.getTime()) ? { at: d, id } : null;
}

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(playerId: string, cursor: string | undefined, limit: number): Promise<Page<ReportSummaryDto>> {
    const c = parseCursor(cursor);
    const rows = await this.prisma.reportRecipient.findMany({
      where: {
        playerId,
        ...(c ? { OR: [{ createdAt: { lt: c.at } }, { createdAt: c.at, reportId: { lt: c.id } }] } : {}),
      },
      include: { report: true },
      orderBy: [{ createdAt: 'desc' }, { reportId: 'desc' }],
      take: limit + 1,
    });
    const items = rows.slice(0, limit);
    const last = items[items.length - 1];
    return {
      items: items.map((r) => toReportSummary(r.report, r)),
      nextCursor: rows.length > limit && last ? `${last.createdAt.toISOString()}|${last.reportId}` : null,
    };
  }

  async detail(playerId: string, reportId: string): Promise<ReportDetailDto> {
    const rec = await this.prisma.reportRecipient.findUnique({ where: { reportId_playerId: { reportId, playerId } }, include: { report: true } });
    if (!rec) throw new GameError('NOT_FOUND', { entity: 'report' });
    return { ...toReportSummary(rec.report, rec), payload: rec.report.payload } as ReportDetailDto;
  }

  async markRead(playerId: string, reportId: string): Promise<void> {
    const r = await this.prisma.reportRecipient.updateMany({ where: { reportId, playerId, readAt: null }, data: { readAt: new Date() } });
    if (r.count === 0) {
      const exists = await this.prisma.reportRecipient.findUnique({ where: { reportId_playerId: { reportId, playerId } } });
      if (!exists) throw new GameError('NOT_FOUND', { entity: 'report' });
    }
  }
}
