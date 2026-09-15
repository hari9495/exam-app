import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { RequirePermissions } from '../rbac/permissions.decorator';
import { CurrentTenant } from '../auth/current-tenant.decorator';
import { CurrentUserId } from '../auth/current-user-id.decorator';
import { TenantContext } from '@exam-platform/shared';
import { DripService } from './drip.service';
import { UpsertDripCampaignDto, EnrolCandidatesDto } from './dto/drip.dto';
import { IsBoolean } from 'class-validator';

class SetEnabledDto {
  @IsBoolean() enabled!: boolean;
}

// Candidate nurture / drip campaigns. Gated on pipeline:manage (same as bulk candidate email).
@Controller('drip-campaigns')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePermissions('pipeline:manage')
export class DripController {
  constructor(private readonly drip: DripService) {}

  @Get()
  list(@CurrentTenant() tenant: TenantContext) {
    return this.drip.list(tenant);
  }

  @Post()
  create(@CurrentTenant() tenant: TenantContext, @CurrentUserId() userId: string, @Body() dto: UpsertDripCampaignDto) {
    return this.drip.create(tenant, userId, dto);
  }

  @Get(':id')
  get(@CurrentTenant() tenant: TenantContext, @Param('id') id: string) {
    return this.drip.get(tenant, id);
  }

  @Patch(':id')
  update(@CurrentTenant() tenant: TenantContext, @CurrentUserId() userId: string, @Param('id') id: string, @Body() dto: UpsertDripCampaignDto) {
    return this.drip.update(tenant, userId, id, dto);
  }

  @Patch(':id/enabled')
  setEnabled(@CurrentTenant() tenant: TenantContext, @CurrentUserId() userId: string, @Param('id') id: string, @Body() dto: SetEnabledDto) {
    return this.drip.setEnabled(tenant, userId, id, dto.enabled);
  }

  @Delete(':id')
  remove(@CurrentTenant() tenant: TenantContext, @CurrentUserId() userId: string, @Param('id') id: string) {
    return this.drip.remove(tenant, userId, id);
  }

  @Post(':id/enrol')
  enrol(@CurrentTenant() tenant: TenantContext, @CurrentUserId() userId: string, @Param('id') id: string, @Body() dto: EnrolCandidatesDto) {
    return this.drip.enrolCandidates(tenant, userId, id, dto);
  }
}
