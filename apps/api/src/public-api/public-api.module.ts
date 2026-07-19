import { Module } from '@nestjs/common';
import { PublicApiService } from './public-api.service';
import { PublicCandidatesController } from './public-candidates.controller';
import { PublicExamsController } from './public-exams.controller';

@Module({
  controllers: [PublicCandidatesController, PublicExamsController],
  providers: [PublicApiService],
  exports: [PublicApiService],
})
export class PublicApiModule {}
