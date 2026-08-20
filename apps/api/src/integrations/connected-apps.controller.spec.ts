import { CanActivate, ExecutionContext } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ConnectedAppsController } from './connected-apps.controller';
import { ConnectedAppsService } from './connected-apps.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../rbac/permissions.guard';

class MockGuard implements CanActivate {
  canActivate(_context: ExecutionContext): boolean {
    return true;
  }
}

describe('ConnectedAppsController', () => {
  let controller: ConnectedAppsController;
  let service: {
    list: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
    remove: jest.Mock;
    test: jest.Mock;
    deliveries: jest.Mock;
  };
  const tenant = { organizationId: 'org-1', isSuperAdmin: false } as any;

  beforeEach(async () => {
    service = {
      list: jest.fn().mockResolvedValue([]),
      create: jest.fn().mockResolvedValue({ id: 'i1' }),
      update: jest.fn().mockResolvedValue({ id: 'i1' }),
      remove: jest.fn().mockResolvedValue({ ok: true }),
      test: jest.fn().mockResolvedValue({ queued: true }),
      deliveries: jest.fn().mockResolvedValue([]),
    };
    const moduleRef = await Test.createTestingModule({
      controllers: [ConnectedAppsController],
      providers: [{ provide: ConnectedAppsService, useValue: service }],
    })
      .overrideGuard(JwtAuthGuard)
      .useClass(MockGuard)
      .overrideGuard(PermissionsGuard)
      .useClass(MockGuard)
      .compile();
    controller = moduleRef.get(ConnectedAppsController);
  });

  it('list passes the tenant through', async () => {
    await controller.list(tenant);
    expect(service.list).toHaveBeenCalledWith(tenant);
  });

  it('create passes tenant, actor userId, and dto through', async () => {
    const dto = { type: 'slack', label: '#rec', targetUrl: 'https://hooks.slack.com/x', events: ['attempt.settled'] } as any;
    await controller.create(tenant, 'user-1', dto);
    expect(service.create).toHaveBeenCalledWith(tenant, 'user-1', dto);
  });

  it('update passes tenant, actor userId, id, and dto through', async () => {
    const dto = { label: 'renamed' } as any;
    await controller.update(tenant, 'user-1', 'i1', dto);
    expect(service.update).toHaveBeenCalledWith(tenant, 'user-1', 'i1', dto);
  });

  it('remove passes tenant, actor userId, and id through', async () => {
    const result = await controller.remove(tenant, 'user-1', 'i1');
    expect(service.remove).toHaveBeenCalledWith(tenant, 'user-1', 'i1');
    expect(result).toEqual({ ok: true });
  });

  it('test passes tenant and id through, returns queued', async () => {
    const result = await controller.test(tenant, 'i1');
    expect(service.test).toHaveBeenCalledWith(tenant, 'i1');
    expect(result).toEqual({ queued: true });
  });

  it('deliveries passes tenant and id through', async () => {
    await controller.deliveries(tenant, 'i1');
    expect(service.deliveries).toHaveBeenCalledWith(tenant, 'i1');
  });
});
