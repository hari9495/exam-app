import { Body, Controller, Get, HttpCode, Param, Post, Put, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { Type } from 'class-transformer';
import { IsArray, IsInt, IsObject, IsOptional, IsString, IsUUID, MaxLength, Min } from 'class-validator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { RequireAnyPermission, RequirePermissions } from '../rbac/permissions.decorator';
import { ownSession } from '../org-structure/org-structure.controller';
import { ApprovalPolicies } from './approval-policies';
import { ApprovalsEngine } from './approvals-engine.service';
import { ApprovalNotices } from './approval-notices';
import { HiringChainsMove } from './hiring-chains-move';

export class PolicySaveDto {
  @IsArray() steps!: unknown[];
  @IsOptional() @IsArray() rules?: unknown[];
  @Type(() => Number) @IsInt() @Min(0) version!: number;
}
export class PolicyResetDto {
  @Type(() => Number) @IsInt() @Min(1) version!: number;
}
export class PolicyTryDto {
  @IsOptional() @IsObject() values?: Record<string, unknown>;
  @IsOptional() @IsUUID() requestId?: string;
  @IsOptional() @IsUUID() personId?: string;
  @IsOptional() @IsObject() draft?: { steps?: unknown; rules?: unknown };
}
export class LimitsSaveDto {
  @IsArray() rows!: unknown[];
}
export class NoticeSaveDto {
  @IsString() @MaxLength(150) subject!: string;
  @IsString() @MaxLength(2000) body!: string;
}
type U = { userId?: string; organizationId?: string | null };
const who = (req: Request) => {
  const u = req.user as U;
  return { organizationId: u.organizationId ?? null, userId: u.userId ?? null };
};

// Settings S-6, 2.4 Approvals (answer 1330), widened by E2: the company's approval rules per request type, "Try it", the
// approval limits and the hiring notices. HR's settings key changes them; those who read the company settings read them.
// Every change is audited. Pay types and the pay limits also need the pay approve key (review item 4, checked inside).
@Controller('workflow')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ApprovalPoliciesController {
  constructor(
    private readonly policies: ApprovalPolicies,
    private readonly engine: ApprovalsEngine,
    private readonly notices: ApprovalNotices,
    private readonly move: HiringChainsMove,
  ) {}

  @Get('policies')
  @RequireAnyPermission('org.settings.manage', 'org.structure.view')
  list(@Req() req: Request) {
    return this.policies.list(who(req));
  }

  @Put('policies/:type')
  @RequirePermissions('org.settings.manage')
  save(@Req() req: Request, @Param('type') type: string, @Body() dto: PolicySaveDto) {
    ownSession(req);
    return this.policies.save(who(req), type, { steps: dto.steps, rules: dto.rules }, dto.version);
  }

  @Post('policies/:type/reset')
  @HttpCode(200)
  @RequirePermissions('org.settings.manage')
  reset(@Req() req: Request, @Param('type') type: string, @Body() dto: PolicyResetDto) {
    ownSession(req);
    return this.policies.reset(who(req), type, dto.version);
  }

  /** PLT-57: the route a request would take (sample values or a past request), saved policy or a draft. Reads only. */
  @Post('policies/:type/try')
  @HttpCode(200)
  @RequirePermissions('org.settings.manage')
  tryIt(@Req() req: Request, @Param('type') type: string, @Body() dto: PolicyTryDto) {
    return this.policies.tryIt(who(req), this.engine, type, dto);
  }

  /** Past requests of the type that kept their values, for "Try it". */
  @Get('policies/:type/requests')
  @RequirePermissions('org.settings.manage')
  pastRequests(@Req() req: Request, @Param('type') type: string) {
    return this.notices.pastRequests(who(req), type);
  }

  @Get('policies/:type/notices')
  @RequireAnyPermission('org.settings.manage', 'org.structure.view')
  noticeTexts(@Req() req: Request, @Param('type') type: string) {
    return this.notices.list(who(req), type);
  }

  @Put('policies/:type/notices/:event')
  @RequirePermissions('org.settings.manage')
  saveNotice(@Req() req: Request, @Param('type') type: string, @Param('event') event: string, @Body() dto: NoticeSaveDto) {
    ownSession(req);
    return this.notices.save(who(req), type, event, dto);
  }

  @Post('policies/:type/notices/:event/reset')
  @HttpCode(200)
  @RequirePermissions('org.settings.manage')
  resetNotice(@Req() req: Request, @Param('type') type: string, @Param('event') event: string) {
    ownSession(req);
    return this.notices.reset(who(req), type, event);
  }

  @Get('approval-limits')
  @RequireAnyPermission('org.settings.manage', 'org.structure.view')
  limits(@Req() req: Request) {
    return this.policies.limits(who(req));
  }

  @Put('approval-limits/:family')
  @RequirePermissions('org.settings.manage')
  saveLimits(@Req() req: Request, @Param('family') family: string, @Body() dto: LimitsSaveDto) {
    ownSession(req);
    return this.policies.saveLimits(who(req), family, dto.rows);
  }

  /** E2 part 6 (answer 2789): old hiring approvers next to the new ones, per step, for this company. Reads only. */
  @Get('hiring-move')
  @RequirePermissions('org.settings.manage')
  hiringDryRun(@Req() req: Request) {
    return this.move.dryRun(who(req));
  }

  /** Moves this company's requisition and offer chains into policies, only where old and new approvers match. */
  @Post('hiring-move')
  @HttpCode(200)
  @RequirePermissions('org.settings.manage')
  hiringMove(@Req() req: Request) {
    ownSession(req);
    return this.move.run(who(req));
  }
}
