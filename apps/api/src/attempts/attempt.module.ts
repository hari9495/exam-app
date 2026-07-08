import { Module } from '@nestjs/common';
import { GradingModule } from '../grading/grading.module';
import { AttemptController } from './attempt.controller';
import { AttemptService } from './attempt.service';
import { AttemptsController } from './attempts.controller';
import { AttemptsAdminService } from './attempts-admin.service';

@Module({
  imports: [GradingModule],
  controllers: [AttemptController, AttemptsController],
  providers: [AttemptService, AttemptsAdminService],
})
export class AttemptModule {}
