import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query, UseGuards } from '@nestjs/common';
import { Transform } from 'class-transformer';
import { IsInt, IsOptional, IsString, IsUUID, MaxLength, Min } from 'class-validator';
import { TenantContext } from '@exam-platform/shared';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { OwnSessionChangesGuard } from '../../auth/own-session.guard';
import { CurrentTenant } from '../../auth/current-tenant.decorator';
import { CurrentUserId } from '../../auth/current-user-id.decorator';
import { PermissionsGuard } from '../../rbac/permissions.guard';
import { RequireAnyPermission } from '../../rbac/permissions.decorator';
import { MarkingService } from './marking.service';

export class MarkingQueryDto {
  @IsOptional()
  @IsUUID()
  examId?: string;
}

export class MarkDto {
  @IsInt()
  @Min(0)
  marks!: number;

  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MaxLength(2000)
  feedback?: string | null;
}

// Assessments AS-6 (PRC-19): people who mark (asmt.evaluate, or the older exam:manage). No change while acting for
// someone else (AS-0).
@Controller('asmt/marking')
@UseGuards(JwtAuthGuard, OwnSessionChangesGuard, PermissionsGuard)
export class MarkingController {
  constructor(private readonly marking: MarkingService) {}

  @Get()
  @RequireAnyPermission('asmt.evaluate', 'exam:manage')
  queue(@CurrentTenant() ctx: TenantContext, @CurrentUserId() userId: string, @Query() q: MarkingQueryDto) {
    return this.marking.queue(ctx, userId, q.examId);
  }

  @Get(':attemptId/:questionId')
  @RequireAnyPermission('asmt.evaluate', 'exam:manage')
  view(@CurrentTenant() ctx: TenantContext, @CurrentUserId() userId: string, @Param('attemptId', ParseUUIDPipe) attemptId: string, @Param('questionId', ParseUUIDPipe) questionId: string) {
    return this.marking.view(ctx, userId, attemptId, questionId);
  }

  @Post(':attemptId/:questionId/mark')
  @HttpCode(200)
  @RequireAnyPermission('asmt.evaluate', 'exam:manage')
  mark(@CurrentTenant() ctx: TenantContext, @CurrentUserId() userId: string, @Param('attemptId', ParseUUIDPipe) attemptId: string, @Param('questionId', ParseUUIDPipe) questionId: string, @Body() dto: MarkDto) {
    return this.marking.mark(ctx, userId, attemptId, questionId, dto.marks, dto.feedback ?? null);
  }

  @Post(':attemptId/:questionId/suggestion')
  @HttpCode(200)
  @RequireAnyPermission('asmt.evaluate', 'exam:manage')
  suggestion(@CurrentTenant() ctx: TenantContext, @CurrentUserId() userId: string, @Param('attemptId', ParseUUIDPipe) attemptId: string, @Param('questionId', ParseUUIDPipe) questionId: string) {
    return this.marking.suggestion(ctx, userId, attemptId, questionId);
  }
}
