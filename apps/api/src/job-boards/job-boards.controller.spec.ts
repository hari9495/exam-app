import { CanActivate, ExecutionContext } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Reflector } from '@nestjs/core';
import { JobBoardsController } from './job-boards.controller';
import { JobBoardsService } from './job-boards.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { PERMISSIONS_KEY } from '../rbac/permissions.decorator';

class MockGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    return true;
  }
}

describe('JobBoardsController', () => {
  let controller: JobBoardsController;
  let service: { list: jest.Mock; create: jest.Mock; update: jest.Mock; remove: jest.Mock };
  const ctxReq = { organizationId: 'org-1', isSuperAdmin: false } as any;

  beforeEach(async () => {
    service = {
      list: jest.fn().mockResolvedValue([{ id: 'board-1' }]),
      create: jest.fn().mockResolvedValue({ id: 'board-2' }),
      update: jest.fn().mockResolvedValue({ id: 'board-1' }),
      remove: jest.fn().mockResolvedValue({ id: 'board-1' }),
    };
    const moduleRef = await Test.createTestingModule({
      controllers: [JobBoardsController],
      providers: [{ provide: JobBoardsService, useValue: service }],
    })
      .overrideGuard(JwtAuthGuard)
      .useClass(MockGuard)
      .overrideGuard(PermissionsGuard)
      .useClass(MockGuard)
      .compile();
    controller = moduleRef.get(JobBoardsController);
  });

  it('GET /organizations/job-boards delegates to list', async () => {
    const res = await controller.list(ctxReq);
    expect(service.list).toHaveBeenCalledWith(ctxReq);
    expect(res).toEqual([{ id: 'board-1' }]);
  });

  it('POST /organizations/job-boards delegates to create', async () => {
    const dto = { name: 'LinkedIn' };
    const res = await controller.create(ctxReq, 'user-1', dto);
    expect(service.create).toHaveBeenCalledWith(ctxReq, 'user-1', dto);
    expect(res).toEqual({ id: 'board-2' });
  });

  it('PATCH /organizations/job-boards/:id delegates to update', async () => {
    const dto = { name: 'Renamed' };
    const res = await controller.update(ctxReq, 'user-1', 'board-1', dto);
    expect(service.update).toHaveBeenCalledWith(ctxReq, 'user-1', 'board-1', dto);
    expect(res).toEqual({ id: 'board-1' });
  });

  it('DELETE /organizations/job-boards/:id delegates to remove', async () => {
    const res = await controller.remove(ctxReq, 'user-1', 'board-1');
    expect(service.remove).toHaveBeenCalledWith(ctxReq, 'user-1', 'board-1');
    expect(res).toEqual({ id: 'board-1' });
  });

  describe('permissions metadata', () => {
    const reflector = new Reflector();

    it('every route requires org:manage_settings', () => {
      expect(reflector.get(PERMISSIONS_KEY, JobBoardsController.prototype.list)).toEqual(['org:manage_settings']);
      expect(reflector.get(PERMISSIONS_KEY, JobBoardsController.prototype.create)).toEqual(['org:manage_settings']);
      expect(reflector.get(PERMISSIONS_KEY, JobBoardsController.prototype.update)).toEqual(['org:manage_settings']);
      expect(reflector.get(PERMISSIONS_KEY, JobBoardsController.prototype.remove)).toEqual(['org:manage_settings']);
    });
  });
});
