import { Body, Controller, Get, Headers, HttpCode, Ip, Param, ParseUUIDPipe, Post, Query, Req, Res, StreamableFile, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
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
import {
  AuditQueryDto,
  BackfillDto,
  DeviceBatchDto,
  DocumentListDto,
  FileListDto,
  HrCorrectionDto,
  IssueDocumentDto,
  LateCorrectionDto,
  LegalHoldDto,
  NomineeDto,
  PortalEmailDto,
  PortalVerifyDto,
  ReleaseFileDto,
  ReopenDecisionDto,
  ReopenRequestDto,
  SupersedeDocumentDto,
  TimelineQueryDto,
  YearDto,
} from './dto';
import { PayAuditService } from './audit.service';
import { PayDocumentsService } from './documents.service';
import { ExchangeFilesService } from './exchange-files.service';
import { PayPeriodsService } from './periods.service';

// Payroll batch 5a (M03-BUILD-DESIGN §14.1). Every route declares its key (YX-SEC-01) and the services check the key's
// legal-entity scope again; the database pay guard is the second layer. ⚡ = a fresh second sign-in step (P12).
//   payroll.period.view                  periods, stages, history and corrections of the entities in scope
//   payroll.period.reopen ⚡             ask to reopen a locked month; the first (payroll) check of someone else's request
//   payroll.period.reopen.approve ⚡     the final approval (Finance or System Admin)
//   attendance.lock                      HR corrections, late device batches and the backfill ⚡
//   payroll.document.view / .issue ⚡    pay documents of the entities in scope; issue and correct them
//   payroll.file.view / .release ⚡      exchange files: single-use download links, release by a second person
//   audit.view / audit.export / audit.hold.manage    the audit log, timelines, chain checks, exports, legal holds
//   no key (self)                        my pay documents, my late corrections
const file = (res: Response, out: { file: Buffer; name: string; contentType?: string }) => {
  res.set({ 'Content-Type': out.contentType ?? 'application/pdf', 'Content-Disposition': `attachment; filename="${out.name.replace(/[^A-Za-z0-9._-]/g, '_')}"`, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
  return new StreamableFile(out.file);
};

@Controller('payroll')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class PayrollController {
  constructor(
    private readonly periods: PayPeriodsService,
    private readonly audit: PayAuditService,
    private readonly documents: PayDocumentsService,
    private readonly files: ExchangeFilesService,
  ) {}

  private user(req: Request) {
    return req.user as ScopeUser;
  }

  // ------------------------------------------------------------------------------------------ periods (PAY-1.02)

  @Get('periods')
  @RequireAnyPermission('payroll.period.view', 'payroll.period.reopen', 'payroll.period.reopen.approve')
  list(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Query() q: YearDto) {
    return this.periods.periods(ctx, this.user(req), q.year);
  }

  @Get('periods/:id')
  @RequireAnyPermission('payroll.period.view', 'payroll.period.reopen', 'payroll.period.reopen.approve')
  history(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.periods.history(ctx, this.user(req), id);
  }

  @Post('reopen-requests')
  @RequirePermissions('payroll.period.reopen')
  @RequireStepUp()
  requestReopen(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Body() dto: ReopenRequestDto) {
    return this.periods.requestReopen(ctx, this.user(req), dto.legalEntityId, dto.month, dto.reason);
  }

  @Get('reopen-requests')
  @RequireAnyPermission('payroll.period.view', 'payroll.period.reopen', 'payroll.period.reopen.approve')
  reopenRequests(@Req() req: Request, @CurrentTenant() ctx: TenantContext) {
    return this.periods.reopenRequests(ctx, this.user(req));
  }

  @Post('reopen-requests/:id/decide')
  @HttpCode(200)
  @RequireAnyPermission('payroll.period.reopen', 'payroll.period.reopen.approve')
  @RequireStepUp()
  decideReopen(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ReopenDecisionDto) {
    return this.periods.decideReopen(ctx, this.user(req), id, dto.decision, dto.reason ?? null, dto.confirmation);
  }

  // ------------------------------------------------------------------------------------------ corrections (PAY-1.03 / 1.04)

  @Post('me/late-corrections')
  @Throttle(MODERATE_UPLOAD_THROTTLE)
  lateCorrection(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Body() dto: LateCorrectionDto) {
    return this.periods.lateRequest(ctx, this.user(req), dto);
  }

  @Post('corrections')
  @RequirePermissions('attendance.lock')
  hrCorrection(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Body() dto: HrCorrectionDto) {
    return this.periods.hrCorrection(ctx, this.user(req), dto);
  }

  @Post('device-batches')
  @RequirePermissions('attendance.lock')
  @Throttle(MODERATE_UPLOAD_THROTTLE)
  deviceBatch(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Body() dto: DeviceBatchDto) {
    return this.periods.holdDeviceBatch(ctx, this.user(req), dto);
  }

  @Get('device-batches/held')
  @RequirePermissions('attendance.lock')
  held(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Query('legalEntityId', ParseUUIDPipe) legalEntityId: string) {
    return this.periods.heldPunches(ctx, this.user(req), legalEntityId);
  }

  @Post('device-backfills')
  @RequirePermissions('attendance.lock')
  @RequireStepUp()
  backfill(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Body() dto: BackfillDto) {
    return this.periods.backfill(ctx, this.user(req), dto.legalEntityId, dto.deviceRef, dto.reason, dto.confirmation);
  }

  // ------------------------------------------------------------------------------------------ audit (PAY-1.05 … 1.08)

  @Get('audit')
  @RequirePermissions('audit.view')
  auditSearch(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Query() q: AuditQueryDto) {
    return this.audit.search(ctx, this.user(req), q);
  }

  @Get('audit/timeline')
  @RequirePermissions('audit.view')
  timeline(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Query() q: TimelineQueryDto) {
    return this.audit.timeline(ctx, this.user(req), q.entityType, q.entityId);
  }

  @Get('audit/export')
  @RequirePermissions('audit.view', 'audit.export')
  @Throttle(MODERATE_UPLOAD_THROTTLE)
  async auditExport(@Req() req: Request, @Res({ passthrough: true }) res: Response, @CurrentTenant() ctx: TenantContext, @Query() q: AuditQueryDto) {
    return file(res, { ...(await this.audit.export(ctx, this.user(req), q)), contentType: 'text/csv; charset=utf-8' });
  }

  @Get('audit/chain')
  @RequirePermissions('audit.view')
  chain(@Req() req: Request, @CurrentTenant() ctx: TenantContext) {
    return this.audit.chainStatus(ctx, this.user(req));
  }

  @Post('audit/chain/verify')
  @HttpCode(200)
  @RequirePermissions('audit.view')
  @Throttle(MODERATE_UPLOAD_THROTTLE)
  verify(@Req() req: Request, @CurrentTenant() ctx: TenantContext) {
    return this.audit.verifyNow(ctx, this.user(req));
  }

  @Get('audit/holds')
  @RequirePermissions('audit.hold.manage')
  holds(@Req() req: Request, @CurrentTenant() ctx: TenantContext) {
    return this.audit.holds(ctx, this.user(req));
  }

  @Post('audit/holds')
  @RequirePermissions('audit.hold.manage')
  @RequireStepUp()
  placeHold(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Body() dto: LegalHoldDto) {
    return this.audit.placeHold(ctx, this.user(req), dto);
  }

  @Post('audit/holds/:id/release')
  @HttpCode(200)
  @RequirePermissions('audit.hold.manage')
  @RequireStepUp()
  releaseHold(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.audit.releaseHold(ctx, this.user(req), id);
  }

  // ------------------------------------------------------------------------------------------ documents (PAY-1.09 / 1.10)

  @Get('documents')
  @RequirePermissions('payroll.document.view')
  documentList(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Query() q: DocumentListDto) {
    return this.documents.list(ctx, this.user(req), q);
  }

  @Post('documents')
  @RequirePermissions('payroll.document.issue')
  @RequireStepUp()
  issue(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Body() dto: IssueDocumentDto) {
    return this.documents.issue(ctx, this.user(req), dto);
  }

  @Post('documents/:id/supersede')
  @RequirePermissions('payroll.document.issue')
  @RequireStepUp()
  supersede(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: SupersedeDocumentDto) {
    return this.documents.supersede(ctx, this.user(req), id, dto.fields, dto.reason, dto.confirmation);
  }

  /** The signing helper's upload of the USB-token signed PDF (D1): checked before it is accepted. */
  @Post('documents/:id/signature')
  @HttpCode(200)
  @RequirePermissions('payroll.document.issue')
  @RequireStepUp()
  @Throttle(MODERATE_UPLOAD_THROTTLE)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 10 * 1024 * 1024, files: 1 } }))
  signature(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @UploadedFile() file?: { buffer: Buffer }) {
    return this.documents.attachSignature(ctx, this.user(req), id, file?.buffer);
  }

  @Post('documents/nominees')
  @RequirePermissions('payroll.document.issue')
  @RequireStepUp()
  nominee(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Body() dto: NomineeDto) {
    return this.documents.addNominee(ctx, this.user(req), dto);
  }

  @Get('me/documents')
  mine(@Req() req: Request, @CurrentTenant() ctx: TenantContext) {
    return this.documents.mine(ctx, this.user(req));
  }

  /** Own documents with no key; someone else's need payroll.document.view in its entity (checked by the service). */
  @Get('documents/:id/file')
  @Throttle(MODERATE_UPLOAD_THROTTLE)
  async documentFile(@Req() req: Request, @Res({ passthrough: true }) res: Response, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return file(res, await this.documents.file(ctx, this.user(req), id));
  }

  // ------------------------------------------------------------------------------------------ exchange files (PAY-1.11)

  @Get('files')
  @RequirePermissions('payroll.file.view')
  fileList(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Query() q: FileListDto) {
    return this.files.list(ctx, this.user(req), q.legalEntityId);
  }

  @Post('files/:id/link')
  @HttpCode(200)
  @RequirePermissions('payroll.file.view')
  @Throttle(MODERATE_UPLOAD_THROTTLE)
  link(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.files.link(ctx, this.user(req), id);
  }

  @Get('file-downloads/:token')
  @RequirePermissions('payroll.file.view')
  @Throttle(MODERATE_UPLOAD_THROTTLE)
  async download(@Req() req: Request, @Res({ passthrough: true }) res: Response, @CurrentTenant() ctx: TenantContext, @Param('token') token: string) {
    return file(res, await this.files.download(ctx, this.user(req), token.slice(0, 100)));
  }

  @Post('files/:id/release')
  @HttpCode(200)
  @RequirePermissions('payroll.file.release')
  @RequireStepUp()
  release(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ReleaseFileDto) {
    return this.files.release(ctx, this.user(req), id, dto.confirmation);
  }
}

/**
 * Public pay routes (no sign-in): the verify page (YX-DOC-11) and the alumni / nominee portal (YX-DOC-16 / 19). The
 * portal session token travels in the X-Pay-Portal header, never in the address.
 */
@Controller('public/pay')
export class PublicPayController {
  constructor(private readonly documents: PayDocumentsService) {}

  @Get('verify/:code')
  @Throttle(PUBLIC_API_THROTTLE)
  verify(@Param('code') code: string) {
    return this.documents.verify(code.toUpperCase().slice(0, 16));
  }

  @Post(':org/portal/code')
  @HttpCode(200)
  @Throttle(STRICT_AUTH_THROTTLE)
  portalCode(@Param('org') org: string, @Body() dto: PortalEmailDto, @Ip() ip: string) {
    return this.documents.portalCode(org.slice(0, 100), dto, ip ?? null);
  }

  @Post(':org/portal/verify')
  @HttpCode(200)
  @Throttle(STRICT_AUTH_THROTTLE)
  portalVerify(@Param('org') org: string, @Body() dto: PortalVerifyDto) {
    return this.documents.portalVerify(org.slice(0, 100), dto);
  }

  @Get(':org/portal/documents')
  @Throttle(PUBLIC_API_THROTTLE)
  portalDocuments(@Param('org') org: string, @Headers('x-pay-portal') token?: string) {
    return this.documents.portalDocuments(org.slice(0, 100), token);
  }

  @Get(':org/portal/documents/:id/file')
  @Throttle(PUBLIC_API_THROTTLE)
  async portalFile(@Res({ passthrough: true }) res: Response, @Param('org') org: string, @Param('id', ParseUUIDPipe) id: string, @Headers('x-pay-portal') token?: string) {
    return file(res, await this.documents.portalFile(org.slice(0, 100), token, id));
  }

  @Post(':org/portal/sign-out')
  @HttpCode(200)
  portalSignOut(@Param('org') org: string, @Headers('x-pay-portal') token?: string) {
    return this.documents.portalSignOut(org.slice(0, 100), token);
  }
}
