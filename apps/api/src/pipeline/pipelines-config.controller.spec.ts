import { CanActivate, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { PipelinesConfigController } from './pipelines-config.controller';
import { PipelinesService } from './pipelines.service';
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

describe('PipelinesConfigController', () => {
  let controller: PipelinesConfigController;
  let service: {
    listPipelines: jest.Mock;
    createPipeline: jest.Mock;
    deletePipeline: jest.Mock;
    createStage: jest.Mock;
    updateStage: jest.Mock;
    deleteStage: jest.Mock;
    createStatus: jest.Mock;
    updateStatus: jest.Mock;
    deleteStatus: jest.Mock;
  };
  const ctxReq = { organizationId: 'org-1', isSuperAdmin: false } as any;

  beforeEach(async () => {
    service = {
      listPipelines: jest.fn().mockResolvedValue([{ id: 'p1' }]),
      createPipeline: jest.fn().mockResolvedValue({ id: 'p2' }),
      deletePipeline: jest.fn().mockResolvedValue(undefined),
      createStage: jest.fn().mockResolvedValue({ id: 'stage-1' }),
      updateStage: jest.fn().mockResolvedValue({ id: 'stage-1' }),
      deleteStage: jest.fn().mockResolvedValue(undefined),
      createStatus: jest.fn().mockResolvedValue({ id: 'status-1' }),
      updateStatus: jest.fn().mockResolvedValue({ id: 'status-1' }),
      deleteStatus: jest.fn().mockResolvedValue(undefined),
    };
    const moduleRef = await Test.createTestingModule({
      controllers: [PipelinesConfigController],
      providers: [{ provide: PipelinesService, useValue: service }],
    })
      .overrideGuard(JwtAuthGuard)
      .useClass(MockGuard)
      .overrideGuard(PermissionsGuard)
      .useClass(MockGuard)
      .compile();
    controller = moduleRef.get(PipelinesConfigController);
  });

  it('GET /pipelines delegates to listPipelines', async () => {
    const res = await controller.list(ctxReq);
    expect(service.listPipelines).toHaveBeenCalledWith(ctxReq);
    expect(res).toEqual([{ id: 'p1' }]);
  });

  it('POST /pipelines delegates to createPipeline', async () => {
    const res = await controller.create(ctxReq, 'user-1', { name: 'Tech' } as any);
    expect(service.createPipeline).toHaveBeenCalledWith(ctxReq, 'user-1', { name: 'Tech' });
    expect(res).toEqual({ id: 'p2' });
  });

  it('DELETE /pipelines/:id delegates to deletePipeline', async () => {
    await controller.remove(ctxReq, 'user-1', 'p1');
    expect(service.deletePipeline).toHaveBeenCalledWith(ctxReq, 'user-1', 'p1');
  });

  it('POST /pipelines/:id/stages delegates to createStage', async () => {
    const dto = { name: 'Screening', category: 'active', position: 1 } as any;
    const res = await controller.createStage(ctxReq, 'user-1', 'p1', dto);
    expect(service.createStage).toHaveBeenCalledWith(ctxReq, 'user-1', 'p1', dto);
    expect(res).toEqual({ id: 'stage-1' });
  });

  it('PATCH /pipelines/stages/:stageId delegates to updateStage', async () => {
    const dto = { name: 'Renamed' } as any;
    const res = await controller.updateStage(ctxReq, 'user-1', 'stage-1', dto);
    expect(service.updateStage).toHaveBeenCalledWith(ctxReq, 'user-1', 'stage-1', dto);
    expect(res).toEqual({ id: 'stage-1' });
  });

  it('DELETE /pipelines/stages/:stageId delegates to deleteStage', async () => {
    await controller.removeStage(ctxReq, 'user-1', 'stage-1');
    expect(service.deleteStage).toHaveBeenCalledWith(ctxReq, 'user-1', 'stage-1');
  });

  it('POST /pipelines/stages/:stageId/statuses delegates to createStatus', async () => {
    const dto = { name: 'Phone screen', position: 1 } as any;
    const res = await controller.createStatus(ctxReq, 'user-1', 'stage-1', dto);
    expect(service.createStatus).toHaveBeenCalledWith(ctxReq, 'user-1', 'stage-1', dto);
    expect(res).toEqual({ id: 'status-1' });
  });

  it('PATCH /pipelines/statuses/:statusId delegates to updateStatus', async () => {
    const dto = { name: 'Renamed' } as any;
    const res = await controller.updateStatus(ctxReq, 'user-1', 'status-1', dto);
    expect(service.updateStatus).toHaveBeenCalledWith(ctxReq, 'user-1', 'status-1', dto);
    expect(res).toEqual({ id: 'status-1' });
  });

  it('DELETE /pipelines/statuses/:statusId delegates to deleteStatus', async () => {
    await controller.removeStatus(ctxReq, 'user-1', 'status-1');
    expect(service.deleteStatus).toHaveBeenCalledWith(ctxReq, 'user-1', 'status-1');
  });

  // Routes must be mounted behind JwtAuthGuard, not simply absent -- an unauthenticated
  // request should 401, not 404.
  it('is unreachable when JwtAuthGuard rejects the request', async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [PipelinesConfigController],
      providers: [{ provide: PipelinesService, useValue: service }],
    })
      .overrideGuard(JwtAuthGuard)
      .useClass(RejectingGuard)
      .overrideGuard(PermissionsGuard)
      .useClass(MockGuard)
      .compile();
    const app = moduleRef.createNestApplication();
    await app.init();
    const server = app.getHttpServer();
    const response = await request(server).get('/pipelines');
    expect(response.status).toBe(401);
    await app.close();
  });
});
