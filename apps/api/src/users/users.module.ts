import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { AuditModule, StorageModule } from '@exam-platform/shared';
import { EmailModule } from '../email/email.module';
import { BillingModule } from '../billing/billing.module';

@Module({
  // BillingModule imported explicitly (not @Global) so UsersService can inject QuotaService --
  // same prod DI crash this pattern avoids elsewhere (see jobs.module.ts).
  imports: [JwtModule.register({}), AuditModule, EmailModule, StorageModule, BillingModule],
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
