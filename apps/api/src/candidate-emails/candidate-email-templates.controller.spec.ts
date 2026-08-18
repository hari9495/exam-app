import { CanActivate, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { CandidateEmailTemplatesController } from './candidate-email-templates.controller';
import { CandidateEmailTemplatesService } from './candidate-email-templates.service';
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

describe('CandidateEmailTemplatesController', () => {
  let controller: CandidateEmailTemplatesController;
  let service: {
    listWithDefaults: jest.Mock;
    upsert: jest.Mock;
    setEnabled: jest.Mock;
    remove: jest.Mock;
  };
  const tenant = { organizationId: 'org-1', isSuperAdmin: false } as any;

  beforeEach(async () => {
    service = {
      listWithDefaults: jest.fn().mockResolvedValue([{ id: null, isDefault: true }]),
      upsert: jest.fn().mockResolvedValue({ id: 's1' }),
      setEnabled: jest.fn().mockResolvedValue({ id: 's1', enabled: true }),
      remove: jest.fn().mockResolvedValue({ success: true }),
    };
    const moduleRef = await Test.createTestingModule({
      controllers: [CandidateEmailTemplatesController],
      providers: [{ provide: CandidateEmailTemplatesService, useValue: service }],
    })
      .overrideGuard(JwtAuthGuard)
      .useClass(MockGuard)
      .overrideGuard(PermissionsGuard)
      .useClass(MockGuard)
      .compile();
    controller = moduleRef.get(CandidateEmailTemplatesController);
  });

  it('GET / delegates to listWithDefaults', async () => {
    await controller.list(tenant);
    expect(service.listWithDefaults).toHaveBeenCalledWith(tenant);
  });

  it('POST / delegates to upsert with the dto', async () => {
    const dto = { name: 'Offer', triggerEvent: 'offer', triggerMode: 'prompt', subject: 'S', body: 'B' } as any;
    await controller.create(tenant, 'user-1', dto);
    expect(service.upsert).toHaveBeenCalledWith(tenant, 'user-1', dto);
  });

  it('PATCH /:id delegates to upsert with the id merged into the dto', async () => {
    const dto = { name: 'Offer v2', triggerEvent: 'offer', triggerMode: 'prompt', subject: 'S', body: 'B' } as any;
    await controller.update(tenant, 'user-1', 's1', dto);
    expect(service.upsert).toHaveBeenCalledWith(tenant, 'user-1', { ...dto, id: 's1' });
  });

  it('PATCH /:id/enabled delegates to setEnabled', async () => {
    await controller.setEnabled(tenant, 'user-1', 's1', { enabled: false } as any);
    expect(service.setEnabled).toHaveBeenCalledWith(tenant, 'user-1', 's1', false);
  });

  it('DELETE /:id delegates to remove', async () => {
    await controller.remove(tenant, 'user-1', 's1');
    expect(service.remove).toHaveBeenCalledWith(tenant, 'user-1', 's1');
  });

  // Routes must be mounted behind JwtAuthGuard, not simply absent -- an unauthenticated
  // request should 401, not 404. Overriding the guard to reject proves it is actually wired
  // in front of the handler rather than the controller being reachable unguarded.
  it('is unreachable when JwtAuthGuard rejects the request', async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [CandidateEmailTemplatesController],
      providers: [{ provide: CandidateEmailTemplatesService, useValue: service }],
    })
      .overrideGuard(JwtAuthGuard)
      .useClass(RejectingGuard)
      .overrideGuard(PermissionsGuard)
      .useClass(MockGuard)
      .compile();
    const app = moduleRef.createNestApplication();
    await app.init();
    const server = app.getHttpServer();
    const response = await request(server).get('/candidate-email-templates');
    expect(response.status).toBe(401);
    await app.close();
  });
});
