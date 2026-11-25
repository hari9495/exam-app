import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Post, Put, Req, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsBoolean, IsEmail, IsIn, IsOptional, IsString, IsUUID, Length, Matches, MaxLength, ValidateNested } from 'class-validator';
import { TenantContext } from '@exam-platform/shared';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { RequirePermissions } from '../rbac/permissions.decorator';
import { CurrentTenant } from '../auth/current-tenant.decorator';
import { assertOwnSession } from '../service-desk/desk-access';
import { PublicApplicationsThrottlerGuard } from '../public-applications/public-applications.throttler.guard';
import { STRICT_WALK_IN_THROTTLE } from '../rate-limit-tiers';
import { CampaignsService } from './campaigns.service';
import { CrmConsentsService } from './consents.service';

class StepDto {
  @IsIn(['message', 'wait']) kind!: 'message' | 'wait';
  @IsOptional() @IsUUID() templateId?: string;
  @IsOptional() days?: number;
}

class AudienceDto {
  @IsUUID() poolId!: string;
  @IsIn(['email', 'whatsapp']) channel!: 'email' | 'whatsapp';
}

class CampaignDto extends AudienceDto {
  @IsString() @Length(1, 120) name!: string;
  @IsArray() @ArrayMaxSize(10) @ValidateNested({ each: true }) @Type(() => StepDto) steps!: StepDto[];
  @IsBoolean() stopOnReply!: boolean;
  @IsBoolean() stopOnApply!: boolean;
  /** true: save and start (enrol now); false: save a draft. */
  @IsBoolean() start!: boolean;
}

class SourcedDto {
  @IsString() @Length(1, 200) name!: string;
  @IsEmail() @MaxLength(320) email!: string;
  @IsOptional() @IsString() @MaxLength(200) headline?: string | null;
  @IsIn(['LinkedIn', 'Naukri', 'GitHub', 'Referral', 'Event', 'Other']) site!: string;
  /** The lawful source: where the details were found and why contacting the person is allowed. */
  @IsString() @Length(10, 500) sourceNote!: string;
}

class DobDto {
  @Matches(/^\d{4}-\d{2}-\d{2}$/) dob!: string;
  @IsOptional() @IsString() @MaxLength(200) guardianName?: string | null;
  @IsOptional() @IsEmail() @MaxLength(320) guardianEmail?: string | null;
}

class AnswerDto {
  @IsBoolean() agree!: boolean;
}

// HIR-20 Talent CRM campaigns and sourced profiles, HIR-05 under-18 guardian consent. Everything needs the candidate
// manage key; another company's record is not found (404); every change is refused while acting for someone (403).
@Controller('hiring')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePermissions('candidate:manage')
export class CrmController {
  constructor(
    private readonly campaigns: CampaignsService,
    private readonly consents: CrmConsentsService,
  ) {}

  @Get('campaigns')
  list(@CurrentTenant() ctx: TenantContext) {
    return this.campaigns.list(ctx);
  }

  @Post('campaigns/audience')
  @HttpCode(200)
  audience(@CurrentTenant() ctx: TenantContext, @Body() dto: AudienceDto) {
    return this.campaigns.preview(ctx, dto.poolId, dto.channel);
  }

  @Post('campaigns')
  create(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Body() dto: CampaignDto) {
    assertOwnSession(req);
    return this.campaigns.create(ctx, dto);
  }

  @Post('campaigns/:id/start')
  @HttpCode(200)
  start(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    assertOwnSession(req);
    return this.campaigns.start(ctx, id);
  }

  @Post('campaigns/:id/stop')
  @HttpCode(200)
  stop(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    assertOwnSession(req);
    return this.campaigns.stop(ctx, id);
  }

  @Get('campaigns/:id/members')
  members(@CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.campaigns.members(ctx, id);
  }

  @Post('campaigns/:id/members/:candidateId/replied')
  @HttpCode(200)
  replied(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Param('candidateId', ParseUUIDPipe) candidateId: string) {
    assertOwnSession(req);
    return this.campaigns.replied(ctx, id, candidateId);
  }

  @Get('candidates/:id/engagement')
  engagement(@CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.campaigns.engagement(ctx, id);
  }

  @Get('sourced')
  sourced(@CurrentTenant() ctx: TenantContext) {
    return this.consents.listSourced(ctx);
  }

  @Post('sourced')
  addSourced(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Body() dto: SourcedDto) {
    assertOwnSession(req);
    return this.consents.addSourced(ctx, dto);
  }

  @Post('sourced/:id/resend')
  @HttpCode(200)
  resendSourced(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    assertOwnSession(req);
    return this.consents.resendSourced(ctx, id);
  }

  @Delete('sourced/:id')
  eraseSourced(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    assertOwnSession(req);
    return this.consents.eraseSourced(ctx, id);
  }

  @Put('candidates/:id/date-of-birth')
  setDob(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: DobDto) {
    assertOwnSession(req);
    return this.consents.setDob(ctx, id, dto);
  }

  @Post('candidates/:id/guardian-consent/resend')
  @HttpCode(200)
  resendGuardian(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    assertOwnSession(req);
    return this.consents.resendGuardian(ctx, id);
  }
}

// The two consent links (a sourced person, a parent or guardian). No account: the 64-character token is the key, and
// each token has its own small budget (PublicApplicationsThrottlerGuard keys on :token) behind the app-wide IP limit.
@Controller('public/consent')
@UseGuards(PublicApplicationsThrottlerGuard)
@Throttle(STRICT_WALK_IN_THROTTLE)
export class CrmPublicController {
  constructor(private readonly consents: CrmConsentsService) {}

  @Get('sourced/:token')
  sourced(@Param('token') token: string) {
    return this.consents.sourcedPage(token);
  }

  @Post('sourced/:token')
  @HttpCode(200)
  answerSourced(@Param('token') token: string, @Body() dto: AnswerDto) {
    return this.consents.answerSourced(token, dto.agree);
  }

  @Get('guardian/:token')
  guardian(@Param('token') token: string) {
    return this.consents.guardianPage(token);
  }

  @Post('guardian/:token')
  @HttpCode(200)
  answerGuardian(@Param('token') token: string, @Body() dto: AnswerDto) {
    return this.consents.answerGuardian(token, dto.agree);
  }
}
