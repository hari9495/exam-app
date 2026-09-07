import { Module } from '@nestjs/common';
import { ApiUsageService } from './api-usage.service';

@Module({
  providers: [ApiUsageService],
  exports: [ApiUsageService],
})
export class ApiUsageModule {}
