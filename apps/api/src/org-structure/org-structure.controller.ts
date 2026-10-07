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
import { SETTINGS } from './settings-registry';
import { OrgStructureService } from './org-structure.service';
import { OrgScopeService } from '../access/org-scope.service';

// Settings › Organisation (P01 §8, APX-D 1.2–1.4) and the scoped-settings API (P01 §4.6). Every route
// declares its permission (P02 YX-SEC-01):
//   org.structure.view           read entities, locations and masters (Public / Internal)
//   org.settings.manage          change them and scoped settings (HR / System Admin)
//   org.entity.statutory.manage  the Confidential entity identifiers (P02 §4.4)
//   pay.range.view / .manage     grade pay ranges (founder rule R1: pay is private)
// Each key may be held for the whole company or one legal entity (P02 §4.3): writes and pay / Confidential
// reads are checked against the record's entity here (OrgScopeService) before the service runs.
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
export function ownSession(req: Request): void {
  const user = req.user as RequestUser | undefined;
  if (user?.impersonatorUserId || user?.actingSuperAdmin) throw new ForbiddenException('Not available while acting for someone else');
}

@Controller('org')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class OrgStructureController {
  constructor(
    private readonly org: OrgStructureService,
    private readonly settings: OrgSettingsService,
    private readonly scope: OrgScopeService,
  ) {}

  private manage(req: Request, entityId: string | null) {
    return this.scope.require(req, 'org.settings.manage', entityId);
  }

  /** Settings that loosen an access or fraud guard also need their guard key, company-wide (P02 §4.2, YX-SEC-02). */
  private async settingGuard(req: Request, key: string) {
    const guard = SETTINGS[key]?.guard;
    if (guard) await this.scope.require(req, guard, null);
  }

  /**
   * Naming a department head hands them the implicit view of the department's people (P02 YX-SEC-04): an access
   * grant, so it also needs access.role.manage company-wide (YX-SEC-02), not only the structure grant.
   */
  private async headGuard(req: Request, ctx: TenantContext, kind: MasterKind, id: string | null, dto: unknown) {
    const head = (dto as { headEmployeeId?: string | null }).headEmployeeId;
    if (kind === 'departments' && head !== undefined && head !== (await this.org.departmentHead(ctx, id))) await this.scope.require(req, 'access.role.manage', null);
  }

  /** The entity a master body puts the record in: a cost centre's entity, an entity-only owner, or company-wide. */
  private masterEntity(kind: MasterKind, body: { legalEntityId?: string; ownerLegalEntityId?: string | null }): string | null {
    return kind === 'cost-centres' ? (body.legalEntityId ?? null) : (body.ownerLegalEntityId ?? null);
  }

  /**
   * Lists the screens need: India's states and the open data regions. Public reference data (no company
   * record in it), so every signed-in user may read it, e.g. for their own address (P02 §4.5).
   */
  @Get('reference')
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
  async createEntity(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Body() dto: LegalEntityDto) {
    ownSession(req);
    await this.manage(req, null);
    return this.org.createEntity(ctx, dto);
  }

  @Put('legal-entities/:id')
  @RequirePermissions('org.settings.manage')
  async updateEntity(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: LegalEntityDto) {
    ownSession(req);
    await this.manage(req, id);
    return this.org.updateEntity(ctx, id, dto);
  }

  @Post('legal-entities/:id/default')
  @HttpCode(200)
  @RequirePermissions('org.settings.manage')
  async setDefault(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    ownSession(req);
    await this.manage(req, null);
    return this.org.setDefaultEntity(ctx, id);
  }

  @Post('legal-entities/:id/archive')
  @HttpCode(200)
  @RequirePermissions('org.settings.manage')
  async archiveEntity(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    ownSession(req);
    await this.manage(req, id);
    return this.org.archiveEntity(ctx, id);
  }

  @Post('legal-entities/:id/restore')
  @HttpCode(200)
  @RequirePermissions('org.settings.manage')
  async restoreEntity(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    ownSession(req);
    await this.manage(req, id);
    return this.org.restoreEntity(ctx, id);
  }

  @Delete('legal-entities/:id')
  @HttpCode(204)
  @RequirePermissions('org.settings.manage')
  async deleteEntity(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    ownSession(req);
    await this.manage(req, null);
    await this.org.deleteEntity(ctx, id);
  }

  @Get('legal-entities/:id/statutory')
  @RequirePermissions('org.entity.statutory.manage')
  async getStatutory(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    ownSession(req);
    await this.scope.require(req, 'org.entity.statutory.manage', id);
    return this.org.getStatutory(ctx, id);
  }

  @Put('legal-entities/:id/statutory')
  @RequirePermissions('org.entity.statutory.manage')
  @RequireStepUp()
  async setStatutory(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: LegalEntityStatutoryDto) {
    ownSession(req);
    await this.scope.require(req, 'org.entity.statutory.manage', id);
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
  async createLocation(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Body() dto: LocationDto) {
    ownSession(req);
    await this.manage(req, dto.legalEntityId);
    return this.org.createLocation(ctx, dto);
  }

  @Put('locations/:id')
  @RequirePermissions('org.settings.manage')
  async updateLocation(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: LocationDto) {
    ownSession(req);
    await this.manage(req, await this.scope.entityOf(ctx, 'location', id));
    return this.org.updateLocation(ctx, id, dto);
  }

  @Post('locations/:id/archive')
  @HttpCode(200)
  @RequirePermissions('org.settings.manage')
  async archiveLocation(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    ownSession(req);
    await this.manage(req, await this.scope.entityOf(ctx, 'location', id));
    return this.org.archiveLocation(ctx, id, true);
  }

  @Post('locations/:id/restore')
  @HttpCode(200)
  @RequirePermissions('org.settings.manage')
  async restoreLocation(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    ownSession(req);
    await this.manage(req, await this.scope.entityOf(ctx, 'location', id));
    return this.org.archiveLocation(ctx, id, false);
  }

  @Delete('locations/:id')
  @HttpCode(204)
  @RequirePermissions('org.settings.manage')
  async deleteLocation(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    ownSession(req);
    await this.manage(req, await this.scope.entityOf(ctx, 'location', id));
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
  async createMaster(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('kind', KIND) kind: MasterKind, @Body() body: unknown) {
    ownSession(req);
    const dto = masterBody(kind, body);
    await this.manage(req, this.masterEntity(kind, dto as never));
    await this.headGuard(req, ctx, kind, null, dto);
    return this.org.createMaster(ctx, kind, dto);
  }

  @Put('masters/:kind/:id')
  @RequirePermissions('org.settings.manage')
  async updateMaster(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('kind', KIND) kind: MasterKind, @Param('id', ParseUUIDPipe) id: string, @Body() body: unknown) {
    ownSession(req);
    const dto = masterBody(kind, body);
    await this.manage(req, await this.scope.entityOf(ctx, kind, id));
    // Moving it to another owner (or making it shared) needs that scope too.
    if (kind === 'cost-centres' || (dto as { ownerLegalEntityId?: string | null }).ownerLegalEntityId !== undefined) await this.manage(req, this.masterEntity(kind, dto as never));
    await this.headGuard(req, ctx, kind, id, dto);
    return this.org.updateMaster(ctx, kind, id, dto);
  }

  @Post('masters/:kind/:id/archive')
  @HttpCode(200)
  @RequirePermissions('org.settings.manage')
  async archiveMaster(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('kind', KIND) kind: MasterKind, @Param('id', ParseUUIDPipe) id: string) {
    ownSession(req);
    await this.manage(req, await this.scope.entityOf(ctx, kind, id));
    return this.org.archiveMaster(ctx, kind, id, true);
  }

  @Post('masters/:kind/:id/restore')
  @HttpCode(200)
  @RequirePermissions('org.settings.manage')
  async restoreMaster(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('kind', KIND) kind: MasterKind, @Param('id', ParseUUIDPipe) id: string) {
    ownSession(req);
    await this.manage(req, await this.scope.entityOf(ctx, kind, id));
    return this.org.archiveMaster(ctx, kind, id, false);
  }

  @Delete('masters/:kind/:id')
  @HttpCode(204)
  @RequirePermissions('org.settings.manage')
  async deleteMaster(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('kind', KIND) kind: MasterKind, @Param('id', ParseUUIDPipe) id: string) {
    ownSession(req);
    await this.manage(req, await this.scope.entityOf(ctx, kind, id));
    await this.org.deleteMaster(ctx, kind, id);
  }

  // ---- grade pay ranges: pay data (R1) ----

  @Get('grades/:gradeId/pay-ranges')
  @RequirePermissions('pay.range.view')
  async listPayRanges(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('gradeId', ParseUUIDPipe) gradeId: string, @Query() q: PayRangeQueryDto) {
    ownSession(req);
    // R1 + P02 §4.3: only the entities the pay grant reaches.
    return this.org.listPayRanges(ctx, gradeId, q.legalEntityId, await this.scope.reach(req, 'pay.range.view'));
  }

  @Post('grades/:gradeId/pay-ranges')
  @RequirePermissions('pay.range.manage')
  @RequireStepUp()
  async createPayRange(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('gradeId', ParseUUIDPipe) gradeId: string, @Body() dto: PayRangeDto) {
    ownSession(req);
    await this.scope.require(req, 'pay.range.manage', dto.legalEntityId);
    return this.org.createPayRange(ctx, gradeId, dto);
  }

  @Put('pay-ranges/:id')
  @RequirePermissions('pay.range.manage')
  @RequireStepUp()
  async updatePayRange(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: PayRangeAmountsDto) {
    ownSession(req);
    await this.scope.require(req, 'pay.range.manage', await this.scope.entityOf(ctx, 'pay_range', id));
    return this.org.updatePayRange(ctx, id, dto);
  }

  @Delete('pay-ranges/:id')
  @HttpCode(204)
  @RequirePermissions('pay.range.manage')
  @RequireStepUp()
  async deletePayRange(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    ownSession(req);
    await this.scope.require(req, 'pay.range.manage', await this.scope.entityOf(ctx, 'pay_range', id));
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
  async resolveSetting(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Query() q: ResolveSettingQueryDto) {
    // Resolving for a person reads their assignment (Internal): only for HR whose grant reaches them.
    if (q.employeeId) await this.scope.requireEmployee(req, ctx, q.employeeId, q.asOf);
    return this.settings.resolve(ctx, q);
  }

  @Put('settings')
  @RequirePermissions('org.settings.manage')
  async setSetting(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Body() dto: SettingDto) {
    ownSession(req);
    await this.manage(req, await this.scope.settingEntity(ctx, dto.scopeType, dto.scopeId));
    await this.settingGuard(req, dto.key);
    return this.settings.set(ctx, dto);
  }

  @Delete('settings/:id')
  @HttpCode(204)
  @RequirePermissions('org.settings.manage')
  async removeSetting(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    ownSession(req);
    const row = await this.scope.settingById(ctx, id);
    await this.manage(req, row.entityId);
    await this.settingGuard(req, row.key);
    await this.settings.remove(ctx, id);
  }
}
