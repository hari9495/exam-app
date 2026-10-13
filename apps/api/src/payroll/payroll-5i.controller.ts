import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query, Req, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import { Request } from 'express';
import { TenantContext } from '@exam-platform/shared';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentTenant } from '../auth/current-tenant.decorator';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { RequirePermissions } from '../rbac/permissions.decorator';
import { MODERATE_UPLOAD_THROTTLE } from '../rate-limit-tiers';
import type { ScopeUser } from '../access/scope';
import {
  AuthorisationDto,
  ClawbackDto,
  EntityMonthQuery,
  IncentivePlanDto,
  IncentiveResultsDto,
  LayoffDto,
  OncallRuleDto,
  OncallSlotDto,
  OutputImportDto,
  OutputsDto,
  PostMonthDto,
  RateCardDto,
  RevokeDto,
  SettlementDto,
  SettlementPostDto,
  TipPoolDto,
  UnionDto,
  VrsDto,
} from './dto-5i';
import { SpecialPayService } from './special-pay.service';

// Payroll batch 5i special pay (M03-BUILD-DESIGN §14.7). Every route declares its key (YX-SEC-01); the service checks the
// key's legal entities again and the database pay guard does too.
//   payroll.special.manage    piece-rate, incentives, tips, on-call, union dues, settlements, lay-off and VRS; sending a
//                             month's lines to payroll (approved in Approvals by a payroll approver who neither made it
//                             nor is paid in it)
//   (own)                     a person's incentive statement (their own rows only)

@Controller('payroll/special')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class Payroll5iController {
  constructor(private readonly special: SpecialPayService) {}

  private user(req: Request) {
    return req.user as ScopeUser;
  }

  @Get('postings')
  @RequirePermissions('payroll.special.manage')
  postings(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Query() q: EntityMonthQuery) {
    return this.special.postings(ctx, this.user(req), q.legalEntityId, q.month);
  }

  // ------------------------------------------------------------------------------------------ piece-rate

  @Get('rate-cards')
  @RequirePermissions('payroll.special.manage')
  cards(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Query() q: EntityMonthQuery) {
    return this.special.cards(ctx, this.user(req), q.legalEntityId);
  }

  @Post('rate-cards')
  @RequirePermissions('payroll.special.manage')
  addCard(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Body() dto: RateCardDto) {
    return this.special.addCard(ctx, this.user(req), dto);
  }

  @Get('outputs')
  @RequirePermissions('payroll.special.manage')
  outputs(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Query() q: PostMonthDto) {
    return this.special.outputs(ctx, this.user(req), q.legalEntityId, q.month);
  }

  @Post('outputs')
  @RequirePermissions('payroll.special.manage')
  addOutputs(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Body() dto: OutputsDto) {
    return this.special.addOutputs(ctx, this.user(req), dto.legalEntityId, dto.rows);
  }

  @Post('outputs/import')
  @Throttle(MODERATE_UPLOAD_THROTTLE)
  @RequirePermissions('payroll.special.manage')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 2 * 1024 * 1024, files: 1 } }))
  importOutputs(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Body() dto: OutputImportDto, @UploadedFile() f?: Express.Multer.File) {
    return this.special.importOutputs(ctx, this.user(req), dto.legalEntityId, f?.buffer);
  }

  @Post('piece/post')
  @RequirePermissions('payroll.special.manage')
  postPiece(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Body() dto: PostMonthDto) {
    return this.special.postPiece(ctx, this.user(req), dto.legalEntityId, dto.month);
  }

  // ------------------------------------------------------------------------------------------ incentives

  @Get('plans')
  @RequirePermissions('payroll.special.manage')
  plans(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Query() q: EntityMonthQuery) {
    return this.special.plans(ctx, this.user(req), q.legalEntityId);
  }

  @Post('plans')
  @RequirePermissions('payroll.special.manage')
  addPlan(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Body() dto: IncentivePlanDto) {
    return this.special.addPlan(ctx, this.user(req), dto);
  }

  @Get('plans/:id/results')
  @RequirePermissions('payroll.special.manage')
  results(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Query() q: SettlementPostDto) {
    return this.special.results(ctx, this.user(req), id, q.month);
  }

  @Post('plans/:id/results')
  @HttpCode(200)
  @RequirePermissions('payroll.special.manage')
  saveResults(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: IncentiveResultsDto) {
    return this.special.saveResults(ctx, this.user(req), id, dto);
  }

  @Post('plans/:id/post')
  @RequirePermissions('payroll.special.manage')
  postIncentives(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: SettlementPostDto) {
    return this.special.postIncentives(ctx, this.user(req), id, dto.month);
  }

  @Post('clawbacks')
  @RequirePermissions('payroll.special.manage')
  addClawback(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Body() dto: ClawbackDto) {
    return this.special.addClawback(ctx, this.user(req), dto);
  }

  @Post('clawbacks/post')
  @RequirePermissions('payroll.special.manage')
  postClawbacks(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Body() dto: PostMonthDto) {
    return this.special.postClawbacks(ctx, this.user(req), dto.legalEntityId, dto.month);
  }

  /** The signed-in person's incentive statement (no key: their own rows, by the pay guard). */
  @Get('me/incentives')
  myIncentives(@Req() req: Request, @CurrentTenant() ctx: TenantContext) {
    return this.special.myIncentives(ctx, this.user(req));
  }

  // ------------------------------------------------------------------------------------------ tips and on-call

  @Get('tip-pools')
  @RequirePermissions('payroll.special.manage')
  pools(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Query() q: PostMonthDto) {
    return this.special.pools(ctx, this.user(req), q.legalEntityId, q.month);
  }

  @Post('tip-pools')
  @RequirePermissions('payroll.special.manage')
  addPool(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Body() dto: TipPoolDto) {
    return this.special.addPool(ctx, this.user(req), dto);
  }

  @Post('tip-pools/:id/post')
  @RequirePermissions('payroll.special.manage')
  postPool(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.special.postPool(ctx, this.user(req), id);
  }

  @Get('oncall-rules')
  @RequirePermissions('payroll.special.manage')
  oncallRules(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Query() q: EntityMonthQuery) {
    return this.special.oncallRules(ctx, this.user(req), q.legalEntityId);
  }

  @Post('oncall-rules')
  @RequirePermissions('payroll.special.manage')
  addOncallRule(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Body() dto: OncallRuleDto) {
    return this.special.addOncallRule(ctx, this.user(req), dto);
  }

  @Get('oncall-slots')
  @RequirePermissions('payroll.special.manage')
  slots(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Query() q: PostMonthDto) {
    return this.special.slots(ctx, this.user(req), q.legalEntityId, q.month);
  }

  @Post('oncall-slots')
  @RequirePermissions('payroll.special.manage')
  addSlot(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Body() dto: OncallSlotDto) {
    return this.special.addSlot(ctx, this.user(req), dto);
  }

  @Post('oncall/post')
  @RequirePermissions('payroll.special.manage')
  postOncall(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Body() dto: PostMonthDto) {
    return this.special.postOncall(ctx, this.user(req), dto.legalEntityId, dto.month);
  }

  // ------------------------------------------------------------------------------------------ industrial relations

  @Get('unions')
  @RequirePermissions('payroll.special.manage')
  unions(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Query() q: EntityMonthQuery) {
    return this.special.unions(ctx, this.user(req), q.legalEntityId);
  }

  @Post('unions')
  @RequirePermissions('payroll.special.manage')
  addUnion(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Body() dto: UnionDto) {
    return this.special.addUnion(ctx, this.user(req), dto);
  }

  @Post('union-authorisations')
  @RequirePermissions('payroll.special.manage')
  authorise(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Body() dto: AuthorisationDto) {
    return this.special.authorise(ctx, this.user(req), dto);
  }

  @Post('union-authorisations/:id/revoke')
  @HttpCode(200)
  @RequirePermissions('payroll.special.manage')
  revoke(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: RevokeDto) {
    return this.special.revoke(ctx, this.user(req), id, dto.revokedOn);
  }

  @Post('union/post')
  @RequirePermissions('payroll.special.manage')
  postUnion(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Body() dto: PostMonthDto) {
    return this.special.postUnion(ctx, this.user(req), dto.legalEntityId, dto.month);
  }

  @Get('unions/:id/remittance')
  @RequirePermissions('payroll.special.manage')
  remittance(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Query() q: SettlementPostDto) {
    return this.special.remittance(ctx, this.user(req), id, q.month);
  }

  @Post('settlements')
  @RequirePermissions('payroll.special.manage')
  addSettlement(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Body() dto: SettlementDto) {
    return this.special.addSettlement(ctx, this.user(req), dto);
  }

  @Post('settlements/:id/post')
  @RequirePermissions('payroll.special.manage')
  postSettlement(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: SettlementPostDto) {
    return this.special.postSettlement(ctx, this.user(req), id, dto.month);
  }

  @Post('entities/:entityId/layoff-days')
  @HttpCode(200)
  @RequirePermissions('payroll.special.manage')
  addLayoff(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('entityId', ParseUUIDPipe) entityId: string, @Body() dto: LayoffDto) {
    return this.special.addLayoff(ctx, this.user(req), entityId, dto);
  }

  @Post('layoff/post')
  @RequirePermissions('payroll.special.manage')
  postLayoff(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Body() dto: PostMonthDto) {
    return this.special.postLayoff(ctx, this.user(req), dto.legalEntityId, dto.month);
  }

  @Post('entities/:entityId/vrs')
  @RequirePermissions('payroll.special.manage')
  addVrs(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('entityId', ParseUUIDPipe) entityId: string, @Body() dto: VrsDto) {
    return this.special.addVrs(ctx, this.user(req), entityId, dto);
  }
}
