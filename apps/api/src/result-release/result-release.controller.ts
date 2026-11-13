import { Body, Controller, Param, Post, UseGuards } from '@nestjs/common';
import { TenantContext } from '@exam-platform/shared';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { OwnSessionChangesGuard } from '../auth/own-session.guard';
import { RequireAnyPermission } from '../rbac/permissions.decorator';
import { RequireStepUp } from '../auth/step-up.decorator';
import { CurrentTenant } from '../auth/current-tenant.decorator';
import { CurrentUserId } from '../auth/current-user-id.decorator';
import { ResultReleaseService } from './result-release.service';
import { ReleaseResultsDto } from './dto/release-results.dto';

// Recruiter result-release actions, gated on exam:manage (same key attempts-admin mutations use).
@Controller()
// AS-0 (answer 2006): no assessments change while acting for someone else.
@UseGuards(JwtAuthGuard, OwnSessionChangesGuard, PermissionsGuard)
export class ResultReleaseController {
  constructor(private readonly service: ResultReleaseService) {}

  // AS-0 (answer 2006): releasing results asks for the second factor again.
  @Post('exams/:examId/results/release')
  @RequireAnyPermission('exam:manage', 'asmt.evaluate')
  @RequireStepUp()
  releaseExam(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUserId() userId: string,
    @Param('examId') examId: string,
    @Body() dto: ReleaseResultsDto,
  ) {
    return this.service.releaseExam(tenant, userId, examId, dto.notify ?? false);
  }

  @Post('attempts/:attemptId/results/release')
  @RequireAnyPermission('exam:manage', 'asmt.evaluate')
  @RequireStepUp()
  releaseAttempt(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUserId() userId: string,
    @Param('attemptId') attemptId: string,
    @Body() dto: ReleaseResultsDto,
  ) {
    return this.service.setAttemptRelease(tenant, userId, attemptId, 'released', dto.notify ?? false);
  }

  @Post('attempts/:attemptId/results/hold')
  @RequireAnyPermission('exam:manage', 'asmt.evaluate')
  holdAttempt(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUserId() userId: string,
    @Param('attemptId') attemptId: string,
  ) {
    return this.service.setAttemptRelease(tenant, userId, attemptId, 'held', false);
  }
}
