import { Body, Controller, Param, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { RequirePermissions } from '../rbac/permissions.decorator';
import { CurrentTenant } from '../auth/current-tenant.decorator';
import { TenantContext } from '@exam-platform/shared';
import { AiDraftingService } from './ai-drafting.service';
import {
  GenerateJobDescriptionDto,
  GenerateOfferLetterDto,
  GenerateOutreachEmailDto,
  GenerateFunnelNarrativeDto,
} from './dto/ai-drafting.dto';

@Controller('ai')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class AiDraftingController {
  constructor(private readonly drafting: AiDraftingService) {}

  @Post('job-description')
  @RequirePermissions('pipeline:manage')
  jobDescription(@CurrentTenant() tenant: TenantContext, @Body() dto: GenerateJobDescriptionDto) {
    return this.drafting.generateJobDescription(tenant, dto);
  }

  @Post('entries/:id/offer-letter')
  @RequirePermissions('pipeline:manage')
  offerLetter(@CurrentTenant() tenant: TenantContext, @Param('id') id: string, @Body() dto: GenerateOfferLetterDto) {
    return this.drafting.generateOfferLetter(tenant, id, dto);
  }

  @Post('entries/:id/outreach-email')
  @RequirePermissions('pipeline:manage')
  outreachEmail(@CurrentTenant() tenant: TenantContext, @Param('id') id: string, @Body() dto: GenerateOutreachEmailDto) {
    return this.drafting.generateOutreachEmail(tenant, id, dto);
  }

  @Post('funnel-narrative')
  @RequirePermissions('results:view')
  funnelNarrative(@CurrentTenant() tenant: TenantContext, @Body() dto: GenerateFunnelNarrativeDto) {
    return this.drafting.generateFunnelNarrative(tenant, dto);
  }
}
