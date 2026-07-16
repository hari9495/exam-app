import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { RequirePermissions } from '../rbac/permissions.decorator';
import { CurrentTenant } from '../auth/current-tenant.decorator';
import { CurrentUserId } from '../auth/current-user-id.decorator';
import { TenantContext } from '@exam-platform/shared';
import { AttemptsAdminService } from './attempts-admin.service';
import { SendCandidateMessageDto } from './dto/send-candidate-message.dto';
import { GradeCodeAnswerDto } from './dto/grade-code-answer.dto';

@Controller('attempts')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class AttemptsAdminController {
  constructor(private readonly attemptsAdminService: AttemptsAdminService) {}

  @Get(':id/proctoring-events')
  @RequirePermissions('exam:manage')
  listProctoringEvents(@CurrentTenant() tenant: TenantContext, @Param('id') id: string) {
    return this.attemptsAdminService.listProctoringEvents(tenant, id);
  }

  @Post(':id/force-submit')
  @RequirePermissions('exam:manage')
  forceSubmit(@CurrentTenant() tenant: TenantContext, @CurrentUserId() userId: string, @Param('id') id: string) {
    return this.attemptsAdminService.forceSubmit(tenant, id, userId);
  }

  @Post(':id/unblock')
  @RequirePermissions('exam:manage')
  unblock(@CurrentTenant() tenant: TenantContext, @CurrentUserId() userId: string, @Param('id') id: string) {
    return this.attemptsAdminService.unblock(tenant, id, userId);
  }

  @Post(':id/answers/:questionId/grade')
  @RequirePermissions('exam:manage')
  gradeCodeAnswer(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUserId() userId: string,
    @Param('id') id: string,
    @Param('questionId') questionId: string,
    @Body() dto: GradeCodeAnswerDto,
  ) {
    return this.attemptsAdminService.gradeCodeAnswer(tenant, id, questionId, userId, dto.marksAwarded, dto.feedback);
  }

  @Post(':id/finalize-manual-grade')
  @RequirePermissions('exam:manage')
  finalizeManualGrade(@CurrentTenant() tenant: TenantContext, @CurrentUserId() userId: string, @Param('id') id: string) {
    return this.attemptsAdminService.finalizeManualGrade(tenant, id, userId);
  }

  @Post(':id/message')
  @RequirePermissions('exam:manage')
  sendMessage(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUserId() userId: string,
    @Param('id') id: string,
    @Body() dto: SendCandidateMessageDto,
  ) {
    return this.attemptsAdminService.sendMessage(tenant, id, userId, dto.body);
  }

  @Get(':id/messages')
  @RequirePermissions('exam:manage')
  listMessages(@CurrentTenant() tenant: TenantContext, @Param('id') id: string) {
    return this.attemptsAdminService.listMessages(tenant, id);
  }

  @Post(':id/reanalyze')
  @RequirePermissions('exam:manage')
  reanalyze(@CurrentTenant() tenant: TenantContext, @CurrentUserId() userId: string, @Param('id') id: string) {
    return this.attemptsAdminService.reanalyze(tenant, userId, id);
  }

  @Get(':id/ai-insight')
  @RequirePermissions('results:view')
  getInsight(@CurrentTenant() tenant: TenantContext, @Param('id') id: string) {
    return this.attemptsAdminService.getInsight(tenant, id);
  }

  @Post(':id/ai-insight/regenerate')
  @RequirePermissions('results:view')
  regenerateInsight(@CurrentTenant() tenant: TenantContext, @CurrentUserId() userId: string, @Param('id') id: string) {
    return this.attemptsAdminService.regenerateInsight(tenant, userId, id);
  }

  @Get(':id/answers/:questionId/code-review')
  @RequirePermissions('exam:manage')
  getCodeReview(@CurrentTenant() tenant: TenantContext, @Param('id') id: string, @Param('questionId') questionId: string) {
    return this.attemptsAdminService.getCodeReview(tenant, id, questionId);
  }

  @Post(':id/answers/:questionId/code-review/regenerate')
  @RequirePermissions('exam:manage')
  regenerateCodeReview(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUserId() userId: string,
    @Param('id') id: string,
    @Param('questionId') questionId: string,
  ) {
    return this.attemptsAdminService.regenerateCodeReview(tenant, userId, id, questionId);
  }
}
