import { Module } from '@nestjs/common';
import { ApiUsageInterceptor } from './api-usage.interceptor';
import { ApiUsageService } from './api-usage.service';

@Module({
  providers: [ApiUsageService, ApiUsageInterceptor],
  exports: [ApiUsageService, ApiUsageInterceptor],
})
export class ApiUsageModule {}
