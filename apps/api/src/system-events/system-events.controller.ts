import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { RequirePermissions } from '../rbac/permissions.decorator';
import { CurrentTenant } from '../auth/current-tenant.decorator';
import { TenantContext } from '@exam-platform/shared';
import { SystemEventsQueryService, SystemEventFilters } from './system-events-query.service';

// Gated on audit:view rather than a new permission key: the audience for "what broke in
// production" is exactly the audience already trusted to read the audit trail.
@Controller('system-events')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class SystemEventsController {
  constructor(private readonly systemEventsQuery: SystemEventsQueryService) {}

  @Get()
  @RequirePermissions('audit:view')
  async list(
    @CurrentTenant() tenant: TenantContext,
    @Query('service') service?: string,
    @Query('severity') severity?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('attemptId') attemptId?: string,
    @Query('limit') limit?: string,
    @Query('cursor') cursor?: string,
  ) {
    const filters: SystemEventFilters = {
      service,
      severity,
      from,
      to,
      attemptId,
      limit: limit ? parseInt(limit, 10) : undefined,
      cursor,
    };
    const [data, total] = await Promise.all([
      this.systemEventsQuery.list(tenant, filters),
      this.systemEventsQuery.count(tenant, { ...filters, cursor: undefined }),
    ]);
    return { data, total };
  }
}
