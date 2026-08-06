import { Body, Controller, Get, Param, Post, Res, StreamableFile, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import { Response } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { RequirePermissions } from '../rbac/permissions.decorator';
import { CurrentTenant } from '../auth/current-tenant.decorator';
import { CurrentUserId } from '../auth/current-user-id.decorator';
import { TenantContext } from '@exam-platform/shared';
import { InvitationsService } from './invitations.service';
import { CreateInvitationsDto } from './dto/create-invitations.dto';
import { BulkUploadInviteDto } from './dto/bulk-upload-invite.dto';
import { UpdateAccommodationDto } from './dto/update-accommodation.dto';
import { MODERATE_UPLOAD_THROTTLE } from '../rate-limit-tiers';
import { generateBulkInviteTemplate } from '../candidates/bulk-invite-template';

@Controller()
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class InvitationsController {
  constructor(private readonly invitationsService: InvitationsService) {}

  @Post('exams/:examId/invitations')
  @RequirePermissions('candidate:manage')
  bulkInvite(@CurrentTenant() tenant: TenantContext, @Param('examId') examId: string, @Body() dto: CreateInvitationsDto) {
    return this.invitationsService.bulkInvite(tenant, examId, dto.candidateIds, dto.advancedFromExamId);
  }

  @Post('candidates/bulk-upload-invite')
  @RequirePermissions('candidate:manage')
  @UseInterceptors(FileInterceptor('file'))
  @Throttle(MODERATE_UPLOAD_THROTTLE)
  bulkUploadInvite(
    @CurrentTenant() tenant: TenantContext,
    @Body() dto: BulkUploadInviteDto,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.invitationsService.bulkUploadAndInvite(tenant, dto.examId, file);
  }

  @Get('candidates/bulk-upload-invite/template')
  @RequirePermissions('candidate:manage')
  async downloadBulkUploadInviteTemplate(@Res({ passthrough: true }) res: Response): Promise<StreamableFile> {
    const buffer = await generateBulkInviteTemplate();
    res.set({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="candidate-bulk-upload-invite-template.xlsx"',
    });
    return new StreamableFile(buffer);
  }

  @Get('exams/:examId/invitations')
  @RequirePermissions('candidate:manage')
  list(@CurrentTenant() tenant: TenantContext, @Param('examId') examId: string) {
    return this.invitationsService.list(tenant, examId);
  }

  @Post('invitations/:id/resend')
  @RequirePermissions('candidate:manage')
  resend(@CurrentTenant() tenant: TenantContext, @CurrentUserId() userId: string, @Param('id') id: string) {
    return this.invitationsService.resend(tenant, userId, id);
  }

  @Post('invitations/:id/accommodation')
  @RequirePermissions('candidate:manage')
  updateAccommodation(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUserId() userId: string,
    @Param('id') id: string,
    @Body() dto: UpdateAccommodationDto,
  ) {
    return this.invitationsService.updateAccommodation(tenant, userId, id, dto.extraTimePercent);
  }

  @Post('invitations/:id/revoke')
  @RequirePermissions('candidate:manage')
  revoke(@CurrentTenant() tenant: TenantContext, @CurrentUserId() userId: string, @Param('id') id: string) {
    return this.invitationsService.revoke(tenant, userId, id);
  }
}
