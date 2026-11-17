import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Put, UseGuards } from '@nestjs/common';
import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsIn, IsInt, IsString, IsUUID, Max, MaxLength, Min, MinLength, ValidateNested } from 'class-validator';
import { TenantContext } from '@exam-platform/shared';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { OwnSessionChangesGuard } from '../../auth/own-session.guard';
import { CurrentTenant } from '../../auth/current-tenant.decorator';
import { CurrentUserId } from '../../auth/current-user-id.decorator';
import { PermissionsGuard } from '../../rbac/permissions.guard';
import { RequirePermissions } from '../../rbac/permissions.decorator';
import { PROCTOR_MODES, type ProctorMode } from '../asmt-rules';
import { AsmtTestsService } from './asmt-tests.service';

/** Answer 2151. */
export class JdProposeDto {
  @IsString()
  @MinLength(40, { message: 'Paste the job description (at least a few lines).' })
  @MaxLength(8000)
  jobDescription!: string;
}

export class JdSkillDto {
  @IsUUID()
  tagId!: string;

  @IsInt()
  @Min(1)
  @Max(100)
  percent!: number;
}

export class JdCreateDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title!: string;

  @IsIn(['easy', 'medium', 'hard'])
  level!: 'easy' | 'medium' | 'hard';

  @IsInt()
  @Min(5)
  @Max(100)
  total!: number;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(12)
  @ValidateNested({ each: true })
  @Type(() => JdSkillDto)
  skills!: JdSkillDto[];
}

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

  /** The company's test defaults the builder names (Settings 6.5): the proctoring mode and the approver threshold. */
  @Get('defaults')
  @RequirePermissions('exam:manage')
  defaults(@CurrentTenant() ctx: TenantContext) {
    return this.tests.defaults(ctx);
  }

  @Post('from-job-description/propose')
  @HttpCode(200)
  @RequirePermissions('exam:manage')
  proposeFromJd(@CurrentTenant() ctx: TenantContext, @CurrentUserId() userId: string, @Body() dto: JdProposeDto) {
    return this.tests.proposeFromJd(ctx, userId, dto.jobDescription.trim());
  }

  @Post('from-job-description')
  @RequirePermissions('exam:manage')
  createFromJd(@CurrentTenant() ctx: TenantContext, @CurrentUserId() userId: string, @Body() dto: JdCreateDto) {
    return this.tests.createFromJd(ctx, userId, { ...dto, title: dto.title.trim() });
  }

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
