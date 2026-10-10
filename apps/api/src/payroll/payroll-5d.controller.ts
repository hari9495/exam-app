import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query, Req, Res, StreamableFile, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import { Request, Response } from 'express';
import { TenantContext } from '@exam-platform/shared';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentTenant } from '../auth/current-tenant.decorator';
import { RequireStepUp } from '../auth/step-up.decorator';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { RequireAnyPermission, RequirePermissions } from '../rbac/permissions.decorator';
import { MODERATE_UPLOAD_THROTTLE, STRICT_AUTH_THROTTLE } from '../rate-limit-tiers';
import type { ScopeUser } from '../access/scope';
import { ConfirmDto, DisbursementDto, ExpediteBankDto, GenerateBankFileDto, PaymentModeDto, PaymentResultsDto, QueryListDto, QueryRaiseDto, QueryUpdateDto } from './dto-5d';
import { PayoutService } from './payout.service';
import { PayslipsService } from './payslips.service';

// Payroll batch 5d (M03-BUILD-DESIGN §14.4). Every route declares its key (YX-SEC-01) or is the signed-in person's own
// (no key: their payslips, PDF links and queries, checked against their employee records by the pay guard); the
// services check the key's legal entities again. ⚡ = a fresh second sign-in step (P12).
//   payroll.bankfile.generate        generate (a new one needs a reason)
//   payroll.bankfile.release ⚡       release by someone else; the urgent bank fix after a failed payment (D11)
//   payroll.payment.record           bank results (file or rows), cash / cheque register, ask for a payment mode
//   payroll.payment_mode.approve     approves payment modes through P03 (the generic approvals inbox)
//   payroll.payslip.publish ⚡        publish an approved run's payslips
//   payroll.query.handle             answer payslip queries

@Controller('payroll')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class Payroll5dController {
  constructor(
    private readonly payout: PayoutService,
    private readonly payslips: PayslipsService,
  ) {}

  private user(req: Request) {
    return req.user as ScopeUser;
  }

  // ------------------------------------------------------------------------------------------ bank files

  @Post('runs/:id/bank-files')
  @RequirePermissions('payroll.bankfile.generate')
  generate(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: GenerateBankFileDto) {
    return this.payout.generate(ctx, this.user(req), id, dto);
  }

  @Get('runs/:id/bank-files')
  @RequireAnyPermission('payroll.bankfile.generate', 'payroll.bankfile.release', 'payroll.run.view')
  bankFiles(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.payout.bankFiles(ctx, this.user(req), id);
  }

  @Post('bank-files/:id/release')
  @HttpCode(200)
  @RequirePermissions('payroll.bankfile.release')
  @RequireStepUp()
  release(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ConfirmDto) {
    return this.payout.release(ctx, this.user(req), id, dto.confirmation);
  }

  // ------------------------------------------------------------------------------------------ payment results, modes, register

  @Post('runs/:id/payment-results')
  @HttpCode(200)
  @RequirePermissions('payroll.payment.record')
  results(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: PaymentResultsDto) {
    return this.payout.recordResults(ctx, this.user(req), id, dto.rows, 'manual');
  }

  @Post('runs/:id/payment-results/upload')
  @HttpCode(200)
  @RequirePermissions('payroll.payment.record')
  @Throttle(MODERATE_UPLOAD_THROTTLE)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 2 * 1024 * 1024, files: 1 } }))
  resultsFile(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @UploadedFile() file?: { buffer: Buffer }) {
    return this.payout.recordResults(ctx, this.user(req), id, this.payout.parseResults(file?.buffer), 'file');
  }

  @Post('payslips/:id/expedite-bank')
  @HttpCode(200)
  @RequirePermissions('payroll.bankfile.release')
  @RequireStepUp()
  expedite(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ExpediteBankDto) {
    return this.payout.expedite(ctx, this.user(req), id, dto);
  }

  @Get('payment-modes')
  @RequireAnyPermission('payroll.payment.record', 'payroll.payment_mode.approve')
  modes(@Req() req: Request, @CurrentTenant() ctx: TenantContext) {
    return this.payout.modes(ctx, this.user(req));
  }

  @Post('payment-modes')
  @RequirePermissions('payroll.payment.record')
  requestMode(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Body() dto: PaymentModeDto) {
    return this.payout.requestMode(ctx, this.user(req), dto);
  }

  @Get('runs/:id/disbursements')
  @RequirePermissions('payroll.payment.record')
  disbursements(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.payout.disbursements(ctx, this.user(req), id);
  }

  @Post('runs/:id/disbursements')
  @RequirePermissions('payroll.payment.record')
  disburse(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: DisbursementDto) {
    return this.payout.disburse(ctx, this.user(req), id, dto);
  }

  // ------------------------------------------------------------------------------------------ payslips to employees

  @Post('runs/:id/publish')
  @HttpCode(200)
  @RequirePermissions('payroll.payslip.publish')
  @RequireStepUp()
  publish(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ConfirmDto) {
    return this.payslips.publish(ctx, this.user(req), id, dto.confirmation);
  }

  @Get('me/payslips')
  mySlips(@Req() req: Request, @CurrentTenant() ctx: TenantContext) {
    return this.payslips.mySlips(ctx, this.user(req));
  }

  /** A single-use 60-second link to the PDF (the person's own published payslip). */
  @Get('me/payslips/:id/pdf')
  @Throttle(MODERATE_UPLOAD_THROTTLE)
  pdf(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.payslips.pdfLink(ctx, this.user(req), id);
  }

  @Get('payslip-downloads/:token')
  @Throttle(MODERATE_UPLOAD_THROTTLE)
  async download(@Req() req: Request, @Res({ passthrough: true }) res: Response, @CurrentTenant() ctx: TenantContext, @Param('token') token: string) {
    const out = await this.payslips.download(ctx, this.user(req), token.slice(0, 100));
    res.set({ 'Content-Type': out.contentType, 'Content-Disposition': `attachment; filename="${out.name}"`, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
    return new StreamableFile(out.file);
  }

  /** 5e-D1: the link in the payslip email opens that payslip for the person it was sent to, once signed in. */
  @Post('me/payslip-links/:token/open')
  @HttpCode(200)
  @Throttle(STRICT_AUTH_THROTTLE)
  openLink(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('token') token: string) {
    return this.payslips.openEmailLink(ctx, this.user(req), token.slice(0, 100));
  }

  @Post('me/payslips/:id/queries')
  raise(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: QueryRaiseDto) {
    return this.payslips.raise(ctx, this.user(req), id, dto);
  }

  /** Own queries for everyone; payroll.query.handle adds the entities' queries (checked in the service). */
  @Get('queries')
  queries(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Query() q: QueryListDto) {
    return this.payslips.list(ctx, this.user(req), q.status);
  }

  @Patch('queries/:id')
  updateQuery(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: QueryUpdateDto) {
    return this.payslips.update(ctx, this.user(req), id, dto);
  }
}
