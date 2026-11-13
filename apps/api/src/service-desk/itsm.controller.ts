import { Body, Controller, Get, Param, ParseUUIDPipe, Put, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { TenantContext } from '@exam-platform/shared';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentTenant } from '../auth/current-tenant.decorator';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { RequireAnyPermission, RequirePermissions } from '../rbac/permissions.decorator';
import { DeskAccessService, assertOwnSession } from './desk-access';
import { ItsmSettingsDto, ItsmWindowDto } from './dto-itsm';
import { ItsmService } from './itsm.service';

// Helpdesk ITSM (docs/yukthix/helpdesk-itsm-plan.md; answers 1931-1943): changes and problems on IT desks. Routes
// declare their key (YX-SEC-01); the service checks the seat on the desk. Nothing is changed while acting for another.
@Controller('desk')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class DeskItsmController {
  constructor(
    private readonly access: DeskAccessService,
    private readonly itsm: ItsmService,
  ) {}

  // ---------------------------------------------------------------- ITSM-1 settings

  @Get('desks/:id/itsm-settings')
  @RequireAnyPermission('desk.settings.manage', 'desk.ticket.work')
  async settings(@Req() req: Request, @CurrentTenant() t: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.itsm.settings(await this.access.actor(req, t), id);
  }

  @Put('desks/:id/itsm-settings')
  @RequirePermissions('desk.settings.manage')
  async saveSettings(@Req() req: Request, @CurrentTenant() t: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ItsmSettingsDto) {
    assertOwnSession(req);
    return this.itsm.saveSettings(await this.access.actor(req, t), id, dto);
  }

  // A company-wide rule: the company's Service Desk owner (desk.desk.create) changes it, as with the knowledge interval.
  @Put('itsm/window')
  @RequirePermissions('desk.desk.create')
  async saveWindow(@Req() req: Request, @CurrentTenant() t: TenantContext, @Body() dto: ItsmWindowDto) {
    assertOwnSession(req);
    return this.itsm.saveWindow(await this.access.actor(req, t), dto);
  }
}
