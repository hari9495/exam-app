import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PipelineService } from './pipeline.service';
import { computeCriteriaHash } from '../candidate-fit/candidate-fit.core';

describe('PipelineService', () => {
  let service: PipelineService;
  let tenantPrisma: { forTenant: jest.Mock };
  let audit: { record: jest.Mock };
  let templates: { resolveForEvent: jest.Mock };
  let messages: { sendMessage: jest.Mock };
  let integrationEvents: { emit: jest.Mock };
  const context = { organizationId: 'org-1', isSuperAdmin: false } as any;

  beforeEach(() => {
    tenantPrisma = { forTenant: jest.fn() };
    audit = { record: jest.fn() };
    templates = { resolveForEvent: jest.fn().mockResolvedValue(null) };
    messages = { sendMessage: jest.fn().mockResolvedValue({ id: 'email-1' }) };
    integrationEvents = { emit: jest.fn().mockResolvedValue(undefined) };
    service = new PipelineService(tenantPrisma as any, audit as any, templates as any, messages as any, integrationEvents as any);
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

  it('getJob surfaces publicApplyEnabled and applyToken from the row', async () => {
    const tx = {
      job: {
        findFirst: jest.fn().mockResolvedValue({ id: 'job-1', publicApplyEnabled: true, applyToken: 'tok-abc' }),
      },
      jobExam: { findMany: jest.fn().mockResolvedValue([]) },
    };
    tenantPrisma.forTenant.mockImplementation((_c, fn) => fn(tx));

    const job = await service.getJob(context, 'job-1');

    expect(job.publicApplyEnabled).toBe(true);
    expect(job.applyToken).toBe('tok-abc');
  });

  describe('updateJob publicApplyEnabled toggle', () => {
    it('mints an applyToken via randomUUID when enabling for the first time', async () => {
      const update = jest.fn().mockImplementation(({ data }) => ({ id: 'job-1', ...data }));
      const tx = {
        job: {
          findFirst: jest.fn().mockResolvedValue({ id: 'job-1', applyToken: null, publicApplyEnabled: false }),
          update,
        },
      };
      tenantPrisma.forTenant.mockImplementation((_c, fn) => fn(tx));

      await service.updateJob(context, 'user-1', 'job-1', { publicApplyEnabled: true });

      expect(update).toHaveBeenCalledWith({
        where: { id: 'job-1' },
        data: expect.objectContaining({ publicApplyEnabled: true, applyToken: expect.any(String) }),
      });
      const mintedToken = update.mock.calls[0][0].data.applyToken;
      expect(mintedToken).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
    });

    it('is idempotent on re-enable: does not rotate an existing applyToken', async () => {
      const update = jest.fn().mockImplementation(({ data }) => ({ id: 'job-1', ...data }));
      const tx = {
        job: {
          findFirst: jest.fn().mockResolvedValue({ id: 'job-1', applyToken: 'existing-token', publicApplyEnabled: false }),
          update,
        },
      };
      tenantPrisma.forTenant.mockImplementation((_c, fn) => fn(tx));

      await service.updateJob(context, 'user-1', 'job-1', { publicApplyEnabled: true });

      expect(update).toHaveBeenCalledWith({
        where: { id: 'job-1' },
        data: expect.objectContaining({ publicApplyEnabled: true }),
      });
      expect(update.mock.calls[0][0].data.applyToken).toBeUndefined();
    });

    it('toggling off leaves the existing applyToken untouched (no clear, no rotate)', async () => {
      const update = jest.fn().mockImplementation(({ data }) => ({ id: 'job-1', ...data }));
      const tx = {
        job: {
          findFirst: jest.fn().mockResolvedValue({ id: 'job-1', applyToken: 'existing-token', publicApplyEnabled: true }),
          update,
        },
      };
      tenantPrisma.forTenant.mockImplementation((_c, fn) => fn(tx));

      await service.updateJob(context, 'user-1', 'job-1', { publicApplyEnabled: false });

      expect(update).toHaveBeenCalledWith({
        where: { id: 'job-1' },
        data: expect.objectContaining({ publicApplyEnabled: false }),
      });
      expect(update.mock.calls[0][0].data.applyToken).toBeUndefined();
    });

    it('leaves applyToken alone entirely when publicApplyEnabled is not part of the update', async () => {
      const update = jest.fn().mockImplementation(({ data }) => ({ id: 'job-1', ...data }));
      const tx = {
        job: {
          findFirst: jest.fn().mockResolvedValue({ id: 'job-1', applyToken: null, publicApplyEnabled: false }),
          update,
        },
      };
      tenantPrisma.forTenant.mockImplementation((_c, fn) => fn(tx));

      await service.updateJob(context, 'user-1', 'job-1', { title: 'New Title' });

      expect(update.mock.calls[0][0].data).not.toHaveProperty('publicApplyEnabled');
      expect(update.mock.calls[0][0].data).not.toHaveProperty('applyToken');
    });
  });

  describe('updateJob fit criteria', () => {
    let tx: any;
    beforeEach(() => {
      const update = jest.fn().mockImplementation(({ data }) => ({ id: 'job-1', ...data }));
      tx = {
        job: {
          findFirst: jest.fn().mockResolvedValue({ id: 'job-1', applyToken: null, publicApplyEnabled: false }),
          update,
        },
      };
      tenantPrisma.forTenant.mockImplementation((_c, fn) => fn(tx));
    });

    it('persists fitCriteria and a valid rubric (as JSON string)', async () => {
      await service.updateJob(context, 'user-1', 'job-1', {
        fitCriteria: 'Must ship fast',
        fitRubric: [{ label: 'Python', weight: 60 }, { label: 'AWS', weight: 40 }],
      } as any);
      const data = tx.job.update.mock.calls.at(-1)[0].data;
      expect(data.fitCriteria).toBe('Must ship fast');
      expect(JSON.parse(data.fitRubric)).toEqual([{ label: 'Python', weight: 60 }, { label: 'AWS', weight: 40 }]);
    });

    it('clears the rubric when passed null / empty array', async () => {
      await service.updateJob(context, 'user-1', 'job-1', { fitRubric: [] } as any);
      expect(tx.job.update.mock.calls.at(-1)[0].data.fitRubric).toBeNull();
    });

    it('rejects a rubric whose weights do not sum to 100', async () => {
      await expect(
        service.updateJob(context, 'user-1', 'job-1', { fitRubric: [{ label: 'A', weight: 50 }] } as any),
      ).rejects.toThrow(/sum to 100/i);
    });
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
          { id: 'en2', candidateId: 'c2', stage: 'interview', rejected: true, enteredVia: 'exam', rejectedReason: 'failed screen',
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
    expect(board.rejected[0].rejectedReason).toBe('failed screen');
  });

  it('getPipeline includes fit fields per entry (score, status, stale)', async () => {
    // Job's current criteria hash is computed from these fields (see computeCriteriaHash).
    const job = { id: 'job-1', title: 'Backend Eng', description: 'desc', fitCriteria: 'crit', fitRubric: null };
    const currentHash = computeCriteriaHash({
      title: job.title, description: job.description, fitCriteria: job.fitCriteria, fitRubric: job.fitRubric,
    });
    const tx = {
      job: { findFirst: jest.fn().mockResolvedValue(job) },
      jobExam: { findMany: jest.fn().mockResolvedValue([]) },
      pipelineEntry: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'en1', candidateId: 'c1', stage: 'applied', rejected: false, enteredVia: 'manual',
            candidate: { name: 'Amy', email: 'amy@x.com', invitations: [] },
            feedback: [],
            fitAssessment: { status: 'done', overallScore: 77, criteriaHash: 'H' } }, // stale: 'H' !== currentHash
          { id: 'en2', candidateId: 'c2', stage: 'applied', rejected: false, enteredVia: 'manual',
            candidate: { name: 'Bo', email: 'bo@x.com', invitations: [] },
            feedback: [],
            fitAssessment: null },
        ]),
      },
    };
    tenantPrisma.forTenant.mockImplementation((_c, fn) => fn(tx));

    const board = await service.getPipeline(context, 'job-1');

    const scored = board.stages.applied.find((r) => r.entryId === 'en1')!;
    expect(scored.fitScore).toBe(77);
    expect(scored.fitStatus).toBe('done');
    expect(scored.fitStale).toBe(true); // stored hash 'H' !== currentHash

    const unscored = board.stages.applied.find((r) => r.entryId === 'en2')!;
    expect(unscored.fitScore).toBeNull();
    expect(unscored.fitStatus).toBeNull();
    expect(unscored.fitStale).toBe(false);
  });

  it('getPipeline marks fitStale false when the stored criteriaHash matches the current hash', async () => {
    const job = { id: 'job-1', title: 'Backend Eng', description: 'desc', fitCriteria: 'crit', fitRubric: null };
    const currentHash = computeCriteriaHash({
      title: job.title, description: job.description, fitCriteria: job.fitCriteria, fitRubric: job.fitRubric,
    });
    const tx = {
      job: { findFirst: jest.fn().mockResolvedValue(job) },
      jobExam: { findMany: jest.fn().mockResolvedValue([]) },
      pipelineEntry: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'en1', candidateId: 'c1', stage: 'applied', rejected: false, enteredVia: 'manual',
            candidate: { name: 'Amy', email: 'amy@x.com', invitations: [] },
            feedback: [],
            fitAssessment: { status: 'done', overallScore: 90, criteriaHash: currentHash } },
        ]),
      },
    };
    tenantPrisma.forTenant.mockImplementation((_c, fn) => fn(tx));

    const board = await service.getPipeline(context, 'job-1');

    expect(board.stages.applied[0].fitStale).toBe(false);
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

  describe('exportJobCandidatesCsv', () => {
    it('builds a header + one row per candidate, comma-quoted and formula-injection-safe', async () => {
      const tx = {
        job: { findFirst: jest.fn().mockResolvedValue({ id: 'job-1' }) },
        pipelineEntry: {
          findMany: jest.fn().mockResolvedValue([
            { stage: 'hired', rejected: false, createdAt: new Date('2026-08-01T00:00:00.000Z'), candidate: { name: 'Asha, Rao', email: 'asha@example.com', phone: '+91' } },
            { stage: 'applied', rejected: true, createdAt: new Date('2026-08-02T00:00:00.000Z'), candidate: { name: '=cmd()', email: 'x@y.com', phone: null } },
          ]),
        },
      };
      tenantPrisma.forTenant.mockImplementation((_c, fn) => fn(tx));

      const csv = await service.exportJobCandidatesCsv(context, 'job-1');
      const lines = csv.trim().split('\r\n');

      expect(lines[0]).toBe('Name,Email,Phone,Stage,Status,Applied At');
      // +91 phone is prefixed with ' -- a leading + is a spreadsheet formula-injection vector (and keeps it as text)
      expect(lines[1]).toBe("\"Asha, Rao\",asha@example.com,'+91,hired,active,2026-08-01T00:00:00.000Z");
      expect(lines[2]).toContain("'=cmd()"); // formula prefix neutralized
      expect(lines[2]).toContain('rejected');
    });

    it('throws NotFound for a job outside the org', async () => {
      tenantPrisma.forTenant.mockImplementation((_c, fn) => fn({ job: { findFirst: jest.fn().mockResolvedValue(null) } }));
      await expect(service.exportJobCandidatesCsv(context, 'nope')).rejects.toThrow(NotFoundException);
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

    it('emits candidate.hired (subject/role/linkPath) when moved to the hired stage', async () => {
      const update = jest.fn().mockResolvedValue({ id: 'en1', stage: 'hired' });
      const tx = {
        pipelineEntry: {
          findFirst: jest.fn().mockResolvedValue({ id: 'en1', jobId: 'job-1' }),
          update,
          findUnique: jest.fn().mockResolvedValue({ candidateId: 'cand-1', candidate: { name: 'Asha Rao' }, job: { title: 'Backend Engineer' } }),
        },
      };
      tenantPrisma.forTenant.mockImplementation((_c, fn) => fn(tx));

      await service.patchEntry(context, 'user-1', 'en1', { stage: 'hired' });

      expect(integrationEvents.emit).toHaveBeenCalledWith(
        'org-1',
        'candidate.hired',
        expect.objectContaining({ subject: 'Asha Rao', roleTitle: 'Backend Engineer', linkPath: '/candidates/cand-1' }),
      );
    });

    it('does not emit candidate.hired on a non-hired stage move', async () => {
      const tx = { pipelineEntry: { findFirst: jest.fn().mockResolvedValue({ id: 'en1', jobId: 'job-1' }), update: jest.fn().mockResolvedValue({ id: 'en1', stage: 'interview' }) } };
      tenantPrisma.forTenant.mockImplementation((_c, fn) => fn(tx));

      await service.patchEntry(context, 'user-1', 'en1', { stage: 'interview' });

      expect(integrationEvents.emit).not.toHaveBeenCalled();
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

    describe('stage-move comms hook', () => {
      const tx = { pipelineEntry: { findFirst: jest.fn().mockResolvedValue({ id: 'entry-1', jobId: 'job-1' }), update: jest.fn().mockResolvedValue({ id: 'entry-1', stage: 'offer' }) } };
      beforeEach(() => {
        tenantPrisma.forTenant.mockImplementation((_c, fn) => fn(tx));
      });

      it('auto-sends when the target event resolves an auto template', async () => {
        templates.resolveForEvent.mockResolvedValue({ id: 't1', subject: 's', body: 'b', triggerMode: 'auto' });

        const result = await service.patchEntry(context, 'user-1', 'entry-1', { stage: 'offer' });

        expect(messages.sendMessage).toHaveBeenCalledWith(context, null, 'entry-1', expect.objectContaining({ source: 'stage_auto', templateId: 't1', subject: 's', body: 'b' }));
        expect(result.pendingMessage).toBeUndefined();
      });

      it('returns a pendingMessage (does not send) for a prompt template', async () => {
        templates.resolveForEvent.mockResolvedValue({ id: 't1', subject: 's', body: 'b', triggerMode: 'prompt' });

        const r = await service.patchEntry(context, 'user-1', 'entry-1', { stage: 'interview' });

        expect(r.pendingMessage).toMatchObject({ templateId: 't1', subject: 's', body: 'b' });
        expect(messages.sendMessage).not.toHaveBeenCalled();
      });

      it('maps a rejection to the rejected event', async () => {
        templates.resolveForEvent.mockResolvedValue(null);

        await service.patchEntry(context, 'user-1', 'entry-1', { rejected: true });

        expect(templates.resolveForEvent).toHaveBeenCalledWith(context, 'rejected');
      });

      it('does nothing when no template resolves', async () => {
        templates.resolveForEvent.mockResolvedValue(null);

        const r = await service.patchEntry(context, 'user-1', 'entry-1', { stage: 'screened' });

        expect(r.pendingMessage).toBeUndefined();
        expect(messages.sendMessage).not.toHaveBeenCalled();
      });

      it('does not resolve a template (or send) when neither stage nor rejected:true is set', async () => {
        await service.patchEntry(context, 'user-1', 'entry-1', { rejected: false });

        expect(templates.resolveForEvent).not.toHaveBeenCalled();
        expect(messages.sendMessage).not.toHaveBeenCalled();
      });

      it('still returns the moved entry when the post-commit comms resolution throws', async () => {
        templates.resolveForEvent.mockRejectedValue(new Error('pool exhausted'));

        const result = await service.patchEntry(context, 'user-1', 'entry-1', { stage: 'offer' });

        expect(result.entry).toEqual({ id: 'entry-1', stage: 'offer' });
        expect(result.pendingMessage).toBeUndefined();
      });
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

  it('upsertDriveEntry upserts a drive entry stamp-if-absent using the caller tx', async () => {
    const upsert = jest.fn().mockResolvedValue({ id: 'en-1' });
    const tx = { pipelineEntry: { upsert } };
    await service.upsertDriveEntry(tx as any, context, 'job-1', 'cand-1');
    expect(upsert).toHaveBeenCalledWith({
      where: { jobId_candidateId: { jobId: 'job-1', candidateId: 'cand-1' } },
      create: { organizationId: 'org-1', jobId: 'job-1', candidateId: 'cand-1', stage: 'applied', enteredVia: 'drive' },
      update: {},
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

  describe('addFeedback', () => {
    it('accepts a rating-only feedback, stores note as null, and audits feedback.added', async () => {
      const create = jest.fn().mockResolvedValue({ id: 'fb1', entryId: 'en1', authorUserId: 'user-1', note: null, rating: 5 });
      const tx = {
        pipelineEntry: { findFirst: jest.fn().mockResolvedValue({ id: 'en1', jobId: 'job-1' }) },
        pipelineFeedback: { create },
      };
      tenantPrisma.forTenant.mockImplementation((_c, fn) => fn(tx));

      const out = await service.addFeedback(context, 'user-1', 'en1', { rating: 5 });

      expect(out).toEqual({ id: 'fb1', entryId: 'en1', authorUserId: 'user-1', note: null, rating: 5 });
      expect(create).toHaveBeenCalledWith({
        data: { organizationId: 'org-1', entryId: 'en1', authorUserId: 'user-1', note: null, rating: 5 },
      });
      expect(audit.record).toHaveBeenCalledWith(context, expect.objectContaining({
        actorUserId: 'user-1', action: 'feedback.added', entityType: 'pipeline_entry', entityId: 'en1',
      }));
    });

    it('throws BadRequestException when neither note nor rating is given, and never calls create', async () => {
      const create = jest.fn();
      const tx = { pipelineEntry: { findFirst: jest.fn() }, pipelineFeedback: { create } };
      tenantPrisma.forTenant.mockImplementation((_c, fn) => fn(tx));

      await expect(service.addFeedback(context, 'user-1', 'en1', {})).rejects.toThrow(BadRequestException);
      expect(create).not.toHaveBeenCalled();
    });

    it('throws BadRequestException when note is only whitespace and rating is absent', async () => {
      const create = jest.fn();
      const tx = { pipelineEntry: { findFirst: jest.fn() }, pipelineFeedback: { create } };
      tenantPrisma.forTenant.mockImplementation((_c, fn) => fn(tx));

      await expect(service.addFeedback(context, 'user-1', 'en1', { note: '   ' })).rejects.toThrow(BadRequestException);
      expect(create).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when the entry is not in org, and never calls create', async () => {
      const create = jest.fn();
      const tx = { pipelineEntry: { findFirst: jest.fn().mockResolvedValue(null) }, pipelineFeedback: { create } };
      tenantPrisma.forTenant.mockImplementation((_c, fn) => fn(tx));

      await expect(service.addFeedback(context, 'user-1', 'missing', { rating: 3 })).rejects.toThrow(NotFoundException);
      expect(create).not.toHaveBeenCalled();
    });
  });

  describe('listFeedback', () => {
    it('returns rows newest-first with authorName joined', async () => {
      const tx = {
        pipelineEntry: { findFirst: jest.fn().mockResolvedValue({ id: 'en1', jobId: 'job-1' }) },
        pipelineFeedback: {
          findMany: jest.fn().mockResolvedValue([
            { id: 'fb2', entryId: 'en1', authorUserId: 'user-2', note: 'great', rating: 5, createdAt: new Date('2026-01-02') },
            { id: 'fb1', entryId: 'en1', authorUserId: 'user-1', note: null, rating: 3, createdAt: new Date('2026-01-01') },
          ]),
        },
        user: { findMany: jest.fn().mockResolvedValue([{ id: 'user-1', name: 'Amy' }, { id: 'user-2', name: 'Bo' }]) },
      };
      tenantPrisma.forTenant.mockImplementation((_c, fn) => fn(tx));

      const rows = await service.listFeedback(context, 'en1');

      expect(tx.pipelineFeedback.findMany).toHaveBeenCalledWith({ where: { entryId: 'en1' }, orderBy: { createdAt: 'desc' } });
      expect(tx.user.findMany).toHaveBeenCalledWith({ where: { id: { in: ['user-2', 'user-1'] } }, select: { id: true, name: true } });
      expect(rows).toEqual([
        { id: 'fb2', authorUserId: 'user-2', authorName: 'Bo', note: 'great', rating: 5, createdAt: new Date('2026-01-02') },
        { id: 'fb1', authorUserId: 'user-1', authorName: 'Amy', note: null, rating: 3, createdAt: new Date('2026-01-01') },
      ]);
    });

    it('throws NotFoundException when the entry is not in org', async () => {
      const tx = { pipelineEntry: { findFirst: jest.fn().mockResolvedValue(null) } };
      tenantPrisma.forTenant.mockImplementation((_c, fn) => fn(tx));

      await expect(service.listFeedback(context, 'missing')).rejects.toThrow(NotFoundException);
    });
  });
});
