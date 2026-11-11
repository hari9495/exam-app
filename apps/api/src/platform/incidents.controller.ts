import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Put, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUserId } from '../auth/current-user-id.decorator';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { RequirePermissions } from '../rbac/permissions.decorator';
import { PlatformStaffGuard } from './platform-staff.guard';
import { IncidentBreachDto, IncidentOpenDto, IncidentReviewDto, IncidentSettingsDto, IncidentUpdateDto } from './incidents.dto';
import { IncidentsService } from './incidents.service';

// YukthiX console C-8, YX-10 incidents (and answer 1124): staff only, on their own platform session with their security
// key, every route behind the incidents key (staff role: Security lead, answer 1058).
@Controller('platform/incidents')
@UseGuards(JwtAuthGuard, PlatformStaffGuard, PermissionsGuard)
export class IncidentsController {
  constructor(private readonly incidents: IncidentsService) {}

  @Get()
  @RequirePermissions('platform.incidents.manage')
  overview(@CurrentUserId() actor: string) {
    return this.incidents.overview(actor);
  }

  @Post()
  @RequirePermissions('platform.incidents.manage')
  open(@CurrentUserId() actor: string, @Body() dto: IncidentOpenDto) {
    return this.incidents.open(actor, dto);
  }

  @Post(':id/updates')
  @RequirePermissions('platform.incidents.manage')
  postUpdate(@CurrentUserId() actor: string, @Param('id', ParseUUIDPipe) id: string, @Body() dto: IncidentUpdateDto) {
    return this.incidents.postUpdate(actor, id, dto);
  }

  @Post(':id/updates/:updateId/review')
  @HttpCode(200)
  @RequirePermissions('platform.incidents.manage')
  review(@CurrentUserId() actor: string, @Param('id', ParseUUIDPipe) id: string, @Param('updateId', ParseUUIDPipe) updateId: string, @Body() dto: IncidentReviewDto) {
    return this.incidents.review(actor, id, updateId, dto);
  }

  @Post(':id/breach')
  @HttpCode(200)
  @RequirePermissions('platform.incidents.manage')
  markBreach(@CurrentUserId() actor: string, @Param('id', ParseUUIDPipe) id: string, @Body() dto: IncidentBreachDto) {
    return this.incidents.markBreach(actor, id, dto.containmentId);
  }

  @Put('settings')
  @RequirePermissions('platform.incidents.manage')
  saveSettings(@CurrentUserId() actor: string, @Body() dto: IncidentSettingsDto) {
    return this.incidents.saveSettings(actor, dto.leadHours);
  }
}
