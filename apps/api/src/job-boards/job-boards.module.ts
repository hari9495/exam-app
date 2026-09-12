import { Module } from '@nestjs/common';
import { CryptoModule } from '@exam-platform/shared';
import { JobBoardsController } from './job-boards.controller';
import { JobBoardsService } from './job-boards.service';
import { JobBoardPosterService } from './job-board-poster.service';

@Module({
  // CryptoModule provides OrgSecretsCryptoService for encrypting per-board API creds + decrypting
  // them when posting. JobBoardPosterService is exported so PipelineModule can push jobs on the
  // job lifecycle (create/open/close/board-membership change).
  imports: [CryptoModule],
  controllers: [JobBoardsController],
  providers: [JobBoardsService, JobBoardPosterService],
  exports: [JobBoardsService, JobBoardPosterService],
})
export class JobBoardsModule {}
