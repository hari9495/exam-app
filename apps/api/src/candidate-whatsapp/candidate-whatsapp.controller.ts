import { Body, Controller, Param, Post, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { RequirePermissions } from '../rbac/permissions.decorator';
import { CurrentTenant } from '../auth/current-tenant.decorator';
import { CurrentUserId } from '../auth/current-user-id.decorator';
import { TenantContext } from '@exam-platform/shared';
import { CandidateWhatsappService } from './candidate-whatsapp.service';
import { SendWhatsappDto } from './dto/send-whatsapp.dto';

@Controller('candidate-whatsapp')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class CandidateWhatsappController {
  constructor(private readonly candidateWhatsapp: CandidateWhatsappService) {}

  @Post(':entryId')
  @RequirePermissions('pipeline:manage')
  sendWhatsapp(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUserId() userId: string,
    @Param('entryId') entryId: string,
    @Body() dto: SendWhatsappDto,
  ) {
    return this.candidateWhatsapp.sendWhatsapp(tenant, userId, entryId, { ...dto, source: 'manual' });
  }

  @Get(':candidateId')
  @RequirePermissions('pipeline:manage')
  listMessages(@CurrentTenant() tenant: TenantContext, @Param('candidateId') candidateId: string) {
    return this.candidateWhatsapp.listMessages(tenant, candidateId);
  }

  @Post(':id/resend')
  @RequirePermissions('pipeline:manage')
  resend(@CurrentTenant() tenant: TenantContext, @CurrentUserId() userId: string, @Param('id') id: string) {
    return this.candidateWhatsapp.resend(tenant, userId, id);
  }
}
