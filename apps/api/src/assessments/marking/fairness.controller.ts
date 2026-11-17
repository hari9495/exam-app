import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import { Transform } from 'class-transformer';
import { IsIn, IsString, MaxLength, MinLength } from 'class-validator';
import { TenantContext } from '@exam-platform/shared';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { OwnSessionChangesGuard } from '../../auth/own-session.guard';
import { CurrentTenant } from '../../auth/current-tenant.decorator';
import { CurrentUserId } from '../../auth/current-user-id.decorator';
import { PermissionsGuard } from '../../rbac/permissions.guard';
import { RequireAnyPermission } from '../../rbac/permissions.decorator';
import { FairnessService } from './fairness.service';

export class FairnessDecisionDto {
  @IsIn(['keep', 'revise', 'retire'])
  decision!: 'keep' | 'revise' | 'retire';

  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(10, { message: 'Give a reason of at least 10 characters.' })
  @MaxLength(2000)
  reason!: string;
}

// Assessments AS-6 (answer 2019): a test's fairness, counts only. Test writers and results readers see it; test
// writers open and decide a review.
@Controller('asmt/fairness')
@UseGuards(JwtAuthGuard, OwnSessionChangesGuard, PermissionsGuard)
export class FairnessController {
  constructor(private readonly fairness: FairnessService) {}

  @Get(':examId')
  @RequireAnyPermission('asmt.test.manage', 'exam:manage', 'asmt.results.view')
  view(@CurrentTenant() ctx: TenantContext, @Param('examId', ParseUUIDPipe) examId: string) {
    return this.fairness.view(ctx, examId);
  }

  @Post(':examId/review')
  @RequireAnyPermission('asmt.test.manage', 'exam:manage')
  open(@CurrentTenant() ctx: TenantContext, @CurrentUserId() userId: string, @Param('examId', ParseUUIDPipe) examId: string) {
    return this.fairness.openReview(ctx, userId, examId);
  }

  @Post('reviews/:id/decide')
  @HttpCode(200)
  @RequireAnyPermission('asmt.test.manage', 'exam:manage')
  decide(@CurrentTenant() ctx: TenantContext, @CurrentUserId() userId: string, @Param('id', ParseUUIDPipe) id: string, @Body() dto: FairnessDecisionDto) {
    return this.fairness.decide(ctx, userId, id, dto.decision, dto.reason);
  }
}
