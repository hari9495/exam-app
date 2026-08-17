import { Module } from '@nestjs/common';
import { StorageModule } from '@exam-platform/shared';
import { JobsModule } from '../jobs/jobs.module';
import { PublicApplicationsController } from './public-applications.controller';
import { PublicApplicationsService } from './public-applications.service';
import { PublicApplicationsThrottlerGuard } from './public-applications.throttler.guard';

@Module({
  // PrismaService/TenantPrismaService come from the @Global() PrismaModule (already imported
  // in AppModule), same as WalkInModule -- only the non-global deps need importing here.
  imports: [StorageModule, JobsModule],
  controllers: [PublicApplicationsController],
  providers: [PublicApplicationsService, PublicApplicationsThrottlerGuard],
})
export class PublicApplicationsModule {}
