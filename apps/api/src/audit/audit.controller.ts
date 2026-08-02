import { Controller, Get, Query, Res, StreamableFile, UseGuards } from '@nestjs/common';
import { Response } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { RequirePermissions } from '../rbac/permissions.decorator';
import { CurrentTenant } from '../auth/current-tenant.decorator';
import { TenantContext } from '@exam-platform/shared';
import { AuditQueryService, AuditLogFilters } from './audit-query.service';
import { auditLogsToCsv } from './audit-export';

@Controller('audit-logs')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class AuditController {
  constructor(private readonly auditQuery: AuditQueryService) {}

  @Get()
  @RequirePermissions('audit:view')
  async list(
    @CurrentTenant() tenant: TenantContext,
    @Query('entityType') entityType?: string,
    @Query('entityId') entityId?: string,
    @Query('actorUserId') actorUserId?: string,
    @Query('action') action?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('limit') limit?: string,
    @Query('cursor') cursor?: string,
    @Query('category') category?: AuditLogFilters['category'],
  ) {
    const filters: AuditLogFilters = {
      entityType,
      entityId,
      actorUserId,
      action,
      from,
      to,
      limit: limit ? parseInt(limit, 10) : undefined,
      cursor,
      category,
    };
    // total ignores the cursor (it's the count for the whole filtered set, not
    // just this page) so the UI can show "showing 20 of 340" as more pages load.
    const [data, total] = await Promise.all([
      this.auditQuery.list(tenant, filters),
      this.auditQuery.count(tenant, { ...filters, cursor: undefined }),
    ]);
    return { data, total };
  }

  @Get('export')
  @RequirePermissions('audit:view')
  async export(
    @CurrentTenant() tenant: TenantContext,
    @Res({ passthrough: true }) res: Response,
    @Query('entityType') entityType?: string,
    @Query('entityId') entityId?: string,
    @Query('actorUserId') actorUserId?: string,
    @Query('action') action?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('category') category?: AuditLogFilters['category'],
  ): Promise<StreamableFile> {
    const entries = await this.auditQuery.listForExport(tenant, {
      entityType,
      entityId,
      actorUserId,
      action,
      from,
      to,
      category,
    });
    const buffer = auditLogsToCsv(entries);
    res.set({
      'Content-Type': 'text/csv',
      'Content-Disposition': 'attachment; filename="audit-log.csv"',
    });
    return new StreamableFile(buffer);
  }
}
