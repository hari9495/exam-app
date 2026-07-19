import { Controller, Get, NotFoundException, Param, Query, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiKeyAuthGuard } from './api-key-auth.guard';
import { PublicApiThrottlerGuard } from './public-api-throttler.guard';
import { CurrentApiKeyOrg } from './current-api-key-org.decorator';
import { PublicApiService } from './public-api.service';
import { PaginationQueryDto } from './dto/pagination-query.dto';
import { TenantContext } from '@exam-platform/shared';
import { PUBLIC_API_THROTTLE } from '../rate-limit-tiers';

@Controller('public/candidates')
@UseGuards(ApiKeyAuthGuard, PublicApiThrottlerGuard)
@Throttle(PUBLIC_API_THROTTLE)
export class PublicCandidatesController {
  constructor(private readonly publicApiService: PublicApiService) {}

  @Get()
  list(@CurrentApiKeyOrg() tenant: TenantContext, @Query() query: PaginationQueryDto) {
    return this.publicApiService.listCandidates(tenant, query.page ?? 1, query.pageSize ?? 50);
  }

  @Get(':id')
  async get(@CurrentApiKeyOrg() tenant: TenantContext, @Param('id') id: string) {
    const candidate = await this.publicApiService.getCandidate(tenant, id);
    if (!candidate) {
      throw new NotFoundException(`Candidate ${id} not found`);
    }
    return candidate;
  }
}
