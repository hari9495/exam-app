import { Module } from '@nestjs/common';
import { JobBoardsController } from './job-boards.controller';
import { JobBoardsService } from './job-boards.service';

@Module({
  controllers: [JobBoardsController],
  providers: [JobBoardsService],
  exports: [JobBoardsService],
})
export class JobBoardsModule {}
