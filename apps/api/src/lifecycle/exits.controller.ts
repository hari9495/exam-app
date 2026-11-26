import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Put, Req, UseGuards, Query } from '@nestjs/common';
import { Request } from 'express';
import { TenantContext } from '@exam-platform/shared';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentTenant } from '../auth/current-tenant.decorator';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { RequireAnyPermission, RequirePermissions } from '../rbac/permissions.decorator';
import type { ScopeUser } from '../access/scope';
import { AssetCategoryDto, AssetDto, CompanyExitDto, ManualStepDto, SettledOutsideDto, HrFactsDto, InterviewDto, InterviewNotesDto, IssueAssetDto, NoticeChangeDto, ProbationReviewDto, ReasonDto, ResignDto, ReturnAssetDto, BlockItemDto, SignOffDto } from './exit-dto';
import { ExitsService } from './exits.service';
import { OffboardingService } from './offboarding.service';
import { LastDayService } from './last-day.service';
import { ItAssetsService } from './it-assets.service';
import { ContractDto, FreeSeatDto, LicenceDto, LicenceSeatDto, SupplierDto } from './it-assets-dto';
import { EntityFilterDto } from '../common/entity-filter.dto';

// Lifecycle batch 6c (design §13). Keys (P02 YX-SEC-01), checked again per person, case, item and asset:
//   lifecycle.exit.view                 exit cases of the people in scope (the manager sees their team's without a key)
//   lifecycle.exit.manage               company exits (and withdrawing them), notice changes, the HR step of a resignation, any clearance item
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
    private readonly lastDay: LastDayService,
    private readonly itAssets: ItAssetsService,
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
  list(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Query() q: EntityFilterDto) {
    return this.exits.list(ctx, this.user(req), q.legalEntityId);
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

  @Post('exits/:id/withdraw')
  @HttpCode(200)
  @RequirePermissions('lifecycle.exit.manage')
  withdrawExit(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ReasonDto) {
    return this.exits.withdrawCompanyExit(ctx, this.user(req), id, dto.reason);
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

  // ------------------------------------------------------------------------------------------ after the last day (6d)

  @Get('exits/:id/steps')
  @RequirePermissions('lifecycle.exit.manage')
  steps(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.lastDay.panel(ctx, this.user(req), id);
  }

  @Post('exits/:id/steps/:handler/retry')
  @HttpCode(200)
  @RequirePermissions('lifecycle.exit.manage')
  retryStep(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Param('handler') handler: string) {
    return this.lastDay.retry(ctx, this.user(req), id, handler.slice(0, 40));
  }

  @Post('exits/:id/steps/:handler/done')
  @HttpCode(200)
  @RequirePermissions('lifecycle.exit.manage')
  stepDone(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Param('handler') handler: string, @Body() dto: ManualStepDto) {
    return this.lastDay.manualDone(ctx, this.user(req), id, handler.slice(0, 40), dto.note);
  }

  @Get('exits/:id/handoff')
  @RequireAnyPermission('lifecycle.exit.manage', 'payroll.period.view')
  handoff(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.lastDay.handoff(ctx, this.user(req), id);
  }

  @Post('exits/:id/settled-outside')
  @HttpCode(200)
  @RequirePermissions('lifecycle.exit.manage')
  settledOutside(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: SettledOutsideDto) {
    return this.lastDay.settledOutside(ctx, this.user(req), id, dto);
  }

  // ------------------------------------------------------------------------------------------ clearance

  @Get('clearance/mine')
  myClearance(@Req() req: Request, @CurrentTenant() ctx: TenantContext) {
    return this.offboarding.myClearance(ctx, this.user(req));
  }

  /** PPL-20 HR view: every department's items, leaver by leaver, for leavers in the caller's scope. */
  @Get('clearance')
  @RequirePermissions('lifecycle.exit.manage')
  hrClearance(@Req() req: Request, @CurrentTenant() ctx: TenantContext) {
    return this.offboarding.hrClearance(ctx, this.user(req));
  }

  /** PPL-20: the owner (or HR over the leaver) marks an open item blocked, with the reason. */
  @Post('clearance/:id/block')
  @HttpCode(200)
  block(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: BlockItemDto) {
    return this.offboarding.block(ctx, this.user(req), id, dto);
  }

  @Post('clearance/:id/sign-off')
  @HttpCode(200)
  signOff(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: SignOffDto) {
    return this.offboarding.signOff(ctx, this.user(req), id, dto);
  }

  // ------------------------------------------------------------------------------------------ assets

  /** PPL-03: what one person holds (themselves, asset.view, or their managers); decided by the service. */
  @Get('people/:employeeId/assets')
  personAssets(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('employeeId', ParseUUIDPipe) employeeId: string) {
    return this.offboarding.personAssets(ctx, this.user(req), employeeId);
  }

  @Get('assets')
  @RequirePermissions('asset.view')
  assets(@Req() req: Request, @CurrentTenant() ctx: TenantContext) {
    return this.offboarding.assets(ctx, this.user(req));
  }

  // Settings 2.8 (answer 2712): the company's asset categories. Read by the settings page and the asset pickers; changed
  // with HR's company-wide settings key (checked again by the service).
  @Get('asset-categories')
  @RequireAnyPermission('asset.view', 'asset.manage', 'org.settings.manage', 'org.structure.view')
  assetCategories(@Req() req: Request, @CurrentTenant() ctx: TenantContext) {
    return this.offboarding.categories(ctx, this.user(req));
  }

  @Post('asset-categories')
  @RequirePermissions('org.settings.manage')
  addAssetCategory(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Body() dto: AssetCategoryDto) {
    return this.offboarding.saveCategory(ctx, this.user(req), null, dto);
  }

  @Put('asset-categories/:id')
  @RequirePermissions('org.settings.manage')
  saveAssetCategory(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: AssetCategoryDto) {
    return this.offboarding.saveCategory(ctx, this.user(req), id, dto);
  }

  @Post('asset-categories/:id/retire')
  @HttpCode(200)
  @RequirePermissions('org.settings.manage')
  retireAssetCategory(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.offboarding.retireCategory(ctx, this.user(req), id);
  }

  // IT assets part 3 (answer 2716): the IT and Admin supplier list, company-wide. Read with asset.view or asset.manage at
  // any scope (to pick one on an asset); changed by asset.manage holders at any scope (checked again by the service).
  @Get('asset-suppliers')
  @RequireAnyPermission('asset.view', 'asset.manage')
  assetSuppliers(@Req() req: Request, @CurrentTenant() ctx: TenantContext) {
    return this.itAssets.suppliers(ctx, this.user(req));
  }

  @Post('asset-suppliers')
  @RequirePermissions('asset.manage')
  addAssetSupplier(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Body() dto: SupplierDto) {
    return this.itAssets.saveSupplier(ctx, this.user(req), null, dto);
  }

  @Put('asset-suppliers/:id')
  @RequirePermissions('asset.manage')
  saveAssetSupplier(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: SupplierDto) {
    return this.itAssets.saveSupplier(ctx, this.user(req), id, dto);
  }

  // Answer 2717: asset contracts (asset.view over the contract's place reads; asset.manage over it changes; checked again
  // per contract by the service, with the value only for money holders).
  @Get('asset-contracts')
  @RequirePermissions('asset.view')
  assetContracts(@Req() req: Request, @CurrentTenant() ctx: TenantContext) {
    return this.itAssets.contracts(ctx, this.user(req));
  }

  @Post('asset-contracts')
  @RequirePermissions('asset.manage')
  addAssetContract(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Body() dto: ContractDto) {
    return this.itAssets.saveContract(ctx, this.user(req), null, dto);
  }

  @Put('asset-contracts/:id')
  @RequirePermissions('asset.manage')
  saveAssetContract(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ContractDto) {
    return this.itAssets.saveContract(ctx, this.user(req), id, dto);
  }

  // Answer 2718: software licences and their seats (asset.view over the licence's place reads; asset.manage over it
  // changes, gives and frees seats; checked again per licence by the service, with the cost only for money holders).
  @Get('asset-licences')
  @RequirePermissions('asset.view')
  assetLicences(@Req() req: Request, @CurrentTenant() ctx: TenantContext) {
    return this.itAssets.licences(ctx, this.user(req));
  }

  @Post('asset-licences')
  @RequirePermissions('asset.manage')
  addAssetLicence(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Body() dto: LicenceDto) {
    return this.itAssets.saveLicence(ctx, this.user(req), null, dto);
  }

  @Put('asset-licences/:id')
  @RequirePermissions('asset.manage')
  saveAssetLicence(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: LicenceDto) {
    return this.itAssets.saveLicence(ctx, this.user(req), id, dto);
  }

  @Post('asset-licences/:id/seats')
  @RequirePermissions('asset.manage')
  giveLicenceSeat(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: LicenceSeatDto) {
    return this.itAssets.giveSeat(ctx, this.user(req), id, dto);
  }

  @Post('asset-licences/:id/seats/:seatId/free')
  @HttpCode(200)
  @RequirePermissions('asset.manage')
  freeLicenceSeat(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Param('seatId', ParseUUIDPipe) seatId: string, @Body() dto: FreeSeatDto) {
    return this.itAssets.freeSeat(ctx, this.user(req), id, seatId, dto);
  }

  /** Who an asset can be issued to: current employees, name only. IT holds asset.manage without any employee grant. */
  @Get('assets/people')
  @RequirePermissions('asset.manage')
  assetPeople(@Req() req: Request, @CurrentTenant() ctx: TenantContext) {
    return this.offboarding.assetPeople(ctx, this.user(req));
  }

  // IT assets plan (26 Nov 2026): the asset page, details and history (asset.view over its place; else 404).
  @Get('assets/:id')
  @RequirePermissions('asset.view')
  assetPage(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.offboarding.assetPage(ctx, this.user(req), id);
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
