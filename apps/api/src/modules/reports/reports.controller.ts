import { Controller, Get, HttpCode, Param, Post, Query } from '@nestjs/common';
import { idSchema, reportsQuerySchema, type Page, type ReportDetailDto, type ReportSummaryDto } from '@wn/shared';
import { CurrentUser, type AuthUser } from '../../common/auth/auth';
import { ZodPipe } from '../../common/pipes/zod.pipe';
import { ReportsService } from './reports.service';

@Controller('reports')
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  /** GET /reports?cursor=&limit=20 */
  @Get()
  list(@CurrentUser() u: AuthUser, @Query(new ZodPipe(reportsQuerySchema)) q: { cursor?: string; limit: number }): Promise<Page<ReportSummaryDto>> {
    return this.reports.list(u.playerId, q.cursor, q.limit);
  }

  @Get(':id')
  detail(@CurrentUser() u: AuthUser, @Param('id', new ZodPipe(idSchema)) id: string): Promise<ReportDetailDto> {
    return this.reports.detail(u.playerId, id);
  }

  @Post(':id/read')
  @HttpCode(204)
  async read(@CurrentUser() u: AuthUser, @Param('id', new ZodPipe(idSchema)) id: string): Promise<void> {
    await this.reports.markRead(u.playerId, id);
  }
}
