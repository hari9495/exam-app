import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { CurrentTenant } from '../auth/current-tenant.decorator';
import { CurrentUserId } from '../auth/current-user-id.decorator';
import { assertOwnSession } from '../service-desk/desk-access';
import { TenantContext } from '@exam-platform/shared';
import { InternalApplicationsService } from './internal-applications.service';
import { ApplyInternalDto } from './dto/internal-application.dto';

// HIR-13 Internal jobs. Every route is the signed-in person's own (PermissionsGuard is a no-op without
// @RequirePermissions): the jobs shown on Internal jobs, whether they may apply (company rules, founder decision 6),
// applying, and their own applications. Who may apply is checked by the service from People, never by the client.
// Internal applicants surface in the normal pipeline board (enteredVia='internal').
@Controller('internal-applications')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class InternalApplicationsController {
  constructor(private readonly internal: InternalApplicationsService) {}

  @Get('jobs')
  jobs(@CurrentTenant() tenant: TenantContext, @CurrentUserId() userId: string) {
    return this.internal.openJobs(tenant, userId);
  }

  @Get('eligibility')
  eligibility(@CurrentTenant() tenant: TenantContext, @CurrentUserId() userId: string) {
    return this.internal.eligibility(tenant, userId);
  }

  // Applying is the person's own act (it is about their career), so it is refused while acting for someone else.
  @Post()
  apply(@Req() req: Request, @CurrentTenant() tenant: TenantContext, @CurrentUserId() userId: string, @Body() dto: ApplyInternalDto) {
    assertOwnSession(req);
    return this.internal.apply(tenant, userId, dto);
  }

  @Get('mine')
  mine(@CurrentTenant() tenant: TenantContext, @CurrentUserId() userId: string) {
    return this.internal.myApplications(tenant, userId);
  }
}
