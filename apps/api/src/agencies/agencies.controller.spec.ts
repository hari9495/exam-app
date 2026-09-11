import { CanActivate, ExecutionContext } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Reflector } from '@nestjs/core';
import { AgenciesController } from './agencies.controller';
import { AgenciesService } from './agencies.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { PERMISSIONS_KEY } from '../rbac/permissions.decorator';

class MockGuard implements CanActivate {
  canActivate(_context: ExecutionContext): boolean {
    return true;
  }
}

describe('AgenciesController', () => {
  let controller: AgenciesController;
  let service: { list: jest.Mock; create: jest.Mock; update: jest.Mock; remove: jest.Mock; regenerateToken: jest.Mock };
  const ctxReq = { organizationId: 'org-1', isSuperAdmin: false } as any;

  beforeEach(async () => {
    service = {
      list: jest.fn().mockResolvedValue([{ id: 'agency-1' }]),
      create: jest.fn().mockResolvedValue({ id: 'agency-2' }),
      update: jest.fn().mockResolvedValue({ id: 'agency-1' }),
      remove: jest.fn().mockResolvedValue({ id: 'agency-1' }),
      regenerateToken: jest.fn().mockResolvedValue({ portalUrl: 'https://app.example.com/agency/new-tok' }),
    };
    const moduleRef = await Test.createTestingModule({
      controllers: [AgenciesController],
      providers: [{ provide: AgenciesService, useValue: service }],
    })
      .overrideGuard(JwtAuthGuard)
      .useClass(MockGuard)
      .overrideGuard(PermissionsGuard)
      .useClass(MockGuard)
      .compile();
    controller = moduleRef.get(AgenciesController);
  });

  it('GET /agencies delegates to list', async () => {
    const res = await controller.list(ctxReq);
    expect(service.list).toHaveBeenCalledWith(ctxReq);
    expect(res).toEqual([{ id: 'agency-1' }]);
  });

  it('POST /agencies delegates to create', async () => {
    const dto = { name: 'Acme Staffing' };
    const res = await controller.create(ctxReq, 'user-1', dto as any);
    expect(service.create).toHaveBeenCalledWith(ctxReq, 'user-1', dto);
    expect(res).toEqual({ id: 'agency-2' });
  });

  it('PATCH /agencies/:id delegates to update', async () => {
    const dto = { name: 'Renamed' };
    const res = await controller.update(ctxReq, 'user-1', 'agency-1', dto as any);
    expect(service.update).toHaveBeenCalledWith(ctxReq, 'user-1', 'agency-1', dto);
    expect(res).toEqual({ id: 'agency-1' });
  });

  it('DELETE /agencies/:id delegates to remove', async () => {
    const res = await controller.remove(ctxReq, 'user-1', 'agency-1');
    expect(service.remove).toHaveBeenCalledWith(ctxReq, 'user-1', 'agency-1');
    expect(res).toEqual({ id: 'agency-1' });
  });

  it('POST /agencies/:id/regenerate-token delegates to regenerateToken', async () => {
    const res = await controller.regenerateToken(ctxReq, 'user-1', 'agency-1');
    expect(service.regenerateToken).toHaveBeenCalledWith(ctxReq, 'user-1', 'agency-1');
    expect(res).toEqual({ portalUrl: 'https://app.example.com/agency/new-tok' });
  });

  describe('permissions metadata', () => {
    const reflector = new Reflector();

    it('every route requires org:manage_settings', () => {
      expect(reflector.get(PERMISSIONS_KEY, AgenciesController.prototype.list)).toEqual(['org:manage_settings']);
      expect(reflector.get(PERMISSIONS_KEY, AgenciesController.prototype.create)).toEqual(['org:manage_settings']);
      expect(reflector.get(PERMISSIONS_KEY, AgenciesController.prototype.update)).toEqual(['org:manage_settings']);
      expect(reflector.get(PERMISSIONS_KEY, AgenciesController.prototype.remove)).toEqual(['org:manage_settings']);
      expect(reflector.get(PERMISSIONS_KEY, AgenciesController.prototype.regenerateToken)).toEqual(['org:manage_settings']);
    });
  });
});
