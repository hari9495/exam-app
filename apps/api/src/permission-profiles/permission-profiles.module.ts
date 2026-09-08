import { Module } from '@nestjs/common';
import { PermissionProfilesController } from './permission-profiles.controller';
import { PermissionProfilesService } from './permission-profiles.service';

@Module({
  controllers: [PermissionProfilesController],
  providers: [PermissionProfilesService],
  exports: [PermissionProfilesService],
})
export class PermissionProfilesModule {}
