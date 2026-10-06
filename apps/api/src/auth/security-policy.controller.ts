import { Body, Controller, ForbiddenException, Get, Patch, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { TenantContext } from '@exam-platform/shared';
import { JwtAuthGuard } from './jwt-auth.guard';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { RequirePermissions } from '../rbac/permissions.decorator';
import { CurrentTenant } from './current-tenant.decorator';
import { SecurityPolicyService } from './security-policy.service';
import { UpdateSecurityPolicyDto } from './dto/update-security-policy.dto';
import { RequireStepUp } from './step-up.decorator';

interface RequestUser {
  userId: string;
  role: string;
  actingSuperAdmin?: boolean;
  impersonatorUserId?: string;
}

// Settings › People & Access › Security (P12 §7; YX-IAM-06/08/09, Q8). Bearer-token authenticated
// only -- no cookie auth, so no CSRF surface. org:manage_settings is an admin-console permission, so
// the company's admin IP allow-list applies too (PermissionsGuard).
@Controller('security/policy')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class SecurityPolicyController {
  constructor(private readonly policies: SecurityPolicyService) {}

  @Get()
  @RequirePermissions('org:manage_settings')
  get(@CurrentTenant() ctx: TenantContext) {
    return this.policies.get(ctx);
  }

  // "Change security settings" is a step-up action (P12 §3).
  @Patch()
  @RequirePermissions('org:manage_settings')
  @RequireStepUp()
  update(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Body() dto: UpdateSecurityPolicyDto) {
    const user = req.user as RequestUser;
    if (user.impersonatorUserId) {
      throw new ForbiddenException('Not available while impersonating');
    }
    return this.policies.update(ctx, user.userId, dto, {
      ip: req.ip ?? null,
      exemptFromIpLists: user.role === 'super_admin' || Boolean(user.actingSuperAdmin),
    });
  }
}
