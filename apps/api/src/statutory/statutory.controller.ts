import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUserId } from '../auth/current-user-id.decorator';
import { RequireStepUp } from '../auth/step-up.decorator';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { RequirePermissions } from '../rbac/permissions.decorator';
import { PlatformStaffGuard } from '../platform/platform-staff.guard';
import { RuleChangesDto, RuleDraftDto, RuleUpdateDto } from '../payroll/dto-5b';
import { StatutoryRulesService } from './statutory.service';

// The YukthiX console's statutory rule store (PAY-2.01, P07 §4.3; console C-1, YX-01 to YX-03): staff only, on their
// platform session, with the Rules editor key (platform.statutory.manage, answer 1058). The drafter sends a draft for
// review; a second member of staff publishes it (security key again) or asks for changes with a note (answer 1042).
// Golden cases run on a draft without saving anything (1043); the impact is numbers only, read through platformRead
// (1044). Maker ≠ checker is checked here and in SQL; every write is audited.
@Controller('platform/statutory')
@UseGuards(JwtAuthGuard, PlatformStaffGuard, PermissionsGuard)
@RequirePermissions('platform.statutory.manage')
export class StatutoryConsoleController {
  constructor(private readonly rules: StatutoryRulesService) {}

  @Get('rule-sets')
  list() {
    return this.rules.list();
  }

  @Post('rule-sets')
  draft(@CurrentUserId() actor: string, @Body() dto: RuleDraftDto) {
    return this.rules.draft(actor, dto);
  }

  @Get('rule-sets/:id')
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.rules.get(id);
  }

  @Patch('rule-sets/:id')
  update(@CurrentUserId() actor: string, @Param('id', ParseUUIDPipe) id: string, @Body() dto: RuleUpdateDto) {
    return this.rules.update(actor, id, dto);
  }

  @Post('rule-sets/:id/run')
  @HttpCode(200)
  run(@CurrentUserId() actor: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.rules.dryRun(actor, id);
  }

  @Post('rule-sets/:id/send-for-review')
  @HttpCode(200)
  sendForReview(@CurrentUserId() actor: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.rules.sendForReview(actor, id);
  }

  @Post('rule-sets/:id/request-changes')
  @HttpCode(200)
  requestChanges(@CurrentUserId() actor: string, @Param('id', ParseUUIDPipe) id: string, @Body() dto: RuleChangesDto) {
    return this.rules.requestChanges(actor, id, dto.note);
  }

  @Get('rule-sets/:id/impact')
  impact(@CurrentUserId() actor: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.rules.impact(actor, id);
  }

  @Post('rule-sets/:id/publish')
  @HttpCode(200)
  @RequireStepUp()
  publish(@CurrentUserId() actor: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.rules.publish(actor, id);
  }
}
