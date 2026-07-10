import { Module } from '@nestjs/common';
import { ExamsModule } from '../exams/exams.module';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';

@Module({
  imports: [ExamsModule],
  controllers: [ReportsController],
  providers: [ReportsService],
})
export class ReportsModule {}
