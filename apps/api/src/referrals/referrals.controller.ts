import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { RequirePermissions } from '../rbac/permissions.decorator';
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

  @Post()
  submit(@CurrentTenant() tenant: TenantContext, @CurrentUserId() userId: string, @Body() dto: SubmitReferralDto) {
    return this.referrals.submit(tenant, userId, dto);
  }

  @Get('mine')
  mine(@CurrentTenant() tenant: TenantContext, @CurrentUserId() userId: string) {
    return this.referrals.myReferrals(tenant, userId);
  }

  @Get()
  @RequirePermissions('candidate:view')
  list(@CurrentTenant() tenant: TenantContext) {
    return this.referrals.listAll(tenant);
  }

  @Patch(':id/reward')
  @RequirePermissions('pipeline:manage')
  setReward(@CurrentTenant() tenant: TenantContext, @CurrentUserId() userId: string, @Param('id') id: string, @Body() dto: SetRewardStatusDto) {
    return this.referrals.setReward(tenant, userId, id, dto);
  }
}
