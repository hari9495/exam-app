import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { RequirePermissions } from '../rbac/permissions.decorator';
import { CurrentTenant } from '../auth/current-tenant.decorator';
import { CurrentUserId } from '../auth/current-user-id.decorator';
import { TenantContext } from '@exam-platform/shared';
import { CandidateWhatsappTemplatesService } from './candidate-whatsapp-templates.service';
import { UpsertWhatsappTemplateDto } from './dto/upsert-whatsapp-template.dto';
import { SetWhatsappTemplateEnabledDto } from './dto/set-whatsapp-template-enabled.dto';

@Controller('candidate-whatsapp-templates')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class CandidateWhatsappTemplatesController {
  constructor(private readonly templates: CandidateWhatsappTemplatesService) {}

  @Get()
  @RequirePermissions('pipeline:manage')
  list(@CurrentTenant() tenant: TenantContext) {
    return this.templates.listWithDefaults(tenant);
  }

  @Post()
  @RequirePermissions('pipeline:manage')
  create(@CurrentTenant() tenant: TenantContext, @CurrentUserId() userId: string, @Body() dto: UpsertWhatsappTemplateDto) {
    return this.templates.upsert(tenant, userId, dto);
  }

  @Patch(':id')
  @RequirePermissions('pipeline:manage')
  update(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUserId() userId: string,
    @Param('id') id: string,
    @Body() dto: UpsertWhatsappTemplateDto,
  ) {
    return this.templates.upsert(tenant, userId, { ...dto, id });
  }

  @Patch(':id/enabled')
  @RequirePermissions('pipeline:manage')
  setEnabled(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUserId() userId: string,
    @Param('id') id: string,
    @Body() dto: SetWhatsappTemplateEnabledDto,
  ) {
    return this.templates.setEnabled(tenant, userId, id, dto.enabled);
  }

  @Delete(':id')
  @RequirePermissions('pipeline:manage')
  remove(@CurrentTenant() tenant: TenantContext, @CurrentUserId() userId: string, @Param('id') id: string) {
    return this.templates.remove(tenant, userId, id);
  }
}
