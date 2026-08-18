import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { RequirePermissions } from '../rbac/permissions.decorator';
import { CurrentTenant } from '../auth/current-tenant.decorator';
import { CurrentUserId } from '../auth/current-user-id.decorator';
import { TenantContext } from '@exam-platform/shared';
import { CandidateEmailTemplatesService } from './candidate-email-templates.service';
import { UpsertTemplateDto } from './dto/upsert-template.dto';
import { SetEnabledDto } from './dto/set-enabled.dto';

@Controller('candidate-email-templates')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class CandidateEmailTemplatesController {
  constructor(private readonly templates: CandidateEmailTemplatesService) {}

  @Get()
  @RequirePermissions('pipeline:manage')
  list(@CurrentTenant() tenant: TenantContext) {
    return this.templates.listWithDefaults(tenant);
  }

  @Post()
  @RequirePermissions('pipeline:manage')
  create(@CurrentTenant() tenant: TenantContext, @CurrentUserId() userId: string, @Body() dto: UpsertTemplateDto) {
    return this.templates.upsert(tenant, userId, dto);
  }

  @Patch(':id')
  @RequirePermissions('pipeline:manage')
  update(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUserId() userId: string,
    @Param('id') id: string,
    @Body() dto: UpsertTemplateDto,
  ) {
    return this.templates.upsert(tenant, userId, { ...dto, id });
  }

  @Patch(':id/enabled')
  @RequirePermissions('pipeline:manage')
  setEnabled(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUserId() userId: string,
    @Param('id') id: string,
    @Body() dto: SetEnabledDto,
  ) {
    return this.templates.setEnabled(tenant, userId, id, dto.enabled);
  }

  @Delete(':id')
  @RequirePermissions('pipeline:manage')
  remove(@CurrentTenant() tenant: TenantContext, @CurrentUserId() userId: string, @Param('id') id: string) {
    return this.templates.remove(tenant, userId, id);
  }
}
