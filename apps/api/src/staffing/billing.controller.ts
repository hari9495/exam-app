import { Body, Controller, Delete, Get, Headers, HttpCode, Ip, Param, ParseUUIDPipe, Post, Put, Query, Req, Res, StreamableFile, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { TenantContext } from '@exam-platform/shared';
import type { ScopeUser } from '../access/scope';
import { assertOwnSession } from '../service-desk/desk-access';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { RequireAnyPermission } from '../rbac/permissions.decorator';
import { CurrentTenant } from '../auth/current-tenant.decorator';
import { PUBLIC_API_THROTTLE, STRICT_AUTH_THROTTLE } from '../rate-limit-tiers';
import { StaffingBillingService } from './billing.service';
import { ClientPortalService } from './client-portal.service';
import { ApproveHoursDto, ExportQueryDto, HireDto, LeftDto, PortalInterviewDto, VendorConsultantDto, ClientTermsDto, CollectionDto, ContactPortalDto, CreditNoteDto, DraftInvoiceDto, HoursDto, PortalDecisionDto, PortalEmailDto, PortalSendBackDto, PortalVerifyDto, ReceiptDto, ReissueDto, VendorBillDto, VendorBillPaidDto, VersionDto } from './staffing-dto';

const who = (req: Request) => req.user as ScopeUser;
const READ = ['ats.staffing.manage', 'ats.staffing.billing'] as const;

/** Staffing slice 3 (HIR-18, HIR-19, HIR-30, answer 490, the contact's portal access). The service checks each key. */
@Controller('staffing')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class StaffingBillingController {
  constructor(
    private readonly billing: StaffingBillingService,
    private readonly portal: ClientPortalService,
  ) {}

  @Get('placements/:id/hours')
  @RequireAnyPermission(...READ)
  hours(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.billing.hours(ctx, who(req), id);
  }

  @Post('placements/:id/hours')
  @RequireAnyPermission('ats.staffing.manage')
  saveHours(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: HoursDto) {
    assertOwnSession(req);
    return this.billing.saveHours(ctx, who(req), id, dto);
  }

  @Post('hours/:id/approve')
  @RequireAnyPermission('ats.staffing.manage')
  approveHours(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ApproveHoursDto) {
    assertOwnSession(req);
    return this.billing.approveHours(ctx, who(req), id, dto);
  }

  @Get('invoices')
  @RequireAnyPermission(...READ)
  invoices(@Req() req: Request, @CurrentTenant() ctx: TenantContext) {
    return this.billing.list(ctx, who(req));
  }

  @Get('invoices/options')
  @RequireAnyPermission('ats.staffing.billing')
  invoiceOptions(@Req() req: Request, @CurrentTenant() ctx: TenantContext) {
    return this.billing.options(ctx, who(req));
  }

  @Post('invoices/draft')
  @RequireAnyPermission('ats.staffing.billing')
  draft(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Body() dto: DraftInvoiceDto) {
    assertOwnSession(req);
    return this.billing.draft(ctx, who(req), dto);
  }

  @Get('invoices/:id')
  @RequireAnyPermission(...READ)
  invoice(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.billing.one(ctx, who(req), id);
  }

  @Get('exports/options')
  @RequireAnyPermission('ats.staffing.billing')
  exportOptions(@Req() req: Request, @CurrentTenant() ctx: TenantContext) {
    return this.billing.exportOptions(ctx, who(req));
  }

  /** Answer 522: a download (a GET), but audited and refused while acting, like every finance write. */
  @Get('exports')
  @RequireAnyPermission('ats.staffing.billing')
  async exportMonth(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Query() q: ExportQueryDto, @Res({ passthrough: true }) res: Response) {
    assertOwnSession(req);
    const f = await this.billing.exportMonth(ctx, who(req), q);
    res.set({ 'Content-Type': f.type, 'Content-Disposition': `attachment; filename="${f.filename}"` });
    return new StreamableFile(f.buffer);
  }

  @Get('invoices/:id/pdf')
  @RequireAnyPermission(...READ)
  async invoicePdf(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Res({ passthrough: true }) res: Response) {
    const f = await this.billing.pdf(ctx, who(req), id);
    res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="${f.filename}"` });
    return new StreamableFile(f.buffer);
  }

  @Post('placements/:id/hired')
  @RequireAnyPermission('ats.staffing.manage')
  hired(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: HireDto) {
    assertOwnSession(req);
    return this.billing.hired(ctx, who(req), id, dto);
  }

  @Post('placements/:id/left')
  @RequireAnyPermission('ats.staffing.manage')
  leftClient(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: LeftDto) {
    assertOwnSession(req);
    return this.billing.left(ctx, who(req), id, dto);
  }

  @Get('vendor-bills/consultants')
  @RequireAnyPermission('ats.staffing.billing')
  consultantOptions(@Req() req: Request, @CurrentTenant() ctx: TenantContext) {
    return this.billing.consultantOptions(ctx, who(req));
  }

  @Put('vendor-bills/vendors/:id/consultant')
  @RequireAnyPermission('ats.staffing.billing')
  linkConsultant(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: VendorConsultantDto) {
    assertOwnSession(req);
    return this.billing.linkConsultant(ctx, who(req), id, dto);
  }

  @Delete('invoices/:id')
  @RequireAnyPermission('ats.staffing.billing')
  deleteDraft(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    assertOwnSession(req);
    return this.billing.deleteDraft(ctx, who(req), id);
  }

  @Post('invoices/:id/issue')
  @RequireAnyPermission('ats.staffing.billing')
  issue(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: VersionDto) {
    assertOwnSession(req);
    return this.billing.issue(ctx, who(req), id, dto);
  }

  @Post('invoices/:id/credit-note')
  @RequireAnyPermission('ats.staffing.billing')
  creditNote(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: CreditNoteDto) {
    assertOwnSession(req);
    return this.billing.creditNote(ctx, who(req), id, dto);
  }

  @Post('invoices/:id/reissue')
  @RequireAnyPermission('ats.staffing.billing')
  reissue(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ReissueDto) {
    assertOwnSession(req);
    return this.billing.reissue(ctx, who(req), id, dto);
  }

  @Put('invoices/:id/collection')
  @RequireAnyPermission('ats.staffing.billing')
  collection(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: CollectionDto) {
    assertOwnSession(req);
    return this.billing.collection(ctx, who(req), id, dto);
  }

  @Get('receivables')
  @RequireAnyPermission('ats.staffing.billing')
  receivables(@Req() req: Request, @CurrentTenant() ctx: TenantContext) {
    return this.billing.receivables(ctx, who(req));
  }

  @Post('receipts')
  @RequireAnyPermission('ats.staffing.billing')
  receipt(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Body() dto: ReceiptDto) {
    assertOwnSession(req);
    return this.billing.receipt(ctx, who(req), dto);
  }

  @Get('clients/:id/terms')
  @RequireAnyPermission(...READ)
  terms(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.billing.terms(ctx, who(req), id);
  }

  @Put('clients/:id/terms')
  @RequireAnyPermission('ats.staffing.manage')
  saveTerms(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ClientTermsDto) {
    assertOwnSession(req);
    return this.billing.saveTerms(ctx, who(req), id, dto);
  }

  @Post('clients/:id/contacts/:contactId/portal')
  @RequireAnyPermission('ats.staffing.manage')
  contactPortal(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Param('contactId', ParseUUIDPipe) contactId: string, @Body() dto: ContactPortalDto) {
    assertOwnSession(req);
    return this.portal.setAccess(ctx, who(req), id, contactId, dto);
  }

  @Get('vendor-bills')
  @RequireAnyPermission('ats.staffing.billing')
  vendorBills(@Req() req: Request, @CurrentTenant() ctx: TenantContext) {
    return this.billing.vendorBills(ctx, who(req));
  }

  @Post('vendor-bills')
  @RequireAnyPermission('ats.staffing.billing')
  confirmVendorBill(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Body() dto: VendorBillDto) {
    assertOwnSession(req);
    return this.billing.confirmVendorBill(ctx, who(req), dto);
  }

  @Post('vendor-bills/:id/paid')
  @RequireAnyPermission('ats.staffing.billing')
  vendorBillPaid(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: VendorBillPaidDto) {
    assertOwnSession(req);
    return this.billing.vendorBillPaid(ctx, who(req), id, dto);
  }
}

/** Answer 453 (T9-06): the client contact's portal: a one-time code by email, then a session token in a header. */
@Controller('public/client-portal')
export class PublicClientPortalController {
  constructor(private readonly portal: ClientPortalService) {}

  @Post(':org/code')
  @HttpCode(200)
  @Throttle(STRICT_AUTH_THROTTLE)
  code(@Param('org') org: string, @Body() dto: PortalEmailDto, @Ip() ip: string) {
    return this.portal.code(org.slice(0, 100), dto, ip ?? null);
  }

  @Post(':org/verify')
  @HttpCode(200)
  @Throttle(STRICT_AUTH_THROTTLE)
  verify(@Param('org') org: string, @Body() dto: PortalVerifyDto) {
    return this.portal.verify(org.slice(0, 100), dto);
  }

  @Get(':org/me')
  @Throttle(PUBLIC_API_THROTTLE)
  me(@Param('org') org: string, @Headers('x-client-portal') token?: string) {
    return this.portal.me(org.slice(0, 100), token);
  }

  @Post(':org/submissions/:id/decision')
  @HttpCode(200)
  @Throttle(PUBLIC_API_THROTTLE)
  decide(@Param('org') org: string, @Param('id', ParseUUIDPipe) id: string, @Body() dto: PortalDecisionDto, @Headers('x-client-portal') token?: string) {
    return this.portal.decide(org.slice(0, 100), token, id, dto);
  }

  @Post(':org/timesheets/:id/approve')
  @HttpCode(200)
  @Throttle(PUBLIC_API_THROTTLE)
  approve(@Param('org') org: string, @Param('id', ParseUUIDPipe) id: string, @Headers('x-client-portal') token?: string) {
    return this.portal.timesheet(org.slice(0, 100), token, id, 'approve');
  }

  @Post(':org/timesheets/:id/send-back')
  @HttpCode(200)
  @Throttle(PUBLIC_API_THROTTLE)
  sendBack(@Param('org') org: string, @Param('id', ParseUUIDPipe) id: string, @Body() dto: PortalSendBackDto, @Headers('x-client-portal') token?: string) {
    return this.portal.timesheet(org.slice(0, 100), token, id, 'send_back', dto);
  }

  @Post(':org/interviews')
  @HttpCode(200)
  @Throttle(PUBLIC_API_THROTTLE)
  bookInterview(@Param('org') org: string, @Body() dto: PortalInterviewDto, @Headers('x-client-portal') token?: string) {
    return this.portal.bookInterview(org.slice(0, 100), token, dto);
  }

  @Get(':org/invoices/:id/pdf')
  @Throttle(PUBLIC_API_THROTTLE)
  async invoicePdf(@Param('org') org: string, @Param('id', ParseUUIDPipe) id: string, @Res({ passthrough: true }) res: Response, @Headers('x-client-portal') token?: string) {
    const f = await this.portal.invoicePdf(org.slice(0, 100), token, id);
    res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="${f.filename}"` });
    return new StreamableFile(f.buffer);
  }

  @Post(':org/sign-out')
  @HttpCode(200)
  signOut(@Param('org') org: string, @Headers('x-client-portal') token?: string) {
    return this.portal.signOut(org.slice(0, 100), token);
  }
}
