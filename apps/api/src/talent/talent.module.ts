import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { CandidatesModule } from '../candidates/candidates.module';
import { CandidateSearchModule } from '../candidate-search/candidate-search.module';
import { EmailModule } from '../email/email.module';
import { TalentController } from './talent.controller';
import { CandidateMergeService } from './merge.service';
import { TalentPoolsService } from './pools.service';
import { CandidateRetentionService } from './retention.service';
import { CandidateProfileService } from './candidate-profile.service';

// M10 recruitment batch AT4 (M10-BUILD-DESIGN §7, §13): candidates — duplicates and merge, pools, retention.
@Module({
  imports: [AuthModule, CandidatesModule, CandidateSearchModule, EmailModule],
  controllers: [TalentController],
  providers: [CandidateMergeService, TalentPoolsService, CandidateRetentionService, CandidateProfileService],
  exports: [CandidateRetentionService],
})
export class TalentModule {}
