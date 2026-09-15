import { Module } from '@nestjs/common';
import { InternalApplicationsService } from './internal-applications.service';
import { InternalApplicationsController } from './internal-applications.controller';

// Internal-mobility self-apply. Reuses the candidate-ingestion primitives (candidate upsert +
// recomputeGlobalStage) to land a staff self-application as a pipeline entry (enteredVia='internal').
// No résumé/blob or résumé-parse queue (the applicant is a known employee), so no extra imports;
// TenantPrismaService + AuditService are globally provided.
@Module({
  controllers: [InternalApplicationsController],
  providers: [InternalApplicationsService],
})
export class InternalApplicationsModule {}
