import { CanActivate, ExecutionContext, BadRequestException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Reflector } from '@nestjs/core';
import { AgencySubmissionsController } from './agency-submissions.controller';
import { AgencySubmissionsService } from './agency-submissions.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { PERMISSIONS_KEY } from '../rbac/permissions.decorator';

class MockGuard implements CanActivate {
  canActivate(_context: ExecutionContext): boolean {
    return true;
  }
}

describe('AgencySubmissionsController', () => {
  let controller: AgencySubmissionsController;
  let service: { list: jest.Mock; accept: jest.Mock; reject: jest.Mock };
  const tenant = { organizationId: 'org-1', isSuperAdmin: false } as any;

  beforeEach(async () => {
    service = {
      list: jest.fn().mockResolvedValue([{ id: 'sub-1' }]),
      accept: jest.fn().mockResolvedValue({ id: 'sub-1', status: 'accepted' }),
      reject: jest.fn().mockResolvedValue({ id: 'sub-1', status: 'rejected' }),
    };
    const moduleRef = await Test.createTestingModule({
      controllers: [AgencySubmissionsController],
      providers: [{ provide: AgencySubmissionsService, useValue: service }],
    })
      .overrideGuard(JwtAuthGuard)
      .useClass(MockGuard)
      .overrideGuard(PermissionsGuard)
      .useClass(MockGuard)
      .compile();
    controller = moduleRef.get(AgencySubmissionsController);
  });

  it('list defaults to status=pending and delegates to the service', async () => {
    const result = await controller.list(tenant, undefined);
    expect(service.list).toHaveBeenCalledWith(tenant, 'pending');
    expect(result).toEqual([{ id: 'sub-1' }]);
  });

  it('list passes through a valid explicit status', async () => {
    await controller.list(tenant, 'accepted');
    expect(service.list).toHaveBeenCalledWith(tenant, 'accepted');
  });

  it('list rejects an invalid status', async () => {
    expect(() => controller.list(tenant, 'bogus')).toThrow(BadRequestException);
    expect(service.list).not.toHaveBeenCalled();
  });

  it('accept delegates to the service with tenant, id, and the authed user id', async () => {
    const result = await controller.accept(tenant, 'user-1', 'sub-1');
    expect(service.accept).toHaveBeenCalledWith(tenant, 'sub-1', 'user-1');
    expect(result).toEqual({ id: 'sub-1', status: 'accepted' });
  });

  it('reject delegates to the service with tenant, id, and the authed user id', async () => {
    const result = await controller.reject(tenant, 'user-1', 'sub-1');
    expect(service.reject).toHaveBeenCalledWith(tenant, 'sub-1', 'user-1');
    expect(result).toEqual({ id: 'sub-1', status: 'rejected' });
  });

  it('gates every method behind pipeline:manage', () => {
    const reflector = new Reflector();
    expect(reflector.get(PERMISSIONS_KEY, AgencySubmissionsController.prototype.list)).toEqual(['pipeline:manage']);
    expect(reflector.get(PERMISSIONS_KEY, AgencySubmissionsController.prototype.accept)).toEqual(['pipeline:manage']);
    expect(reflector.get(PERMISSIONS_KEY, AgencySubmissionsController.prototype.reject)).toEqual(['pipeline:manage']);
  });
});
