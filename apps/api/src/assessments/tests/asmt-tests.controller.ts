import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Put, UseGuards } from '@nestjs/common';
import { IsIn } from 'class-validator';
import { TenantContext } from '@exam-platform/shared';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { OwnSessionChangesGuard } from '../../auth/own-session.guard';
import { CurrentTenant } from '../../auth/current-tenant.decorator';
import { CurrentUserId } from '../../auth/current-user-id.decorator';
import { PermissionsGuard } from '../../rbac/permissions.guard';
import { RequirePermissions } from '../../rbac/permissions.decorator';
import { PROCTOR_MODES, type ProctorMode } from '../asmt-rules';
import { AsmtTestsService } from './asmt-tests.service';

export class ProctoringModeDto {
  @IsIn(PROCTOR_MODES, { message: 'Choose Open, AI-only or Record & review.' })
  mode!: ProctorMode;
}

// Assessments AS-2 (PRC-04): the test builder's reads and the approval of a big test. Test writers only
// (asmt.test.manage, through its alias exam:manage); no change while acting for someone else (AS-0, answer 2006).
@Controller('asmt/tests')
@UseGuards(JwtAuthGuard, OwnSessionChangesGuard, PermissionsGuard)
export class AsmtTestsController {
  constructor(private readonly tests: AsmtTestsService) {}

  @Get(':id')
  @RequirePermissions('exam:manage')
  get(@CurrentTenant() ctx: TenantContext, @CurrentUserId() userId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.tests.get(ctx, userId, id);
  }

  @Put(':id/proctoring-mode')
  @RequirePermissions('exam:manage')
  setMode(@CurrentTenant() ctx: TenantContext, @CurrentUserId() userId: string, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ProctoringModeDto) {
    return this.tests.setMode(ctx, userId, id, dto.mode);
  }

  @Post(':id/approval/request')
  @HttpCode(200)
  @RequirePermissions('exam:manage')
  requestApproval(@CurrentTenant() ctx: TenantContext, @CurrentUserId() userId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.tests.requestApproval(ctx, userId, id);
  }

  @Post(':id/approval/approve')
  @HttpCode(200)
  @RequirePermissions('exam:manage')
  approve(@CurrentTenant() ctx: TenantContext, @CurrentUserId() userId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.tests.approve(ctx, userId, id);
  }
}
