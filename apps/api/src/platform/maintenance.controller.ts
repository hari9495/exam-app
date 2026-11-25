import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import { TenantContext } from '@exam-platform/shared';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentTenant } from '../auth/current-tenant.decorator';
import { CurrentUserId } from '../auth/current-user-id.decorator';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { RequireAnyPermission, RequirePermissions } from '../rbac/permissions.decorator';
import { PlatformStaffGuard } from './platform-staff.guard';
import { MaintenanceDecisionDto, MaintenanceWindowDto } from './maintenance.dto';
import { MaintenanceService } from './maintenance.service';
import { IncidentsService } from './incidents.service';

// YukthiX console C-5 (answers 948, 1053; YX-10 Maintenance): staff only, on their own platform session with their
// security key, every route behind the maintenance key.
@Controller('platform/maintenance')
@UseGuards(JwtAuthGuard, PlatformStaffGuard, PermissionsGuard)
export class MaintenanceController {
  constructor(private readonly maintenance: MaintenanceService) {}

  @Get()
  // Staff roles (answer 1058): Customer success sees the windows (view key); a Security lead manages them.
  @RequireAnyPermission('platform.maintenance.view', 'platform.maintenance.manage')
  overview(@CurrentUserId() actor: string) {
    return this.maintenance.overview(actor);
  }

  @Post()
  @RequirePermissions('platform.maintenance.manage')
  schedule(@CurrentUserId() actor: string, @Body() dto: MaintenanceWindowDto) {
    return this.maintenance.schedule(actor, dto);
  }

  @Post(':id/approve')
  @HttpCode(200)
  @RequirePermissions('platform.maintenance.manage')
  approve(@CurrentUserId() actor: string, @Param('id', ParseUUIDPipe) id: string, @Body() dto: MaintenanceDecisionDto) {
    return this.maintenance.approve(actor, id, dto);
  }

  @Post(':id/cancel')
  @HttpCode(200)
  @RequirePermissions('platform.maintenance.manage')
  cancel(@CurrentUserId() actor: string, @Param('id', ParseUUIDPipe) id: string, @Body() dto: MaintenanceDecisionDto) {
    return this.maintenance.cancel(actor, id, dto);
  }

}

/**
 * Answer 948: what every signed-in person's app shows now (one endpoint): the maintenance banner the day before and
 * during a scheduled window, and (C-8, YX-10) the latest posted update of an open incident on one of the company's
 * products, or nothing. It never blocks sign-in or any page by itself.
 */
@Controller('availability')
@UseGuards(JwtAuthGuard)
export class AvailabilityController {
  constructor(
    private readonly maintenance: MaintenanceService,
    private readonly incidents: IncidentsService,
  ) {}

  @Get()
  async current(@CurrentTenant() ctx: TenantContext) {
    const [m, incident] = await Promise.all([this.maintenance.availability(ctx), this.incidents.current(ctx)]);
    return { ...m, incident };
  }
}
