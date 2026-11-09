import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { assertOwnSession } from '../service-desk/desk-access';
import type { ScopeUser } from '../access/scope';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { RequireAnyPermission } from '../rbac/permissions.decorator';
import { CurrentTenant } from '../auth/current-tenant.decorator';
import { CurrentUserId } from '../auth/current-user-id.decorator';
import { TenantContext } from '@exam-platform/shared';
import { ReferralsService } from './referrals.service';
import { SubmitReferralDto, SetRewardStatusDto } from './dto/referral.dto';

// PermissionsGuard is a no-op when a route carries no @RequirePermissions, so the referrer-facing
// routes (jobs / submit / mine) are open to ANY authenticated staff member; only the recruiter
// management routes carry a permission (candidate:view to see all, pipeline:manage to set rewards).
@Controller('referrals')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ReferralsController {
  constructor(private readonly referrals: ReferralsService) {}

  @Get('jobs')
  jobs(@CurrentTenant() tenant: TenantContext) {
    return this.referrals.referableJobs(tenant);
  }

  /** HIR-12: the company's bonus and qualifying days (settings with defaults), for the Refer page. */
  @Get('policy')
  policy(@CurrentTenant() tenant: TenantContext) {
    return this.referrals.policy(tenant);
  }

  // Referring is the person's own act (the bonus is theirs), so it is refused while acting for someone else.
  @Post()
  submit(@Req() req: Request, @CurrentTenant() tenant: TenantContext, @CurrentUserId() userId: string, @Body() dto: SubmitReferralDto) {
    assertOwnSession(req);
    return this.referrals.submit(tenant, userId, dto);
  }

  @Get('mine')
  mine(@CurrentTenant() tenant: TenantContext, @CurrentUserId() userId: string) {
    return this.referrals.myReferrals(tenant, userId);
  }

  // HIR-12 All referrals (founder answer 204): HR with ats.referral.manage, or recruiters who see candidates.
  @Get()
  @RequireAnyPermission('ats.referral.manage', 'candidate:view')
  async list(@Req() req: Request, @CurrentTenant() tenant: TenantContext) {
    await this.referrals.managerGate(req.user as ScopeUser, 'candidate:view');
    return this.referrals.listAll(tenant);
  }

  @Patch(':id/reward')
  @RequireAnyPermission('ats.referral.manage', 'pipeline:manage')
  async setReward(@Req() req: Request, @CurrentTenant() tenant: TenantContext, @CurrentUserId() userId: string, @Param('id', ParseUUIDPipe) id: string, @Body() dto: SetRewardStatusDto) {
    assertOwnSession(req);
    await this.referrals.managerGate(req.user as ScopeUser, 'pipeline:manage');
    return this.referrals.setReward(tenant, userId, id, dto);
  }
}
