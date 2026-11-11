import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Put, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUserId } from '../auth/current-user-id.decorator';
import { RequireStepUp } from '../auth/step-up.decorator';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { RequirePermissions } from '../rbac/permissions.decorator';
import { ownSession } from '../org-structure/org-structure.controller';
import { ConsoleOpsService } from './console-ops.service';
import { ContainDto, FlagDefaultDto, FlagOverrideDto, FlagReasonDto } from './dto';
import { PlatformStaffGuard } from './platform-staff.guard';

// Console C-4: feature switches (answer 1049) and Contain a company (answer 1050). YukthiX staff on their own security-key
// session only (PlatformStaffGuard); the kill switch, containing and lifting ask for the security key again (step-up).
@Controller('platform')
@UseGuards(JwtAuthGuard, PlatformStaffGuard, PermissionsGuard)
export class ConsoleOpsController {
  constructor(private readonly ops: ConsoleOpsService) {}

  @Get('feature-flags')
  @RequirePermissions('platform.flags.manage')
  flags(@CurrentUserId() staff: string) {
    return this.ops.flags(staff);
  }

  @Put('feature-flags/:key/default')
  @RequirePermissions('platform.flags.manage')
  @RequireStepUp()
  setDefault(@Req() req: Request, @CurrentUserId() staff: string, @Param('key') key: string, @Body() dto: FlagDefaultDto) {
    ownSession(req);
    return this.ops.setDefault(staff, key, dto.on, dto.reason);
  }

  @Put('feature-flags/:key/companies/:id')
  @RequirePermissions('platform.flags.manage')
  @RequireStepUp()
  override(@Req() req: Request, @CurrentUserId() staff: string, @Param('key') key: string, @Param('id', ParseUUIDPipe) id: string, @Body() dto: FlagOverrideDto) {
    ownSession(req);
    return this.ops.override(staff, key, id, dto.on ?? null, dto.reason);
  }

  @Post('feature-flags/:key/kill')
  @RequirePermissions('platform.flags.manage')
  @RequireStepUp()
  kill(@Req() req: Request, @CurrentUserId() staff: string, @Param('key') key: string, @Body() dto: FlagReasonDto) {
    ownSession(req);
    return this.ops.kill(staff, key, dto.reason);
  }

  @Post('feature-flags/:key/revive')
  @RequirePermissions('platform.flags.manage')
  @RequireStepUp()
  revive(@Req() req: Request, @CurrentUserId() staff: string, @Param('key') key: string, @Body() dto: FlagReasonDto) {
    ownSession(req);
    return this.ops.revive(staff, key, dto.reason);
  }

  /** C-5's Products and features card: this company's feature switches (answer 1053 hook). */
  @Get('companies/:id/feature-switches')
  @RequirePermissions('platform.companies.view')
  companySwitches(@CurrentUserId() staff: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.ops.companySwitches(staff, id);
  }

  @Get('companies/:id/containment')
  @RequirePermissions('platform.company.contain')
  containment(@CurrentUserId() staff: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.ops.containment(staff, id);
  }

  @Post('companies/:id/contain')
  @RequirePermissions('platform.company.contain')
  @RequireStepUp()
  contain(@Req() req: Request, @CurrentUserId() staff: string, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ContainDto) {
    ownSession(req);
    return this.ops.contain(staff, id, dto.reason);
  }

  @Post('companies/:id/containment/request-lift')
  @RequirePermissions('platform.company.contain')
  @RequireStepUp()
  requestLift(@Req() req: Request, @CurrentUserId() staff: string, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ContainDto) {
    ownSession(req);
    return this.ops.requestLift(staff, id, dto.reason);
  }

  @Post('companies/:id/containment/lift')
  @RequirePermissions('platform.company.contain')
  @RequireStepUp()
  lift(@Req() req: Request, @CurrentUserId() staff: string, @Param('id', ParseUUIDPipe) id: string) {
    ownSession(req);
    return this.ops.lift(staff, id);
  }
}
