import { CanActivate, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { PipelineController } from './pipeline.controller';
import { PipelineService } from './pipeline.service';
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

describe('PipelineController', () => {
  let controller: PipelineController;
  let service: {
    createJob: jest.Mock;
    listJobs: jest.Mock;
    getJob: jest.Mock;
    updateJob: jest.Mock;
    deleteJob: jest.Mock;
    getPipeline: jest.Mock;
    addEntry: jest.Mock;
    patchEntry: jest.Mock;
    deleteEntry: jest.Mock;
    linkExam: jest.Mock;
    unlinkExam: jest.Mock;
    addFeedback: jest.Mock;
    listFeedback: jest.Mock;
  };
  const tenant = { organizationId: 'org-1', isSuperAdmin: false } as any;

  beforeEach(async () => {
    service = {
      createJob: jest.fn().mockResolvedValue({ id: 'job-1' }),
      listJobs: jest.fn().mockResolvedValue([{ id: 'job-1' }]),
      getJob: jest.fn().mockResolvedValue({ id: 'job-1' }),
      updateJob: jest.fn().mockResolvedValue({ id: 'job-1' }),
      deleteJob: jest.fn().mockResolvedValue({ success: true }),
      getPipeline: jest.fn().mockResolvedValue({ stages: {}, rejected: [] }),
      addEntry: jest.fn().mockResolvedValue({ id: 'entry-1' }),
      patchEntry: jest.fn().mockResolvedValue({ id: 'entry-1' }),
      deleteEntry: jest.fn().mockResolvedValue({ success: true }),
      linkExam: jest.fn().mockResolvedValue({ success: true }),
      unlinkExam: jest.fn().mockResolvedValue({ success: true }),
      addFeedback: jest.fn().mockResolvedValue({ id: 'feedback-1' }),
      listFeedback: jest.fn().mockResolvedValue([]),
    };
    const moduleRef = await Test.createTestingModule({
      controllers: [PipelineController],
      providers: [{ provide: PipelineService, useValue: service }],
    })
      .overrideGuard(JwtAuthGuard)
      .useClass(MockGuard)
      .overrideGuard(PermissionsGuard)
      .useClass(MockGuard)
      .compile();
    controller = moduleRef.get(PipelineController);
  });

  it('createJob delegates to the service with the actor and dto', async () => {
    const dto = { title: 'Backend Engineer' };
    await controller.createJob(tenant, 'user-1', dto as any);
    expect(service.createJob).toHaveBeenCalledWith(tenant, 'user-1', dto);
  });

  it('listJobs delegates to the service with the status filter', async () => {
    await controller.listJobs(tenant, 'open');
    expect(service.listJobs).toHaveBeenCalledWith(tenant, 'open');
  });

  it('getJob delegates to the service with the job id', async () => {
    await controller.getJob(tenant, 'job-1');
    expect(service.getJob).toHaveBeenCalledWith(tenant, 'job-1');
  });

  it('updateJob delegates to the service with the actor, job id, and dto', async () => {
    const dto = { title: 'Senior Backend Engineer' };
    await controller.updateJob(tenant, 'user-1', 'job-1', dto as any);
    expect(service.updateJob).toHaveBeenCalledWith(tenant, 'user-1', 'job-1', dto);
  });

  it('deleteJob delegates to the service with the actor and job id', async () => {
    await controller.deleteJob(tenant, 'user-1', 'job-1');
    expect(service.deleteJob).toHaveBeenCalledWith(tenant, 'user-1', 'job-1');
  });

  it('getPipeline delegates to the service with the job id', async () => {
    await controller.getPipeline(tenant, 'job-1');
    expect(service.getPipeline).toHaveBeenCalledWith(tenant, 'job-1');
  });

  it('addEntry delegates to the service with the actor, job id, and dto', async () => {
    const dto = { candidateId: 'cand-1' };
    await controller.addEntry(tenant, 'user-1', 'job-1', dto as any);
    expect(service.addEntry).toHaveBeenCalledWith(tenant, 'user-1', 'job-1', dto);
  });

  it('patchEntry delegates to the service with the actor, entry id, and dto', async () => {
    const dto = { stage: 'interview' };
    await controller.patchEntry(tenant, 'user-1', 'entry-1', dto as any);
    expect(service.patchEntry).toHaveBeenCalledWith(tenant, 'user-1', 'entry-1', dto);
  });

  it('deleteEntry delegates to the service with the actor and entry id', async () => {
    await controller.deleteEntry(tenant, 'user-1', 'entry-1');
    expect(service.deleteEntry).toHaveBeenCalledWith(tenant, 'user-1', 'entry-1');
  });

  it('linkExam delegates to the service with the actor, job id, and dto.examId', async () => {
    const dto = { examId: 'exam-1' };
    await controller.linkExam(tenant, 'user-1', 'job-1', dto as any);
    expect(service.linkExam).toHaveBeenCalledWith(tenant, 'user-1', 'job-1', 'exam-1');
  });

  it('unlinkExam delegates to the service with the actor, job id, and exam id', async () => {
    await controller.unlinkExam(tenant, 'user-1', 'job-1', 'exam-1');
    expect(service.unlinkExam).toHaveBeenCalledWith(tenant, 'user-1', 'job-1', 'exam-1');
  });

  it('addFeedback delegates to the service with the actor, entry id, and dto', async () => {
    const dto = { note: 'Great candidate', rating: 5 };
    await controller.addFeedback(tenant, 'user-1', 'entry-1', dto as any);
    expect(service.addFeedback).toHaveBeenCalledWith(tenant, 'user-1', 'entry-1', dto);
  });

  it('listFeedback delegates to the service with the entry id', async () => {
    await controller.listFeedback(tenant, 'entry-1');
    expect(service.listFeedback).toHaveBeenCalledWith(tenant, 'entry-1');
  });

  // Routes must be mounted behind JwtAuthGuard, not simply absent -- an unauthenticated
  // request should 401, not 404. Overriding the guard to reject proves it is actually wired
  // in front of the handler rather than the controller being reachable unguarded.
  it('is unreachable when JwtAuthGuard rejects the request', async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [PipelineController],
      providers: [{ provide: PipelineService, useValue: service }],
    })
      .overrideGuard(JwtAuthGuard)
      .useClass(RejectingGuard)
      .overrideGuard(PermissionsGuard)
      .useClass(MockGuard)
      .compile();
    const app = moduleRef.createNestApplication();
    await app.init();
    const server = app.getHttpServer();
    const response = await request(server).get('/jobs');
    expect(response.status).toBe(401);
    await app.close();
  });
});
