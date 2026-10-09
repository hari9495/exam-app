import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUserId } from '../auth/current-user-id.decorator';
import { RequireStepUp } from '../auth/step-up.decorator';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { RequirePermissions } from '../rbac/permissions.decorator';
import { PlatformStaffGuard } from '../platform/platform-staff.guard';
import { RuleDraftDto } from '../payroll/dto-5b';
import { StatutoryRulesService } from './statutory.service';

// The YukthiX console's statutory rule store (PAY-2.01, P07 §4.3): staff only, on their platform session. A draft is
// published by a second member of staff after its shape checks and golden cases pass (maker ≠ checker, also in SQL).
@Controller('platform/statutory')
@UseGuards(JwtAuthGuard, PlatformStaffGuard, PermissionsGuard)
export class StatutoryConsoleController {
  constructor(private readonly rules: StatutoryRulesService) {}

  @Get('rule-sets')
  @RequirePermissions('platform.statutory.manage')
  list() {
    return this.rules.list();
  }

  @Post('rule-sets')
  @RequirePermissions('platform.statutory.manage')
  draft(@CurrentUserId() actor: string, @Body() dto: RuleDraftDto) {
    return this.rules.draft(actor, dto);
  }

  @Post('rule-sets/:id/publish')
  @HttpCode(200)
  @RequirePermissions('platform.statutory.manage')
  @RequireStepUp()
  publish(@CurrentUserId() actor: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.rules.publish(actor, id);
  }
}
