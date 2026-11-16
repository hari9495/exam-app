import { Module } from '@nestjs/common';
import { StorageModule } from '@exam-platform/shared';
import { BeforeTestController } from './before-test.controller';
import { BeforeTestService } from './before-test.service';

// Assessments AS-4b (answer 2011): accommodations (PRC-11) and connectivity above the cap (PRC-10), the staff side.
@Module({
  imports: [StorageModule],
  controllers: [BeforeTestController],
  providers: [BeforeTestService],
})
export class BeforeTestModule {}
