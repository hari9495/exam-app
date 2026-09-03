import { CanActivate, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { ApprovalsController } from './approvals.controller';
import { ApprovalsService } from './approvals.service';
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

describe('ApprovalsController', () => {
  let controller: ApprovalsController;
  let approvals: { listRequests: jest.Mock; getRequestDetail: jest.Mock; decide: jest.Mock };
  const tenant = { organizationId: 'org-1', isSuperAdmin: false } as any;

  beforeEach(async () => {
    approvals = {
      listRequests: jest.fn().mockResolvedValue([{ id: 'req-1' }]),
      getRequestDetail: jest.fn().mockResolvedValue({ id: 'req-1' }),
      decide: jest.fn().mockResolvedValue({ requestStatus: 'approved' }),
    };
    const moduleRef = await Test.createTestingModule({
      controllers: [ApprovalsController],
      providers: [{ provide: ApprovalsService, useValue: approvals }],
    })
      .overrideGuard(JwtAuthGuard)
      .useClass(MockGuard)
      .overrideGuard(PermissionsGuard)
      .useClass(MockGuard)
      .compile();
    controller = moduleRef.get(ApprovalsController);
  });

  it('listRequests defaults scope to inbox when omitted', async () => {
    await controller.listRequests(tenant, 'user-1', undefined, undefined);
    expect(approvals.listRequests).toHaveBeenCalledWith(tenant, 'user-1', 'inbox', undefined);
  });

  it('listRequests passes scope + status through', async () => {
    await controller.listRequests(tenant, 'user-1', 'submitted', 'pending_approval');
    expect(approvals.listRequests).toHaveBeenCalledWith(tenant, 'user-1', 'submitted', 'pending_approval');
  });

  it('getRequestDetail delegates with the request id', async () => {
    await controller.getRequestDetail(tenant, 'req-1');
    expect(approvals.getRequestDetail).toHaveBeenCalledWith(tenant, 'req-1');
  });

  it('decide delegates to the service with the actor, id, decision, and note', async () => {
    await controller.decide(tenant, 'user-1', 'req-1', { decision: 'approved', note: 'ok' } as any);
    expect(approvals.decide).toHaveBeenCalledWith(tenant, 'req-1', 'user-1', 'approved', 'ok');
  });

  // Routes must be mounted behind JwtAuthGuard, not simply absent -- an unauthenticated
  // request should 401, not 404.
  it('is unreachable when JwtAuthGuard rejects the request', async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [ApprovalsController],
      providers: [{ provide: ApprovalsService, useValue: approvals }],
    })
      .overrideGuard(JwtAuthGuard)
      .useClass(RejectingGuard)
      .overrideGuard(PermissionsGuard)
      .useClass(MockGuard)
      .compile();
    const app = moduleRef.createNestApplication();
    await app.init();
    const server = app.getHttpServer();
    const response = await request(server).get('/approvals/requests');
    expect(response.status).toBe(401);
    await app.close();
  });
});
