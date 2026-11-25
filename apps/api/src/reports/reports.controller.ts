import { Controller, Get, Param, Query, Res, StreamableFile, UseGuards } from '@nestjs/common';
import { Response } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { RequirePermissions } from '../rbac/permissions.decorator';
import { SeesAnswerKeys, ShowsAnswerKeys, withoutCorrectOptions } from '../rbac/answer-keys';
import { ResultsScope, ResultsScopeOf, ScopesResults } from '../rbac/results-scope';
import { CurrentTenant } from '../auth/current-tenant.decorator';
import { TenantContext } from '@exam-platform/shared';
import { ReportsService, ExportResultRow, CandidateDetail, CandidateComparisonRow } from './reports.service';
import { ExportFormatQueryDto } from './dto/export-format-query.dto';
import { exportResultsToCsv } from './exporters/csv-exporter';
import { exportResultsToXlsx } from './exporters/xlsx-exporter';
import { exportResultsToPdf } from './exporters/pdf-exporter';

const EXPORT_CONTENT_TYPES: Record<string, string> = {
  csv: 'text/csv',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  pdf: 'application/pdf',
};

@Controller('exams')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get(':id/results/summary')
  @RequirePermissions('results:view')
  @ScopesResults()
  getSummary(@CurrentTenant() tenant: TenantContext, @Param('id') id: string, @ResultsScopeOf() scope: ResultsScope) {
    return this.reportsService.getSummary(tenant, id, scope);
  }

  @Get(':id/results/question-accuracy')
  @RequirePermissions('results:view')
  @ScopesResults()
  getQuestionAccuracy(@CurrentTenant() tenant: TenantContext, @Param('id') id: string, @ResultsScopeOf() scope: ResultsScope) {
    return this.reportsService.getQuestionAccuracy(tenant, id, scope);
  }

  @Get(':id/candidates/:candidateId/report')
  @RequirePermissions('results:view')
  @ShowsAnswerKeys()
  @ScopesResults()
  async getCandidateDetail(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') id: string,
    @Param('candidateId') candidateId: string,
    @SeesAnswerKeys() keys: boolean,
    @ResultsScopeOf() scope: ResultsScope,
    @Query('attemptId') attemptId?: string,
  ): Promise<CandidateDetail> {
    const detail = await this.reportsService.getCandidateDetail(tenant, id, candidateId, attemptId, scope);
    // Readers of results see what the candidate chose and whether it was right, not the answer key (security fix).
    return keys ? detail : withoutCorrectOptions(detail);
  }

  @Get(':id/candidates/compare')
  @RequirePermissions('results:view')
  @ScopesResults()
  compareCandidates(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') id: string,
    @Query('invitationIds') invitationIds: string,
    @ResultsScopeOf() scope: ResultsScope,
  ): Promise<CandidateComparisonRow[]> {
    return this.reportsService.compareCandidates(tenant, id, invitationIds ?? '', scope);
  }

  @Get(':id/results/export')
  @RequirePermissions('results:view')
  @ScopesResults()
  async exportResults(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') id: string,
    @Query() query: ExportFormatQueryDto,
    @Query('invitationIds') invitationIds: string | undefined,
    @Res({ passthrough: true }) res: Response,
    @ResultsScopeOf() scope: ResultsScope,
  ): Promise<StreamableFile> {
    const invitationIdList = invitationIds ? invitationIds.split(',').filter(Boolean) : undefined;
    const rows = await this.reportsService.getExportRows(tenant, id, invitationIdList, scope);
    const buffer = await this.buildExportBuffer(query.format, rows);

    res.set({
      'Content-Type': EXPORT_CONTENT_TYPES[query.format],
      'Content-Disposition': `attachment; filename="exam-${id}-results.${query.format}"`,
    });
    return new StreamableFile(buffer);
  }

  private buildExportBuffer(format: 'csv' | 'xlsx' | 'pdf', rows: ExportResultRow[]): Buffer | Promise<Buffer> {
    if (format === 'csv') {
      return exportResultsToCsv(rows);
    }
    if (format === 'xlsx') {
      return exportResultsToXlsx(rows);
    }
    return exportResultsToPdf(rows);
  }
}
