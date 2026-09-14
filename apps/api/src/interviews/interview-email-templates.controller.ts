import { Body, Controller, Get, Param, Put, UseGuards } from '@nestjs/common';
import { TenantContext } from '@exam-platform/shared';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { RequirePermissions } from '../rbac/permissions.decorator';
import { CurrentTenant } from '../auth/current-tenant.decorator';
import { CurrentUserId } from '../auth/current-user-id.decorator';
import { InterviewEmailTemplatesService } from './interview-email-templates.service';
import { UpsertInterviewEmailTemplateDto } from './dto/upsert-interview-email-template.dto';

// Gated on pipeline:manage — the same key interviews.controller uses to send/cancel interviews
// (interview config is recruiter-managed, not an org:manage_settings concern).
@Controller('interview-email-templates')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class InterviewEmailTemplatesController {
  constructor(private readonly templates: InterviewEmailTemplatesService) {}

  @Get()
  @RequirePermissions('pipeline:manage')
  list(@CurrentTenant() tenant: TenantContext) {
    return this.templates.list(tenant);
  }

  @Put(':eventType')
  @RequirePermissions('pipeline:manage')
  upsert(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUserId() userId: string,
    @Param('eventType') eventType: string,
    @Body() dto: UpsertInterviewEmailTemplateDto,
  ) {
    return this.templates.upsert(tenant, userId, eventType, dto);
  }
}
