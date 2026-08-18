import { CanActivate, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { WalkInGroupsController } from './walk-in-groups.controller';
import { WalkInGroupsService } from './walk-in-groups.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../rbac/permissions.guard';

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

describe('WalkInGroupsController', () => {
  let controller: WalkInGroupsController;
  let service: { setJob: jest.Mock };
  const tenant = { organizationId: 'org-1', isSuperAdmin: false } as any;

  beforeEach(async () => {
    service = {
      setJob: jest.fn().mockResolvedValue({ success: true }),
    };
    const moduleRef = await Test.createTestingModule({
      controllers: [WalkInGroupsController],
      providers: [{ provide: WalkInGroupsService, useValue: service }],
    })
      .overrideGuard(JwtAuthGuard)
      .useClass(MockGuard)
      .overrideGuard(PermissionsGuard)
      .useClass(MockGuard)
      .compile();
    controller = moduleRef.get(WalkInGroupsController);
  });

  it('setJob delegates to the service with the parsed jobId', async () => {
    await controller.setJob(tenant, 'user-1', 'group-1', { jobId: 'job-1' } as any);
    expect(service.setJob).toHaveBeenCalledWith(tenant, 'user-1', 'group-1', 'job-1');
  });

  it('setJob delegates a null jobId to unlink', async () => {
    await controller.setJob(tenant, 'user-1', 'group-1', { jobId: null } as any);
    expect(service.setJob).toHaveBeenCalledWith(tenant, 'user-1', 'group-1', null);
  });

  // Routes must be mounted behind JwtAuthGuard, not simply absent -- an unauthenticated
  // request should 401, not 404. Overriding the guard to reject proves it is actually wired
  // in front of the handler rather than the controller being reachable unguarded.
  it('is unreachable when JwtAuthGuard rejects the request', async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [WalkInGroupsController],
      providers: [{ provide: WalkInGroupsService, useValue: service }],
    })
      .overrideGuard(JwtAuthGuard)
      .useClass(RejectingGuard)
      .overrideGuard(PermissionsGuard)
      .useClass(MockGuard)
      .compile();
    const app = moduleRef.createNestApplication();
    await app.init();
    const server = app.getHttpServer();
    const response = await request(server).patch('/walk-in-groups/group-1/job').send({ jobId: null });
    expect(response.status).toBe(401);
    await app.close();
  });
});
