import { Module } from '@nestjs/common';
import { AuditModule, CryptoModule } from '@exam-platform/shared';
import { REDIS_CONNECTION, createRedisConnection } from '../jobs/redis-connection';
import { AutomationService } from './automation.service';

// P19 rules engine (shared platform engine). Modules register their record types with AutomationService.
@Module({
  imports: [AuditModule, CryptoModule],
  providers: [{ provide: REDIS_CONNECTION, useFactory: createRedisConnection }, AutomationService],
  exports: [AutomationService],
})
export class RulesEngineModule {}
