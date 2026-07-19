import { Controller, Get, NotFoundException, Param, Query, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiKeyAuthGuard } from './api-key-auth.guard';
import { PublicApiThrottlerGuard } from './public-api-throttler.guard';
import { CurrentApiKeyOrg } from './current-api-key-org.decorator';
import { PublicApiService } from './public-api.service';
import { PaginationQueryDto } from './dto/pagination-query.dto';
import { TenantContext } from '@exam-platform/shared';
import { PUBLIC_API_THROTTLE } from '../rate-limit-tiers';
import { SkipGlobalThrottle } from '../fail-open-throttler.guard';

@Controller('public/exams')
@UseGuards(ApiKeyAuthGuard, PublicApiThrottlerGuard)
@Throttle(PUBLIC_API_THROTTLE)
@SkipGlobalThrottle()
export class PublicExamsController {
  constructor(private readonly publicApiService: PublicApiService) {}

  @Get()
  list(@CurrentApiKeyOrg() tenant: TenantContext, @Query() query: PaginationQueryDto) {
    return this.publicApiService.listExams(tenant, Number(query.page ?? 1), Number(query.pageSize ?? 50));
  }

  @Get(':id')
  async get(@CurrentApiKeyOrg() tenant: TenantContext, @Param('id') id: string) {
    const exam = await this.publicApiService.getExam(tenant, id);
    if (!exam) {
      throw new NotFoundException(`Exam ${id} not found`);
    }
    return exam;
  }

  @Get(':id/results')
  results(@CurrentApiKeyOrg() tenant: TenantContext, @Param('id') id: string, @Query() query: PaginationQueryDto) {
    return this.publicApiService.getExamResults(tenant, id, Number(query.page ?? 1), Number(query.pageSize ?? 50));
  }
}
