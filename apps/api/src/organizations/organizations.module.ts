import { Module } from '@nestjs/common';
import { OrganizationsController } from './organizations.controller';
import { OrganizationsPublicController } from './organizations-public.controller';
import { OrganizationsService } from './organizations.service';

@Module({
  controllers: [OrganizationsController, OrganizationsPublicController],
  providers: [OrganizationsService],
  exports: [OrganizationsService],
})
export class OrganizationsModule {}
