import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { RequirePermissions } from '../rbac/permissions.decorator';
import { CurrentTenant } from '../auth/current-tenant.decorator';
import { CurrentUserId } from '../auth/current-user-id.decorator';
import { TenantContext } from '@exam-platform/shared';
import { CandidateSearchService } from './candidate-search.service';
import { CandidateSearchDto } from './dto/candidate-search.dto';

@Controller()
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class CandidateSearchController {
  constructor(private readonly search: CandidateSearchService) {}

  @Post('candidates/search')
  @RequirePermissions('pipeline:manage')
  semanticSearch(@CurrentTenant() tenant: TenantContext, @Body() dto: CandidateSearchDto) {
    return this.search.search(tenant, dto.query, dto.limit);
  }

  @Get('candidates/:id/similar')
  @RequirePermissions('pipeline:manage')
  similar(@CurrentTenant() tenant: TenantContext, @Param('id') id: string, @Query('limit') limit?: string) {
    return this.search.findSimilar(tenant, id, limit ? Number(limit) : undefined);
  }

  @Post('candidates/embeddings/backfill')
  @RequirePermissions('pipeline:manage')
  backfill(@CurrentTenant() tenant: TenantContext, @CurrentUserId() userId: string) {
    return this.search.backfill(tenant, userId);
  }
}
