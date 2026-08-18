import { Module } from '@nestjs/common';
import { EmailModule } from '../email/email.module';
import { InterviewsController } from './interviews.controller';
import { InterviewsService } from './interviews.service';

@Module({
  imports: [EmailModule],
  controllers: [InterviewsController],
  providers: [InterviewsService],
  exports: [InterviewsService],
})
export class InterviewsModule {}
