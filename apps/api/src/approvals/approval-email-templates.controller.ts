import { Body, Controller, Get, Param, Put, UseGuards } from '@nestjs/common';
import { TenantContext } from '@exam-platform/shared';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { OwnSessionChangesGuard } from '../auth/own-session.guard';
import { RequirePermissions } from '../rbac/permissions.decorator';
import { CurrentTenant } from '../auth/current-tenant.decorator';
import { CurrentUserId } from '../auth/current-user-id.decorator';
import { ApprovalEmailTemplatesService } from './approval-email-templates.service';
import { UpsertApprovalEmailTemplateDto } from './dto/upsert-approval-email-template.dto';

@Controller('approval-email-templates')
// Settings 5.4 (answer 2429): no change while acting for someone else.
@UseGuards(JwtAuthGuard, PermissionsGuard, OwnSessionChangesGuard)
export class ApprovalEmailTemplatesController {
  constructor(private readonly templates: ApprovalEmailTemplatesService) {}

  @Get()
  @RequirePermissions('approvals:configure')
  list(@CurrentTenant() tenant: TenantContext) {
    return this.templates.list(tenant);
  }

  @Put(':eventType')
  @RequirePermissions('approvals:configure')
  upsert(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUserId() userId: string,
    @Param('eventType') eventType: string,
    @Body() dto: UpsertApprovalEmailTemplateDto,
  ) {
    return this.templates.upsert(tenant, userId, eventType, dto);
  }
}
