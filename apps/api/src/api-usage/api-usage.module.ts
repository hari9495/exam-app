import { Module } from '@nestjs/common';
import { ApiUsageInterceptor } from './api-usage.interceptor';
import { ApiUsageRetentionService } from './api-usage-retention.service';
import { ApiUsageService } from './api-usage.service';

@Module({
  providers: [ApiUsageService, ApiUsageInterceptor, ApiUsageRetentionService],
  exports: [ApiUsageService, ApiUsageInterceptor],
})
export class ApiUsageModule {}
