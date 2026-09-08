import { Module } from '@nestjs/common';
import { StorageModule } from '@exam-platform/shared';
import { AgencySubmissionsController } from './agency-submissions.controller';
import { AgencySubmissionsService } from './agency-submissions.service';

@Module({
  // PrismaService/TenantPrismaService/AuditService come from the @Global() PrismaModule/AuditModule
  // (already imported in AppModule); only BlobStorageService (for resumeUrl signing) needs
  // importing here.
  imports: [StorageModule],
  controllers: [AgencySubmissionsController],
  providers: [AgencySubmissionsService],
})
export class AgencySubmissionsModule {}
