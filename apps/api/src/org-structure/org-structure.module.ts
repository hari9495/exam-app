import { Module } from '@nestjs/common';
import { OrgStructureController } from './org-structure.controller';
import { OrgSettingsService } from './org-settings.service';
import { OrgStructureService } from './org-structure.service';
import { OrgScopeService } from '../access/org-scope.service';
import { NotificationsModule } from '../notifications/notifications.module';
import { SettingChangeNoticesService } from './setting-change-notices.service';

// P01 organisation structure: legal entities, locations, structure masters, grade pay ranges and scoped
// settings. Exports the services for the employee core (step 2b) and later modules.
@Module({
  imports: [NotificationsModule],
  providers: [OrgStructureService, OrgSettingsService, OrgScopeService, SettingChangeNoticesService],
  controllers: [OrgStructureController],
  exports: [OrgStructureService, OrgSettingsService, OrgScopeService, SettingChangeNoticesService],
})
export class OrgStructureModule {}
