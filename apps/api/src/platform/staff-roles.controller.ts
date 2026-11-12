import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Put, UseGuards } from '@nestjs/common';
import { ArrayMaxSize, ArrayUnique, IsArray, IsEmail, IsIn, IsString, Length, MaxLength } from 'class-validator';
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

const trim = () => Transform(({ value }) => (typeof value === 'string' ? value.trim() : value));

/** Answer 1164: a new member of staff (no role until a Security lead gives one). */
export class InviteStaffDto {
  @trim()
  @IsEmail()
  @MaxLength(254)
  email!: string;

  @trim()
  @IsString()
  @Length(2, 100)
  name!: string;

  @trim()
  @IsString()
  @Length(5, 300)
  reason!: string;
}

export class StaffReasonDto {
  @trim()
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

  /** Answer 1164: add a member of staff (invitation by email; the security key comes at first sign-in). */
  @Post()
  @RequireStepUp()
  invite(@CurrentUserId() actor: string, @Body() dto: InviteStaffDto) {
    return this.staff.invite(actor, dto);
  }

  /** Answer 1164: deactivate another member of staff (signed out everywhere). */
  @Post(':id/deactivate')
  @HttpCode(200)
  @RequireStepUp()
  deactivate(@CurrentUserId() actor: string, @Param('id', ParseUUIDPipe) id: string, @Body() dto: StaffReasonDto) {
    return this.staff.deactivate(actor, id, dto.reason);
  }

  /** Answer 1171: reactivate a deactivated member of staff (they sign in again with their security key). */
  @Post(':id/reactivate')
  @HttpCode(200)
  @RequireStepUp()
  reactivate(@CurrentUserId() actor: string, @Param('id', ParseUUIDPipe) id: string, @Body() dto: StaffReasonDto) {
    return this.staff.reactivate(actor, id, dto.reason);
  }

  /** Answer 1173: send the invitation again to someone who never signed in (the old link stops working). */
  @Post(':id/resend-invitation')
  @HttpCode(200)
  @RequireStepUp()
  resendInvite(@CurrentUserId() actor: string, @Param('id', ParseUUIDPipe) id: string, @Body() dto: StaffReasonDto) {
    return this.staff.resendInvite(actor, id, dto.reason);
  }

  @Put(':id/roles')
  @RequireStepUp()
  setRoles(@CurrentUserId() actor: string, @Param('id', ParseUUIDPipe) id: string, @Body() dto: StaffRolesDto) {
    return this.staff.setRoles(actor, id, dto.roles, dto.reason);
  }
}

/** Answer 1166: every member of staff sees their own roles (no console key needed; staff only, on their session). */
@Controller('platform/my-roles')
@UseGuards(JwtAuthGuard, PlatformStaffGuard, PermissionsGuard)
export class MyStaffRolesController {
  constructor(private readonly staff: StaffRolesService) {}

  @Get()
  mine(@CurrentUserId() actor: string) {
    return this.staff.mine(actor);
  }
}
