import { Body, Controller, Param, Post, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { RequirePermissions } from '../rbac/permissions.decorator';
import { CurrentTenant } from '../auth/current-tenant.decorator';
import { CurrentUserId } from '../auth/current-user-id.decorator';
import { TenantContext } from '@exam-platform/shared';
import { CandidateSmsService } from './candidate-sms.service';
import { SendSmsDto } from './dto/send-sms.dto';

@Controller('candidate-sms')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class CandidateSmsController {
  constructor(private readonly candidateSms: CandidateSmsService) {}

  @Post(':entryId')
  @RequirePermissions('pipeline:manage')
  sendSms(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUserId() userId: string,
    @Param('entryId') entryId: string,
    @Body() dto: SendSmsDto,
  ) {
    return this.candidateSms.sendSms(tenant, userId, entryId, { ...dto, source: 'manual' });
  }

  @Get(':candidateId')
  @RequirePermissions('pipeline:manage')
  listMessages(@CurrentTenant() tenant: TenantContext, @Param('candidateId') candidateId: string) {
    return this.candidateSms.listMessages(tenant, candidateId);
  }

  @Post(':id/resend')
  @RequirePermissions('pipeline:manage')
  resend(@CurrentTenant() tenant: TenantContext, @CurrentUserId() userId: string, @Param('id') id: string) {
    return this.candidateSms.resend(tenant, userId, id);
  }
}
