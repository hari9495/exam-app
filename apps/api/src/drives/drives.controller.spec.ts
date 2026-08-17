import { CanActivate, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { DrivesController } from './drives.controller';
import { DrivesService } from './drives.service';
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

describe('DrivesController', () => {
  let controller: DrivesController;
  let service: { create: jest.Mock; listForGroup: jest.Mock; liveRoster: jest.Mock; results: jest.Mock };
  const tenant = { organizationId: 'org-1', isSuperAdmin: false } as any;

  beforeEach(async () => {
    service = {
      create: jest.fn().mockResolvedValue({ id: 'drive-1' }),
      listForGroup: jest.fn().mockResolvedValue([{ id: 'drive-1', status: 'live' }]),
      liveRoster: jest.fn().mockResolvedValue({ rows: [], counts: {} }),
      results: jest.fn().mockResolvedValue({ rows: [], counts: {} }),
    };
    const moduleRef = await Test.createTestingModule({
      controllers: [DrivesController],
      providers: [{ provide: DrivesService, useValue: service }],
    })
      .overrideGuard(JwtAuthGuard)
      .useClass(MockGuard)
      .overrideGuard(PermissionsGuard)
      .useClass(MockGuard)
      .compile();
    controller = moduleRef.get(DrivesController);
  });

  it('create delegates to the service with the group id and dto', async () => {
    const dto = { name: 'Morning Drive', startsAt: '2026-08-20T09:00:00.000Z', endsAt: '2026-08-20T12:00:00.000Z' };
    await controller.create(tenant, 'user-1', 'group-1', dto as any);
    expect(service.create).toHaveBeenCalledWith(tenant, 'user-1', 'group-1', dto);
  });

  it('listForGroup delegates to the service with the group id', async () => {
    await controller.listForGroup(tenant, 'group-1');
    expect(service.listForGroup).toHaveBeenCalledWith(tenant, 'group-1');
  });

  it('liveRoster delegates to the service with the drive id', async () => {
    await controller.liveRoster(tenant, 'drive-1');
    expect(service.liveRoster).toHaveBeenCalledWith(tenant, 'drive-1');
  });

  it('results delegates to the service with the drive id', async () => {
    await controller.results(tenant, 'drive-1');
    expect(service.results).toHaveBeenCalledWith(tenant, 'drive-1');
  });

  // Routes must be mounted behind JwtAuthGuard, not simply absent -- an unauthenticated
  // request should 401, not 404. Overriding the guard to reject proves it is actually wired
  // in front of the handler rather than the controller being reachable unguarded.
  it('is unreachable when JwtAuthGuard rejects the request', async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [DrivesController],
      providers: [{ provide: DrivesService, useValue: service }],
    })
      .overrideGuard(JwtAuthGuard)
      .useClass(RejectingGuard)
      .overrideGuard(PermissionsGuard)
      .useClass(MockGuard)
      .compile();
    const app = moduleRef.createNestApplication();
    await app.init();
    const server = app.getHttpServer();
    const response = await request(server).get('/drives/drive-1/live');
    expect(response.status).toBe(401);
    await app.close();
  });
});
