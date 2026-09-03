import { BadRequestException, Body, Controller, Get, Param, Put, UseGuards } from '@nestjs/common';
import { APPROVAL_GATES, ApprovalGate, TenantContext } from '@exam-platform/shared';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { RequirePermissions } from '../rbac/permissions.decorator';
import { CurrentTenant } from '../auth/current-tenant.decorator';
import { ApprovalsService } from './approvals.service';
import { UpsertChainDto } from './dto/upsert-chain.dto';

@Controller('organizations/approvals')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ApprovalsConfigController {
  constructor(private readonly approvals: ApprovalsService) {}

  @Get('chains')
  @RequirePermissions('approvals:configure')
  getChains(@CurrentTenant() tenant: TenantContext) {
    return this.approvals.getChains(tenant);
  }

  @Put('chains/:gate')
  @RequirePermissions('approvals:configure')
  upsertChain(@CurrentTenant() tenant: TenantContext, @Param('gate') gate: string, @Body() dto: UpsertChainDto) {
    if (!(APPROVAL_GATES as readonly string[]).includes(gate)) {
      throw new BadRequestException(`Unknown gate '${gate}'`);
    }
    return this.approvals.upsertChain(tenant, gate as ApprovalGate, dto);
  }
}
