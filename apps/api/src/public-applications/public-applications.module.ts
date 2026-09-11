import { Module } from '@nestjs/common';
import { StorageModule, CryptoModule } from '@exam-platform/shared';
import { JobsModule } from '../jobs/jobs.module';
import { BillingModule } from '../billing/billing.module';
import { PublicApplicationsController } from './public-applications.controller';
import { PublicApplicationsService } from './public-applications.service';
import { PublicApplicationsThrottlerGuard } from './public-applications.throttler.guard';

@Module({
  // PrismaService/TenantPrismaService come from the @Global() PrismaModule (already imported
  // in AppModule), same as WalkInModule -- only the non-global deps need importing here.
  // CryptoModule provides AiApiKeyResolverService; BillingModule provides QuotaService (both used
  // by the résumé-autofill parse endpoint), mirroring how JobsModule wires the résumé-parse job.
  imports: [StorageModule, JobsModule, CryptoModule, BillingModule],
  controllers: [PublicApplicationsController],
  providers: [PublicApplicationsService, PublicApplicationsThrottlerGuard],
})
export class PublicApplicationsModule {}
