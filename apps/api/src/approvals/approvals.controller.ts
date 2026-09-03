import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { TenantContext } from '@exam-platform/shared';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { CurrentTenant } from '../auth/current-tenant.decorator';
import { CurrentUserId } from '../auth/current-user-id.decorator';
import { ApprovalsService } from './approvals.service';
import { DecideDto } from './dto/decide.dto';

@Controller('approvals')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ApprovalsController {
  constructor(private readonly approvals: ApprovalsService) {}

  // No @RequirePermissions -- auth-only (any org user), same reasoning as decide() above.
  // Recruiters need to know whether the offer/requisition gate is enabled to render the right
  // CTA ("Submit for approval" vs "Send"), but approvals:configure is org_admin-only, so they
  // can't call getChains() on the /organizations/approvals controller.
  @Get('gate-status')
  getGateStatus(@CurrentTenant() tenant: TenantContext) {
    return this.approvals.getGateStatus(tenant);
  }

  @Get('requests')
  listRequests(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUserId() userId: string,
    @Query('scope') scope?: 'inbox' | 'submitted',
    @Query('status') status?: string,
  ) {
    return this.approvals.listRequests(tenant, userId, scope ?? 'inbox', status);
  }

  @Get('requests/:id')
  getRequestDetail(@CurrentTenant() tenant: TenantContext, @Param('id') id: string) {
    return this.approvals.getRequestDetail(tenant, id);
  }

  // No @RequirePermissions here -- authorization is membership in the request's current
  // approval step, enforced inside ApprovalsService.decide() itself.
  @Post('requests/:id/decide')
  decide(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUserId() userId: string,
    @Param('id') id: string,
    @Body() dto: DecideDto,
  ) {
    return this.approvals.decide(tenant, id, userId, dto.decision, dto.note);
  }
}
