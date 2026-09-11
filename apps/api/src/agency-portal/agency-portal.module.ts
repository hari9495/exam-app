import { Module } from '@nestjs/common';
import { StorageModule } from '@exam-platform/shared';
import { AgencyPortalController } from './agency-portal.controller';
import { AgencyPortalService } from './agency-portal.service';
import { PublicApplicationsThrottlerGuard } from '../public-applications/public-applications.throttler.guard';

@Module({
  // PrismaService/TenantPrismaService come from the @Global() PrismaModule (already imported in
  // AppModule), same as PublicApplicationsModule -- only the non-global deps need importing here.
  // PublicApplicationsThrottlerGuard is reused (not re-implemented) but still needs registering
  // as a provider in THIS module for Nest to resolve its own DI deps (ThrottlerStorage etc.),
  // same as PublicApplicationsModule does for itself.
  imports: [StorageModule],
  controllers: [AgencyPortalController],
  providers: [AgencyPortalService, PublicApplicationsThrottlerGuard],
})
export class AgencyPortalModule {}
