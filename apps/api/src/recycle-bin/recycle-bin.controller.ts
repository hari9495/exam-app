import { BadRequestException, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Post, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { TenantContext } from '@exam-platform/shared';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { RequireAnyPermission, RequirePermissions } from '../rbac/permissions.decorator';
import { RequireStepUp } from '../auth/step-up.decorator';
import { CurrentTenant } from '../auth/current-tenant.decorator';
import { RecycleBinService, ENTITY_TYPES, EntityType, isEntityType } from './recycle-bin.service';

function assertEntityType(entityType: string): asserts entityType is EntityType {
  if (!isEntityType(entityType)) {
    throw new BadRequestException(`entityType must be one of: ${Object.keys(ENTITY_TYPES).join(', ')}`);
  }
}

// NOTE: @RequirePermissions is applied per-method, not on the class -- PermissionsGuard reads
// metadata off `context.getHandler()` only (see permissions.guard.ts), so a class-level
// SetMetadata (attached to the constructor, not the route method) would never be seen by the
// guard and the routes would run unguarded. Every other permissioned controller in this codebase
// decorates each route individually for that reason.
@Controller('recycle-bin')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class RecycleBinController {
  constructor(private readonly service: RecycleBinService) {}

  // Batch B item 3 (admin B2): the YukthiX-wide bin, for whoever manages company settings (either key family).
  // Declared before the hiring routes below: ':entityType/:id' would otherwise take 'items/<id>'.
  @Get('items')
  @RequireAnyPermission('org.settings.manage', 'org:manage_settings')
  items(@CurrentTenant() tenant: TenantContext) {
    return this.service.items(tenant);
  }

  @Post('items/:id/restore')
  @HttpCode(200)
  @RequireAnyPermission('org.settings.manage', 'org:manage_settings')
  restoreItem(@Req() req: Request, @CurrentTenant() tenant: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.restoreItem(tenant, (req.user as { userId: string }).userId, id);
  }

  // Delete for good: a step-up action (it cannot be undone).
  @Delete('items/:id')
  @RequireAnyPermission('org.settings.manage', 'org:manage_settings')
  @RequireStepUp()
  purgeItem(@Req() req: Request, @CurrentTenant() tenant: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.purgeItem(tenant, (req.user as { userId: string }).userId, id);
  }

  @Get()
  @RequirePermissions('org:manage_settings')
  list(@CurrentTenant() tenant: TenantContext) {
    return this.service.list(tenant);
  }

  @Post(':entityType/:id/restore')
  @RequirePermissions('org:manage_settings')
  restore(@CurrentTenant() tenant: TenantContext, @Param('entityType') entityType: string, @Param('id') id: string) {
    assertEntityType(entityType);
    return this.service.restore(tenant, entityType, id);
  }

  @Delete(':entityType/:id')
  @RequirePermissions('org:manage_settings')
  purge(@CurrentTenant() tenant: TenantContext, @Param('entityType') entityType: string, @Param('id') id: string) {
    assertEntityType(entityType);
    return this.service.purge(tenant, entityType, id);
  }
}
