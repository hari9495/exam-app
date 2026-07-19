import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { IsOptional, IsString } from 'class-validator';
import { ApiKeyAuthGuard } from './api-key-auth.guard';
import { PublicApiThrottlerGuard } from './public-api-throttler.guard';
import { CurrentApiKeyOrg } from './current-api-key-org.decorator';
import { PublicApiService } from './public-api.service';
import { PaginationQueryDto } from './dto/pagination-query.dto';
import { TenantContext } from '@exam-platform/shared';
import { PUBLIC_API_THROTTLE } from '../rate-limit-tiers';

// The global ValidationPipe runs with { whitelist: true, forbidNonWhitelisted: true }
// (apps/api/src/main.ts) -- any query key without a validation decorator is rejected
// as extraneous with a 400, so examId/candidateId/status each need one even though
// the service just passes them through as opaque strings.
class ListInvitationsQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsString()
  examId?: string;

  @IsOptional()
  @IsString()
  candidateId?: string;

  @IsOptional()
  @IsString()
  status?: string;
}

@Controller('public/invitations')
@UseGuards(ApiKeyAuthGuard, PublicApiThrottlerGuard)
@Throttle(PUBLIC_API_THROTTLE)
export class PublicInvitationsController {
  constructor(private readonly publicApiService: PublicApiService) {}

  @Get()
  list(@CurrentApiKeyOrg() tenant: TenantContext, @Query() query: ListInvitationsQueryDto) {
    return this.publicApiService.listInvitations(tenant, Number(query.page ?? 1), Number(query.pageSize ?? 50), {
      examId: query.examId,
      candidateId: query.candidateId,
      status: query.status,
    });
  }
}
