import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Put, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUserId } from '../auth/current-user-id.decorator';
import { RequireStepUp } from '../auth/step-up.decorator';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { RequirePermissions } from '../rbac/permissions.decorator';
import { PlatformStaffGuard } from './platform-staff.guard';
import { CsDecisionDto, CsMessageDto, CsSettingsDto } from './customer-success.dto';
import { CustomerSuccessService } from './customer-success.service';

// YukthiX console C-2, Customer success (answers 1047, 1048, 1058): staff only, on their own platform session with their
// security key (PlatformStaffGuard), every route behind the Customer success key. Approving a message to more than one
// company sends it to all of them: step-up.
@Controller('platform/customers')
@UseGuards(JwtAuthGuard, PlatformStaffGuard, PermissionsGuard)
export class CustomerSuccessController {
  constructor(private readonly cs: CustomerSuccessService) {}

  @Get('health')
  @RequirePermissions('platform.customers.success')
  health(@CurrentUserId() actor: string) {
    return this.cs.health(actor);
  }

  @Get('settings')
  @RequirePermissions('platform.customers.success')
  settings() {
    return this.cs.settings();
  }

  @Put('settings')
  @RequirePermissions('platform.customers.success')
  saveSettings(@CurrentUserId() actor: string, @Body() dto: CsSettingsDto) {
    return this.cs.saveSettings(actor, dto);
  }

  @Get('messages')
  @RequirePermissions('platform.customers.success')
  messages(@CurrentUserId() actor: string) {
    return this.cs.messages(actor);
  }

  @Post('messages')
  @RequirePermissions('platform.customers.success')
  write(@CurrentUserId() actor: string, @Body() dto: CsMessageDto) {
    return this.cs.write(actor, dto);
  }

  @Post('messages/:id/approve')
  @HttpCode(200)
  @RequirePermissions('platform.customers.success')
  @RequireStepUp()
  approve(@CurrentUserId() actor: string, @Param('id', ParseUUIDPipe) id: string, @Body() dto: CsDecisionDto) {
    return this.cs.approve(actor, id, dto);
  }

  @Post('messages/:id/reject')
  @HttpCode(200)
  @RequirePermissions('platform.customers.success')
  reject(@CurrentUserId() actor: string, @Param('id', ParseUUIDPipe) id: string, @Body() dto: CsDecisionDto) {
    return this.cs.reject(actor, id, dto);
  }
}
