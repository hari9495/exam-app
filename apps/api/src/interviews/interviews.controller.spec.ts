import { CanActivate, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { InterviewsController } from './interviews.controller';
import { InterviewsService } from './interviews.service';
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

describe('InterviewsController', () => {
  let controller: InterviewsController;
  let interviews: {
    createInterview: jest.Mock;
    listForEntry: jest.Mock;
    listForCandidate: jest.Mock;
    listMine: jest.Mock;
    cancel: jest.Mock;
    sendInvite: jest.Mock;
  };
  const tenant = { organizationId: 'org-1', isSuperAdmin: false } as any;

  beforeEach(async () => {
    interviews = {
      createInterview: jest.fn().mockResolvedValue({ id: 'interview-1' }),
      listForEntry: jest.fn().mockResolvedValue([{ id: 'interview-1' }]),
      listForCandidate: jest.fn().mockResolvedValue([{ id: 'interview-1' }]),
      listMine: jest.fn().mockResolvedValue([{ id: 'interview-1' }]),
      cancel: jest.fn().mockResolvedValue({ id: 'interview-1', status: 'cancelled' }),
      sendInvite: jest.fn().mockResolvedValue({ id: 'interview-1', sentAt: new Date() }),
    };
    const moduleRef = await Test.createTestingModule({
      controllers: [InterviewsController],
      providers: [{ provide: InterviewsService, useValue: interviews }],
    })
      .overrideGuard(JwtAuthGuard)
      .useClass(MockGuard)
      .overrideGuard(PermissionsGuard)
      .useClass(MockGuard)
      .compile();
    controller = moduleRef.get(InterviewsController);
  });

  it('createInterview delegates to the service with the actor, entry id, and dto', async () => {
    const dto = { slots: [{ startsAt: 'a', endsAt: 'b' }], panelistUserIds: [], location: 'Room 1', timeZone: 'UTC' };
    await controller.createInterview(tenant, 'user-1', 'entry-1', dto as any);
    expect(interviews.createInterview).toHaveBeenCalledWith(tenant, 'user-1', 'entry-1', dto);
  });

  it('listForEntry delegates to the service with the entry id', async () => {
    await controller.listForEntry(tenant, 'entry-1');
    expect(interviews.listForEntry).toHaveBeenCalledWith(tenant, 'entry-1');
  });

  it('listForCandidate delegates to the service with the candidate id', async () => {
    await controller.listForCandidate(tenant, 'cand-1');
    expect(interviews.listForCandidate).toHaveBeenCalledWith(tenant, 'cand-1');
  });

  it('listMine delegates to the service with the current user id', async () => {
    await controller.listMine(tenant, 'user-1');
    expect(interviews.listMine).toHaveBeenCalledWith(tenant, 'user-1');
  });

  it('cancel delegates to the service with the actor and interview id', async () => {
    await controller.cancel(tenant, 'user-1', 'interview-1');
    expect(interviews.cancel).toHaveBeenCalledWith(tenant, 'user-1', 'interview-1');
  });

  it('sendInvite delegates to the service with the actor and interview id', async () => {
    await controller.sendInvite(tenant, 'user-1', 'interview-1');
    expect(interviews.sendInvite).toHaveBeenCalledWith(tenant, 'user-1', 'interview-1');
  });

  // Routes must be mounted behind JwtAuthGuard, not simply absent -- an unauthenticated
  // request should 401, not 404.
  it('is unreachable when JwtAuthGuard rejects the request', async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [InterviewsController],
      providers: [{ provide: InterviewsService, useValue: interviews }],
    })
      .overrideGuard(JwtAuthGuard)
      .useClass(RejectingGuard)
      .overrideGuard(PermissionsGuard)
      .useClass(MockGuard)
      .compile();
    const app = moduleRef.createNestApplication();
    await app.init();
    const server = app.getHttpServer();
    const response = await request(server).get('/candidates/cand-1/interviews');
    expect(response.status).toBe(401);
    await app.close();
  });

  it('is unreachable at interviews/mine when JwtAuthGuard rejects the request', async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [InterviewsController],
      providers: [{ provide: InterviewsService, useValue: interviews }],
    })
      .overrideGuard(JwtAuthGuard)
      .useClass(RejectingGuard)
      .overrideGuard(PermissionsGuard)
      .useClass(MockGuard)
      .compile();
    const app = moduleRef.createNestApplication();
    await app.init();
    const server = app.getHttpServer();
    const response = await request(server).get('/interviews/mine');
    expect(response.status).toBe(401);
    await app.close();
  });
});
