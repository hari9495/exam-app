import { Module } from '@nestjs/common';
import { ExamsModule } from '../exams/exams.module';
import { PublicApiService } from './public-api.service';
import { PublicCandidatesController } from './public-candidates.controller';
import { PublicExamsController } from './public-exams.controller';
import { PublicInvitationsController } from './public-invitations.controller';

@Module({
  imports: [ExamsModule],
  controllers: [PublicCandidatesController, PublicExamsController, PublicInvitationsController],
  providers: [PublicApiService],
  exports: [PublicApiService],
})
export class PublicApiModule {}
