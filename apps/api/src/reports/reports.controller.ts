import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { RequirePermissions } from '../rbac/permissions.decorator';
import { CurrentTenant } from '../auth/current-tenant.decorator';
import { TenantContext } from '@exam-platform/shared';
import { ReportsService } from './reports.service';

@Controller('exams')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get(':id/results/summary')
  @RequirePermissions('exam:manage')
  getSummary(@CurrentTenant() tenant: TenantContext, @Param('id') id: string) {
    return this.reportsService.getSummary(tenant, id);
  }

  @Get(':id/results/question-accuracy')
  @RequirePermissions('exam:manage')
  getQuestionAccuracy(@CurrentTenant() tenant: TenantContext, @Param('id') id: string) {
    return this.reportsService.getQuestionAccuracy(tenant, id);
  }
}
