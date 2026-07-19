import { Module } from '@nestjs/common';
import { ApiInternalClient } from './api-internal.client';

@Module({
  providers: [ApiInternalClient],
  exports: [ApiInternalClient],
})
export class ApiInternalClientModule {}
