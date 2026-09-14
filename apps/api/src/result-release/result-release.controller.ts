import { Body, Controller, Param, Post, UseGuards } from '@nestjs/common';
import { TenantContext } from '@exam-platform/shared';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { RequirePermissions } from '../rbac/permissions.decorator';
import { CurrentTenant } from '../auth/current-tenant.decorator';
import { CurrentUserId } from '../auth/current-user-id.decorator';
import { ResultReleaseService } from './result-release.service';
import { ReleaseResultsDto } from './dto/release-results.dto';

// Recruiter result-release actions, gated on exam:manage (same key attempts-admin mutations use).
@Controller()
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ResultReleaseController {
  constructor(private readonly service: ResultReleaseService) {}

  @Post('exams/:examId/results/release')
  @RequirePermissions('exam:manage')
  releaseExam(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUserId() userId: string,
    @Param('examId') examId: string,
    @Body() dto: ReleaseResultsDto,
  ) {
    return this.service.releaseExam(tenant, userId, examId, dto.notify ?? false);
  }

  @Post('attempts/:attemptId/results/release')
  @RequirePermissions('exam:manage')
  releaseAttempt(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUserId() userId: string,
    @Param('attemptId') attemptId: string,
    @Body() dto: ReleaseResultsDto,
  ) {
    return this.service.setAttemptRelease(tenant, userId, attemptId, 'released', dto.notify ?? false);
  }

  @Post('attempts/:attemptId/results/hold')
  @RequirePermissions('exam:manage')
  holdAttempt(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUserId() userId: string,
    @Param('attemptId') attemptId: string,
  ) {
    return this.service.setAttemptRelease(tenant, userId, attemptId, 'held', false);
  }
}
