import { BadRequestException, CanActivate, ExecutionContext } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Reflector } from '@nestjs/core';
import { RecycleBinController } from './recycle-bin.controller';
import { RecycleBinService } from './recycle-bin.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { PERMISSIONS_KEY } from '../rbac/permissions.decorator';

class MockGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    return true;
  }
}

describe('RecycleBinController', () => {
  let controller: RecycleBinController;
  let service: { list: jest.Mock; restore: jest.Mock; purge: jest.Mock };
  const tenant = { organizationId: 'org-1', isSuperAdmin: false } as any;

  beforeEach(async () => {
    service = {
      list: jest.fn().mockResolvedValue([{ entityType: 'candidate', id: 'c1', label: 'Ann', deletedAt: new Date(), deletedByUserId: 'u1' }]),
      restore: jest.fn().mockResolvedValue({ entityType: 'candidate', id: 'c1', label: 'Ann', deletedAt: null, deletedByUserId: null }),
      purge: jest.fn().mockResolvedValue(undefined),
    };
    const moduleRef = await Test.createTestingModule({
      controllers: [RecycleBinController],
      providers: [{ provide: RecycleBinService, useValue: service }],
    })
      .overrideGuard(JwtAuthGuard)
      .useClass(MockGuard)
      .overrideGuard(PermissionsGuard)
      .useClass(MockGuard)
      .compile();
    controller = moduleRef.get(RecycleBinController);
  });

  it('GET / delegates to service.list with tenant context', async () => {
    const res = await controller.list(tenant);
    expect(service.list).toHaveBeenCalledWith(tenant);
    expect(res).toEqual([expect.objectContaining({ id: 'c1' })]);
  });

  it('POST /:entityType/:id/restore delegates to service.restore with parsed params', async () => {
    const res = await controller.restore(tenant, 'candidate', 'c1');
    expect(service.restore).toHaveBeenCalledWith(tenant, 'candidate', 'c1');
    expect(res).toEqual(expect.objectContaining({ id: 'c1', deletedAt: null }));
  });

  it('POST restore rejects an unknown entityType with BadRequestException and never calls the service', () => {
    expect(() => controller.restore(tenant, 'widget', 'x1')).toThrow(BadRequestException);
    expect(service.restore).not.toHaveBeenCalled();
  });

  it('DELETE /:entityType/:id delegates to service.purge with parsed params', async () => {
    await controller.purge(tenant, 'job', 'j1');
    expect(service.purge).toHaveBeenCalledWith(tenant, 'job', 'j1');
  });

  it('DELETE purge rejects an unknown entityType with BadRequestException and never calls the service', () => {
    expect(() => controller.purge(tenant, 'widget', 'x1')).toThrow(BadRequestException);
    expect(service.purge).not.toHaveBeenCalled();
  });

  describe('permissions metadata', () => {
    const reflector = new Reflector();

    // Method-level, not class-level: PermissionsGuard reads metadata off context.getHandler()
    // only, so a class-level @RequirePermissions would silently never be enforced.
    it('all three routes require org:manage_settings', () => {
      expect(reflector.get(PERMISSIONS_KEY, RecycleBinController.prototype.list)).toEqual(['org:manage_settings']);
      expect(reflector.get(PERMISSIONS_KEY, RecycleBinController.prototype.restore)).toEqual(['org:manage_settings']);
      expect(reflector.get(PERMISSIONS_KEY, RecycleBinController.prototype.purge)).toEqual(['org:manage_settings']);
    });
  });
});
