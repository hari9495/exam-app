import { Module } from '@nestjs/common';
import { FieldPermissionsConfigController } from './field-permissions-config.controller';
import { FieldPermissionsService } from './field-permissions.service';

@Module({
  controllers: [FieldPermissionsConfigController],
  providers: [FieldPermissionsService],
  exports: [FieldPermissionsService],
})
export class FieldPermissionsModule {}
