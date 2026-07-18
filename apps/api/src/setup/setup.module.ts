import { Module } from '@nestjs/common';
import { AuditModule } from '@exam-platform/shared';
import { SetupService } from './setup.service';
import { SetupController } from './setup.controller';

@Module({
  imports: [AuditModule],
  controllers: [SetupController],
  providers: [SetupService],
})
export class SetupModule {}
