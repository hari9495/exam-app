import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query, Req, Res, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import { Request, Response } from 'express';
import { TenantContext } from '@exam-platform/shared';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentTenant } from '../auth/current-tenant.decorator';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { RequireAnyPermission, RequirePermissions } from '../rbac/permissions.decorator';
import { MODERATE_UPLOAD_THROTTLE } from '../rate-limit-tiers';
import type { ScopeUser } from '../access/scope';
import { ActuarialService } from './actuarial.service';
import { CountryPackService } from './country-packs.service';
import { CensusDto, EntityMonthQuery, EquityPlanDto, EwaDrawDto, EwaPaidDto, EwaPolicyDto, ExerciseDto, GrantDto, PackSwitchDto, PostMonthDto, ReasonDto, TaxYearDto, ValuationDto, ValuationResultDto, W9Dto, WpsIdsDto } from './dto-5i';
import { EquityService } from './equity.service';
import { EwaService } from './ewa.service';
import { file } from './payroll.controller';

// Payroll batch 5i (M03-BUILD-DESIGN §14.7): earned wage access, equity, the actuarial census and country packs. Every
// route declares its key (YX-SEC-01) or is the signed-in person's own (no key: their draws and grants, checked against
// their employee records by the pay guard); the services check the key's legal entities again.
//   payroll.ewa.manage        EWA policies, draws, their payment (never one's own) and failures
//   payroll.equity.manage     plans, valuations, grants (approved by another holder), milestones, the cap table
//   payroll.special.manage    the actuarial census; the UAE end-of-service provision
//   payroll.journal.export    the actuary's figures and the provision journal (posted by someone else)
//   payroll.setup.manage      country packs (switched on after the completeness check), WPS ids
//   payroll.bankfile.generate the WPS salary file of an approved run
//   consultant.manage         W-9 and 1099-NEC for a US legal entity's contractors

@Controller('payroll')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class Payroll5iMoreController {
  constructor(
    private readonly ewa: EwaService,
    private readonly equity: EquityService,
    private readonly actuarial: ActuarialService,
    private readonly packs: CountryPackService,
  ) {}

  private user(req: Request) {
    return req.user as ScopeUser;
  }

  // ------------------------------------------------------------------------------------------ earned wage access

  @Get('ewa/policies')
  @RequirePermissions('payroll.ewa.manage')
  ewaPolicies(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Query() q: EntityMonthQuery) {
    return this.ewa.policies(ctx, this.user(req), q.legalEntityId);
  }

  @Post('ewa/policies')
  @RequirePermissions('payroll.ewa.manage')
  ewaPolicy(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Body() dto: EwaPolicyDto) {
    return this.ewa.addPolicy(ctx, this.user(req), dto);
  }

  @Get('ewa/draws')
  @RequirePermissions('payroll.ewa.manage')
  ewaDraws(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Query() q: PostMonthDto) {
    return this.ewa.draws(ctx, this.user(req), q.legalEntityId, q.month);
  }

  @Post('ewa/draws/:id/paid')
  @HttpCode(200)
  @RequirePermissions('payroll.ewa.manage')
  ewaPaid(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: EwaPaidDto) {
    return this.ewa.paid(ctx, this.user(req), id, dto.reference);
  }

  @Post('ewa/draws/:id/failed')
  @HttpCode(200)
  @RequirePermissions('payroll.ewa.manage')
  ewaFailed(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ReasonDto) {
    return this.ewa.failed(ctx, this.user(req), id, dto.reason);
  }

  /** The signed-in person's earned wage access (no key: their own). */
  @Get('me/ewa')
  myEwa(@Req() req: Request, @CurrentTenant() ctx: TenantContext) {
    return this.ewa.me(ctx, this.user(req));
  }

  @Post('me/ewa/draws')
  myDraw(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Body() dto: EwaDrawDto) {
    return this.ewa.request(ctx, this.user(req), dto);
  }

  // ------------------------------------------------------------------------------------------ equity

  @Get('equity')
  @RequirePermissions('payroll.equity.manage')
  equityOverview(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Query() q: EntityMonthQuery) {
    return this.equity.overview(ctx, this.user(req), q.legalEntityId);
  }

  @Post('equity/plans')
  @RequirePermissions('payroll.equity.manage')
  equityPlan(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Body() dto: EquityPlanDto) {
    return this.equity.addPlan(ctx, this.user(req), dto);
  }

  @Post('equity/valuations')
  @RequirePermissions('payroll.equity.manage')
  equityValuation(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Body() dto: ValuationDto) {
    return this.equity.addValuation(ctx, this.user(req), dto);
  }

  @Post('equity/grants')
  @RequirePermissions('payroll.equity.manage')
  equityGrant(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Body() dto: GrantDto) {
    return this.equity.grant(ctx, this.user(req), dto);
  }

  @Post('equity/vesting/:id/confirm')
  @HttpCode(200)
  @RequirePermissions('payroll.equity.manage')
  confirmMilestone(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.equity.confirmMilestone(ctx, this.user(req), id);
  }

  @Post('equity/exercises/:id/paid')
  @HttpCode(200)
  @RequirePermissions('payroll.equity.manage')
  exercisePaid(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: EwaPaidDto) {
    return this.equity.markPaid(ctx, this.user(req), id, dto.reference);
  }

  @Get('equity/plans/:id/cap-table')
  @RequirePermissions('payroll.equity.manage')
  async capTable(@Req() req: Request, @Res({ passthrough: true }) res: Response, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return file(res, await this.equity.capTable(ctx, this.user(req), id));
  }

  /** The signed-in person's grants, vesting and exercises (no key: their own). */
  @Get('me/equity')
  myEquity(@Req() req: Request, @CurrentTenant() ctx: TenantContext) {
    return this.equity.mine(ctx, this.user(req));
  }

  @Post('me/equity/exercises')
  myExercise(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Body() dto: ExerciseDto) {
    return this.equity.exercise(ctx, this.user(req), dto);
  }

  // ------------------------------------------------------------------------------------------ actuarial

  @Get('actuarial')
  @RequireAnyPermission('payroll.special.manage', 'payroll.journal.export')
  actuarialList(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Query() q: EntityMonthQuery) {
    return this.actuarial.list(ctx, this.user(req), q.legalEntityId);
  }

  @Post('actuarial/census')
  @RequirePermissions('payroll.special.manage')
  census(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Body() dto: CensusDto) {
    return this.actuarial.census(ctx, this.user(req), dto);
  }

  @Post('actuarial/valuations')
  @Throttle(MODERATE_UPLOAD_THROTTLE)
  @RequirePermissions('payroll.journal.export')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 10 * 1024 * 1024, files: 1 } }))
  valuation(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Body() dto: ValuationResultDto, @UploadedFile() f?: Express.Multer.File) {
    return this.actuarial.record(ctx, this.user(req), dto, f?.buffer);
  }

  @Post('actuarial/valuations/:id/post')
  @HttpCode(200)
  @RequirePermissions('payroll.journal.export')
  postValuation(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.actuarial.post(ctx, this.user(req), id);
  }

  // ------------------------------------------------------------------------------------------ country packs

  @Get('country-packs')
  @RequirePermissions('payroll.setup.manage')
  packStatus(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Query() q: EntityMonthQuery) {
    return this.packs.status(ctx, this.user(req), q.legalEntityId);
  }

  @Post('country-packs')
  @HttpCode(200)
  @RequirePermissions('payroll.setup.manage')
  switchOn(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Body() dto: PackSwitchDto) {
    return this.packs.switchOn(ctx, this.user(req), dto.legalEntityId, dto.settings ?? {});
  }

  @Post('entities/:entityId/wps-ids')
  @HttpCode(200)
  @RequirePermissions('payroll.setup.manage')
  wpsIds(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('entityId', ParseUUIDPipe) entityId: string, @Body() dto: WpsIdsDto) {
    return this.packs.setWpsIds(ctx, this.user(req), entityId, dto);
  }

  @Post('runs/:id/wps-file')
  @RequirePermissions('payroll.bankfile.generate')
  wpsFile(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.packs.wpsFile(ctx, this.user(req), id);
  }

  @Post('eosb/provision')
  @HttpCode(200)
  @RequirePermissions('payroll.special.manage')
  eosb(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Body() dto: PostMonthDto) {
    return this.packs.provisionEosb(ctx, this.user(req), dto.legalEntityId, dto.month);
  }

  @Post('w9')
  @HttpCode(200)
  @RequirePermissions('consultant.manage')
  w9(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Body() dto: W9Dto) {
    return this.packs.saveW9(ctx, this.user(req), dto);
  }

  @Get('1099-nec')
  @RequirePermissions('consultant.manage')
  nec(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Query() q: TaxYearDto) {
    return this.packs.necSummary(ctx, this.user(req), q.legalEntityId, q.year);
  }

  @Post('1099-nec')
  @RequirePermissions('consultant.manage')
  necFile(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Body() dto: TaxYearDto) {
    return this.packs.necFile(ctx, this.user(req), dto.legalEntityId, dto.year);
  }

  @Get('1099-nec/:consultantId/copy')
  @RequirePermissions('consultant.manage')
  async necCopy(@Req() req: Request, @Res({ passthrough: true }) res: Response, @CurrentTenant() ctx: TenantContext, @Param('consultantId', ParseUUIDPipe) id: string, @Query() q: TaxYearDto) {
    return file(res, await this.packs.necCopy(ctx, this.user(req), q.legalEntityId, id, q.year));
  }
}
