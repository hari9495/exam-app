import { Module } from '@nestjs/common';
import { ApiUsageModule } from '../api-usage/api-usage.module';
import { ExamsModule } from '../exams/exams.module';
import { PublicApiService } from './public-api.service';
import { PublicCandidatesController } from './public-candidates.controller';
import { PublicExamsController } from './public-exams.controller';
import { PublicInvitationsController } from './public-invitations.controller';

@Module({
  imports: [ExamsModule, ApiUsageModule],
  controllers: [PublicCandidatesController, PublicExamsController, PublicInvitationsController],
  providers: [PublicApiService],
  exports: [PublicApiService],
})
export class PublicApiModule {}
