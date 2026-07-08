import { Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { RequirePermissions } from '../rbac/permissions.decorator';
import { CurrentTenant } from '../auth/current-tenant.decorator';
import { CurrentUserId } from '../auth/current-user-id.decorator';
import { TenantContext } from '../prisma/tenant-context';
import { AttemptsAdminService } from './attempts-admin.service';

@Controller('attempts')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class AttemptsController {
  constructor(private readonly attemptsAdminService: AttemptsAdminService) {}

  @Get(':id/proctoring-events')
  @RequirePermissions('exam:manage')
  listProctoringEvents(@CurrentTenant() tenant: TenantContext, @Param('id') id: string) {
    return this.attemptsAdminService.listProctoringEvents(tenant, id);
  }

  @Post(':id/force-submit')
  @RequirePermissions('exam:manage')
  forceSubmit(@CurrentTenant() tenant: TenantContext, @CurrentUserId() userId: string, @Param('id') id: string) {
    return this.attemptsAdminService.forceSubmit(tenant, id, userId);
  }
}
