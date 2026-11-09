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
import { ClientContactDto, ClientDto, InvoiceSeriesDto, RateChangeDto, RateLineDto, SaveStaffingSettingsDto, UpdateClientDto } from './staffing-dto';

const who = (req: Request) => req.user as ScopeUser;

// Staffing desk slice 1 (HIR-14 clients, HIR-15 rate cards, Settings 6.2). Reads: the staffing keys (pay rates and
// margins only with ats.staffing.manage); writes: ats.staffing.manage for the whole company, the person's own act
// (never while acting for someone else). The desk must be turned on (setting staffing.desk.enabled). Another company's
// records read as not found.
@Controller('staffing')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class StaffingController {
  constructor(private readonly staffing: StaffingService) {}

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
}
