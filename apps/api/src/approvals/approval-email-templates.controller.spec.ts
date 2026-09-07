import { BadRequestException, CanActivate, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Reflector } from '@nestjs/core';
import request from 'supertest';
import { ApprovalEmailTemplatesController } from './approval-email-templates.controller';
import { ApprovalEmailTemplatesService } from './approval-email-templates.service';
import { PERMISSIONS_KEY } from '../rbac/permissions.decorator';
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

describe('ApprovalEmailTemplatesController', () => {
  let controller: ApprovalEmailTemplatesController;
  let service: { list: jest.Mock; upsert: jest.Mock };
  const tenant = { organizationId: 'org-1', isSuperAdmin: false } as any;

  beforeEach(async () => {
    service = {
      list: jest.fn().mockResolvedValue([
        { eventType: 'approval.requested', subject: null, body: null, enabled: true },
        { eventType: 'approval.approved', subject: null, body: null, enabled: true },
        { eventType: 'approval.rejected', subject: null, body: null, enabled: true },
        { eventType: 'approval.cancelled', subject: null, body: null, enabled: true },
      ]),
      upsert: jest.fn().mockResolvedValue({ id: 't1', eventType: 'approval.requested', subject: 'S', body: 'B', enabled: true }),
    };
    const moduleRef = await Test.createTestingModule({
      controllers: [ApprovalEmailTemplatesController],
      providers: [{ provide: ApprovalEmailTemplatesService, useValue: service }],
    })
      .overrideGuard(JwtAuthGuard)
      .useClass(MockGuard)
      .overrideGuard(PermissionsGuard)
      .useClass(MockGuard)
      .compile();
    controller = moduleRef.get(ApprovalEmailTemplatesController);
  });

  it('GET / delegates to list and returns all four slots', async () => {
    const result = await controller.list(tenant);
    expect(service.list).toHaveBeenCalledWith(tenant);
    expect(result).toHaveLength(4);
  });

  it('PUT /:eventType delegates to upsert with the tenant, actor, eventType, and dto', async () => {
    const dto = { subject: 'S', body: 'B', enabled: true } as any;
    await controller.upsert(tenant, 'user-1', 'approval.requested', dto);
    expect(service.upsert).toHaveBeenCalledWith(tenant, 'user-1', 'approval.requested', dto);
  });

  // Real HTTP round-trip (not a direct method call) so the exception filter's translation of a
  // service-thrown BadRequestException into an actual 400 response is proven, not just that the
  // promise rejects.
  it('PUT /:eventType returns 400 when the service rejects an unknown event type', async () => {
    service.upsert = jest.fn().mockImplementation(() => {
      throw new BadRequestException("Unknown event type 'bogus'");
    });
    const moduleRef = await Test.createTestingModule({
      controllers: [ApprovalEmailTemplatesController],
      providers: [{ provide: ApprovalEmailTemplatesService, useValue: service }],
    })
      .overrideGuard(JwtAuthGuard)
      .useClass(MockGuard)
      .overrideGuard(PermissionsGuard)
      .useClass(MockGuard)
      .compile();
    const app = moduleRef.createNestApplication();
    await app.init();
    const response = await request(app.getHttpServer()).put('/approval-email-templates/bogus').send({ subject: 'S', body: 'B' });
    expect(response.status).toBe(400);
    await app.close();
  });

  // Routes must be mounted behind JwtAuthGuard, not simply absent -- an unauthenticated
  // request should 401, not 404.
  it('is unreachable when JwtAuthGuard rejects the request', async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [ApprovalEmailTemplatesController],
      providers: [{ provide: ApprovalEmailTemplatesService, useValue: service }],
    })
      .overrideGuard(JwtAuthGuard)
      .useClass(RejectingGuard)
      .overrideGuard(PermissionsGuard)
      .useClass(MockGuard)
      .compile();
    const app = moduleRef.createNestApplication();
    await app.init();
    const response = await request(app.getHttpServer()).get('/approval-email-templates');
    expect(response.status).toBe(401);
    await app.close();
  });

  describe('permissions metadata', () => {
    const reflector = new Reflector();

    it('list and upsert both require approvals:configure', () => {
      expect(reflector.get(PERMISSIONS_KEY, ApprovalEmailTemplatesController.prototype.list)).toEqual(['approvals:configure']);
      expect(reflector.get(PERMISSIONS_KEY, ApprovalEmailTemplatesController.prototype.upsert)).toEqual(['approvals:configure']);
    });
  });
});
