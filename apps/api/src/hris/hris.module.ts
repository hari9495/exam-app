import { Module } from '@nestjs/common';
import { CryptoModule } from '@exam-platform/shared';
import { REDIS_CONNECTION, createRedisConnection } from '../jobs/redis-connection';
import { HRIS_EXPORTS_QUEUE, createHrisExportsQueue } from './hris-exports.queue';
import { HrisExportService } from './hris-export.service';
import { HrisExportWorkerService } from './hris-export.worker.service';

// Dedicated HRIS/ATS export module: on candidate hire, push a structured employee record to the
// org's configured HRIS endpoint. Own queue + worker + delivery-history table (see schema), reusing
// the shared crypto (auth header) and the integrations SSRF guard. Inert until an org configures it.
@Module({
  imports: [CryptoModule],
  providers: [
    { provide: REDIS_CONNECTION, useFactory: createRedisConnection },
    { provide: HRIS_EXPORTS_QUEUE, useFactory: createHrisExportsQueue, inject: [REDIS_CONNECTION] },
    HrisExportService,
    HrisExportWorkerService,
  ],
  exports: [HrisExportService],
})
export class HrisModule {}
