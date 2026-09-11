import { Module } from '@nestjs/common';
import { CryptoModule, StorageModule } from '@exam-platform/shared';
import { OrganizationsController } from './organizations.controller';
import { OrganizationsPublicController } from './organizations-public.controller';
import { OrganizationsService } from './organizations.service';
import { RecordVisibilityConfigController } from './record-visibility-config.controller';
import { RecordVisibilityService } from './record-visibility.service';
import { OrgSenderAddressesController } from './org-sender-addresses.controller';
import { OrgSenderAddressesService } from './org-sender-addresses.service';
import { EmailModule } from '../email/email.module';
import { ApiUsageModule } from '../api-usage/api-usage.module';

@Module({
  imports: [EmailModule, CryptoModule, StorageModule, ApiUsageModule],
  controllers: [OrganizationsController, OrganizationsPublicController, RecordVisibilityConfigController, OrgSenderAddressesController],
  providers: [OrganizationsService, RecordVisibilityService, OrgSenderAddressesService],
  exports: [OrganizationsService],
})
export class OrganizationsModule {}
