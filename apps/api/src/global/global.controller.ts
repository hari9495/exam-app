import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Put, Query, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { TenantContext } from '@exam-platform/shared';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentTenant } from '../auth/current-tenant.decorator';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { RequireAnyPermission, RequirePermissions } from '../rbac/permissions.decorator';
import { OrgScopeService } from '../access/org-scope.service';
import { ownSession } from '../org-structure/org-structure.controller';
import { CountrySetupDto, CountrySetupEntityDto, LanguageDto, TranslationDto, TranslationQueryDto, VersionDto } from './dto';
import { GlobalService } from './global.service';

// Batch G1 · global core (G1-GLOBAL-CORE-BUILD-DESIGN §9). Permissions (P02 YX-SEC-01):
//   org.structure.view / org.settings.manage   read the country packs
//   org.settings.manage (whole company)        translations and the "Add a country" guide
//   signed in, own session                     my language
@Controller('global')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class GlobalController {
  constructor(
    private readonly global: GlobalService,
    private readonly scope: OrgScopeService,
  ) {}

  /** Company-wide words and guides: the whole-company grant, never one entity's (P02 §4.3). */
  private manage(req: Request) {
    return this.scope.require(req, 'org.settings.manage', null);
  }

  @Get('countries')
  @RequireAnyPermission('org.structure.view', 'org.settings.manage')
  countries(@CurrentTenant() ctx: TenantContext) {
    return this.global.countries(ctx);
  }

  @Get('countries/:code')
  @RequireAnyPermission('org.structure.view', 'org.settings.manage')
  country(@CurrentTenant() ctx: TenantContext, @Param('code') code: string) {
    return this.global.country(ctx, /^[A-Z]{2}$/.test(code) ? code : '--');
  }

  @Get('me/language')
  myLanguage(@CurrentTenant() ctx: TenantContext) {
    return this.global.myLanguage(ctx);
  }

  @Put('me/language')
  setMyLanguage(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Body() dto: LanguageDto) {
    ownSession(req);
    return this.global.setMyLanguage(ctx, dto.language);
  }

  @Get('translations')
  @RequirePermissions('org.settings.manage')
  async translations(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Query() q: TranslationQueryDto) {
    await this.manage(req);
    return this.global.translations(ctx, q.subjectType);
  }

  @Put('translations')
  @RequirePermissions('org.settings.manage')
  async saveTranslation(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Body() dto: TranslationDto) {
    ownSession(req);
    await this.manage(req);
    return this.global.saveTranslation(ctx, dto);
  }

  @Get('country-setups')
  @RequirePermissions('org.settings.manage')
  async setups(@Req() req: Request, @CurrentTenant() ctx: TenantContext) {
    await this.manage(req);
    return this.global.setups(ctx);
  }

  @Post('country-setups')
  @RequirePermissions('org.settings.manage')
  async start(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Body() dto: CountrySetupDto) {
    ownSession(req);
    await this.manage(req);
    return this.global.startSetup(ctx, dto);
  }

  @Put('country-setups/:id')
  @RequirePermissions('org.settings.manage')
  async setEntity(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: CountrySetupEntityDto) {
    ownSession(req);
    await this.manage(req);
    return this.global.setSetupEntity(ctx, id, dto.legalEntityId, dto.version);
  }

  @Post('country-setups/:id/finish')
  @RequirePermissions('org.settings.manage')
  async finish(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: VersionDto) {
    ownSession(req);
    await this.manage(req);
    return this.global.finishSetup(ctx, id, dto.version);
  }
}
