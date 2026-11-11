import { StorageModule } from '@exam-platform/shared';
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
import { InterviewDaysService } from './interview-days.service';
import { InterviewsModule } from '../interviews/interviews.module';
import { NotetakerService } from './notetaker.service';
import { AiModule } from '../ai/ai.module';
import { WhatsappModule } from '../whatsapp/whatsapp.module';
import { CandidateWhatsappModule } from '../candidate-whatsapp/candidate-whatsapp.module';
import { REDIS_CONNECTION, createRedisConnection } from '../jobs/redis-connection';
import { InterviewReminderJobs } from './interview-reminders.jobs';

// M10 recruitment batch AT5 (M10-BUILD-DESIGN §8, §9): the pipeline board, interviews and scorecards.
@Module({
  imports: [StorageModule, AuthModule, PipelineModule, InvitationsModule, CandidateEmailsModule, EmailModule, ApprovalsModule, InterviewsModule, AiModule, WhatsappModule, CandidateWhatsappModule],
  controllers: [InterviewingController],
  providers: [HiringBoardService, ScorecardTemplatesService, ScorecardsService, HiringHomeService, InterviewDaysService, NotetakerService, { provide: REDIS_CONNECTION, useFactory: createRedisConnection }, InterviewReminderJobs],
  exports: [HiringBoardService, ScorecardsService, HiringHomeService],
})
export class InterviewingModule {}
