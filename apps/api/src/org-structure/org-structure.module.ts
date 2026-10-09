import { Module } from '@nestjs/common';
import { OrgStructureController } from './org-structure.controller';
import { OrgSettingsService } from './org-settings.service';
import { OrgStructureService } from './org-structure.service';
import { OrgScopeService } from '../access/org-scope.service';

// P01 organisation structure: legal entities, locations, structure masters, grade pay ranges and scoped
// settings. Exports the services for the employee core (step 2b) and later modules.
@Module({
  providers: [OrgStructureService, OrgSettingsService, OrgScopeService],
  controllers: [OrgStructureController],
  exports: [OrgStructureService, OrgSettingsService, OrgScopeService],
})
export class OrgStructureModule {}
