import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { RequirePermissions } from '../rbac/permissions.decorator';
import { CurrentTenant } from '../auth/current-tenant.decorator';
import { CurrentUserId } from '../auth/current-user-id.decorator';
import { TenantContext } from '@exam-platform/shared';
import { CandidateSmsTemplatesService } from './candidate-sms-templates.service';
import { UpsertSmsTemplateDto } from './dto/upsert-sms-template.dto';
import { SetSmsEnabledDto } from './dto/set-sms-enabled.dto';

@Controller('candidate-sms-templates')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class CandidateSmsTemplatesController {
  constructor(private readonly templates: CandidateSmsTemplatesService) {}

  @Get()
  @RequirePermissions('pipeline:manage')
  list(@CurrentTenant() tenant: TenantContext) {
    return this.templates.listWithDefaults(tenant);
  }

  @Post()
  @RequirePermissions('pipeline:manage')
  create(@CurrentTenant() tenant: TenantContext, @CurrentUserId() userId: string, @Body() dto: UpsertSmsTemplateDto) {
    return this.templates.upsert(tenant, userId, dto);
  }

  @Patch(':id')
  @RequirePermissions('pipeline:manage')
  update(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUserId() userId: string,
    @Param('id') id: string,
    @Body() dto: UpsertSmsTemplateDto,
  ) {
    return this.templates.upsert(tenant, userId, { ...dto, id });
  }

  @Patch(':id/enabled')
  @RequirePermissions('pipeline:manage')
  setEnabled(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUserId() userId: string,
    @Param('id') id: string,
    @Body() dto: SetSmsEnabledDto,
  ) {
    return this.templates.setEnabled(tenant, userId, id, dto.enabled);
  }

  @Delete(':id')
  @RequirePermissions('pipeline:manage')
  remove(@CurrentTenant() tenant: TenantContext, @CurrentUserId() userId: string, @Param('id') id: string) {
    return this.templates.remove(tenant, userId, id);
  }
}
