import { CanActivate, ExecutionContext } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { RecordVisibilityConfigController } from './record-visibility-config.controller';
import { RecordVisibilityService } from './record-visibility.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { PERMISSIONS_KEY } from '../rbac/permissions.decorator';

class MockGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    return true;
  }
}

describe('RecordVisibilityConfigController', () => {
  let controller: RecordVisibilityConfigController;
  let service: { getRecordVisibility: jest.Mock; setRecordVisibility: jest.Mock };
  const tenant = { organizationId: 'org-1', isSuperAdmin: false, userId: 'user-1' } as any;

  beforeEach(async () => {
    service = {
      getRecordVisibility: jest.fn().mockResolvedValue({ enabled: true }),
      setRecordVisibility: jest.fn().mockResolvedValue({ enabled: false }),
    };
    const moduleRef = await Test.createTestingModule({
      controllers: [RecordVisibilityConfigController],
      providers: [{ provide: RecordVisibilityService, useValue: service }],
    })
      .overrideGuard(JwtAuthGuard)
      .useClass(MockGuard)
      .overrideGuard(PermissionsGuard)
      .useClass(MockGuard)
      .compile();
    controller = moduleRef.get(RecordVisibilityConfigController);
  });

  it('GET /organizations/record-visibility delegates to getRecordVisibility', async () => {
    const result = await controller.getConfig(tenant);
    expect(service.getRecordVisibility).toHaveBeenCalledWith(tenant);
    expect(result).toEqual({ enabled: true });
  });

  it('PUT /organizations/record-visibility delegates to setRecordVisibility', async () => {
    const dto = { enabled: false };
    const result = await controller.setConfig(tenant, dto);
    expect(service.setRecordVisibility).toHaveBeenCalledWith(tenant, dto.enabled);
    expect(result).toEqual({ enabled: false });
  });

  it('gates GET behind org:manage_settings', () => {
    const permissions = Reflect.getMetadata(PERMISSIONS_KEY, RecordVisibilityConfigController.prototype.getConfig);
    expect(permissions).toEqual(['org:manage_settings']);
  });

  it('gates PUT behind org:manage_settings', () => {
    const permissions = Reflect.getMetadata(PERMISSIONS_KEY, RecordVisibilityConfigController.prototype.setConfig);
    expect(permissions).toEqual(['org:manage_settings']);
  });
});
