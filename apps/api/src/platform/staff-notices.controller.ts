import { Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUserId } from '../auth/current-user-id.decorator';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { PlatformStaffGuard } from './platform-staff.guard';
import { StaffNoticesService } from './staff-notices.service';

// Answer 2093: each staff member's own notices (the console header bell). Staff only, on their platform session; no key
// is needed, as a person only ever sees their own (the database refuses anyone else's).
@Controller('platform/notices')
@UseGuards(JwtAuthGuard, PlatformStaffGuard, PermissionsGuard)
export class StaffNoticesController {
  constructor(private readonly notices: StaffNoticesService) {}

  @Get()
  list(@CurrentUserId() me: string) {
    return this.notices.list(me);
  }

  @Post('read-all')
  @HttpCode(200)
  readAll(@CurrentUserId() me: string) {
    return this.notices.markAllRead(me);
  }

  @Post(':id/read')
  @HttpCode(200)
  read(@CurrentUserId() me: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.notices.markRead(me, id);
  }
}
