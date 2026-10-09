import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Put, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { TenantContext } from '@exam-platform/shared';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentTenant } from '../auth/current-tenant.decorator';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { RequirePermissions } from '../rbac/permissions.decorator';
import type { ScopeUser } from '../access/scope';
import { AssetDto, CompanyExitDto, HrFactsDto, InterviewDto, InterviewNotesDto, IssueAssetDto, NoticeChangeDto, ProbationReviewDto, ReasonDto, ResignDto, ReturnAssetDto, SignOffDto } from './exit-dto';
import { ExitsService } from './exits.service';
import { OffboardingService } from './offboarding.service';

// Lifecycle batch 6c (design §13). Keys (P02 YX-SEC-01), checked again per person, case, item and asset:
//   lifecycle.exit.view                 exit cases of the people in scope (the manager sees their team's without a key)
//   lifecycle.exit.manage               company exits, notice changes, the HR step of a resignation, any clearance item
//   lifecycle.exit.confidential.view    HR-only facts and the exit interview answers (with manage to change the facts)
//   asset.view / asset.manage           the asset list per legal entity or location
//   no key (self)                       my resignation and withdrawal, my exit interview, my assets, my clearance items,
//                                       my team's probation reviews
@Controller('lifecycle')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ExitsController {
  constructor(
    private readonly exits: ExitsService,
    private readonly offboarding: OffboardingService,
  ) {}

  private user(req: Request) {
    return req.user as ScopeUser;
  }

  // ------------------------------------------------------------------------------------------ me

  @Get('me/resignation')
  mine(@Req() req: Request, @CurrentTenant() ctx: TenantContext) {
    return this.exits.mine(ctx, this.user(req));
  }

  @Post('me/resignation')
  resign(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Body() dto: ResignDto) {
    return this.exits.resign(ctx, this.user(req), dto);
  }

  @Post('me/resignation/withdraw')
  @HttpCode(200)
  withdraw(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Body() dto: ReasonDto) {
    return this.exits.withdraw(ctx, this.user(req), dto.reason);
  }

  @Get('me/exit-interview')
  myInterview(@Req() req: Request, @CurrentTenant() ctx: TenantContext) {
    return this.offboarding.myInterview(ctx, this.user(req));
  }

  @Put('me/exit-interview')
  submitInterview(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Body() dto: InterviewDto) {
    return this.offboarding.submitInterview(ctx, this.user(req), dto.answers);
  }

  @Get('me/assets')
  myAssets(@Req() req: Request, @CurrentTenant() ctx: TenantContext) {
    return this.offboarding.myAssets(ctx, this.user(req));
  }

  @Post('me/assets/:id/acknowledge')
  @HttpCode(200)
  acknowledge(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.offboarding.acknowledge(ctx, this.user(req), id, { ip: req.ip ?? null, device: String(req.headers['user-agent'] ?? '').slice(0, 200) || null });
  }

  // ------------------------------------------------------------------------------------------ probation review

  @Post('probations/:employeeId/review')
  @HttpCode(200)
  review(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('employeeId', ParseUUIDPipe) employeeId: string, @Body() dto: ProbationReviewDto) {
    return this.exits.reviewProbation(ctx, this.user(req), employeeId, dto);
  }

  // ------------------------------------------------------------------------------------------ exit cases

  @Get('exits')
  list(@Req() req: Request, @CurrentTenant() ctx: TenantContext) {
    return this.exits.list(ctx, this.user(req));
  }

  @Post('exits')
  @RequirePermissions('lifecycle.exit.manage')
  start(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Body() dto: CompanyExitDto) {
    return this.exits.startCompanyExit(ctx, this.user(req), dto);
  }

  @Get('exits/:id')
  get(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.exits.get(ctx, this.user(req), id);
  }

  @Post('exits/:id/notice')
  @RequirePermissions('lifecycle.exit.manage')
  notice(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: NoticeChangeDto) {
    return this.exits.requestNoticeChange(ctx, this.user(req), id, dto);
  }

  @Put('exits/:id/hr')
  @RequirePermissions('lifecycle.exit.manage', 'lifecycle.exit.confidential.view')
  hr(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: HrFactsDto) {
    return this.exits.setHrFacts(ctx, this.user(req), id, dto);
  }

  @Get('exits/:id/interview')
  @RequirePermissions('lifecycle.exit.confidential.view')
  interview(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.offboarding.interview(ctx, this.user(req), id);
  }

  @Put('exits/:id/interview')
  @RequirePermissions('lifecycle.exit.confidential.view')
  interviewNotes(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: InterviewNotesDto) {
    return this.offboarding.interview(ctx, this.user(req), id, dto.notes ?? null);
  }

  // ------------------------------------------------------------------------------------------ clearance

  @Get('clearance/mine')
  myClearance(@Req() req: Request, @CurrentTenant() ctx: TenantContext) {
    return this.offboarding.myClearance(ctx, this.user(req));
  }

  @Post('clearance/:id/sign-off')
  @HttpCode(200)
  signOff(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: SignOffDto) {
    return this.offboarding.signOff(ctx, this.user(req), id, dto);
  }

  // ------------------------------------------------------------------------------------------ assets

  @Get('assets')
  @RequirePermissions('asset.view')
  assets(@Req() req: Request, @CurrentTenant() ctx: TenantContext) {
    return this.offboarding.assets(ctx, this.user(req));
  }

  @Post('assets')
  @RequirePermissions('asset.manage')
  addAsset(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Body() dto: AssetDto) {
    return this.offboarding.saveAsset(ctx, this.user(req), null, dto);
  }

  @Put('assets/:id')
  @RequirePermissions('asset.manage')
  saveAsset(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: AssetDto) {
    return this.offboarding.saveAsset(ctx, this.user(req), id, dto);
  }

  @Post('assets/:id/issue')
  @HttpCode(200)
  @RequirePermissions('asset.manage')
  issue(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: IssueAssetDto) {
    return this.offboarding.issue(ctx, this.user(req), id, dto);
  }

  @Post('assets/:id/return')
  @HttpCode(200)
  @RequirePermissions('asset.manage')
  takeBack(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ReturnAssetDto) {
    return this.offboarding.takeBack(ctx, this.user(req), id, dto);
  }
}
