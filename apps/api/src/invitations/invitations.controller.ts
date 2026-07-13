import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { RequirePermissions } from '../rbac/permissions.decorator';
import { CurrentTenant } from '../auth/current-tenant.decorator';
import { CurrentUserId } from '../auth/current-user-id.decorator';
import { TenantContext } from '@exam-platform/shared';
import { InvitationsService } from './invitations.service';
import { CreateInvitationsDto } from './dto/create-invitations.dto';

@Controller()
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class InvitationsController {
  constructor(private readonly invitationsService: InvitationsService) {}

  @Post('exams/:examId/invitations')
  @RequirePermissions('candidate:manage')
  bulkInvite(@CurrentTenant() tenant: TenantContext, @Param('examId') examId: string, @Body() dto: CreateInvitationsDto) {
    return this.invitationsService.bulkInvite(tenant, examId, dto.candidateIds);
  }

  @Get('exams/:examId/invitations')
  @RequirePermissions('candidate:manage')
  list(@CurrentTenant() tenant: TenantContext, @Param('examId') examId: string) {
    return this.invitationsService.list(tenant, examId);
  }

  @Post('invitations/:id/resend')
  @RequirePermissions('candidate:manage')
  resend(@CurrentTenant() tenant: TenantContext, @Param('id') id: string) {
    return this.invitationsService.resend(tenant, id);
  }

  @Post('invitations/:id/revoke')
  @RequirePermissions('candidate:manage')
  revoke(@CurrentTenant() tenant: TenantContext, @CurrentUserId() userId: string, @Param('id') id: string) {
    return this.invitationsService.revoke(tenant, userId, id);
  }
}
