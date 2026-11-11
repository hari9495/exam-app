import { Body, Controller, Get, Param, ParseUUIDPipe, Put, UseGuards } from '@nestjs/common';
import { ArrayMaxSize, ArrayUnique, IsArray, IsIn, IsString, Length } from 'class-validator';
import { Transform } from 'class-transformer';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUserId } from '../auth/current-user-id.decorator';
import { RequireStepUp } from '../auth/step-up.decorator';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { RequirePermissions } from '../rbac/permissions.decorator';
import { PlatformStaffGuard } from './platform-staff.guard';
import { STAFF_ROLES, StaffRolesService, type StaffRole } from './staff-roles.service';

export class StaffRolesDto {
  @IsArray()
  @ArrayUnique()
  @ArrayMaxSize(5)
  @IsIn(STAFF_ROLES, { each: true })
  roles!: StaffRole[];

  /** Why: kept in the platform audit log. */
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Length(5, 300)
  reason!: string;
}

// Console › Staff and roles (answers 1058, 1086): who holds which staff role, and changing them. Staff only, on their
// platform session; the Security lead's key (platform.staff.manage) on every route; a change needs the key again.
@Controller('platform/staff')
@UseGuards(JwtAuthGuard, PlatformStaffGuard, PermissionsGuard)
@RequirePermissions('platform.staff.manage')
export class StaffRolesController {
  constructor(private readonly staff: StaffRolesService) {}

  @Get()
  list(@CurrentUserId() actor: string) {
    return this.staff.list(actor);
  }

  @Put(':id/roles')
  @RequireStepUp()
  setRoles(@CurrentUserId() actor: string, @Param('id', ParseUUIDPipe) id: string, @Body() dto: StaffRolesDto) {
    return this.staff.setRoles(actor, id, dto.roles, dto.reason);
  }
}
