import { BadRequestException, Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query, UseGuards } from '@nestjs/common';
import { IsBoolean, IsIn, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { TenantContext } from '@exam-platform/shared';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { OwnSessionChangesGuard } from '../../auth/own-session.guard';
import { CurrentTenant } from '../../auth/current-tenant.decorator';
import { CurrentUserId } from '../../auth/current-user-id.decorator';
import { PermissionsGuard } from '../../rbac/permissions.guard';
import { RequireAnyPermission } from '../../rbac/permissions.decorator';
import { RequireStepUp } from '../../auth/step-up.decorator';
import { IntegrityReviewService } from './integrity-review.service';

class VerdictDto {
  @IsIn(['cleared', 'warning', 'section'])
  verdict!: 'cleared' | 'warning' | 'section';
  @IsString()
  @MaxLength(2000)
  reason!: string;
  @IsOptional()
  @IsString()
  @MaxLength(200)
  sectionTitle?: string;
}
class ReasonDto {
  @IsString()
  @MaxLength(2000)
  reason!: string;
}
class InvalidateDto extends ReasonDto {
  @IsUUID()
  secondReviewerId!: string;
}
class SecondReviewDto extends ReasonDto {
  @IsBoolean()
  confirm!: boolean;
}

// AS-5 part 1: integrity review by the people who proctor or evaluate tests (question 2261). No change while acting
// for someone else (answer 2006).
const REVIEW = ['asmt.proctor', 'asmt.evaluate', 'exam:manage'] as const;

@Controller('asmt')
@UseGuards(JwtAuthGuard, OwnSessionChangesGuard, PermissionsGuard)
export class IntegrityReviewController {
  constructor(private readonly service: IntegrityReviewService) {}

  @Get('integrity')
  @RequireAnyPermission(...REVIEW)
  queue(@CurrentTenant() ctx: TenantContext) {
    return this.service.queue(ctx);
  }

  @Get('integrity/reviewers')
  @RequireAnyPermission(...REVIEW)
  reviewers(@CurrentTenant() ctx: TenantContext, @CurrentUserId() userId: string) {
    return this.service.reviewers(ctx, userId);
  }

  @Get('integrity/:id')
  @RequireAnyPermission(...REVIEW)
  get(@CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.get(ctx, id);
  }

  @Post('integrity/attempts/:attemptId/open')
  @RequireAnyPermission(...REVIEW)
  open(@CurrentTenant() ctx: TenantContext, @CurrentUserId() userId: string, @Param('attemptId', ParseUUIDPipe) attemptId: string) {
    return this.service.open(ctx, userId, attemptId);
  }

  @Post('integrity/:id/take')
  @HttpCode(200)
  @RequireAnyPermission(...REVIEW)
  take(@CurrentTenant() ctx: TenantContext, @CurrentUserId() userId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.take(ctx, userId, id);
  }

  @Post('integrity/:id/verdict')
  @HttpCode(200)
  @RequireAnyPermission(...REVIEW)
  verdict(@CurrentTenant() ctx: TenantContext, @CurrentUserId() userId: string, @Param('id', ParseUUIDPipe) id: string, @Body() dto: VerdictDto) {
    return this.service.verdict(ctx, userId, id, dto);
  }

  // Invalidating an attempt: the second factor again, and a second reviewer after (YX-EVAL-01).
  @Post('integrity/:id/invalidate')
  @HttpCode(200)
  @RequireAnyPermission(...REVIEW)
  @RequireStepUp()
  invalidate(@CurrentTenant() ctx: TenantContext, @CurrentUserId() userId: string, @Param('id', ParseUUIDPipe) id: string, @Body() dto: InvalidateDto) {
    return this.service.verdict(ctx, userId, id, { verdict: 'attempt', reason: dto.reason, secondReviewerId: dto.secondReviewerId });
  }

  @Post('integrity/:id/second-review')
  @HttpCode(200)
  @RequireAnyPermission(...REVIEW)
  @RequireStepUp()
  secondReview(@CurrentTenant() ctx: TenantContext, @CurrentUserId() userId: string, @Param('id', ParseUUIDPipe) id: string, @Body() dto: SecondReviewDto) {
    return this.service.secondReview(ctx, userId, id, dto);
  }

  @Get('appeals')
  @RequireAnyPermission(...REVIEW)
  appeals(@CurrentTenant() ctx: TenantContext) {
    return this.service.appeals(ctx);
  }

  // Answer 2262: one frame of the incident's attempt (audited).
  @Get('integrity/:id/frames/:eventId')
  @RequireAnyPermission(...REVIEW)
  incidentFrame(
    @CurrentTenant() ctx: TenantContext,
    @CurrentUserId() userId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Query('kind') kind: string,
  ) {
    if (kind !== 'camera' && kind !== 'screen') throw new BadRequestException('kind must be camera or screen');
    return this.service.incidentFrame(ctx, userId, id, eventId, kind);
  }

  // Answer 2268: the latest camera frame of each running attempt, for the live console (proctors).
  @Get('live/:examId/frames')
  @RequireAnyPermission('exam:manage', 'asmt.proctor')
  liveFrames(@CurrentTenant() ctx: TenantContext, @Param('examId', ParseUUIDPipe) examId: string) {
    return this.service.liveFrames(ctx, examId);
  }

  @Get('appeals/:id/evidence')
  @RequireAnyPermission(...REVIEW)
  appealEvidence(@CurrentTenant() ctx: TenantContext, @CurrentUserId() userId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.appealEvidence(ctx, userId, id);
  }

  @Post('appeals/:id/uphold')
  @HttpCode(200)
  @RequireAnyPermission(...REVIEW)
  uphold(@CurrentTenant() ctx: TenantContext, @CurrentUserId() userId: string, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ReasonDto) {
    return this.service.decideAppeal(ctx, userId, id, { decision: 'upheld', reason: dto.reason });
  }

  // Answer 2006: overturning a verdict asks for the second factor again.
  @Post('appeals/:id/overturn')
  @HttpCode(200)
  @RequireAnyPermission(...REVIEW)
  @RequireStepUp()
  overturn(@CurrentTenant() ctx: TenantContext, @CurrentUserId() userId: string, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ReasonDto) {
    return this.service.decideAppeal(ctx, userId, id, { decision: 'overturned', reason: dto.reason });
  }
}
