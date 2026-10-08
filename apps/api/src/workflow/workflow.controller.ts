import { Body, Controller, ForbiddenException, Get, HttpCode, Param, ParseUUIDPipe, Post, Query, Req, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Transform } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsDateString, IsIn, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { Request } from 'express';
import { TenantContext } from '@exam-platform/shared';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentTenant } from '../auth/current-tenant.decorator';
import { CompanyContext } from '../org-structure/org-structure.service';
import { MODERATE_UPLOAD_THROTTLE } from '../rate-limit-tiers';
import { ApprovalsEngine } from './approvals-engine.service';

// P03 shared screens (M14 §12.2 "P03 shared: GET /approvals/inbox, POST /approvals/{id}/decide"). No permission key:
// an approver is anyone a request names (P03, implicit role); every route reaches only the signed-in person's own tasks,
// requests and delegations. Decisions are made by the person themselves, never while acting for someone else.

export class DecideDto {
  @IsIn(['approve', 'reject'])
  decision!: 'approve' | 'reject';

  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MaxLength(1000)
  reason?: string;
}

export class PeopleQueryDto {
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MaxLength(60)
  q?: string;
}

export class DelegationDto {
  @IsUUID()
  delegateUserId!: string;

  @IsDateString({ strict: true })
  startsOn!: string;

  @IsDateString({ strict: true })
  endsOn!: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @MaxLength(40, { each: true })
  requestTypes?: string[];
}

interface RequestUser {
  userId?: string;
  impersonatorUserId?: string;
  actingSuperAdmin?: boolean;
}

function me(req: Request, t: TenantContext, write = false): { ctx: CompanyContext; userId: string } {
  const user = req.user as RequestUser | undefined;
  if (!user?.userId || !t.organizationId) throw new ForbiddenException('Sign in to a company to see approvals.');
  // Someone acting for another person (impersonation, a support session) never decides or delegates for them.
  if (write && (user.impersonatorUserId || user.actingSuperAdmin)) throw new ForbiddenException('Not available while acting for someone else');
  return { ctx: { ...t, organizationId: t.organizationId, isSuperAdmin: false }, userId: user.userId };
}

@Controller('workflow')
@UseGuards(JwtAuthGuard)
export class WorkflowController {
  constructor(private readonly engine: ApprovalsEngine) {}

  @Get('approvals/inbox')
  inbox(@Req() req: Request, @CurrentTenant() t: TenantContext) {
    const m = me(req, t);
    return this.engine.inbox(m.ctx, m.userId);
  }

  @Get('approvals/history')
  history(@Req() req: Request, @CurrentTenant() t: TenantContext) {
    const m = me(req, t);
    return this.engine.history(m.ctx, m.userId);
  }

  @Get('approvals/requests/:id')
  request(@Req() req: Request, @CurrentTenant() t: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    const m = me(req, t);
    return this.engine.view(m.ctx, m.userId, id);
  }

  @Post('approvals/tasks/:id/decide')
  @HttpCode(200)
  @Throttle(MODERATE_UPLOAD_THROTTLE)
  decide(@Req() req: Request, @CurrentTenant() t: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: DecideDto) {
    const m = me(req, t, true);
    return this.engine.decide(m.ctx, m.userId, id, dto.decision, dto.reason ?? null, 'web');
  }

  /** Colleagues to choose as a delegate or a named approver: active logins of the company, names only. */
  @Get('people')
  @Throttle(MODERATE_UPLOAD_THROTTLE)
  people(@Req() req: Request, @CurrentTenant() t: TenantContext, @Query() q: PeopleQueryDto) {
    const m = me(req, t);
    return this.engine.people(m.ctx, q.q ?? '');
  }

  @Get('delegations')
  delegations(@Req() req: Request, @CurrentTenant() t: TenantContext) {
    const m = me(req, t);
    return this.engine.delegations(m.ctx, m.userId);
  }

  @Post('delegations')
  delegate(@Req() req: Request, @CurrentTenant() t: TenantContext, @Body() dto: DelegationDto) {
    const m = me(req, t, true);
    return this.engine.delegate(m.ctx, m.userId, dto);
  }

  @Post('delegations/:id/revoke')
  @HttpCode(200)
  revoke(@Req() req: Request, @CurrentTenant() t: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    const m = me(req, t, true);
    return this.engine.revokeDelegation(m.ctx, m.userId, id);
  }
}
