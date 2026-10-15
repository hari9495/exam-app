import { Body, Controller, Get, Headers, HttpCode, Ip, Param, ParseUUIDPipe, Patch, Post, Query, Req, Res, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import { Request, Response } from 'express';
import { TenantContext } from '@exam-platform/shared';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentTenant } from '../auth/current-tenant.decorator';
import { RequireStepUp } from '../auth/step-up.decorator';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { RequireAnyPermission, RequirePermissions } from '../rbac/permissions.decorator';
import { MODERATE_UPLOAD_THROTTLE, PUBLIC_API_THROTTLE, STRICT_AUTH_THROTTLE } from '../rate-limit-tiers';
import type { ScopeUser } from '../access/scope';
import { ConsultantsService } from './consultants.service';
import { ConfirmDto } from './dto-5d';
import { ChallanPrepareDto, EntityDto, ReturnDto, ReturnFiledDto } from './dto-5f';
import {
  CertificateDto197,
  ConsultantDto,
  ConsultantPayoutDto,
  ConsultantPortalEmailDto,
  ConsultantPortalVerifyDto,
  ConsultantResultsDto,
  ConsultantUpdateDto,
  Form131ImportDto,
  InvoiceDto,
  InvoiceListDto,
  StaffInvoiceDto,
  VerifyBankDto,
} from './dto-5h';
import { file } from './payroll.controller';

// Payroll batch 5h (M03-BUILD-DESIGN §14.7). Every route declares its key (YX-SEC-01); the service checks the key's
// legal entities again and the database pay guard does too. ⚡ = a fresh second sign-in step (P12).
//   consultant.manage              the register, bank checks (never one's own entry), s.197 certificates, invoices
//                                  entered for a consultant, bank files and results, payment advice, Form 131 import
//   consultant.invoice.approve     approves invoices through P03 (the approvals inbox); reads the register and invoices
//   payroll.bankfile.release ⚡     releases a consultant bank file someone else generated
//   statutory.challan.manage       the month's non-salary challans per section (deposits recorded on the shared challan)
//   statutory.filing.*             Form 140 / 26Q: draft, reconcile, file, filed

const UPLOAD = FileInterceptor('file', { limits: { fileSize: 5 * 1024 * 1024, files: 1 } });

@Controller('payroll')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class Payroll5hController {
  constructor(private readonly consultants: ConsultantsService) {}

  private user(req: Request) {
    return req.user as ScopeUser;
  }

  // ------------------------------------------------------------------------------------------ register

  @Get('consultants')
  @RequireAnyPermission('consultant.manage', 'consultant.invoice.approve')
  list(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Query('legalEntityId', new ParseUUIDPipe({ optional: true })) legalEntityId?: string) {
    return this.consultants.list(ctx, this.user(req), legalEntityId);
  }

  @Post('consultants')
  @RequirePermissions('consultant.manage')
  create(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Body() dto: ConsultantDto) {
    return this.consultants.create(ctx, this.user(req), dto);
  }

  @Get('consultants/:id')
  @RequireAnyPermission('consultant.manage', 'consultant.invoice.approve')
  get(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.consultants.get(ctx, this.user(req), id);
  }

  @Patch('consultants/:id')
  @RequirePermissions('consultant.manage')
  update(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ConsultantUpdateDto) {
    return this.consultants.update(ctx, this.user(req), id, dto);
  }

  @Post('consultants/:id/bank-check')
  @HttpCode(200)
  @RequirePermissions('consultant.manage')
  verifyBank(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: VerifyBankDto) {
    return this.consultants.verifyBank(ctx, this.user(req), id, dto.reference);
  }

  @Post('consultants/:id/certificates-197')
  @RequirePermissions('consultant.manage')
  addCertificate(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: CertificateDto197) {
    return this.consultants.addCertificate(ctx, this.user(req), id, dto);
  }

  // ------------------------------------------------------------------------------------------ invoices

  @Get('consultant-invoices')
  @RequireAnyPermission('consultant.manage', 'consultant.invoice.approve')
  invoices(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Query() q: InvoiceListDto) {
    return this.consultants.invoices(ctx, this.user(req), q);
  }

  @Post('consultant-invoices')
  @Throttle(MODERATE_UPLOAD_THROTTLE)
  @RequirePermissions('consultant.manage')
  @UseInterceptors(UPLOAD)
  submit(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Body() dto: StaffInvoiceDto, @UploadedFile() f?: Express.Multer.File) {
    return this.consultants.submit(ctx, this.user(req), dto, f);
  }

  @Get('consultant-invoices/:id/file')
  @RequireAnyPermission('consultant.manage', 'consultant.invoice.approve')
  async invoiceFile(@Req() req: Request, @Res({ passthrough: true }) res: Response, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return file(res, await this.consultants.invoiceFile(ctx, this.user(req), id));
  }

  @Get('consultant-invoices/:id/advice')
  @RequirePermissions('consultant.manage')
  async advice(@Req() req: Request, @Res({ passthrough: true }) res: Response, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return file(res, await this.consultants.adviceFile(ctx, this.user(req), id));
  }

  // ------------------------------------------------------------------------------------------ payments

  @Get('consultant-payouts')
  @RequireAnyPermission('consultant.manage', 'payroll.bankfile.release')
  batches(@Req() req: Request, @CurrentTenant() ctx: TenantContext) {
    return this.consultants.batches(ctx, this.user(req));
  }

  @Post('consultant-payouts')
  @RequirePermissions('consultant.manage')
  payout(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Body() dto: ConsultantPayoutDto) {
    return this.consultants.payout(ctx, this.user(req), dto);
  }

  @Get('consultant-payouts/:id/file')
  @RequireAnyPermission('consultant.manage', 'payroll.bankfile.release')
  async batchFile(@Req() req: Request, @Res({ passthrough: true }) res: Response, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return file(res, await this.consultants.batchFile(ctx, this.user(req), id));
  }

  @Post('consultant-payouts/:id/release')
  @HttpCode(200)
  @RequirePermissions('payroll.bankfile.release')
  @RequireStepUp()
  release(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ConfirmDto) {
    return this.consultants.release(ctx, this.user(req), id, dto.confirmation);
  }

  @Post('consultant-payouts/:id/results')
  @HttpCode(200)
  @RequirePermissions('consultant.manage')
  results(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ConsultantResultsDto) {
    return this.consultants.results(ctx, this.user(req), id, dto);
  }

  // ------------------------------------------------------------------------------------------ Form 140 / 26Q and Form 131 / 16A

  @Post('consultant-challans/prepare')
  @HttpCode(200)
  @RequirePermissions('statutory.challan.manage')
  prepareChallans(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Body() dto: ChallanPrepareDto) {
    return this.consultants.prepareChallans(ctx, this.user(req), dto.entityId, dto.month);
  }

  @Get('consultant-returns')
  @RequirePermissions('statutory.filing.view')
  returns(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Query() q: EntityDto) {
    return this.consultants.returns(ctx, this.user(req), q.entityId);
  }

  @Post('consultant-returns')
  @RequirePermissions('statutory.filing.generate')
  draftReturn(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Body() dto: ReturnDto) {
    return this.consultants.draftReturn(ctx, this.user(req), dto.entityId, dto.taxYear, dto.quarter);
  }

  @Post('consultant-returns/:id/reconcile')
  @HttpCode(200)
  @RequirePermissions('statutory.filing.generate')
  reconcile(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.consultants.reconcile(ctx, this.user(req), id);
  }

  @Post('consultant-returns/:id/file')
  @HttpCode(200)
  @RequirePermissions('statutory.filing.generate')
  returnFile(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.consultants.returnFile(ctx, this.user(req), id);
  }

  @Post('consultant-returns/:id/filed')
  @HttpCode(200)
  @RequirePermissions('statutory.filing.generate')
  filed(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ReturnFiledDto) {
    return this.consultants.markFiled(ctx, this.user(req), id, dto.tokenNo, dto.confirmation);
  }

  @Post('consultant-certificates/import')
  @Throttle(MODERATE_UPLOAD_THROTTLE)
  @RequirePermissions('consultant.manage')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 50 * 1024 * 1024, files: 1 } }))
  importCertificates(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Body() dto: Form131ImportDto, @UploadedFile() f?: Express.Multer.File) {
    return this.consultants.importCertificates(ctx, this.user(req), dto, f?.buffer);
  }
}

/**
 * The consultant's own sign-in (no staff account): an emailed code, then a 30-minute session that sees only that
 * consultant's rows. The session token travels in the X-Consultant-Portal header, never in the address.
 */
@Controller('public/consultant')
export class PublicConsultantController {
  constructor(private readonly consultants: ConsultantsService) {}

  @Post(':org/code')
  @HttpCode(200)
  @Throttle(STRICT_AUTH_THROTTLE)
  code(@Param('org') org: string, @Body() dto: ConsultantPortalEmailDto, @Ip() ip: string) {
    return this.consultants.portalCode(org.slice(0, 100), dto, ip ?? null);
  }

  @Post(':org/verify')
  @HttpCode(200)
  @Throttle(STRICT_AUTH_THROTTLE)
  verify(@Param('org') org: string, @Body() dto: ConsultantPortalVerifyDto) {
    return this.consultants.portalVerify(org.slice(0, 100), dto);
  }

  @Get(':org/me')
  @Throttle(PUBLIC_API_THROTTLE)
  me(@Param('org') org: string, @Headers('x-consultant-portal') token?: string) {
    return this.consultants.portalMe(org.slice(0, 100), token);
  }

  @Post(':org/invoices')
  @Throttle(MODERATE_UPLOAD_THROTTLE)
  @UseInterceptors(UPLOAD)
  submit(@Param('org') org: string, @Body() dto: InvoiceDto, @UploadedFile() f?: Express.Multer.File, @Headers('x-consultant-portal') token?: string) {
    return this.consultants.portalSubmit(org.slice(0, 100), token, dto, f);
  }

  @Get(':org/invoices/:id/advice')
  @Throttle(PUBLIC_API_THROTTLE)
  async advice(@Res({ passthrough: true }) res: Response, @Param('org') org: string, @Param('id', ParseUUIDPipe) id: string, @Headers('x-consultant-portal') token?: string) {
    return file(res, await this.consultants.portalAdvice(org.slice(0, 100), token, id));
  }

  @Get(':org/certificates/:id/file')
  @Throttle(PUBLIC_API_THROTTLE)
  async certificate(@Res({ passthrough: true }) res: Response, @Param('org') org: string, @Param('id', ParseUUIDPipe) id: string, @Headers('x-consultant-portal') token?: string) {
    return file(res, await this.consultants.portalCertificate(org.slice(0, 100), token, id));
  }

  @Post(':org/sign-out')
  @HttpCode(200)
  signOut(@Param('org') org: string, @Headers('x-consultant-portal') token?: string) {
    return this.consultants.portalSignOut(org.slice(0, 100), token);
  }
}
