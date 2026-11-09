import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post, Put, Query, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { TenantContext } from '@exam-platform/shared';
import type { ScopeUser } from '../access/scope';
import { assertOwnSession } from '../service-desk/desk-access';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { RequireAnyPermission, RequirePermissions } from '../rbac/permissions.decorator';
import { CurrentTenant } from '../auth/current-tenant.decorator';
import { StaffingService } from './staffing.service';
import { BenchAddDto, CapExceptionDto, ClientContactDto, ClientDto, ClientJobDto, ForwardDto, InvoiceSeriesDto, MoveSubmissionDto, PlacementCreateDto, PlacementEndDto, PlacementExtendDto, RateChangeDto, RateLineDto, SaveStaffingSettingsDto, ShareJobDto, SubmitToClientDto, UpdateClientDto, VendorDto } from './staffing-dto';
import { StaffingWorkService } from './staffing-work.service';
import { VendorsService } from './vendors.service';
import { CurrentUserId } from '../auth/current-user-id.decorator';

const who = (req: Request) => req.user as ScopeUser;

// Staffing desk slice 1 (HIR-14 clients, HIR-15 rate cards, Settings 6.2). Reads: the staffing keys (pay rates and
// margins only with ats.staffing.manage); writes: ats.staffing.manage for the whole company, the person's own act
// (never while acting for someone else). The desk must be turned on (setting staffing.desk.enabled). Another company's
// records read as not found.
@Controller('staffing')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class StaffingController {
  constructor(
    private readonly staffing: StaffingService,
    private readonly work: StaffingWorkService,
    private readonly vendorsSvc: VendorsService,
  ) {}

  /** For the menu: is the company's staffing desk on? */
  @Get('desk')
  desk(@CurrentTenant() ctx: TenantContext) {
    return this.staffing.desk(ctx);
  }

  @Get('clients')
  @RequireAnyPermission('ats.staffing.manage', 'ats.staffing.view')
  clients(@Req() req: Request, @CurrentTenant() ctx: TenantContext) {
    return this.staffing.listClients(ctx, who(req));
  }

  @Post('clients')
  @RequirePermissions('ats.staffing.manage')
  createClient(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Body() dto: ClientDto) {
    assertOwnSession(req);
    return this.staffing.createClient(ctx, who(req), dto);
  }

  @Get('clients/:id')
  @RequireAnyPermission('ats.staffing.manage', 'ats.staffing.view')
  client(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.staffing.getClient(ctx, who(req), id);
  }

  @Put('clients/:id')
  @RequirePermissions('ats.staffing.manage')
  updateClient(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateClientDto) {
    assertOwnSession(req);
    return this.staffing.updateClient(ctx, who(req), id, dto);
  }

  @Post('clients/:id/contacts')
  @RequirePermissions('ats.staffing.manage')
  addContact(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ClientContactDto) {
    assertOwnSession(req);
    return this.staffing.saveContact(ctx, who(req), id, null, dto);
  }

  @Put('clients/:id/contacts/:contactId')
  @RequirePermissions('ats.staffing.manage')
  updateContact(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Param('contactId', ParseUUIDPipe) contactId: string, @Body() dto: ClientContactDto) {
    assertOwnSession(req);
    return this.staffing.saveContact(ctx, who(req), id, contactId, dto);
  }

  @Delete('clients/:id/contacts/:contactId')
  @RequirePermissions('ats.staffing.manage')
  removeContact(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Param('contactId', ParseUUIDPipe) contactId: string) {
    assertOwnSession(req);
    return this.staffing.archiveContact(ctx, who(req), id, contactId);
  }

  @Get('clients/:id/rates')
  @RequireAnyPermission('ats.staffing.manage', 'ats.staffing.view')
  rates(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Query('history') history?: string) {
    return this.staffing.rates(ctx, who(req), id, history === '1' || history === 'true');
  }

  @Post('clients/:id/rates')
  @RequirePermissions('ats.staffing.manage')
  addRate(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: RateLineDto) {
    assertOwnSession(req);
    return this.staffing.addRateLine(ctx, who(req), id, dto);
  }

  @Post('rates/:id/change')
  @RequirePermissions('ats.staffing.manage')
  changeRate(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: RateChangeDto) {
    assertOwnSession(req);
    return this.staffing.changeRate(ctx, who(req), id, dto);
  }

  // Settings 6.2 Staffing desk: account managers or HR with the settings key read and change it (also while the desk is
  // off, to turn it on).
  @Get('settings')
  @RequireAnyPermission('ats.staffing.manage', 'ats.staffing.view', 'org.settings.manage')
  settings(@Req() req: Request, @CurrentTenant() ctx: TenantContext) {
    return this.staffing.readSettings(ctx, who(req));
  }

  @Put('settings')
  @RequireAnyPermission('ats.staffing.manage', 'org.settings.manage')
  saveSettings(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Body() dto: SaveStaffingSettingsDto) {
    assertOwnSession(req);
    return this.staffing.saveSettings(ctx, who(req), dto.changes);
  }

  @Post('invoice-series')
  @RequireAnyPermission('ats.staffing.manage', 'org.settings.manage')
  addSeries(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Body() dto: InvoiceSeriesDto) {
    assertOwnSession(req);
    return this.staffing.saveSeries(ctx, who(req), null, dto);
  }

  @Put('invoice-series/:id')
  @RequireAnyPermission('ats.staffing.manage', 'org.settings.manage')
  updateSeries(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: InvoiceSeriesDto) {
    assertOwnSession(req);
    return this.staffing.saveSeries(ctx, who(req), id, dto);
  }

  /* ---------------- Slice 2: client jobs, submissions (HIR-16), placements and bench (HIR-17) ---------------- */

  @Get('jobs')
  @RequireAnyPermission('ats.staffing.manage', 'ats.staffing.view')
  clientJobs(@Req() req: Request, @CurrentTenant() ctx: TenantContext) {
    return this.work.jobs(ctx, who(req));
  }

  @Post('clients/:id/jobs')
  @RequirePermissions('ats.staffing.manage')
  createClientJob(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ClientJobDto) {
    assertOwnSession(req);
    return this.work.createClientJob(ctx, who(req), id, dto);
  }

  @Get('submissions')
  @RequireAnyPermission('ats.staffing.manage', 'ats.staffing.view')
  submissions(@Req() req: Request, @CurrentTenant() ctx: TenantContext) {
    return this.work.submissions(ctx, who(req));
  }

  @Get('submissions/options')
  @RequireAnyPermission('ats.staffing.manage', 'ats.staffing.view')
  submitOptions(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Query('jobId', ParseUUIDPipe) jobId: string) {
    return this.work.submitOptions(ctx, who(req), jobId);
  }

  @Post('submissions')
  @RequireAnyPermission('ats.staffing.manage', 'ats.staffing.view')
  submit(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Body() dto: SubmitToClientDto) {
    assertOwnSession(req);
    return this.work.submit(ctx, who(req), dto);
  }

  @Post('submissions/:id/move')
  @RequireAnyPermission('ats.staffing.manage', 'ats.staffing.view')
  move(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: MoveSubmissionDto) {
    assertOwnSession(req);
    return this.work.move(ctx, who(req), id, dto);
  }

  @Get('placements')
  @RequireAnyPermission('ats.staffing.manage', 'ats.staffing.view')
  placements(@Req() req: Request, @CurrentTenant() ctx: TenantContext) {
    return this.work.placements(ctx, who(req));
  }

  @Get('placements/placeable')
  @RequirePermissions('ats.staffing.manage')
  placeable(@Req() req: Request, @CurrentTenant() ctx: TenantContext) {
    return this.work.placeable(ctx, who(req));
  }

  @Get('placements/:id')
  @RequireAnyPermission('ats.staffing.manage', 'ats.staffing.view')
  placement(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.work.placement(ctx, who(req), id);
  }

  @Post('placements')
  @RequirePermissions('ats.staffing.manage')
  createPlacement(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Body() dto: PlacementCreateDto) {
    assertOwnSession(req);
    return this.work.createPlacement(ctx, who(req), dto);
  }

  @Post('placements/:id/extend')
  @RequirePermissions('ats.staffing.manage')
  extend(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: PlacementExtendDto) {
    assertOwnSession(req);
    return this.work.extend(ctx, who(req), id, dto);
  }

  @Post('placements/:id/end')
  @RequirePermissions('ats.staffing.manage')
  endPlacement(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: PlacementEndDto) {
    assertOwnSession(req);
    return this.work.end(ctx, who(req), id, dto);
  }

  @Get('bench')
  @RequireAnyPermission('ats.staffing.manage', 'ats.staffing.view')
  bench(@Req() req: Request, @CurrentTenant() ctx: TenantContext) {
    return this.work.bench(ctx, who(req));
  }

  @Get('bench/candidates')
  @RequirePermissions('ats.staffing.manage')
  benchCandidates(@Req() req: Request, @CurrentTenant() ctx: TenantContext) {
    return this.work.benchCandidates(ctx, who(req));
  }

  @Post('bench')
  @RequirePermissions('ats.staffing.manage')
  addToBench(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Body() dto: BenchAddDto) {
    assertOwnSession(req);
    return this.work.addToBench(ctx, who(req), dto);
  }

  @Delete('bench/:id')
  @RequirePermissions('ats.staffing.manage')
  removeFromBench(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    assertOwnSession(req);
    return this.work.removeFromBench(ctx, who(req), id);
  }

  /* ---------------- HIR-21 vendors (the existing agencies; also for companies without the desk) ---------------- */

  @Get('vendors')
  @RequireAnyPermission('ats.agency.manage', 'ats.staffing.manage', 'org:manage_settings')
  vendors(@CurrentTenant() ctx: TenantContext) {
    return this.vendorsSvc.register(ctx);
  }

  @Post('vendors')
  @RequireAnyPermission('ats.agency.manage', 'ats.staffing.manage', 'org:manage_settings')
  addVendor(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Body() dto: VendorDto) {
    assertOwnSession(req);
    return this.vendorsSvc.save(ctx, null, dto);
  }

  @Put('vendors/:id')
  @RequireAnyPermission('ats.agency.manage', 'ats.staffing.manage', 'org:manage_settings')
  updateVendor(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: VendorDto) {
    assertOwnSession(req);
    return this.vendorsSvc.save(ctx, id, dto);
  }

  @Post('vendors/:id/new-link')
  @RequireAnyPermission('ats.agency.manage', 'ats.staffing.manage', 'org:manage_settings')
  newVendorLink(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    assertOwnSession(req);
    return this.vendorsSvc.newLink(ctx, id);
  }

  @Delete('vendors/:id/jobs/:jobId')
  @RequireAnyPermission('ats.agency.manage', 'ats.staffing.manage', 'org:manage_settings')
  unshare(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Param('jobId', ParseUUIDPipe) jobId: string) {
    assertOwnSession(req);
    return this.vendorsSvc.unshare(ctx, id, jobId);
  }

  @Get('vendors/jobs')
  @RequireAnyPermission('ats.agency.manage', 'ats.staffing.manage', 'org:manage_settings')
  vendorJobs(@CurrentTenant() ctx: TenantContext) {
    return this.vendorsSvc.openJobs(ctx);
  }

  @Get('vendors/share-options')
  @RequireAnyPermission('ats.agency.manage', 'ats.staffing.manage', 'org:manage_settings')
  shareOptions(@CurrentTenant() ctx: TenantContext, @Query('jobId', ParseUUIDPipe) jobId: string) {
    return this.vendorsSvc.shareOptions(ctx, jobId);
  }

  @Post('vendors/share')
  @RequireAnyPermission('ats.agency.manage', 'ats.staffing.manage', 'org:manage_settings')
  share(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Body() dto: ShareJobDto) {
    assertOwnSession(req);
    return this.vendorsSvc.share(ctx, dto);
  }

  @Get('vendor-submissions')
  @RequireAnyPermission('ats.agency.manage', 'ats.staffing.manage', 'pipeline:manage')
  async vendorSubmissions(@Req() req: Request, @CurrentTenant() ctx: TenantContext) {
    return this.vendorsSvc.submissions(ctx, (await this.staffing.access(who(req))).vendorRates);
  }

  @Post('vendor-submissions/:id/exception')
  @RequireAnyPermission('ats.agency.manage', 'ats.staffing.manage')
  capException(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: CapExceptionDto) {
    assertOwnSession(req);
    return this.vendorsSvc.exception(ctx, id, dto);
  }

  @Post('vendor-submissions/:id/forward')
  @RequirePermissions('ats.staffing.manage')
  forward(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @CurrentUserId() userId: string, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ForwardDto) {
    assertOwnSession(req);
    return this.vendorsSvc.forward(ctx, userId, id, dto);
  }
}
