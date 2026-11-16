import { Body, Controller, ForbiddenException, Get, HttpCode, Param, ParseUUIDPipe, Post, Put, Query, Req, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Request } from 'express';
import { Transform, Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min, MinLength } from 'class-validator';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { OwnSessionGuard } from '../../auth/own-session.guard';
import { CurrentUserId } from '../../auth/current-user-id.decorator';
import { PermissionsGuard } from '../../rbac/permissions.guard';
import { RequirePermissions } from '../../rbac/permissions.decorator';
import { PlatformStaffGuard } from '../../platform/platform-staff.guard';
import { STRICT_AI_GENERATE_THROTTLE } from '../../rate-limit-tiers';
import { AssistantService, type Me } from './assistant.service';
import { FEATURE_STATUSES, FeatureRequestsService, type FeatureStatus } from './feature-requests.service';

const trim = () => Transform(({ value }) => (typeof value === 'string' ? value.trim() : value));

export class AskDto {
  @trim()
  @IsString()
  @MinLength(2, { message: 'Type a question.' })
  @MaxLength(1000, { message: 'Ask in at most 1,000 characters.' })
  question!: string;

  @IsOptional()
  @IsUUID()
  conversationId?: string;
}

export class AskFeedbackDto {
  @IsIn(['up', 'down'])
  value!: 'up' | 'down';
}

export class FeatureRequestDto {
  @trim()
  @IsString()
  @MinLength(5, { message: 'Say what you would like YukthiX to do (at least 5 characters).' })
  @MaxLength(200)
  title!: string;

  @IsOptional()
  @trim()
  @IsString()
  @MaxLength(2000)
  details?: string;
}

export class FeatureDecisionDto {
  @IsOptional()
  @IsIn(FEATURE_STATUSES)
  status?: FeatureStatus;

  @IsOptional()
  @trim()
  @IsString()
  @MaxLength(500)
  note?: string;

  @IsOptional()
  @IsUUID()
  duplicateOf?: string | null;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  version!: number;
}

export class ReviewQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(365)
  days?: number;
}

/** The signed-in person of a customer company, in their own session (staff acting as them are refused). */
function me(req: Request): Me {
  const u = req.user as { userId: string; organizationId?: string | null; role?: string; permissionProfileId?: string | null; impersonatorUserId?: string | null; actingSuperAdmin?: boolean | null };
  AssistantService.assertOwn(u);
  if (!u.organizationId) throw new ForbiddenException('Ask YukthiX is for people in a customer company.');
  return { organizationId: u.organizationId, userId: u.userId, role: u.role ?? '', permissionProfileId: u.permissionProfileId ?? null };
}

/**
 * Ask YukthiX (answers 2101 to 2108): everyone in a customer company, in their own session. No key to ask; raising a
 * Contact YukthiX ticket needs that ticket's key (org.yukthix_support.raise), as on the Contact YukthiX page.
 */
@Controller('help/assistant')
@UseGuards(JwtAuthGuard, OwnSessionGuard, PermissionsGuard)
export class AssistantController {
  constructor(private readonly assistant: AssistantService) {}

  @Get()
  state(@Req() req: Request) {
    return this.assistant.state(me(req));
  }

  @Post('ask')
  @HttpCode(200)
  @Throttle(STRICT_AI_GENERATE_THROTTLE)
  ask(@Req() req: Request, @Body() dto: AskDto) {
    return this.assistant.ask(me(req), dto.question, dto.conversationId);
  }

  @Put('answers/:id/feedback')
  feedback(@Req() req: Request, @Param('id', ParseUUIDPipe) id: string, @Body() dto: AskFeedbackDto) {
    return this.assistant.feedback(me(req), id, dto.value);
  }

  @Post('conversations/:id/ticket')
  @RequirePermissions('org.yukthix_support.raise')
  ticket(@Req() req: Request, @Param('id', ParseUUIDPipe) id: string) {
    return this.assistant.raiseTicket(me(req), id);
  }

  @Post('conversations/:id/feature-request')
  featureRequest(@Req() req: Request, @Param('id', ParseUUIDPipe) id: string, @Body() dto: FeatureRequestDto) {
    return this.assistant.sendFeatureRequest(me(req), id, dto.title, dto.details ?? '');
  }
}

/** YukthiX staff: the assistant review and the Feature requests list (the help centre writers' key). */
@Controller('platform')
@UseGuards(JwtAuthGuard, PlatformStaffGuard, PermissionsGuard)
export class AssistantStaffController {
  constructor(
    private readonly assistant: AssistantService,
    private readonly requests: FeatureRequestsService,
  ) {}

  @Get('assistant/review')
  @RequirePermissions('platform.helpcentre.write')
  review(@CurrentUserId() _staff: string, @Query() q: ReviewQueryDto) {
    return this.assistant.review(q.days ?? 30);
  }

  @Get('feature-requests')
  @RequirePermissions('platform.helpcentre.write')
  list(@CurrentUserId() staff: string) {
    return this.requests.list(staff);
  }

  @Put('feature-requests/:id')
  @RequirePermissions('platform.helpcentre.write')
  decide(@CurrentUserId() staff: string, @Param('id', ParseUUIDPipe) id: string, @Body() dto: FeatureDecisionDto) {
    return this.requests.decide(staff, id, dto);
  }
}
