import { Module } from '@nestjs/common';
import { CryptoModule, StorageModule } from '@exam-platform/shared';
import { OrganizationsController } from './organizations.controller';
import { OrganizationsPublicController } from './organizations-public.controller';
import { OrganizationsService } from './organizations.service';
import { OrgSenderAddressesController } from './org-sender-addresses.controller';
import { OrgSenderAddressesService } from './org-sender-addresses.service';
import { EmailModule } from '../email/email.module';

@Module({
  imports: [EmailModule, CryptoModule, StorageModule],
  controllers: [OrganizationsController, OrganizationsPublicController, OrgSenderAddressesController],
  providers: [OrganizationsService, OrgSenderAddressesService],
  exports: [OrganizationsService],
})
export class OrganizationsModule {}
