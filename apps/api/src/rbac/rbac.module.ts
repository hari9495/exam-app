import { Global, Module } from '@nestjs/common';
import { PermissionsGuard } from './permissions.guard';
import { RbacController } from './rbac.controller';
import { RbacService } from './rbac.service';
import { RolePermissionsController } from './role-permissions.controller';
import { RolePermissionsService } from './role-permissions.service';

@Global()
@Module({
  controllers: [RbacController, RolePermissionsController],
  providers: [PermissionsGuard, RbacService, RolePermissionsService],
  exports: [PermissionsGuard],
})
export class RbacModule {}
