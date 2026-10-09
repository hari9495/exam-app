import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query, Req, Res, StreamableFile, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import { Request, Response } from 'express';
import { TenantContext } from '@exam-platform/shared';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentTenant } from '../auth/current-tenant.decorator';
import { RequireStepUp } from '../auth/step-up.decorator';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { RequirePermissions } from '../rbac/permissions.decorator';
import { MODERATE_UPLOAD_THROTTLE } from '../rate-limit-tiers';
import type { ScopeUser } from '../access/scope';
import {
  AdvisoryReviewDto,
  CertificateBatchDto,
  ChallanPrepareDto,
  ChallanUpdateDto,
  ConfirmDto5f,
  EntityDto,
  FilingDto,
  HubDto,
  PartADto,
  RegisterDto,
  ReturnDto,
  ReturnFiledDto,
  UploadedDto,
} from './dto-5f';
import { StatutoryFilingsService } from './statutory-filings.service';
import { StatutoryRegistersService } from './statutory-registers.service';

// Payroll batch 5f (M03-BUILD-DESIGN §14.6). Every route declares its key (YX-SEC-01); the services check the key's
// legal entities again and the database pay guard is the second layer. ⚡ = a fresh second sign-in step (P12).
//   statutory.filing.view          hub, filings, challans, returns, registers
//   statutory.filing.generate      PF / ESI / PT / LWF files, supplementary filings, excesses, TDS returns, Part A import
//   statutory.filing.download      statutory files and registers (each download recorded with the hash)
//   statutory.filing.mark_filed ⚡  uploaded with the portal reference; filed (locks the month)
//   statutory.challan.manage       TDS challans
//   statutory.register.sign ⚡      freeze and sign registers, inspection packs, certificates in bulk
//   statutory.advisory.review      the advisory feed

const send = (res: Response, out: { file: Buffer; name: string; contentType: string }) => {
  res.set({
    'Content-Type': out.contentType,
    'Content-Disposition': `attachment; filename="${out.name.replace(/[^A-Za-z0-9._-]/g, '_')}"`,
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  });
  return new StreamableFile(out.file);
};

@Controller('statutory')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class StatutoryController {
  constructor(
    private readonly filings: StatutoryFilingsService,
    private readonly registers: StatutoryRegistersService,
  ) {}

  private user(req: Request) {
    return req.user as ScopeUser;
  }

  @Get('hub')
  @RequirePermissions('statutory.filing.view')
  hub(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Query() q: HubDto) {
    return this.filings.hub(ctx, this.user(req), q.entityId, q.month);
  }

  // ------------------------------------------------------------------------------------------ filings

  @Get('filings')
  @RequirePermissions('statutory.filing.view')
  list(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Query() q: EntityDto) {
    return this.filings.filings(ctx, this.user(req), q.entityId, q.month);
  }

  @Post('filings')
  @RequirePermissions('statutory.filing.generate')
  generate(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Body() dto: FilingDto) {
    return this.filings.generate(ctx, this.user(req), dto);
  }

  @Post('filings/:id/uploaded')
  @HttpCode(200)
  @RequirePermissions('statutory.filing.mark_filed')
  @RequireStepUp()
  uploaded(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UploadedDto) {
    return this.filings.uploaded(ctx, this.user(req), id, dto.reference);
  }

  @Post('filings/:id/filed')
  @HttpCode(200)
  @RequirePermissions('statutory.filing.mark_filed')
  @RequireStepUp()
  filed(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ConfirmDto5f) {
    return this.filings.filed(ctx, this.user(req), id, dto.confirmation);
  }

  @Post('filings/:id/transmit')
  @HttpCode(200)
  @RequirePermissions('statutory.filing.generate')
  transmit(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.filings.transmit(ctx, this.user(req), id);
  }

  // ------------------------------------------------------------------------------------------ TDS challans and returns

  @Get('challans')
  @RequirePermissions('statutory.filing.view')
  challans(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Query() q: EntityDto) {
    return this.filings.challans(ctx, this.user(req), q.entityId);
  }

  @Post('challans')
  @RequirePermissions('statutory.challan.manage')
  prepareChallan(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Body() dto: ChallanPrepareDto) {
    return this.filings.prepareChallan(ctx, this.user(req), dto.entityId, dto.month);
  }

  @Patch('challans/:id')
  @RequirePermissions('statutory.challan.manage')
  updateChallan(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ChallanUpdateDto) {
    return this.filings.updateChallan(ctx, this.user(req), id, dto);
  }

  @Get('tds-returns')
  @RequirePermissions('statutory.filing.view')
  returns(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Query() q: EntityDto) {
    return this.filings.returns(ctx, this.user(req), q.entityId);
  }

  @Post('tds-returns')
  @RequirePermissions('statutory.filing.generate')
  createReturn(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Body() dto: ReturnDto) {
    return this.filings.createReturn(ctx, this.user(req), dto.entityId, dto.taxYear, dto.quarter);
  }

  @Get('tds-returns/:id')
  @RequirePermissions('statutory.filing.view')
  getReturn(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.filings.getReturn(ctx, this.user(req), id);
  }

  @Post('tds-returns/:id/reconcile')
  @HttpCode(200)
  @RequirePermissions('statutory.filing.generate')
  reconcile(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.filings.reconcile(ctx, this.user(req), id);
  }

  @Post('tds-returns/:id/file')
  @HttpCode(200)
  @RequirePermissions('statutory.filing.generate')
  returnFile(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.filings.returnFile(ctx, this.user(req), id);
  }

  @Post('tds-returns/:id/filed')
  @HttpCode(200)
  @RequirePermissions('statutory.filing.mark_filed')
  @RequireStepUp()
  returnFiled(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ReturnFiledDto) {
    return this.filings.returnFiled(ctx, this.user(req), id, dto.tokenNo, dto.confirmation);
  }

  @Post('tds-returns/:id/correction')
  @RequirePermissions('statutory.filing.generate')
  correction(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.filings.correction(ctx, this.user(req), id);
  }

  @Post('tds-returns/part-a')
  @HttpCode(200)
  @RequirePermissions('statutory.filing.generate')
  @Throttle(MODERATE_UPLOAD_THROTTLE)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 50 * 1024 * 1024, files: 1 } }))
  partA(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Body() dto: PartADto, @UploadedFile() file?: { buffer: Buffer }) {
    return this.registers.importPartA(ctx, this.user(req), dto.entityId, dto.taxYear, file?.buffer);
  }

  @Post('form130/batch')
  @HttpCode(200)
  @RequirePermissions('statutory.register.sign')
  @RequireStepUp()
  certificates(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Body() dto: CertificateBatchDto) {
    return this.registers.issueBatch(ctx, this.user(req), dto.entityId, dto.taxYear, dto.confirmation);
  }

  // ------------------------------------------------------------------------------------------ registers and inspection packs

  @Get('registers')
  @RequirePermissions('statutory.filing.view')
  registerList(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Query() q: EntityDto) {
    return this.registers.list(ctx, this.user(req), q.entityId, q.month);
  }

  @Post('registers')
  @RequirePermissions('statutory.filing.generate')
  registerMake(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Body() dto: RegisterDto) {
    return this.registers.generate(ctx, this.user(req), dto.entityId, dto.month, dto.locationId ?? null, dto.reason);
  }

  @Get('registers/:id/file')
  @RequirePermissions('statutory.filing.download')
  @Throttle(MODERATE_UPLOAD_THROTTLE)
  async registerFile(@Req() req: Request, @Res({ passthrough: true }) res: Response, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return send(res, await this.registers.file(ctx, this.user(req), id));
  }

  @Post('registers/:id/freeze')
  @HttpCode(200)
  @RequirePermissions('statutory.register.sign')
  @RequireStepUp()
  freeze(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.registers.freeze(ctx, this.user(req), id);
  }

  @Post('registers/:id/sign')
  @HttpCode(200)
  @RequirePermissions('statutory.register.sign')
  @RequireStepUp()
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 20 * 1024 * 1024, files: 1 } }))
  sign(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @UploadedFile() file?: { buffer: Buffer }) {
    return this.registers.sign(ctx, this.user(req), id, file?.buffer);
  }

  /** The person's own rows in any register (no key: the database shows only their own). */
  @Get('me/registers')
  mine(@Req() req: Request, @CurrentTenant() ctx: TenantContext) {
    return this.registers.mine(ctx, this.user(req));
  }

  @Post('inspection-packs')
  @RequirePermissions('statutory.register.sign')
  pack(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Body() dto: RegisterDto) {
    return this.registers.inspectionPack(ctx, this.user(req), dto.entityId, dto.month, dto.locationId ?? null);
  }

  // ------------------------------------------------------------------------------------------ advisories

  @Get('advisories')
  @RequirePermissions('statutory.advisory.review')
  advisories(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Query() q: EntityDto) {
    return this.registers.advisories(ctx, this.user(req), q.entityId);
  }

  @Post('advisories/:code/review')
  @RequirePermissions('statutory.advisory.review')
  review(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('code') code: string, @Body() dto: AdvisoryReviewDto) {
    return this.registers.review(ctx, this.user(req), code.slice(0, 40), dto.entityId, dto.note);
  }
}
