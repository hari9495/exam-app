import { Global, Module } from '@nestjs/common';
import { PermissionsGuard } from './permissions.guard';
import { RbacController } from './rbac.controller';
import { RbacService } from './rbac.service';

@Global()
@Module({
  controllers: [RbacController],
  providers: [PermissionsGuard, RbacService],
  exports: [PermissionsGuard],
})
export class RbacModule {}
