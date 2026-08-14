import { Module } from '@nestjs/common';
import { PrismaModule } from '@exam-platform/shared';
import { ItemAnalyticsController } from './item-analytics.controller';
import { ItemAnalyticsService } from './item-analytics.service';

@Module({
  imports: [PrismaModule],
  controllers: [ItemAnalyticsController],
  providers: [ItemAnalyticsService],
})
export class ItemAnalyticsModule {}
