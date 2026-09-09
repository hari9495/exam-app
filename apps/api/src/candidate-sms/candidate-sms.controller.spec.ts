import { CanActivate, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { CandidateSmsController } from './candidate-sms.controller';
import { CandidateSmsService } from './candidate-sms.service';
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

describe('CandidateSmsController', () => {
  let controller: CandidateSmsController;
  let service: { sendSms: jest.Mock; listMessages: jest.Mock; resend: jest.Mock };
  const tenant = { organizationId: 'org-1', isSuperAdmin: false } as any;

  beforeEach(async () => {
    service = {
      sendSms: jest.fn().mockResolvedValue({ id: 'sms-1' }),
      listMessages: jest.fn().mockResolvedValue([{ id: 'sms-1' }]),
      resend: jest.fn().mockResolvedValue({ id: 'sms-1' }),
    };
    const moduleRef = await Test.createTestingModule({
      controllers: [CandidateSmsController],
      providers: [{ provide: CandidateSmsService, useValue: service }],
    })
      .overrideGuard(JwtAuthGuard)
      .useClass(MockGuard)
      .overrideGuard(PermissionsGuard)
      .useClass(MockGuard)
      .compile();
    controller = moduleRef.get(CandidateSmsController);
  });

  it('sendSms delegates to the service with the actor, entry id, and dto forced to source manual', async () => {
    const dto = { body: 'There' };
    await controller.sendSms(tenant, 'user-1', 'entry-1', dto as any);
    expect(service.sendSms).toHaveBeenCalledWith(tenant, 'user-1', 'entry-1', { ...dto, source: 'manual' });
  });

  it('listMessages delegates to the service with the candidate id', async () => {
    await controller.listMessages(tenant, 'cand-1');
    expect(service.listMessages).toHaveBeenCalledWith(tenant, 'cand-1');
  });

  it('resend delegates to the service with the actor and message id', async () => {
    await controller.resend(tenant, 'user-1', 'sms-1');
    expect(service.resend).toHaveBeenCalledWith(tenant, 'user-1', 'sms-1');
  });

  // Routes must be mounted behind JwtAuthGuard, not simply absent -- an unauthenticated
  // request should 401, not 404.
  it('is unreachable when JwtAuthGuard rejects the request', async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [CandidateSmsController],
      providers: [{ provide: CandidateSmsService, useValue: service }],
    })
      .overrideGuard(JwtAuthGuard)
      .useClass(RejectingGuard)
      .overrideGuard(PermissionsGuard)
      .useClass(MockGuard)
      .compile();
    const app = moduleRef.createNestApplication();
    await app.init();
    const server = app.getHttpServer();
    const response = await request(server).get('/candidate-sms/cand-1');
    expect(response.status).toBe(401);
    await app.close();
  });
});
