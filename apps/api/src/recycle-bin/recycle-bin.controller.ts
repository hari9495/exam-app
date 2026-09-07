import { BadRequestException, Controller, Delete, Get, Param, Post, UseGuards } from '@nestjs/common';
import { TenantContext } from '@exam-platform/shared';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { RequirePermissions } from '../rbac/permissions.decorator';
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
