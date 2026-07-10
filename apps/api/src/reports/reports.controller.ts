import { Controller, Get, Param, Query, Res, StreamableFile, UseGuards } from '@nestjs/common';
import { Response } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { RequirePermissions } from '../rbac/permissions.decorator';
import { CurrentTenant } from '../auth/current-tenant.decorator';
import { TenantContext } from '@exam-platform/shared';
import { ReportsService, ExportResultRow } from './reports.service';
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
  @RequirePermissions('exam:manage')
  getSummary(@CurrentTenant() tenant: TenantContext, @Param('id') id: string) {
    return this.reportsService.getSummary(tenant, id);
  }

  @Get(':id/results/question-accuracy')
  @RequirePermissions('exam:manage')
  getQuestionAccuracy(@CurrentTenant() tenant: TenantContext, @Param('id') id: string) {
    return this.reportsService.getQuestionAccuracy(tenant, id);
  }

  @Get(':id/results/export')
  @RequirePermissions('exam:manage')
  async exportResults(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') id: string,
    @Query() query: ExportFormatQueryDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const rows = await this.reportsService.getExportRows(tenant, id);
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
