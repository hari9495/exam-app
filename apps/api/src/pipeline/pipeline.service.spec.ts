import { NotFoundException } from '@nestjs/common';
import { PipelineService } from './pipeline.service';

describe('PipelineService', () => {
  let service: PipelineService;
  let tenantPrisma: { forTenant: jest.Mock };
  let audit: { record: jest.Mock };
  const context = { organizationId: 'org-1', isSuperAdmin: false } as any;

  beforeEach(() => {
    tenantPrisma = { forTenant: jest.fn() };
    audit = { record: jest.fn() };
    service = new PipelineService(tenantPrisma as any, audit as any);
  });

  it('createJob writes org-scoped and audits', async () => {
    const create = jest.fn().mockResolvedValue({ id: 'job-1', title: 'Backend Eng' });
    tenantPrisma.forTenant.mockImplementation((_c, fn) => fn({ job: { create } }));
    const out = await service.createJob(context, 'user-1', { title: 'Backend Eng' });
    expect(out).toEqual({ id: 'job-1', title: 'Backend Eng' });
    expect(create).toHaveBeenCalledWith({
      data: { organizationId: 'org-1', title: 'Backend Eng', description: undefined, createdById: 'user-1' },
    });
    expect(audit.record).toHaveBeenCalledWith(context, expect.objectContaining({ action: 'job.created', entityId: 'job-1' }));
  });

  it('getJob throws NotFoundException when not in org', async () => {
    const tx = { job: { findFirst: jest.fn().mockResolvedValue(null) } };
    tenantPrisma.forTenant.mockImplementation((_c, fn) => fn(tx));
    await expect(service.getJob(context, 'missing-job')).rejects.toThrow(NotFoundException);
  });

  it('deleteJob deletes and audits job.deleted', async () => {
    const del = jest.fn().mockResolvedValue({ id: 'job-1' });
    const tx = { job: { findFirst: jest.fn().mockResolvedValue({ id: 'job-1' }), delete: del } };
    tenantPrisma.forTenant.mockImplementation((_c, fn) => fn(tx));

    const result = await service.deleteJob(context, 'user-1', 'job-1');

    expect(result).toEqual({ success: true });
    expect(del).toHaveBeenCalledWith({ where: { id: 'job-1' } });
    expect(audit.record).toHaveBeenCalledWith(context, expect.objectContaining({ action: 'job.deleted', entityId: 'job-1' }));
  });

  it('getPipeline groups by stage and buckets rejected with derived results', async () => {
    const tx = {
      job: { findFirst: jest.fn().mockResolvedValue({ id: 'job-1' }) },
      jobExam: { findMany: jest.fn().mockResolvedValue([{ examId: 'e1' }]) },
      pipelineEntry: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'en1', candidateId: 'c1', stage: 'applied', rejected: false, enteredVia: 'manual',
            candidate: { name: 'Amy', email: 'amy@x.com',
              invitations: [{ examId: 'e1', exam: { title: 'Backend' }, attempt: { result: { passFail: 'pass', percentage: 82 } } }] },
            feedback: [{ rating: 4 }, { rating: null }] },
          { id: 'en2', candidateId: 'c2', stage: 'interview', rejected: true, enteredVia: 'exam',
            candidate: { name: 'Bo', email: 'bo@x.com', invitations: [] }, feedback: [] },
        ]),
      },
    };
    tenantPrisma.forTenant.mockImplementation((_c, fn) => fn(tx));
    const board = await service.getPipeline(context, 'job-1');
    expect(board.stages.applied).toHaveLength(1);
    expect(board.stages.applied[0]).toMatchObject({ entryId: 'en1', avgRating: 4, feedbackCount: 2, examResults: [{ examId: 'e1', passFail: 'pass', score: 82 }] });
    expect(board.stages.interview).toHaveLength(0); // rejected -> not in stage bucket
    expect(board.rejected).toHaveLength(1);
    expect(board.rejected[0].entryId).toBe('en2');
  });

  it('listJobs folds groupBy counts per job, keeping rejected out of its stage bucket', async () => {
    const tx = {
      job: { findMany: jest.fn().mockResolvedValue([{ id: 'job-1' }, { id: 'job-2' }]) },
      pipelineEntry: {
        groupBy: jest.fn().mockResolvedValue([
          { jobId: 'job-1', stage: 'applied', rejected: false, _count: 3 },
          { jobId: 'job-1', stage: 'interview', rejected: true, _count: 2 },
        ]),
      },
    };
    tenantPrisma.forTenant.mockImplementation((_c, fn) => fn(tx));

    const jobs = await service.listJobs(context);

    expect(jobs.find((j) => j.id === 'job-1')!.stageCounts).toEqual({
      applied: 3, screened: 0, interview: 0, offer: 0, hired: 0, rejected: 2,
    });
    expect(jobs.find((j) => j.id === 'job-2')!.stageCounts).toEqual({
      applied: 0, screened: 0, interview: 0, offer: 0, hired: 0, rejected: 0,
    });
  });
});
