import { CanActivate, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Reflector } from '@nestjs/core';
import request from 'supertest';
import { UserGroupsController } from './user-groups.controller';
import { UserGroupsService } from './user-groups.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { PERMISSIONS_KEY } from '../rbac/permissions.decorator';

class MockGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    return true;
  }
}

class RejectingGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    throw new UnauthorizedException();
  }
}

describe('UserGroupsController', () => {
  let controller: UserGroupsController;
  let service: {
    directory: jest.Mock;
    mine: jest.Mock;
    list: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
    setMembers: jest.Mock;
    remove: jest.Mock;
  };
  const ctxReq = { organizationId: 'org-1', isSuperAdmin: false } as any;

  beforeEach(async () => {
    service = {
      directory: jest.fn().mockResolvedValue([{ id: 'g1', name: 'Group 1', memberIds: [] }]),
      mine: jest.fn().mockResolvedValue({ groupIds: ['g1'], coMemberUserIds: [] }),
      list: jest.fn().mockResolvedValue([{ id: 'g1' }]),
      create: jest.fn().mockResolvedValue({ id: 'g2' }),
      update: jest.fn().mockResolvedValue({ id: 'g1' }),
      setMembers: jest.fn().mockResolvedValue({ id: 'g1' }),
      remove: jest.fn().mockResolvedValue({ id: 'g1' }),
    };
    const moduleRef = await Test.createTestingModule({
      controllers: [UserGroupsController],
      providers: [{ provide: UserGroupsService, useValue: service }],
    })
      .overrideGuard(JwtAuthGuard)
      .useClass(MockGuard)
      .overrideGuard(PermissionsGuard)
      .useClass(MockGuard)
      .compile();
    controller = moduleRef.get(UserGroupsController);
  });

  it('GET /user-groups/directory delegates to directory', async () => {
    const res = await controller.directory(ctxReq);
    expect(service.directory).toHaveBeenCalledWith(ctxReq);
    expect(res).toEqual([{ id: 'g1', name: 'Group 1', memberIds: [] }]);
  });

  it('GET /user-groups/mine delegates to mine', async () => {
    const res = await controller.mine(ctxReq, 'user-1');
    expect(service.mine).toHaveBeenCalledWith(ctxReq, 'user-1');
    expect(res).toEqual({ groupIds: ['g1'], coMemberUserIds: [] });
  });

  it('GET /user-groups delegates to list', async () => {
    const res = await controller.list(ctxReq);
    expect(service.list).toHaveBeenCalledWith(ctxReq);
    expect(res).toEqual([{ id: 'g1' }]);
  });

  it('POST /user-groups delegates to create', async () => {
    const dto = { name: 'Group 1' } as any;
    const res = await controller.create(ctxReq, 'user-1', dto);
    expect(service.create).toHaveBeenCalledWith(ctxReq, 'user-1', dto);
    expect(res).toEqual({ id: 'g2' });
  });

  it('PATCH /user-groups/:id delegates to update', async () => {
    const dto = { name: 'Renamed' } as any;
    const res = await controller.update(ctxReq, 'user-1', 'g1', dto);
    expect(service.update).toHaveBeenCalledWith(ctxReq, 'user-1', 'g1', dto);
    expect(res).toEqual({ id: 'g1' });
  });

  it('PUT /user-groups/:id/members delegates to setMembers with userIds unwrapped', async () => {
    const dto = { userIds: ['u1', 'u2'] };
    const res = await controller.setMembers(ctxReq, 'user-1', 'g1', dto);
    expect(service.setMembers).toHaveBeenCalledWith(ctxReq, 'user-1', 'g1', ['u1', 'u2']);
    expect(res).toEqual({ id: 'g1' });
  });

  it('DELETE /user-groups/:id delegates to remove', async () => {
    await controller.remove(ctxReq, 'user-1', 'g1');
    expect(service.remove).toHaveBeenCalledWith(ctxReq, 'user-1', 'g1');
  });

  // Routes must be mounted behind JwtAuthGuard, not simply absent -- an unauthenticated
  // request should 401, not 404.
  it('is unreachable when JwtAuthGuard rejects the request', async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [UserGroupsController],
      providers: [{ provide: UserGroupsService, useValue: service }],
    })
      .overrideGuard(JwtAuthGuard)
      .useClass(RejectingGuard)
      .overrideGuard(PermissionsGuard)
      .useClass(MockGuard)
      .compile();
    const app = moduleRef.createNestApplication();
    await app.init();
    const server = app.getHttpServer();
    const response = await request(server).get('/user-groups');
    expect(response.status).toBe(401);
    await app.close();
  });

  describe('permissions metadata', () => {
    const reflector = new Reflector();

    it('directory and mine require results:view', () => {
      expect(reflector.get(PERMISSIONS_KEY, UserGroupsController.prototype.directory)).toEqual(['results:view']);
      expect(reflector.get(PERMISSIONS_KEY, UserGroupsController.prototype.mine)).toEqual(['results:view']);
    });

    it('admin routes require users:manage_groups', () => {
      expect(reflector.get(PERMISSIONS_KEY, UserGroupsController.prototype.list)).toEqual(['users:manage_groups']);
      expect(reflector.get(PERMISSIONS_KEY, UserGroupsController.prototype.create)).toEqual(['users:manage_groups']);
      expect(reflector.get(PERMISSIONS_KEY, UserGroupsController.prototype.update)).toEqual(['users:manage_groups']);
      expect(reflector.get(PERMISSIONS_KEY, UserGroupsController.prototype.setMembers)).toEqual(['users:manage_groups']);
      expect(reflector.get(PERMISSIONS_KEY, UserGroupsController.prototype.remove)).toEqual(['users:manage_groups']);
    });
  });

  // Nest matches routes in declaration order -- 'directory'/'mine' would otherwise be
  // swallowed by the ':id' routes if declared after them.
  it('declares directory/mine before the :id routes', () => {
    const methodNames = Object.getOwnPropertyNames(UserGroupsController.prototype).filter((n) => n !== 'constructor');
    const directoryIdx = methodNames.indexOf('directory');
    const mineIdx = methodNames.indexOf('mine');
    const updateIdx = methodNames.indexOf('update');
    const setMembersIdx = methodNames.indexOf('setMembers');
    const removeIdx = methodNames.indexOf('remove');
    expect(directoryIdx).toBeGreaterThanOrEqual(0);
    expect(mineIdx).toBeGreaterThanOrEqual(0);
    expect(directoryIdx).toBeLessThan(updateIdx);
    expect(directoryIdx).toBeLessThan(setMembersIdx);
    expect(directoryIdx).toBeLessThan(removeIdx);
    expect(mineIdx).toBeLessThan(updateIdx);
    expect(mineIdx).toBeLessThan(setMembersIdx);
    expect(mineIdx).toBeLessThan(removeIdx);
  });
});
