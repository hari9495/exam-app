import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { TenantContext } from '@exam-platform/shared';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { RequirePermissions } from '../rbac/permissions.decorator';
import { CurrentTenant } from '../auth/current-tenant.decorator';
import { CurrentUserId } from '../auth/current-user-id.decorator';
import { BulkCandidateEmailService } from './bulk-candidate-email.service';
import { SendBulkByEntriesDto, SendBulkByCandidatesDto } from './dto/send-bulk-email.dto';

// Recruiter-triggered bulk email to selected candidates. Gated on pipeline:manage, the same key the
// single candidate-email send uses. Both send routes enqueue a background batch (BullMQ) and return a
// batchId the web polls via GET :batchId for live progress.
@Controller('bulk-candidate-email')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class BulkCandidateEmailController {
  constructor(private readonly service: BulkCandidateEmailService) {}

  @Post('by-entries')
  @RequirePermissions('pipeline:manage')
  sendByEntries(@CurrentTenant() tenant: TenantContext, @CurrentUserId() userId: string, @Body() dto: SendBulkByEntriesDto) {
    return this.service.sendToEntries(tenant, userId, dto.entryIds, dto);
  }

  @Post('by-candidates')
  @RequirePermissions('pipeline:manage')
  sendByCandidates(@CurrentTenant() tenant: TenantContext, @CurrentUserId() userId: string, @Body() dto: SendBulkByCandidatesDto) {
    return this.service.sendToCandidates(tenant, userId, dto.candidateIds, dto);
  }

  @Get(':batchId')
  @RequirePermissions('pipeline:manage')
  getBatch(@CurrentTenant() tenant: TenantContext, @Param('batchId') batchId: string) {
    return this.service.getBatch(tenant, batchId);
  }
}
