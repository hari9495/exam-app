import { Module } from '@nestjs/common';
import { StorageModule } from '@exam-platform/shared';
import { JobsModule } from '../jobs/jobs.module';
import { AgencySubmissionsController } from './agency-submissions.controller';
import { AgencySubmissionsService } from './agency-submissions.service';

@Module({
  // PrismaService/TenantPrismaService/AuditService come from the @Global() PrismaModule/AuditModule
  // (already imported in AppModule); BlobStorageService (resumeUrl signing) and JobsService
  // (resume_parse enqueue on accept) need importing here.
  imports: [StorageModule, JobsModule],
  controllers: [AgencySubmissionsController],
  providers: [AgencySubmissionsService],
})
export class AgencySubmissionsModule {}
