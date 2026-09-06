import { Body, Controller, Get, Put, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { RequirePermissions } from '../rbac/permissions.decorator';
import { CurrentTenant } from '../auth/current-tenant.decorator';
import { TenantContext } from '@exam-platform/shared';
import { RecordVisibilityService } from './record-visibility.service';
import { UpdateRecordVisibilityDto } from './dto/update-record-visibility.dto';

@Controller('organizations/record-visibility')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class RecordVisibilityConfigController {
  constructor(private readonly recordVisibilityService: RecordVisibilityService) {}

  @Get()
  @RequirePermissions('org:manage_settings')
  getConfig(@CurrentTenant() tenant: TenantContext) {
    return this.recordVisibilityService.getRecordVisibility(tenant);
  }

  @Put()
  @RequirePermissions('org:manage_settings')
  setConfig(@CurrentTenant() tenant: TenantContext, @Body() dto: UpdateRecordVisibilityDto) {
    return this.recordVisibilityService.setRecordVisibility(tenant, dto.enabled);
  }
}
