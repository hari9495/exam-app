import { Global, Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PlatformModule } from '../platform/platform.module';
import { StatutoryConsoleController } from './statutory.controller';
import { StatutoryRulesService } from './statutory.service';

// P07 rule store: the published packs for every engine, and the console's draft → publish.
@Global()
@Module({
  imports: [AuthModule, PlatformModule],
  controllers: [StatutoryConsoleController],
  providers: [StatutoryRulesService],
  exports: [StatutoryRulesService],
})
export class StatutoryModule {}
