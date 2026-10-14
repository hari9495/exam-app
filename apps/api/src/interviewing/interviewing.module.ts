import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PipelineModule } from '../pipeline/pipeline.module';
import { InvitationsModule } from '../invitations/invitations.module';
import { CandidateEmailsModule } from '../candidate-emails/candidate-emails.module';
import { EmailModule } from '../email/email.module';
import { InterviewingController } from './interviewing.controller';
import { HiringBoardService } from './hiring-board.service';
import { ScorecardTemplatesService } from './scorecard-templates.service';
import { ScorecardsService } from './scorecards.service';

// M10 recruitment batch AT5 (M10-BUILD-DESIGN §8, §9): the pipeline board, interviews and scorecards.
@Module({
  imports: [AuthModule, PipelineModule, InvitationsModule, CandidateEmailsModule, EmailModule],
  controllers: [InterviewingController],
  providers: [HiringBoardService, ScorecardTemplatesService, ScorecardsService],
  exports: [HiringBoardService, ScorecardsService],
})
export class InterviewingModule {}
