import { Body, Controller, Get, HttpCode, Param, Post, Put, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { Type } from 'class-transformer';
import { IsArray, IsInt, Matches, Min } from 'class-validator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { RequireAnyPermission, RequirePermissions } from '../rbac/permissions.decorator';
import { ownSession } from '../org-structure/org-structure.controller';
import { ApprovalPolicies } from './approval-policies';

export class PolicySaveDto {
  @IsArray() steps!: unknown[];
  @Type(() => Number) @IsInt() @Min(0) version!: number;
}
export class PolicyResetDto {
  @Type(() => Number) @IsInt() @Min(1) version!: number;
}
type U = { userId?: string; organizationId?: string | null };

// Settings S-6, 2.4 Approvals (answer 1330): the company's approval steps per request type. HR's settings key changes
// them; those who read the company settings read them. Every change is audited.
@Controller('workflow/policies')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ApprovalPoliciesController {
  constructor(private readonly policies: ApprovalPolicies) {}

  @Get()
  @RequireAnyPermission('org.settings.manage', 'org.structure.view')
  list(@Req() req: Request) {
    const u = req.user as U;
    return this.policies.list({ organizationId: u.organizationId ?? null, userId: u.userId ?? null });
  }

  @Put(':type')
  @RequirePermissions('org.settings.manage')
  save(@Req() req: Request, @Param('type') type: string, @Body() dto: PolicySaveDto) {
    ownSession(req);
    const u = req.user as U;
    return this.policies.save({ organizationId: u.organizationId ?? null, userId: u.userId ?? null }, type, dto.steps, dto.version);
  }

  @Post(':type/reset')
  @HttpCode(200)
  @RequirePermissions('org.settings.manage')
  reset(@Req() req: Request, @Param('type') type: string, @Body() dto: PolicyResetDto) {
    ownSession(req);
    const u = req.user as U;
    return this.policies.reset({ organizationId: u.organizationId ?? null, userId: u.userId ?? null }, type, dto.version);
  }
}
