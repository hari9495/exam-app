import { Body, Controller, ForbiddenException, Get, HttpCode, Param, ParseUUIDPipe, Post, Put, Query, Req, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Request } from 'express';
import { Transform, Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsIn, IsInt, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min, MinLength } from 'class-validator';
import { TOPICS } from '../../platform/sales-assist.service';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { OwnSessionGuard } from '../../auth/own-session.guard';
import { CurrentUserId } from '../../auth/current-user-id.decorator';
import { PermissionsGuard } from '../../rbac/permissions.guard';
import { RequireAnyPermission, RequirePermissions } from '../../rbac/permissions.decorator';
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

/** Answer 2112: a sales request from a chat about buying (the Talk to us fields, without a nudge). */
export class ChatSalesDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.replace(/[\s-]/g, '').replace(/^(\+91|0)/, '') : value))
  @IsString()
  @Matches(/^[6-9][0-9]{9}$/, { message: 'Give a 10-digit Indian mobile number.' })
  phone!: string;

  @IsArray()
  @ArrayMaxSize(4)
  @IsIn(TOPICS, { each: true })
  topics!: string[];

  @IsOptional()
  @trim()
  @IsString()
  @MaxLength(500)
  @Matches(/^[^<>]*$/, { message: 'Write it without < or >.' })
  note?: string;
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

  /** Answer 2112: Plan & add-ons' key (the service checks it again, with a plain-words refusal). */
  @Post('conversations/:id/sales-request')
  @RequirePermissions('org:manage_billing')
  salesRequest(@Req() req: Request, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ChatSalesDto) {
    return this.assistant.sendSalesRequest(me(req), id, dto);
  }

  @Post('conversations/:id/feature-request')
  featureRequest(@Req() req: Request, @Param('id', ParseUUIDPipe) id: string, @Body() dto: FeatureRequestDto) {
    return this.assistant.sendFeatureRequest(me(req), id, dto.title, dto.details ?? '');
  }
}

/** Answer 2113: feature requests have a key of their own (Support agent and Customer success hold it). */
export const FEATURE_REQUESTS_KEY = 'platform.feature_requests.manage';

/**
 * YukthiX staff: the Feature requests list (its own key, answer 2113) and the assistant review, which the help centre
 * writers keep reading too (they fix the articles it shows are missing).
 */
@Controller('platform')
@UseGuards(JwtAuthGuard, PlatformStaffGuard, PermissionsGuard)
export class AssistantStaffController {
  constructor(
    private readonly assistant: AssistantService,
    private readonly requests: FeatureRequestsService,
  ) {}

  @Get('assistant/review')
  @RequireAnyPermission(FEATURE_REQUESTS_KEY, 'platform.helpcentre.write')
  review(@CurrentUserId() _staff: string, @Query() q: ReviewQueryDto) {
    return this.assistant.review(q.days ?? 30);
  }

  @Get('feature-requests')
  @RequirePermissions(FEATURE_REQUESTS_KEY)
  list(@CurrentUserId() staff: string) {
    return this.requests.list(staff);
  }

  @Put('feature-requests/:id')
  @RequirePermissions(FEATURE_REQUESTS_KEY)
  decide(@CurrentUserId() staff: string, @Param('id', ParseUUIDPipe) id: string, @Body() dto: FeatureDecisionDto) {
    return this.requests.decide(staff, id, dto);
  }
}
