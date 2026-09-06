import { BadRequestException, Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { CustomFieldDefinition } from '@prisma/client';
import { TenantContext } from '@exam-platform/shared';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { RequirePermissions } from '../rbac/permissions.decorator';
import { CurrentTenant } from '../auth/current-tenant.decorator';
import { CustomFieldsService } from './custom-fields.service';
import { CreateCustomFieldDto, CF_ENTITY_TYPES } from './dto/create-custom-field.dto';
import { UpdateCustomFieldDto } from './dto/update-custom-field.dto';

// Web consumes `options` as string[] directly -- parse optionsJson here so web stays dumb.
function toResponse(def: CustomFieldDefinition) {
  let options: string[] | null = null;
  if (def.optionsJson) {
    try {
      const parsed = JSON.parse(def.optionsJson);
      if (Array.isArray(parsed)) options = parsed;
    } catch {
      options = null;
    }
  }
  return {
    id: def.id,
    organizationId: def.organizationId,
    entityType: def.entityType,
    key: def.key,
    label: def.label,
    fieldType: def.fieldType,
    options,
    required: def.required,
    showOnApply: def.showOnApply,
    position: def.position,
    archivedAt: def.archivedAt,
    createdAt: def.createdAt,
  };
}

@Controller('custom-fields')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePermissions('org:manage_settings')
export class CustomFieldsConfigController {
  constructor(private readonly service: CustomFieldsService) {}

  @Get()
  async list(@CurrentTenant() tenant: TenantContext, @Query('entityType') entityType: string, @Query('includeArchived') includeArchived?: string) {
    if (!CF_ENTITY_TYPES.includes(entityType as any)) throw new BadRequestException('entityType must be candidate or job');
    const defs = await this.service.list(tenant, entityType as 'candidate' | 'job', includeArchived === 'true');
    return defs.map(toResponse);
  }

  @Post()
  async create(@CurrentTenant() tenant: TenantContext, @Body() dto: CreateCustomFieldDto) {
    return toResponse(await this.service.create(tenant, dto));
  }

  @Patch(':id')
  async update(@CurrentTenant() tenant: TenantContext, @Param('id') id: string, @Body() dto: UpdateCustomFieldDto) {
    return toResponse(await this.service.update(tenant, id, dto));
  }

  @Delete(':id')
  archive(@CurrentTenant() tenant: TenantContext, @Param('id') id: string) {
    return this.service.archive(tenant, id);
  }
}
