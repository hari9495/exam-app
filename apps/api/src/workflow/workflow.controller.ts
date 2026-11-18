import { Body, Controller, ForbiddenException, Get, HttpCode, Param, ParseUUIDPipe, Post, Query, Req, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Transform } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsDateString, IsIn, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';
import { Request } from 'express';
import { TenantContext } from '@exam-platform/shared';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentTenant } from '../auth/current-tenant.decorator';
import { CompanyContext } from '../org-structure/org-structure.service';
import { MODERATE_UPLOAD_THROTTLE } from '../rate-limit-tiers';
import { ApprovalsEngine } from './approvals-engine.service';
import { ApprovalsOversight } from './approvals-oversight';
import type { ScopeUser } from '../access/scope';

// P03 shared screens (M14 §12.2 "P03 shared: GET /approvals/inbox, POST /approvals/{id}/decide"). No permission key:
// an approver is anyone a request names (P03, implicit role); every route reaches only the signed-in person's own tasks,
// requests and delegations. Decisions are made by the person themselves, never while acting for someone else.

/** Answers 2501 / 2502: move an open approval to someone else, with a reason both approvers see. */
export class ReassignDto {
  @IsUUID()
  toUserId!: string;

  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(3, { message: 'Say why you are moving it, so both approvers know.' })
  @MaxLength(500)
  reason!: string;
}

export class DecideDto {
  @IsIn(['approve', 'reject', 'send_back'])
  decision!: 'approve' | 'reject' | 'send_back';

  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MaxLength(1000)
  reason?: string;
}

export class DecideManyDto {
  // Bulk: approve, or do not approve with one reason; sending back is one request at a time.
  @IsIn(['approve', 'reject'])
  decision!: 'approve' | 'reject';

  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MaxLength(1000)
  reason?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @IsUUID('all', { each: true })
  taskIds!: string[];
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
  constructor(
    private readonly engine: ApprovalsEngine,
    private readonly oversight: ApprovalsOversight,
  ) {}

  /** Answer 2500: everyone's pending approvals in the overseer's scope (workflow.approvals.oversee). */
  @Get('approvals/everyone')
  everyone(@Req() req: Request, @CurrentTenant() t: TenantContext) {
    const m = me(req, t);
    return this.oversight.everyone(m.ctx, req.user as ScopeUser);
  }

  /** Answers 2501 / 2502: the task's holder, or an overseer in scope, moves it to another approver (reason required). */
  @Post('approvals/tasks/:id/reassign')
  @HttpCode(200)
  @Throttle(MODERATE_UPLOAD_THROTTLE)
  reassign(@Req() req: Request, @CurrentTenant() t: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ReassignDto) {
    const m = me(req, t, true);
    return this.oversight.reassign(m.ctx, req.user as ScopeUser, id, dto.toUserId, dto.reason);
  }

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

  /** PLT-04 "Team history": decisions anyone made on requests I hold or held a task for (as approver or the one they act for). */
  @Get('approvals/team-history')
  teamHistory(@Req() req: Request, @CurrentTenant() t: TenantContext) {
    const m = me(req, t);
    return this.engine.teamHistory(m.ctx, m.userId);
  }

  @Get('approvals/mine')
  mine(@Req() req: Request, @CurrentTenant() t: TenantContext) {
    const m = me(req, t);
    return this.engine.mine(m.ctx, m.userId);
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

  /**
   * PLT-04 bulk approve (or not approve): each task is decided on its own, with every check of a single decision (only
   * its holder, still open, not their own request, not one decided on its own page). The answer lists each task's
   * outcome; a refused task says why and the others still go through.
   */
  @Post('approvals/tasks/decide')
  @HttpCode(200)
  @Throttle(MODERATE_UPLOAD_THROTTLE)
  decideMany(@Req() req: Request, @CurrentTenant() t: TenantContext, @Body() dto: DecideManyDto) {
    const m = me(req, t, true);
    return this.engine.decideMany(m.ctx, m.userId, dto.taskIds, dto.decision, dto.reason ?? null, 'web');
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
