import { Module } from '@nestjs/common';
import { GradingModule } from '../grading/grading.module';
import { AttemptController } from './attempt.controller';
import { AttemptService } from './attempt.service';

@Module({
  imports: [GradingModule],
  controllers: [AttemptController],
  providers: [AttemptService],
})
export class AttemptModule {}
