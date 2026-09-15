import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { IsBoolean } from 'class-validator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { RequirePermissions } from '../rbac/permissions.decorator';
import { CurrentTenant } from '../auth/current-tenant.decorator';
import { CurrentUserId } from '../auth/current-user-id.decorator';
import { TenantContext } from '@exam-platform/shared';
import { SurveysService } from './surveys.service';
import { UpsertSurveyDto, SendSurveyDto } from './dto/survey.dto';

class SetEnabledDto {
  @IsBoolean() enabled!: boolean;
}

// Candidate-experience surveys. Gated on pipeline:manage (same as drip campaigns / candidate email).
@Controller('surveys')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePermissions('pipeline:manage')
export class SurveysController {
  constructor(private readonly surveys: SurveysService) {}

  @Get()
  list(@CurrentTenant() tenant: TenantContext) {
    return this.surveys.list(tenant);
  }

  @Post()
  create(@CurrentTenant() tenant: TenantContext, @CurrentUserId() userId: string, @Body() dto: UpsertSurveyDto) {
    return this.surveys.create(tenant, userId, dto);
  }

  @Patch(':id')
  update(@CurrentTenant() tenant: TenantContext, @CurrentUserId() userId: string, @Param('id') id: string, @Body() dto: UpsertSurveyDto) {
    return this.surveys.update(tenant, userId, id, dto);
  }

  @Patch(':id/enabled')
  setEnabled(@CurrentTenant() tenant: TenantContext, @CurrentUserId() userId: string, @Param('id') id: string, @Body() dto: SetEnabledDto) {
    return this.surveys.setEnabled(tenant, userId, id, dto.enabled);
  }

  @Delete(':id')
  remove(@CurrentTenant() tenant: TenantContext, @CurrentUserId() userId: string, @Param('id') id: string) {
    return this.surveys.remove(tenant, userId, id);
  }

  @Get(':id/summary')
  summary(@CurrentTenant() tenant: TenantContext, @Param('id') id: string) {
    return this.surveys.getSummary(tenant, id);
  }

  // Manual send: recruiter picks a candidate's pipeline entry to survey.
  @Post(':id/send')
  send(@CurrentTenant() tenant: TenantContext, @CurrentUserId() userId: string, @Param('id') id: string, @Body() dto: SendSurveyDto) {
    return this.surveys.sendInvite(tenant, userId, id, dto.entryId);
  }
}
