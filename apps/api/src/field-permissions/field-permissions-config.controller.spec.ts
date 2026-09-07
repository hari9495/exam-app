import { CanActivate, ExecutionContext } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { FieldPermissionsConfigController } from './field-permissions-config.controller';
import { FieldPermissionsService } from './field-permissions.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { PERMISSIONS_KEY } from '../rbac/permissions.decorator';

class MockGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    return true;
  }
}

describe('FieldPermissionsConfigController', () => {
  let controller: FieldPermissionsConfigController;
  let service: { getConfig: jest.Mock; setConfig: jest.Mock };
  const tenant = { organizationId: 'org-1', isSuperAdmin: false } as any;

  beforeEach(async () => {
    service = {
      getConfig: jest.fn().mockResolvedValue({ candidate: { recruiter: ['email'] } }),
      setConfig: jest.fn().mockResolvedValue({ candidate: { recruiter: ['email'] } }),
    };
    const moduleRef = await Test.createTestingModule({
      controllers: [FieldPermissionsConfigController],
      providers: [{ provide: FieldPermissionsService, useValue: service }],
    })
      .overrideGuard(JwtAuthGuard)
      .useClass(MockGuard)
      .overrideGuard(PermissionsGuard)
      .useClass(MockGuard)
      .compile();
    controller = moduleRef.get(FieldPermissionsConfigController);
  });

  it('GET /organizations/field-permissions delegates to getConfig', async () => {
    const result = await controller.getConfig(tenant);
    expect(service.getConfig).toHaveBeenCalledWith(tenant);
    expect(result).toEqual({ candidate: { recruiter: ['email'] } });
  });

  it('PUT /organizations/field-permissions delegates to setConfig', async () => {
    const dto = { config: { candidate: { recruiter: ['email'] } } };
    const result = await controller.setConfig(tenant, 'user-1', dto);
    expect(service.setConfig).toHaveBeenCalledWith(tenant, 'user-1', dto.config);
    expect(result).toEqual({ candidate: { recruiter: ['email'] } });
  });

  it('gates GET behind org:manage_settings', () => {
    const permissions = Reflect.getMetadata(PERMISSIONS_KEY, FieldPermissionsConfigController.prototype.getConfig);
    expect(permissions).toEqual(['org:manage_settings']);
  });

  it('gates PUT behind org:manage_settings', () => {
    const permissions = Reflect.getMetadata(PERMISSIONS_KEY, FieldPermissionsConfigController.prototype.setConfig);
    expect(permissions).toEqual(['org:manage_settings']);
  });
});
