import { Module } from '@nestjs/common';
import { StorageModule } from '@exam-platform/shared';
import { JobsModule } from '../jobs/jobs.module';
import { EmailModule } from '../email/email.module';
import { PipelineModule } from '../pipeline/pipeline.module';
import { WalkInController } from './walk-in.controller';
import { WalkInService } from './walk-in.service';

@Module({
  imports: [JobsModule, EmailModule, StorageModule, PipelineModule],
  controllers: [WalkInController],
  providers: [WalkInService],
})
export class WalkInModule {}
