import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { OwnSessionChangesGuard } from '../auth/own-session.guard';
import { RequireAnyPermission, RequirePermissions } from '../rbac/permissions.decorator';
import { ResultsScope, ResultsScopeOf, ScopesResults } from '../rbac/results-scope';
// Proctor interventions and evaluator grading are sensitive-role actions (P12 §3, YX-IAM-01).
import { RequireStepUp, SensitiveRoleAction } from '../auth/step-up.decorator';
import { EndAttemptDto, PauseAttemptDto, ResumeAttemptDto } from './dto/end-attempt.dto';
import { CurrentTenant } from '../auth/current-tenant.decorator';
import { CurrentUserId } from '../auth/current-user-id.decorator';
import { TenantContext } from '@exam-platform/shared';
import { AttemptsAdminService } from './attempts-admin.service';
import { SendCandidateMessageDto } from './dto/send-candidate-message.dto';
import { GradeCodeAnswerDto } from './dto/grade-code-answer.dto';
import { BypassProctoringDto } from './dto/bypass-proctoring.dto';

@Controller('attempts')
// AS-0 (answer 2006): no assessments change while acting for someone else.
@UseGuards(JwtAuthGuard, OwnSessionChangesGuard, PermissionsGuard)
export class AttemptsAdminController {
  constructor(private readonly attemptsAdminService: AttemptsAdminService) {}

  @Get(':id/proctoring-events')
  @RequireAnyPermission('exam:manage', 'asmt.proctor')
  listProctoringEvents(@CurrentTenant() tenant: TenantContext, @Param('id') id: string) {
    return this.attemptsAdminService.listProctoringEvents(tenant, id);
  }

  // AS-0 (answer 2006): ending an attempt asks for the second factor again and a reason the candidate's record keeps.
  @Post(':id/force-submit')
  @RequireAnyPermission('exam:manage', 'asmt.proctor')
  @SensitiveRoleAction()
  @RequireStepUp()
  forceSubmit(@CurrentTenant() tenant: TenantContext, @CurrentUserId() userId: string, @Param('id') id: string, @Body() dto: EndAttemptDto) {
    return this.attemptsAdminService.forceSubmit(tenant, id, userId, dto.reason.trim());
  }

  // AS-5 (PRC-13, answer 2006): pausing and resuming from the live console, each with a reason the record keeps.
  @Post(':id/pause')
  @HttpCode(200)
  @RequireAnyPermission('exam:manage', 'asmt.proctor')
  pause(@CurrentTenant() tenant: TenantContext, @CurrentUserId() userId: string, @Param('id', ParseUUIDPipe) id: string, @Body() dto: PauseAttemptDto) {
    return this.attemptsAdminService.pause(tenant, id, userId, dto.reason.trim(), dto.message?.trim() || null);
  }

  @Post(':id/resume')
  @HttpCode(200)
  @RequireAnyPermission('exam:manage', 'asmt.proctor')
  resume(@CurrentTenant() tenant: TenantContext, @CurrentUserId() userId: string, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ResumeAttemptDto) {
    return this.attemptsAdminService.resume(tenant, id, userId, dto.reason.trim());
  }

  // AS-0: overturning the proctoring verdict (unblocking) asks for the second factor again.
  @Post(':id/unblock')
  @RequireAnyPermission('exam:manage', 'asmt.proctor')
  @SensitiveRoleAction()
  @RequireStepUp()
  unblock(@CurrentTenant() tenant: TenantContext, @CurrentUserId() userId: string, @Param('id') id: string) {
    return this.attemptsAdminService.unblock(tenant, id, userId);
  }

  // AS-0: excusing a candidate from proctoring overturns its verdict too.
  @Post(':id/proctoring-bypass')
  @RequireAnyPermission('exam:manage', 'asmt.proctor')
  @SensitiveRoleAction()
  @RequireStepUp()
  bypassProctoring(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUserId() userId: string,
    @Param('id') id: string,
    @Body() dto: BypassProctoringDto,
  ) {
    return this.attemptsAdminService.bypassProctoring(tenant, id, userId, dto.reason);
  }

  @Post(':id/proctoring-bypass/revoke')
  @RequireAnyPermission('exam:manage', 'asmt.proctor')
  @SensitiveRoleAction()
  revokeProctoringBypass(@CurrentTenant() tenant: TenantContext, @CurrentUserId() userId: string, @Param('id') id: string) {
    return this.attemptsAdminService.revokeProctoringBypass(tenant, id, userId);
  }

  @Post(':id/answers/:questionId/grade')
  @RequireAnyPermission('exam:manage', 'asmt.evaluate')
  @SensitiveRoleAction()
  gradeCodeAnswer(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUserId() userId: string,
    @Param('id') id: string,
    @Param('questionId') questionId: string,
    @Body() dto: GradeCodeAnswerDto,
  ) {
    return this.attemptsAdminService.gradeCodeAnswer(tenant, id, questionId, userId, dto.marksAwarded, dto.feedback);
  }

  // AS-0: finishing the marking asks for the second factor again.
  @Post(':id/finalize-manual-grade')
  @RequireAnyPermission('exam:manage', 'asmt.evaluate')
  @SensitiveRoleAction()
  @RequireStepUp()
  finalizeManualGrade(@CurrentTenant() tenant: TenantContext, @CurrentUserId() userId: string, @Param('id') id: string) {
    return this.attemptsAdminService.finalizeManualGrade(tenant, id, userId);
  }

  @Post(':id/message')
  @RequireAnyPermission('exam:manage', 'asmt.proctor')
  sendMessage(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUserId() userId: string,
    @Param('id') id: string,
    @Body() dto: SendCandidateMessageDto,
  ) {
    return this.attemptsAdminService.sendMessage(tenant, id, userId, dto.body);
  }

  @Get(':id/messages')
  @RequireAnyPermission('exam:manage', 'asmt.proctor')
  listMessages(@CurrentTenant() tenant: TenantContext, @Param('id') id: string) {
    return this.attemptsAdminService.listMessages(tenant, id);
  }

  @Post(':id/reanalyze')
  @RequireAnyPermission('exam:manage', 'asmt.proctor')
  reanalyze(@CurrentTenant() tenant: TenantContext, @CurrentUserId() userId: string, @Param('id') id: string) {
    return this.attemptsAdminService.reanalyze(tenant, userId, id);
  }

  @Get(':id/ai-insight')
  @RequirePermissions('results:view')
  @ScopesResults()
  getInsight(@CurrentTenant() tenant: TenantContext, @Param('id') id: string, @ResultsScopeOf() scope: ResultsScope) {
    return this.attemptsAdminService.getInsight(tenant, id, scope);
  }

  // A paid AI call: a writer's key, not a reader's (security fix).
  @Post(':id/ai-insight/regenerate')
  @RequireAnyPermission('exam:manage', 'asmt.evaluate')
  regenerateInsight(@CurrentTenant() tenant: TenantContext, @CurrentUserId() userId: string, @Param('id') id: string) {
    return this.attemptsAdminService.regenerateInsight(tenant, userId, id);
  }

  @Get(':id/answers/:questionId/code-review')
  @RequireAnyPermission('exam:manage', 'asmt.evaluate')
  getCodeReview(@CurrentTenant() tenant: TenantContext, @Param('id') id: string, @Param('questionId') questionId: string) {
    return this.attemptsAdminService.getCodeReview(tenant, id, questionId);
  }

  @Post(':id/answers/:questionId/code-review/regenerate')
  @RequireAnyPermission('exam:manage', 'asmt.evaluate')
  regenerateCodeReview(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUserId() userId: string,
    @Param('id') id: string,
    @Param('questionId') questionId: string,
  ) {
    return this.attemptsAdminService.regenerateCodeReview(tenant, userId, id, questionId);
  }
}
