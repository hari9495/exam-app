import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { OwnSessionChangesGuard } from '../auth/own-session.guard';
import { RequirePermissions } from '../rbac/permissions.decorator';
import { CurrentTenant } from '../auth/current-tenant.decorator';
import { TenantContext } from '@exam-platform/shared';
import { TagsService } from './tags.service';

@Controller('tags')
// AS-0 (answer 2006): no assessments change while acting for someone else.
@UseGuards(JwtAuthGuard, OwnSessionChangesGuard, PermissionsGuard)
export class TagsController {
  constructor(private readonly tagsService: TagsService) {}

  @Get()
  @RequirePermissions('question_bank:manage')
  list(@CurrentTenant() tenant: TenantContext) {
    return this.tagsService.list(tenant);
  }
}
