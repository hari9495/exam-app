import { Module } from '@nestjs/common';
import { AuditModule } from '@exam-platform/shared';
import { SetupService } from './setup.service';
import { SetupController } from './setup.controller';
import { PasswordPolicyModule } from '../auth/password-policy.module';

@Module({
  imports: [AuditModule, PasswordPolicyModule],
  controllers: [SetupController],
  providers: [SetupService],
})
export class SetupModule {}
