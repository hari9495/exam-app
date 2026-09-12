import { Module } from '@nestjs/common';
import { CryptoModule } from '@exam-platform/shared';
import { CalendarSyncController } from './calendar-sync.controller';
import { CalendarSyncService } from './calendar-sync.service';

@Module({
  // PrismaService/TenantPrismaService come from the @Global() PrismaModule (imported in AppModule).
  // CryptoModule provides OrgSecretsCryptoService for encrypting the stored OAuth tokens.
  imports: [CryptoModule],
  controllers: [CalendarSyncController],
  providers: [CalendarSyncService],
  exports: [CalendarSyncService], // InterviewsModule injects this to push/delete events + read busy times
})
export class CalendarSyncModule {}
