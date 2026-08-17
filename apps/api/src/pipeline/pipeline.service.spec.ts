import { BadRequestException, NotFoundException } from '@nestjs/common';
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

  describe('addEntry', () => {
    it('upserts at applied/manual, audits entry.added, and is idempotent on re-add (update:{})', async () => {
      const upsert = jest.fn().mockResolvedValue({ id: 'en1', stage: 'applied', enteredVia: 'manual' });
      const tx = {
        job: { findFirst: jest.fn().mockResolvedValue({ id: 'job-1' }) },
        candidate: { findFirst: jest.fn().mockResolvedValue({ id: 'c1', organizationId: 'org-1' }) },
        pipelineEntry: { upsert },
      };
      tenantPrisma.forTenant.mockImplementation((_c, fn) => fn(tx));

      const out = await service.addEntry(context, 'user-1', 'job-1', { candidateId: 'c1' });

      expect(out).toEqual({ id: 'en1', stage: 'applied', enteredVia: 'manual' });
      expect(upsert).toHaveBeenCalledWith({
        where: { jobId_candidateId: { jobId: 'job-1', candidateId: 'c1' } },
        create: { organizationId: 'org-1', jobId: 'job-1', candidateId: 'c1', stage: 'applied', enteredVia: 'manual' },
        update: {}, // never overwrite stage/enteredVia on re-add
      });
      expect(audit.record).toHaveBeenCalledWith(context, expect.objectContaining({
        actorUserId: 'user-1', action: 'entry.added', entityType: 'pipeline_entry', entityId: 'en1',
        metadata: { jobId: 'job-1', candidateId: 'c1' },
      }));
    });

    it('throws NotFoundException when the job is not in org', async () => {
      const tx = { job: { findFirst: jest.fn().mockResolvedValue(null) } };
      tenantPrisma.forTenant.mockImplementation((_c, fn) => fn(tx));

      await expect(service.addEntry(context, 'user-1', 'missing-job', { candidateId: 'c1' })).rejects.toThrow(NotFoundException);
    });

    it('throws NotFoundException when candidateId is not in the org, and never calls upsert', async () => {
      const upsert = jest.fn();
      const tx = {
        job: { findFirst: jest.fn().mockResolvedValue({ id: 'job-1' }) },
        candidate: { findFirst: jest.fn().mockResolvedValue(null) },
        pipelineEntry: { upsert },
      };
      tenantPrisma.forTenant.mockImplementation((_c, fn) => fn(tx));

      await expect(service.addEntry(context, 'user-1', 'job-1', { candidateId: 'other-org-c1' })).rejects.toThrow(NotFoundException);
      expect(upsert).not.toHaveBeenCalled();
    });

    it('newCandidate creates the candidate first, then upserts the entry with its id', async () => {
      const candidateUpsert = jest.fn().mockResolvedValue({ id: 'c-new' });
      const upsert = jest.fn().mockResolvedValue({ id: 'en2', stage: 'applied', enteredVia: 'manual' });
      const tx = {
        job: { findFirst: jest.fn().mockResolvedValue({ id: 'job-1' }) },
        candidate: { upsert: candidateUpsert },
        pipelineEntry: { upsert },
      };
      tenantPrisma.forTenant.mockImplementation((_c, fn) => fn(tx));

      await service.addEntry(context, 'user-1', 'job-1', {
        newCandidate: { name: 'Amy', email: 'amy@x.com', phone: '555' },
      });

      expect(candidateUpsert).toHaveBeenCalledWith(expect.objectContaining({
        where: { organizationId_email: { organizationId: 'org-1', email: 'amy@x.com' } },
        create: expect.objectContaining({ organizationId: 'org-1', email: 'amy@x.com', name: 'Amy', phone: '555' }),
      }));
      expect(upsert).toHaveBeenCalledWith(expect.objectContaining({
        where: { jobId_candidateId: { jobId: 'job-1', candidateId: 'c-new' } },
      }));
    });
  });

  describe('patchEntry', () => {
    it('stage move clears reject fields and audits entry.stage_changed', async () => {
      const update = jest.fn().mockResolvedValue({ id: 'en1', stage: 'interview' });
      const tx = { pipelineEntry: { findFirst: jest.fn().mockResolvedValue({ id: 'en1', jobId: 'job-1' }), update } };
      tenantPrisma.forTenant.mockImplementation((_c, fn) => fn(tx));

      await service.patchEntry(context, 'user-1', 'en1', { stage: 'interview' });

      expect(update).toHaveBeenCalledWith({
        where: { id: 'en1' },
        data: { stage: 'interview', rejected: false, rejectedReason: null, rejectedAt: null },
      });
      expect(audit.record).toHaveBeenCalledWith(context, expect.objectContaining({ action: 'entry.stage_changed', entityId: 'en1' }));
    });

    it('rejects an invalid stage with BadRequestException', async () => {
      const tx = { pipelineEntry: { findFirst: jest.fn().mockResolvedValue({ id: 'en1', jobId: 'job-1' }), update: jest.fn() } };
      tenantPrisma.forTenant.mockImplementation((_c, fn) => fn(tx));

      await expect(service.patchEntry(context, 'user-1', 'en1', { stage: 'bogus' })).rejects.toThrow(BadRequestException);
    });

    it('rejected:true sets flag+reason+rejectedAt, leaves stage untouched, and audits entry.rejected', async () => {
      const update = jest.fn().mockResolvedValue({ id: 'en1', rejected: true });
      const tx = { pipelineEntry: { findFirst: jest.fn().mockResolvedValue({ id: 'en1', jobId: 'job-1' }), update } };
      tenantPrisma.forTenant.mockImplementation((_c, fn) => fn(tx));

      await service.patchEntry(context, 'user-1', 'en1', { rejected: true, reason: 'not a fit' });

      expect(update).toHaveBeenCalledWith({
        where: { id: 'en1' },
        data: { rejected: true, rejectedReason: 'not a fit', rejectedAt: expect.any(Date) },
      });
      expect(audit.record).toHaveBeenCalledWith(context, expect.objectContaining({ action: 'entry.rejected', entityId: 'en1' }));
    });

    it('rejected:false clears the reject fields and audits entry.unrejected', async () => {
      const update = jest.fn().mockResolvedValue({ id: 'en1', rejected: false });
      const tx = { pipelineEntry: { findFirst: jest.fn().mockResolvedValue({ id: 'en1', jobId: 'job-1' }), update } };
      tenantPrisma.forTenant.mockImplementation((_c, fn) => fn(tx));

      await service.patchEntry(context, 'user-1', 'en1', { rejected: false });

      expect(update).toHaveBeenCalledWith({
        where: { id: 'en1' },
        data: { rejected: false, rejectedReason: null, rejectedAt: null },
      });
      expect(audit.record).toHaveBeenCalledWith(context, expect.objectContaining({ action: 'entry.unrejected', entityId: 'en1' }));
    });

    it('throws BadRequestException for a patch with neither stage nor rejected, and never calls update', async () => {
      const update = jest.fn();
      const tx = { pipelineEntry: { findFirst: jest.fn().mockResolvedValue({ id: 'en1', jobId: 'job-1' }), update } };
      tenantPrisma.forTenant.mockImplementation((_c, fn) => fn(tx));

      await expect(service.patchEntry(context, 'user-1', 'en1', { reason: 'typo' } as any)).rejects.toThrow(BadRequestException);
      expect(update).not.toHaveBeenCalled();
    });

    it('throws NotFoundException for an unknown entry', async () => {
      const tx = { pipelineEntry: { findFirst: jest.fn().mockResolvedValue(null) } };
      tenantPrisma.forTenant.mockImplementation((_c, fn) => fn(tx));

      await expect(service.patchEntry(context, 'user-1', 'missing', { stage: 'interview' })).rejects.toThrow(NotFoundException);
    });
  });

  describe('linkExam', () => {
    it('links and backfills already-invited candidates as enteredVia=exam', async () => {
      const upsert = jest.fn().mockResolvedValue({ id: 'en1' });
      const tx = {
        job: { findFirst: jest.fn().mockResolvedValue({ id: 'job-1' }) },
        // findMany backs syncEntriesForInvitations's own lookup of jobs linked to this exam --
        // reused by linkExam for the backfill, so it must resolve the job just upserted above.
        jobExam: { upsert: jest.fn().mockResolvedValue({ id: 'jx1' }), findMany: jest.fn().mockResolvedValue([{ jobId: 'job-1' }]) },
        invitation: { findMany: jest.fn().mockResolvedValue([{ candidateId: 'c1' }, { candidateId: 'c2' }]) },
        pipelineEntry: { upsert },
      };
      tenantPrisma.forTenant.mockImplementation((_c, fn) => fn(tx));

      const result = await service.linkExam(context, 'user-1', 'job-1', 'e1');

      expect(result).toEqual({ success: true });
      expect(tx.jobExam.upsert).toHaveBeenCalledWith({
        where: { jobId_examId: { jobId: 'job-1', examId: 'e1' } },
        create: { organizationId: 'org-1', jobId: 'job-1', examId: 'e1' },
        update: {},
      });
      expect(tx.invitation.findMany).toHaveBeenCalledWith({ where: { examId: 'e1' }, select: { candidateId: true } });
      expect(upsert).toHaveBeenCalledTimes(2);
      expect(upsert.mock.calls[0][0].create).toMatchObject({ enteredVia: 'exam', stage: 'applied' });
      expect(upsert.mock.calls[0][0].update).toEqual({});
      expect(audit.record).toHaveBeenCalledWith(context, expect.objectContaining({
        actorUserId: 'user-1', action: 'job.exam_linked', entityType: 'job', entityId: 'job-1', metadata: { examId: 'e1' },
      }));
    });

    it('throws NotFoundException when the job is not in org', async () => {
      const tx = { job: { findFirst: jest.fn().mockResolvedValue(null) } };
      tenantPrisma.forTenant.mockImplementation((_c, fn) => fn(tx));

      await expect(service.linkExam(context, 'user-1', 'missing-job', 'e1')).rejects.toThrow(NotFoundException);
    });
  });

  describe('unlinkExam', () => {
    it('deletes the JobExam row idempotently and audits job.exam_unlinked', async () => {
      const deleteMany = jest.fn().mockResolvedValue({ count: 1 });
      const tx = { jobExam: { deleteMany } };
      tenantPrisma.forTenant.mockImplementation((_c, fn) => fn(tx));

      const result = await service.unlinkExam(context, 'user-1', 'job-1', 'e1');

      expect(result).toEqual({ success: true });
      expect(deleteMany).toHaveBeenCalledWith({ where: { jobId: 'job-1', examId: 'e1' } });
      expect(audit.record).toHaveBeenCalledWith(context, expect.objectContaining({
        actorUserId: 'user-1', action: 'job.exam_unlinked', entityType: 'job', entityId: 'job-1', metadata: { examId: 'e1' },
      }));
    });

    it('is a no-op (not an error) when the link does not exist', async () => {
      const deleteMany = jest.fn().mockResolvedValue({ count: 0 });
      const tx = { jobExam: { deleteMany } };
      tenantPrisma.forTenant.mockImplementation((_c, fn) => fn(tx));

      await expect(service.unlinkExam(context, 'user-1', 'job-1', 'e1')).resolves.toEqual({ success: true });
    });
  });

  describe('syncEntriesForInvitations', () => {
    it('upserts one entry per linked job x candidate', async () => {
      const upsert = jest.fn().mockResolvedValue({ id: 'en1' });
      const tx = { jobExam: { findMany: jest.fn().mockResolvedValue([{ jobId: 'job-1' }, { jobId: 'job-2' }]) }, pipelineEntry: { upsert } };

      await service.syncEntriesForInvitations(tx as any, context, 'e1', ['c1']);

      expect(tx.jobExam.findMany).toHaveBeenCalledWith({ where: { examId: 'e1' }, select: { jobId: true } });
      expect(upsert).toHaveBeenCalledTimes(2); // job-1xc1, job-2xc1
      expect(upsert).toHaveBeenCalledWith({
        where: { jobId_candidateId: { jobId: 'job-1', candidateId: 'c1' } },
        create: { organizationId: 'org-1', jobId: 'job-1', candidateId: 'c1', stage: 'applied', enteredVia: 'exam' },
        update: {},
      });
    });

    it('is a no-op when the exam is linked to no job', async () => {
      const upsert = jest.fn();
      const tx = { jobExam: { findMany: jest.fn().mockResolvedValue([]) }, pipelineEntry: { upsert } };

      await service.syncEntriesForInvitations(tx as any, context, 'e1', ['c1', 'c2']);

      expect(upsert).not.toHaveBeenCalled();
    });

    it('upserts every job x candidate pair for multiple candidates', async () => {
      const upsert = jest.fn().mockResolvedValue({ id: 'en1' });
      const tx = { jobExam: { findMany: jest.fn().mockResolvedValue([{ jobId: 'job-1' }]) }, pipelineEntry: { upsert } };

      await service.syncEntriesForInvitations(tx as any, context, 'e1', ['c1', 'c2']);

      expect(upsert).toHaveBeenCalledTimes(2);
    });
  });

  describe('deleteEntry', () => {
    it('deletes the entry and audits entry.removed', async () => {
      const del = jest.fn().mockResolvedValue({ id: 'en1' });
      const tx = { pipelineEntry: { findFirst: jest.fn().mockResolvedValue({ id: 'en1', jobId: 'job-1' }), delete: del } };
      tenantPrisma.forTenant.mockImplementation((_c, fn) => fn(tx));

      const result = await service.deleteEntry(context, 'user-1', 'en1');

      expect(result).toEqual({ success: true });
      expect(del).toHaveBeenCalledWith({ where: { id: 'en1' } });
      expect(audit.record).toHaveBeenCalledWith(context, expect.objectContaining({ action: 'entry.removed', entityId: 'en1' }));
    });

    it('throws NotFoundException for an unknown entry', async () => {
      const tx = { pipelineEntry: { findFirst: jest.fn().mockResolvedValue(null) } };
      tenantPrisma.forTenant.mockImplementation((_c, fn) => fn(tx));

      await expect(service.deleteEntry(context, 'user-1', 'missing')).rejects.toThrow(NotFoundException);
    });
  });
});
