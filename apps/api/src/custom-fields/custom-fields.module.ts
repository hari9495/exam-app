import { Module } from '@nestjs/common';
import { CustomFieldsConfigController } from './custom-fields-config.controller';
import { CustomFieldsService } from './custom-fields.service';

@Module({
  controllers: [CustomFieldsConfigController],
  providers: [CustomFieldsService],
  exports: [CustomFieldsService],
})
export class CustomFieldsModule {}
