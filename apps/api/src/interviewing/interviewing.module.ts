import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PipelineModule } from '../pipeline/pipeline.module';
import { InvitationsModule } from '../invitations/invitations.module';
import { CandidateEmailsModule } from '../candidate-emails/candidate-emails.module';
import { EmailModule } from '../email/email.module';
import { ApprovalsModule } from '../approvals/approvals.module';
import { InterviewingController } from './interviewing.controller';
import { HiringBoardService } from './hiring-board.service';
import { ScorecardTemplatesService } from './scorecard-templates.service';
import { ScorecardsService } from './scorecards.service';
import { HiringHomeService } from './hiring-home.service';

// M10 recruitment batch AT5 (M10-BUILD-DESIGN §8, §9): the pipeline board, interviews and scorecards.
@Module({
  imports: [AuthModule, PipelineModule, InvitationsModule, CandidateEmailsModule, EmailModule, ApprovalsModule],
  controllers: [InterviewingController],
  providers: [HiringBoardService, ScorecardTemplatesService, ScorecardsService, HiringHomeService],
  exports: [HiringBoardService, ScorecardsService, HiringHomeService],
})
export class InterviewingModule {}
