import { CanActivate, ExecutionContext } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PermissionProfilesController } from './permission-profiles.controller';
import { PermissionProfilesService } from './permission-profiles.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { PERMISSIONS_KEY } from '../rbac/permissions.decorator';

class MockGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    return true;
  }
}

describe('PermissionProfilesController', () => {
  let controller: PermissionProfilesController;
  let service: {
    list: jest.Mock;
    assignablePermissions: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
    remove: jest.Mock;
  };
  const tenant = { organizationId: 'org-1', isSuperAdmin: false } as any;

  beforeEach(async () => {
    service = {
      list: jest.fn().mockResolvedValue([{ id: 'p1' }]),
      assignablePermissions: jest.fn().mockResolvedValue([{ key: 'pipeline:manage', description: 'Manage pipeline' }]),
      create: jest.fn().mockResolvedValue({ id: 'p1' }),
      update: jest.fn().mockResolvedValue({ id: 'p1' }),
      remove: jest.fn().mockResolvedValue({ success: true }),
    };
    const moduleRef = await Test.createTestingModule({
      controllers: [PermissionProfilesController],
      providers: [{ provide: PermissionProfilesService, useValue: service }],
    })
      .overrideGuard(JwtAuthGuard)
      .useClass(MockGuard)
      .overrideGuard(PermissionsGuard)
      .useClass(MockGuard)
      .compile();
    controller = moduleRef.get(PermissionProfilesController);
  });

  it('GET /organizations/permission-profiles delegates to list', async () => {
    const result = await controller.list(tenant);
    expect(service.list).toHaveBeenCalledWith(tenant);
    expect(result).toEqual([{ id: 'p1' }]);
  });

  it('GET /organizations/permission-profiles/assignable-permissions delegates to assignablePermissions', async () => {
    const result = await controller.assignablePermissions();
    expect(service.assignablePermissions).toHaveBeenCalled();
    expect(result).toEqual([{ key: 'pipeline:manage', description: 'Manage pipeline' }]);
  });

  it('POST /organizations/permission-profiles delegates to create', async () => {
    const dto = { name: 'Recruiter Lite', permissions: ['pipeline:manage'] };
    const result = await controller.create(tenant, 'user-1', dto);
    expect(service.create).toHaveBeenCalledWith(tenant, 'user-1', dto);
    expect(result).toEqual({ id: 'p1' });
  });

  it('PATCH /organizations/permission-profiles/:id delegates to update', async () => {
    const dto = { name: 'Renamed' };
    const result = await controller.update(tenant, 'user-1', 'p1', dto);
    expect(service.update).toHaveBeenCalledWith(tenant, 'user-1', 'p1', dto);
    expect(result).toEqual({ id: 'p1' });
  });

  it('DELETE /organizations/permission-profiles/:id delegates to remove', async () => {
    const result = await controller.remove(tenant, 'user-1', 'p1');
    expect(service.remove).toHaveBeenCalledWith(tenant, 'user-1', 'p1');
    expect(result).toEqual({ success: true });
  });

  it.each([
    ['list', 'list'],
    ['assignablePermissions', 'assignablePermissions'],
    ['create', 'create'],
    ['update', 'update'],
    ['remove', 'remove'],
  ])('gates %s behind org:manage_users', (_label, method) => {
    const permissions = Reflect.getMetadata(PERMISSIONS_KEY, (PermissionProfilesController.prototype as any)[method]);
    expect(permissions).toEqual(['org:manage_users']);
  });
});
