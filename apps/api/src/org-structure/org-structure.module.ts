import { Module } from '@nestjs/common';
import { OrgStructureController } from './org-structure.controller';
import { OrgSettingsService } from './org-settings.service';
import { OrgStructureService } from './org-structure.service';

// P01 organisation structure: legal entities, locations, structure masters, grade pay ranges and scoped
// settings. Exports the services for the employee core (step 2b) and later modules.
@Module({
  providers: [OrgStructureService, OrgSettingsService],
  controllers: [OrgStructureController],
  exports: [OrgStructureService, OrgSettingsService],
})
export class OrgStructureModule {}
