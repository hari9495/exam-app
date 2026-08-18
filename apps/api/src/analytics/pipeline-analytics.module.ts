import { Module } from '@nestjs/common';
import { PrismaModule } from '@exam-platform/shared';
import { PipelineAnalyticsController } from './pipeline-analytics.controller';
import { PipelineAnalyticsService } from './pipeline-analytics.service';

@Module({
  imports: [PrismaModule],
  controllers: [PipelineAnalyticsController],
  providers: [PipelineAnalyticsService],
})
export class PipelineAnalyticsModule {}
