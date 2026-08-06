import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { AuditModule, StorageModule } from '@exam-platform/shared';
import { EmailModule } from '../email/email.module';

@Module({
  imports: [JwtModule.register({}), AuditModule, EmailModule, StorageModule],
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
