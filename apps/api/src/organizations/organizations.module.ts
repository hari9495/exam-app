import { Module } from '@nestjs/common';
import { CryptoModule } from '@exam-platform/shared';
import { OrganizationsController } from './organizations.controller';
import { OrganizationsPublicController } from './organizations-public.controller';
import { OrganizationsService } from './organizations.service';
import { EmailModule } from '../email/email.module';

@Module({
  imports: [EmailModule, CryptoModule],
  controllers: [OrganizationsController, OrganizationsPublicController],
  providers: [OrganizationsService],
  exports: [OrganizationsService],
})
export class OrganizationsModule {}
