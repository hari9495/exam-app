import { Controller, Get, UseGuards } from '@nestjs/common';
import { TenantContext } from '@exam-platform/shared';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { CurrentTenant } from '../auth/current-tenant.decorator';
import { ApprovalsService } from './approvals.service';

@Controller('approvals')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ApprovalsController {
  constructor(private readonly approvals: ApprovalsService) {}

  // No @RequirePermissions -- auth-only (any org user).
  // Recruiters need to know whether the offer/requisition gate is enabled to render the right
  // CTA ("Submit for approval" vs "Send"), but approvals:configure is org_admin-only, so they
  // can't call getChains() on the /organizations/approvals controller.
  @Get('gate-status')
  getGateStatus(@CurrentTenant() tenant: TenantContext) {
    return this.approvals.getGateStatus(tenant);
  }
}
