import { Body, Controller, Delete, ForbiddenException, Get, HttpCode, Param, ParseEnumPipe, ParseUUIDPipe, Post, Put, Query, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { TenantContext } from '@exam-platform/shared';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentTenant } from '../auth/current-tenant.decorator';
import { RequireStepUp } from '../auth/step-up.decorator';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { RequireAnyPermission, RequirePermissions } from '../rbac/permissions.decorator';
import {
  LegalEntityDto,
  LegalEntityStatutoryDto,
  LocationDto,
  MASTER_KINDS,
  MasterKind,
  MasterListQueryDto,
  PayRangeAmountsDto,
  PayRangeDto,
  PayRangeQueryDto,
  ResolveSettingQueryDto,
  SettingDto,
  masterBody,
} from './dto';
import { IN_STATES, REGIONS } from './org-validation';
import { OrgSettingsService } from './org-settings.service';
import { OrgStructureService } from './org-structure.service';

// Settings › Organisation (P01 §8, APX-D 1.2–1.4) and the scoped-settings API (P01 §4.6). Every route
// declares its permission (P02 YX-SEC-01):
//   org.structure.view           read entities, locations and masters (Public / Internal)
//   org.settings.manage          change them and scoped settings (HR / System Admin)
//   org.entity.statutory.manage  the Confidential entity identifiers (P02 §4.4)
//   pay.range.view / .manage     grade pay ranges (founder rule R1: pay is private)
const VIEW = ['org.structure.view', 'org.settings.manage'] as const;
const KIND = new ParseEnumPipe(Object.fromEntries(MASTER_KINDS.map((k) => [k, k])));

interface RequestUser {
  impersonatorUserId?: string;
  actingSuperAdmin?: boolean;
}

/**
 * Changes are made by the signed-in person themselves; Confidential and pay data are never shown to
 * YukthiX staff acting in a company or to an impersonation (P02 YX-SEC-20: masked in support access).
 */
function ownSession(req: Request): void {
  const user = req.user as RequestUser | undefined;
  if (user?.impersonatorUserId || user?.actingSuperAdmin) throw new ForbiddenException('Not available while acting for someone else');
}

@Controller('org')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class OrgStructureController {
  constructor(
    private readonly org: OrgStructureService,
    private readonly settings: OrgSettingsService,
  ) {}

  /** Lists the screens need: India's states and the open data regions. */
  @Get('reference')
  @RequireAnyPermission(...VIEW)
  reference() {
    return {
      states: Object.entries(IN_STATES).map(([code, name]) => ({ code, name, country: 'IN' })),
      regions: Object.entries(REGIONS).filter(([, r]) => r.live).map(([code, r]) => ({ code, countries: r.countries })),
    };
  }

  // ---- legal entities (P01 §4.1) ----

  @Get('legal-entities')
  @RequireAnyPermission(...VIEW)
  listEntities(@CurrentTenant() ctx: TenantContext, @Query() q: MasterListQueryDto) {
    return this.org.listEntities(ctx, q.includeArchived === 'true');
  }

  @Post('legal-entities')
  @RequirePermissions('org.settings.manage')
  createEntity(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Body() dto: LegalEntityDto) {
    ownSession(req);
    return this.org.createEntity(ctx, dto);
  }

  @Put('legal-entities/:id')
  @RequirePermissions('org.settings.manage')
  updateEntity(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: LegalEntityDto) {
    ownSession(req);
    return this.org.updateEntity(ctx, id, dto);
  }

  @Post('legal-entities/:id/default')
  @HttpCode(200)
  @RequirePermissions('org.settings.manage')
  setDefault(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    ownSession(req);
    return this.org.setDefaultEntity(ctx, id);
  }

  @Post('legal-entities/:id/archive')
  @HttpCode(200)
  @RequirePermissions('org.settings.manage')
  archiveEntity(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    ownSession(req);
    return this.org.archiveEntity(ctx, id);
  }

  @Post('legal-entities/:id/restore')
  @HttpCode(200)
  @RequirePermissions('org.settings.manage')
  restoreEntity(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    ownSession(req);
    return this.org.restoreEntity(ctx, id);
  }

  @Delete('legal-entities/:id')
  @HttpCode(204)
  @RequirePermissions('org.settings.manage')
  async deleteEntity(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    ownSession(req);
    await this.org.deleteEntity(ctx, id);
  }

  @Get('legal-entities/:id/statutory')
  @RequirePermissions('org.entity.statutory.manage')
  getStatutory(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    ownSession(req);
    return this.org.getStatutory(ctx, id);
  }

  @Put('legal-entities/:id/statutory')
  @RequirePermissions('org.entity.statutory.manage')
  @RequireStepUp()
  setStatutory(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: LegalEntityStatutoryDto) {
    ownSession(req);
    return this.org.setStatutory(ctx, id, dto);
  }

  // ---- locations (P01 §4.2) ----

  @Get('locations')
  @RequireAnyPermission(...VIEW)
  listLocations(@CurrentTenant() ctx: TenantContext, @Query() q: MasterListQueryDto) {
    return this.org.listLocations(ctx, q.legalEntityId, q.includeArchived === 'true');
  }

  @Post('locations')
  @RequirePermissions('org.settings.manage')
  createLocation(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Body() dto: LocationDto) {
    ownSession(req);
    return this.org.createLocation(ctx, dto);
  }

  @Put('locations/:id')
  @RequirePermissions('org.settings.manage')
  updateLocation(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: LocationDto) {
    ownSession(req);
    return this.org.updateLocation(ctx, id, dto);
  }

  @Post('locations/:id/archive')
  @HttpCode(200)
  @RequirePermissions('org.settings.manage')
  archiveLocation(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    ownSession(req);
    return this.org.archiveLocation(ctx, id, true);
  }

  @Post('locations/:id/restore')
  @HttpCode(200)
  @RequirePermissions('org.settings.manage')
  restoreLocation(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    ownSession(req);
    return this.org.archiveLocation(ctx, id, false);
  }

  @Delete('locations/:id')
  @HttpCode(204)
  @RequirePermissions('org.settings.manage')
  async deleteLocation(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    ownSession(req);
    await this.org.deleteLocation(ctx, id);
  }

  // ---- structure masters (P01 §4.3): departments, designations, grades, employment-types, cost-centres ----

  @Get('masters/:kind')
  @RequireAnyPermission(...VIEW)
  listMasters(@CurrentTenant() ctx: TenantContext, @Param('kind', KIND) kind: MasterKind, @Query() q: MasterListQueryDto) {
    return this.org.listMasters(ctx, kind, q.legalEntityId, q.includeArchived === 'true');
  }

  @Post('masters/:kind')
  @RequirePermissions('org.settings.manage')
  createMaster(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('kind', KIND) kind: MasterKind, @Body() body: unknown) {
    ownSession(req);
    return this.org.createMaster(ctx, kind, masterBody(kind, body));
  }

  @Put('masters/:kind/:id')
  @RequirePermissions('org.settings.manage')
  updateMaster(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('kind', KIND) kind: MasterKind, @Param('id', ParseUUIDPipe) id: string, @Body() body: unknown) {
    ownSession(req);
    return this.org.updateMaster(ctx, kind, id, masterBody(kind, body));
  }

  @Post('masters/:kind/:id/archive')
  @HttpCode(200)
  @RequirePermissions('org.settings.manage')
  archiveMaster(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('kind', KIND) kind: MasterKind, @Param('id', ParseUUIDPipe) id: string) {
    ownSession(req);
    return this.org.archiveMaster(ctx, kind, id, true);
  }

  @Post('masters/:kind/:id/restore')
  @HttpCode(200)
  @RequirePermissions('org.settings.manage')
  restoreMaster(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('kind', KIND) kind: MasterKind, @Param('id', ParseUUIDPipe) id: string) {
    ownSession(req);
    return this.org.archiveMaster(ctx, kind, id, false);
  }

  @Delete('masters/:kind/:id')
  @HttpCode(204)
  @RequirePermissions('org.settings.manage')
  async deleteMaster(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('kind', KIND) kind: MasterKind, @Param('id', ParseUUIDPipe) id: string) {
    ownSession(req);
    await this.org.deleteMaster(ctx, kind, id);
  }

  // ---- grade pay ranges: pay data (R1) ----

  @Get('grades/:gradeId/pay-ranges')
  @RequirePermissions('pay.range.view')
  listPayRanges(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('gradeId', ParseUUIDPipe) gradeId: string, @Query() q: PayRangeQueryDto) {
    ownSession(req);
    return this.org.listPayRanges(ctx, gradeId, q.legalEntityId);
  }

  @Post('grades/:gradeId/pay-ranges')
  @RequirePermissions('pay.range.manage')
  @RequireStepUp()
  createPayRange(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('gradeId', ParseUUIDPipe) gradeId: string, @Body() dto: PayRangeDto) {
    ownSession(req);
    return this.org.createPayRange(ctx, gradeId, dto);
  }

  @Put('pay-ranges/:id')
  @RequirePermissions('pay.range.manage')
  @RequireStepUp()
  updatePayRange(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: PayRangeAmountsDto) {
    ownSession(req);
    return this.org.updatePayRange(ctx, id, dto);
  }

  @Delete('pay-ranges/:id')
  @HttpCode(204)
  @RequirePermissions('pay.range.manage')
  @RequireStepUp()
  async deletePayRange(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    ownSession(req);
    await this.org.deletePayRange(ctx, id);
  }

  // ---- scoped settings (P01 §4.6) ----

  @Get('settings')
  @RequireAnyPermission(...VIEW)
  listSettings(@CurrentTenant() ctx: TenantContext) {
    return this.settings.list(ctx);
  }

  @Get('settings/resolve')
  @RequireAnyPermission(...VIEW)
  resolveSetting(@CurrentTenant() ctx: TenantContext, @Query() q: ResolveSettingQueryDto) {
    return this.settings.resolve(ctx, q);
  }

  @Put('settings')
  @RequirePermissions('org.settings.manage')
  setSetting(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Body() dto: SettingDto) {
    ownSession(req);
    return this.settings.set(ctx, dto);
  }

  @Delete('settings/:id')
  @HttpCode(204)
  @RequirePermissions('org.settings.manage')
  async removeSetting(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    ownSession(req);
    await this.settings.remove(ctx, id);
  }
}
