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
  let approvals: { getGateStatus: jest.Mock };
  const tenant = { organizationId: 'org-1', isSuperAdmin: false } as any;

  beforeEach(async () => {
    approvals = {
      getGateStatus: jest.fn().mockResolvedValue({ requisition: false, offer: true }),
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

  // Regression for Finding 1: any authenticated org user (not just approvals:configure
  // holders) must be able to read the gate-enabled flags -- this route carries no
  // @RequirePermissions, unlike getChains() on the config controller.
  it('getGateStatus delegates to the service with the tenant context', async () => {
    const result = await controller.getGateStatus(tenant);
    expect(approvals.getGateStatus).toHaveBeenCalledWith(tenant);
    expect(result).toEqual({ requisition: false, offer: true });
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
    const response = await request(server).get('/approvals/gate-status');
    expect(response.status).toBe(401);
    await app.close();
  });
});
