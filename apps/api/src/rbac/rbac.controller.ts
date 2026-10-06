import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from './permissions.guard';
import { RequirePermissions } from './permissions.decorator';
import { RbacService } from './rbac.service';
import { MyPermissionsQueryDto } from './dto/my-permissions-query.dto';

@Controller('rbac')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class RbacController {
  constructor(private readonly rbacService: RbacService) {}

  @Get('roles')
  @RequirePermissions('audit:view')
  listRoles() {
    return this.rbacService.listRoles();
  }

  /** Which of the asked-for keys the signed-in person holds, so screens show only what they can open. The API still checks every call. */
  @Get('me/permissions')
  myPermissions(@Req() req: Request, @Query() q: MyPermissionsQueryDto) {
    const user = req.user as { userId?: string; role: string; organizationId?: string | null; permissionProfileId?: string | null };
    return this.rbacService.grantedKeys(user, q.keys.split(','));
  }
}
