import { Module } from '@nestjs/common';
import { AuditModule } from '@exam-platform/shared';
import { EmailModule } from '../email/email.module';
import { PasswordPolicyService } from './password-policy.service';

// Its own module so UsersModule / SetupModule can enforce the password floor without importing
// all of AuthModule (Redis clients, strategies).
@Module({
  imports: [AuditModule, EmailModule],
  providers: [PasswordPolicyService],
  exports: [PasswordPolicyService],
})
export class PasswordPolicyModule {}
