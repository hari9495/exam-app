import { Module } from '@nestjs/common';
import { JobsModule } from '../jobs/jobs.module';
import { CandidateFitService } from './candidate-fit.service';
import { CandidateFitController } from './candidate-fit.controller';

@Module({
  imports: [JobsModule], // provides JobsService (exported)
  controllers: [CandidateFitController],
  providers: [CandidateFitService],
})
export class CandidateFitModule {}
