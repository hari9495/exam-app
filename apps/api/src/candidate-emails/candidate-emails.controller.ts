import { Body, Controller, Param, Post, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { RequirePermissions } from '../rbac/permissions.decorator';
import { CurrentTenant } from '../auth/current-tenant.decorator';
import { CurrentUserId } from '../auth/current-user-id.decorator';
import { TenantContext } from '@exam-platform/shared';
import { CandidateEmailsService } from './candidate-emails.service';
import { SendMessageDto } from './dto/send-message.dto';

@Controller()
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class CandidateEmailsController {
  constructor(private readonly candidateEmails: CandidateEmailsService) {}

  @Post('pipeline/entries/:id/messages')
  @RequirePermissions('pipeline:manage')
  sendMessage(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUserId() userId: string,
    @Param('id') id: string,
    @Body() dto: SendMessageDto,
  ) {
    return this.candidateEmails.sendMessage(tenant, userId, id, { ...dto, source: 'manual' });
  }

  @Get('candidates/:id/messages')
  @RequirePermissions('pipeline:manage')
  listMessages(@CurrentTenant() tenant: TenantContext, @Param('id') id: string) {
    return this.candidateEmails.listMessages(tenant, id);
  }

  @Post('candidate-emails/:id/resend')
  @RequirePermissions('pipeline:manage')
  resend(@CurrentTenant() tenant: TenantContext, @CurrentUserId() userId: string, @Param('id') id: string) {
    return this.candidateEmails.resend(tenant, userId, id);
  }
}
