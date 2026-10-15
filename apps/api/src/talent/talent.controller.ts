import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Post, Put, UseGuards } from '@nestjs/common';
import { TenantContext } from '@exam-platform/shared';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { RequireAnyPermission, RequirePermissions } from '../rbac/permissions.decorator';
import { CurrentTenant } from '../auth/current-tenant.decorator';
import { CandidateMergeService } from './merge.service';
import { TalentPoolsService } from './pools.service';
import { CandidateRetentionService } from './retention.service';
import { CandidateProfileService } from './candidate-profile.service';
import { LegalHoldDto, MergeDto, PoolDto, PoolMembersDto, RetentionRunDto, WithdrawConsentDto } from './talent-dto';

// Recruitment batch AT4 (M10-BUILD-DESIGN §18.1): duplicates and merge, talent pools and hotlists, the candidate
// profile, legal hold, consent withdrawal and the retention sweep.
@Controller('hiring')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class TalentController {
  constructor(
    private readonly merges: CandidateMergeService,
    private readonly pools: TalentPoolsService,
    private readonly retention: CandidateRetentionService,
    private readonly profiles: CandidateProfileService,
  ) {}

  @Get('duplicates')
  @RequirePermissions('candidate:manage')
  duplicates(@CurrentTenant() ctx: TenantContext) {
    return this.merges.duplicates(ctx);
  }

  @Post('candidates/:id/merge')
  @HttpCode(200)
  @RequirePermissions('candidate:manage')
  merge(@CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: MergeDto) {
    return this.merges.merge(ctx, id, dto.mergedId, { name: dto.name, phone: dto.phone, resume: dto.resume });
  }

  @Get('candidates/:id')
  @RequireAnyPermission('candidate:manage', 'candidate:view')
  profile(@CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.profiles.get(ctx, id);
  }

  @Put('candidates/:id/legal-hold')
  @RequirePermissions('candidate:data_rights')
  hold(@CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: LegalHoldDto) {
    return this.profiles.setHold(ctx, id, dto.on, dto.on ? (dto.reason ?? null) : null);
  }

  @Post('candidates/:id/consents/withdraw')
  @HttpCode(200)
  @RequireAnyPermission('candidate:manage', 'candidate:data_rights')
  withdraw(@CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: WithdrawConsentDto) {
    return this.profiles.withdraw(ctx, id, dto.purpose);
  }

  @Get('pools')
  @RequireAnyPermission('candidate:manage', 'candidate:view')
  listPools(@CurrentTenant() ctx: TenantContext) {
    return this.pools.list(ctx);
  }

  @Post('pools')
  @RequirePermissions('candidate:manage')
  createPool(@CurrentTenant() ctx: TenantContext, @Body() dto: PoolDto) {
    return this.pools.create(ctx, dto);
  }

  @Delete('pools/:id')
  @RequirePermissions('candidate:manage')
  archivePool(@CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.pools.archive(ctx, id);
  }

  @Get('pools/:id/members')
  @RequireAnyPermission('candidate:manage', 'candidate:view')
  members(@CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.pools.members(ctx, id);
  }

  @Post('pools/:id/members')
  @HttpCode(200)
  @RequirePermissions('candidate:manage')
  addMembers(@CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: PoolMembersDto) {
    return this.pools.add(ctx, id, dto.candidateIds, dto.note);
  }

  @Delete('pools/:id/members/:candidateId')
  @RequirePermissions('candidate:manage')
  removeMember(@CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Param('candidateId', ParseUUIDPipe) candidateId: string) {
    return this.pools.remove(ctx, id, candidateId);
  }

  @Post('retention/run')
  @HttpCode(200)
  @RequirePermissions('candidate:data_rights')
  runRetention(@CurrentTenant() ctx: TenantContext, @Body() dto: RetentionRunDto) {
    return this.retention.run(ctx, { dryRun: dto.dryRun });
  }

  @Get('retention/runs')
  @RequirePermissions('candidate:data_rights')
  retentionRuns(@CurrentTenant() ctx: TenantContext) {
    return this.retention.runs(ctx);
  }
}
