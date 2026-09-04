import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { PipelineService } from './pipeline.service';
import { computeCriteriaHash } from '../candidate-fit/candidate-fit.core';

// addEntry/patchEntry now call recomputeGlobalStage(tx, ...) as their last tx write, which reads
// tx.pipelineEntry.findMany + tx.candidateEmail.count and writes tx.candidate.update. Any test tx
// that reaches that point needs these three -- default to an empty/no-op shape, letting a test's
// own tx override any of them (defaults spread first, so an explicit mock always wins).
function withRecomputeMocks(tx: any) {
  tx.pipelineEntry = { findMany: jest.fn().mockResolvedValue([]), ...tx.pipelineEntry };
  tx.candidateEmail = { count: jest.fn().mockResolvedValue(0), ...tx.candidateEmail };
  tx.candidate = { update: jest.fn().mockResolvedValue({}), ...tx.candidate };
  // patchEntry's hire path reads tx.organization.findFirst to check autoArchiveSiblingsOnHire --
  // default it off (no-op) so pre-existing hire tests that don't care about this feature are
  // unaffected; a test that does care overrides tx.organization itself.
  tx.organization = { findFirst: jest.fn().mockResolvedValue({ autoArchiveSiblingsOnHire: false }), ...tx.organization };
  return tx;
}

describe('PipelineService', () => {
  let service: PipelineService;
  let tenantPrisma: { forTenant: jest.Mock };
  let audit: { record: jest.Mock };
  let templates: { resolveForStage: jest.Mock };
  let messages: { sendMessage: jest.Mock };
  let integrationEvents: { emit: jest.Mock };
  let notifications: { createMentions: jest.Mock; notify: jest.Mock };
  let approvals: { getChains: jest.Mock; submit: jest.Mock; isConfigurer: jest.Mock; cancelForSubject: jest.Mock; getSummariesFor: jest.Mock };
  let pipelines: { getDefaultPipeline: jest.Mock; resolveStatus: jest.Mock };
  const context = { organizationId: 'org-1', isSuperAdmin: false } as any;

  const chains = (requisitionEnabled: boolean) => ({
    requisition: { gate: 'requisition', enabled: requisitionEnabled, steps: [] },
    offer: { gate: 'offer', enabled: false, steps: [] },
  });

  beforeEach(() => {
    tenantPrisma = { forTenant: jest.fn() };
    audit = { record: jest.fn() };
    templates = { resolveForStage: jest.fn().mockResolvedValue(null) };
    messages = { sendMessage: jest.fn().mockResolvedValue({ id: 'email-1' }) };
    integrationEvents = { emit: jest.fn().mockResolvedValue(undefined) };
    notifications = { createMentions: jest.fn().mockResolvedValue(undefined), notify: jest.fn().mockResolvedValue(undefined) };
    approvals = {
      getChains: jest.fn().mockResolvedValue(chains(false)),
      submit: jest.fn(),
      isConfigurer: jest.fn(),
      cancelForSubject: jest.fn(),
      getSummariesFor: jest.fn().mockResolvedValue(new Map()),
    };
    pipelines = {
      getDefaultPipeline: jest.fn().mockResolvedValue({ id: 'pipeline-default' }),
      resolveStatus: jest.fn(),
    };
    service = new PipelineService(tenantPrisma as any, audit as any, templates as any, messages as any, integrationEvents as any, notifications as any, approvals as any, pipelines as any);
  });

  it('createJob writes org-scoped and audits', async () => {
    const create = jest.fn().mockResolvedValue({ id: 'job-1', title: 'Backend Eng' });
    tenantPrisma.forTenant.mockImplementation((_c, fn) => fn({ job: { create } }));
    const out = await service.createJob(context, 'user-1', { title: 'Backend Eng' });
    expect(out).toEqual({ id: 'job-1', title: 'Backend Eng' });
    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({ organizationId: 'org-1', title: 'Backend Eng', description: undefined, createdById: 'user-1', status: 'open' }),
    });
    expect(audit.record).toHaveBeenCalledWith(context, expect.objectContaining({ action: 'job.created', entityId: 'job-1' }));
  });

  describe('requisition gating', () => {
    it('creates a job as draft when the requisition gate is enabled', async () => {
      approvals.getChains.mockResolvedValue(chains(true));
      const create = jest.fn().mockResolvedValue({ id: 'job-1', status: 'draft' });
      tenantPrisma.forTenant.mockImplementation((_c, fn) => fn({ job: { create } }));

      await service.createJob(context, 'user-1', { title: 'Backend Eng' });

      expect(create).toHaveBeenCalledWith({ data: expect.objectContaining({ status: 'draft' }) });
    });

    it('creates a job as open when the gate is disabled', async () => {
      approvals.getChains.mockResolvedValue(chains(false));
      const create = jest.fn().mockResolvedValue({ id: 'job-1', status: 'open' });
      tenantPrisma.forTenant.mockImplementation((_c, fn) => fn({ job: { create } }));

      await service.createJob(context, 'user-1', { title: 'Backend Eng' });

      expect(create).toHaveBeenCalledWith({ data: expect.objectContaining({ status: 'open' }) });
    });

    it('refuses addEntry when the job is not open (409)', async () => {
      const tx = { job: { findFirst: jest.fn().mockResolvedValue({ id: 'job-1', status: 'draft' }) } };
      tenantPrisma.forTenant.mockImplementation((_c, fn) => fn(tx));

      await expect(service.addEntry(context, 'user-1', 'job-1', { candidateId: 'c1' })).rejects.toThrow(ConflictException);
    });

    it('refuses setPublicApply (enabling) when the job is not open (409)', async () => {
      const tx = { job: { findFirst: jest.fn().mockResolvedValue({ id: 'job-1', status: 'draft', applyToken: null }) } };
      tenantPrisma.forTenant.mockImplementation((_c, fn) => fn(tx));

      await expect(service.updateJob(context, 'user-1', 'job-1', { publicApplyEnabled: true })).rejects.toThrow(ConflictException);
    });

    it('refuses addEntry when the job is pending_approval (409)', async () => {
      const tx = { job: { findFirst: jest.fn().mockResolvedValue({ id: 'job-1', status: 'pending_approval' }) } };
      tenantPrisma.forTenant.mockImplementation((_c, fn) => fn(tx));

      await expect(service.addEntry(context, 'user-1', 'job-1', { candidateId: 'c1' })).rejects.toThrow(ConflictException);
    });

    it('refuses setPublicApply (enabling) when the job is pending_approval (409)', async () => {
      const tx = { job: { findFirst: jest.fn().mockResolvedValue({ id: 'job-1', status: 'pending_approval', applyToken: null }) } };
      tenantPrisma.forTenant.mockImplementation((_c, fn) => fn(tx));

      await expect(service.updateJob(context, 'user-1', 'job-1', { publicApplyEnabled: true })).rejects.toThrow(ConflictException);
    });

    // Gate-off regression: pre-feature there was no status guard at all, so adding a candidate
    // to / re-enabling public apply on a CLOSED job must keep working -- the gate only exists
    // for draft/pending_approval, the states the approvals feature actually introduced.
    it('allows addEntry on a closed job (gate-off regression)', async () => {
      const upsert = jest.fn().mockResolvedValue({ id: 'en1', stage: 'applied', enteredVia: 'manual' });
      const tx = {
        job: { findFirst: jest.fn().mockResolvedValue({ id: 'job-1', status: 'closed' }) },
        candidate: { findFirst: jest.fn().mockResolvedValue({ id: 'c1', organizationId: 'org-1' }) },
        pipelineEntry: { upsert },
      };
      tenantPrisma.forTenant.mockImplementation((_c, fn) => fn(withRecomputeMocks(tx)));

      await expect(service.addEntry(context, 'user-1', 'job-1', { candidateId: 'c1' })).resolves.toBeDefined();
      expect(upsert).toHaveBeenCalled();
    });

    it('allows re-enabling public apply on a closed job (gate-off regression)', async () => {
      const update = jest.fn().mockImplementation(({ data }) => ({ id: 'job-1', ...data }));
      const tx = {
        job: {
          findFirst: jest.fn().mockResolvedValue({ id: 'job-1', status: 'closed', applyToken: 'existing-token', publicApplyEnabled: false }),
          update,
        },
      };
      tenantPrisma.forTenant.mockImplementation((_c, fn) => fn(tx));

      await expect(service.updateJob(context, 'user-1', 'job-1', { publicApplyEnabled: true })).resolves.toBeDefined();
      expect(update).toHaveBeenCalledWith({
        where: { id: 'job-1' },
        data: expect.objectContaining({ publicApplyEnabled: true }),
      });
    });
  });

  describe('updateJob gate-bypass guard on status', () => {
    it('rejects PATCH status:open on a draft job (409)', async () => {
      const tx = { job: { findFirst: jest.fn().mockResolvedValue({ id: 'job-1', status: 'draft' }) } };
      tenantPrisma.forTenant.mockImplementation((_c, fn) => fn(tx));

      await expect(service.updateJob(context, 'user-1', 'job-1', { status: 'open' } as any)).rejects.toThrow(ConflictException);
    });

    it('rejects PATCH status:open on a pending_approval job (409)', async () => {
      const tx = { job: { findFirst: jest.fn().mockResolvedValue({ id: 'job-1', status: 'pending_approval' }) } };
      tenantPrisma.forTenant.mockImplementation((_c, fn) => fn(tx));

      await expect(service.updateJob(context, 'user-1', 'job-1', { status: 'open' } as any)).rejects.toThrow(ConflictException);
    });

    it('allows closed -> open (reopening a previously-open job stays a free status flip)', async () => {
      const update = jest.fn().mockImplementation(({ data }) => ({ id: 'job-1', ...data }));
      const tx = { job: { findFirst: jest.fn().mockResolvedValue({ id: 'job-1', status: 'closed' }), update } };
      tenantPrisma.forTenant.mockImplementation((_c, fn) => fn(tx));

      await expect(service.updateJob(context, 'user-1', 'job-1', { status: 'open' } as any)).resolves.toBeDefined();
      expect(update).toHaveBeenCalledWith({ where: { id: 'job-1' }, data: expect.objectContaining({ status: 'open' }) });
    });

    it('allows a normal field edit on an open job (no status change)', async () => {
      const update = jest.fn().mockImplementation(({ data }) => ({ id: 'job-1', ...data }));
      const tx = { job: { findFirst: jest.fn().mockResolvedValue({ id: 'job-1', status: 'open', title: 'Old Title' }), update } };
      tenantPrisma.forTenant.mockImplementation((_c, fn) => fn(tx));

      await expect(service.updateJob(context, 'user-1', 'job-1', { title: 'New Title' })).resolves.toBeDefined();
      expect(update).toHaveBeenCalledWith({ where: { id: 'job-1' }, data: expect.objectContaining({ title: 'New Title' }) });
    });

    it('allows open -> closed', async () => {
      const update = jest.fn().mockImplementation(({ data }) => ({ id: 'job-1', ...data }));
      const tx = {
        job: { findFirst: jest.fn().mockResolvedValue({ id: 'job-1', status: 'open' }), update },
        pipelineEntry: { findMany: jest.fn().mockResolvedValue([]), updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
      };
      tenantPrisma.forTenant.mockImplementation((_c, fn) => fn(tx));

      await expect(service.updateJob(context, 'user-1', 'job-1', { status: 'closed' })).resolves.toBeDefined();
      expect(update).toHaveBeenCalledWith({ where: { id: 'job-1' }, data: expect.objectContaining({ status: 'closed', closedAt: expect.any(Date) }) });
    });

    it('closing a job archives its still-active, non-hired entries and frees those candidates', async () => {
      const update = jest.fn().mockImplementation(({ data }) => ({ id: 'job-1', ...data }));
      const findMany = jest.fn().mockResolvedValue([{ candidateId: 'cand-1' }, { candidateId: 'cand-2' }, { candidateId: 'cand-1' }]);
      const updateMany = jest.fn().mockResolvedValue({ count: 3 });
      const tx = {
        job: { findFirst: jest.fn().mockResolvedValue({ id: 'job-1', status: 'open' }), update },
        pipelineEntry: { findMany, updateMany },
        candidateEmail: { count: jest.fn().mockResolvedValue(0) },
        candidate: { update: jest.fn().mockResolvedValue({}) },
      };
      tenantPrisma.forTenant.mockImplementation((_c, fn) => fn(tx));

      await service.updateJob(context, 'user-1', 'job-1', { status: 'closed' });

      expect(updateMany).toHaveBeenCalledWith({
        where: expect.objectContaining({
          jobId: 'job-1',
          organizationId: 'org-1',
          archivedAt: null,
          status: { stage: { category: { not: 'hired' } } },
        }),
        data: { archivedAt: expect.any(Date) },
      });
      // Dedupe: cand-1 appears twice in the affected entries but is recomputed once.
      expect(tx.candidate.update).toHaveBeenCalledTimes(2);
    });

    it('does not archive/recompute anything when patching an already-closed job to closed again', async () => {
      const update = jest.fn().mockImplementation(({ data }) => ({ id: 'job-1', ...data }));
      const findMany = jest.fn();
      const updateMany = jest.fn();
      const tx = {
        job: { findFirst: jest.fn().mockResolvedValue({ id: 'job-1', status: 'closed' }), update },
        pipelineEntry: { findMany, updateMany },
      };
      tenantPrisma.forTenant.mockImplementation((_c, fn) => fn(tx));

      await service.updateJob(context, 'user-1', 'job-1', { status: 'closed' });

      expect(findMany).not.toHaveBeenCalled();
      expect(updateMany).not.toHaveBeenCalled();
    });
  });

  describe('updateJob field-locking while pending_approval', () => {
    function pendingJob(overrides: any = {}) {
      return {
        id: 'job-1',
        status: 'pending_approval',
        title: 'Backend Eng',
        department: 'Engineering',
        headcount: 2,
        salaryMin: 100000,
        salaryMax: 150000,
        salaryCurrency: 'USD',
        hiringManagerId: 'mgr-1',
        ...overrides,
      };
    }

    it.each([
      ['title', 'New Title'],
      ['department', 'Sales'],
      ['headcount', 5],
      ['salaryMin', 90000],
      ['salaryMax', 160000],
      ['salaryCurrency', 'EUR'],
      ['hiringManagerId', 'mgr-2'],
    ])('rejects editing %s while pending_approval (409)', async (field, newValue) => {
      const tx = { job: { findFirst: jest.fn().mockResolvedValue(pendingJob()) } };
      tenantPrisma.forTenant.mockImplementation((_c, fn) => fn(tx));

      await expect(service.updateJob(context, 'user-1', 'job-1', { [field]: newValue } as any)).rejects.toThrow(ConflictException);
    });

    it('allows editing description while pending_approval', async () => {
      const update = jest.fn().mockImplementation(({ data }) => ({ id: 'job-1', ...data }));
      const tx = { job: { findFirst: jest.fn().mockResolvedValue(pendingJob()), update } };
      tenantPrisma.forTenant.mockImplementation((_c, fn) => fn(tx));

      await expect(service.updateJob(context, 'user-1', 'job-1', { description: 'Updated description' })).resolves.toBeDefined();
      expect(update).toHaveBeenCalledWith({ where: { id: 'job-1' }, data: expect.objectContaining({ description: 'Updated description' }) });
    });

    it('allows resending the same (unchanged) locked-field values while pending_approval', async () => {
      const update = jest.fn().mockImplementation(({ data }) => ({ id: 'job-1', ...data }));
      const tx = { job: { findFirst: jest.fn().mockResolvedValue(pendingJob()), update } };
      tenantPrisma.forTenant.mockImplementation((_c, fn) => fn(tx));

      await expect(
        service.updateJob(context, 'user-1', 'job-1', { title: 'Backend Eng', description: 'ok' }),
      ).resolves.toBeDefined();
    });
  });

  describe('submitRequisition', () => {
    it('submits and leaves the job pending when approval is required', async () => {
      const tx = { job: { findFirst: jest.fn().mockResolvedValue({ id: 'job-1', status: 'draft' }), updateMany: jest.fn().mockResolvedValue({ count: 1 }) } };
      tenantPrisma.forTenant.mockImplementation((_c, fn) => fn(tx));
      approvals.submit.mockResolvedValue({ status: 'pending_approval', requestId: 'req-1' });

      const result = await service.submitRequisition(context, 'user-1', 'job-1');

      expect(result).toEqual({ status: 'pending_approval', requestId: 'req-1' });
      expect(approvals.submit).toHaveBeenCalledWith(context, 'requisition', 'job-1', 'user-1');
      expect(tx.job.updateMany).toHaveBeenCalledWith({
        where: { id: 'job-1', organizationId: 'org-1' },
        data: { status: 'pending_approval' },
      });
    });

    it('submits and opens the job immediately when the chain auto-passes', async () => {
      const tx = { job: { findFirst: jest.fn().mockResolvedValue({ id: 'job-1', status: 'draft' }), updateMany: jest.fn().mockResolvedValue({ count: 1 }) } };
      tenantPrisma.forTenant.mockImplementation((_c, fn) => fn(tx));
      approvals.submit.mockResolvedValue({ status: 'approved' });

      const result = await service.submitRequisition(context, 'user-1', 'job-1');

      expect(result).toEqual({ status: 'approved' });
      expect(tx.job.updateMany).toHaveBeenCalledWith({
        where: { id: 'job-1', organizationId: 'org-1' },
        data: { status: 'open' },
      });
    });

    it('refuses to submit a job that is not a draft', async () => {
      const tx = { job: { findFirst: jest.fn().mockResolvedValue({ id: 'job-1', status: 'open' }) } };
      tenantPrisma.forTenant.mockImplementation((_c, fn) => fn(tx));

      await expect(service.submitRequisition(context, 'user-1', 'job-1')).rejects.toThrow(ConflictException);
      expect(approvals.submit).not.toHaveBeenCalled();
    });

    it('throws NotFoundException for a job outside the org', async () => {
      tenantPrisma.forTenant.mockImplementation((_c, fn) => fn({ job: { findFirst: jest.fn().mockResolvedValue(null) } }));

      await expect(service.submitRequisition(context, 'user-1', 'missing')).rejects.toThrow(NotFoundException);
    });
  });

  describe('cancelRequisitionApproval', () => {
    it('resolves isConfigurer, cancels the open request, and flips the job back to draft', async () => {
      approvals.isConfigurer.mockResolvedValue(false);
      approvals.cancelForSubject.mockResolvedValue({ subjectType: 'job', subjectId: 'job-1', gate: 'requisition' });
      const tx = { job: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) } };
      tenantPrisma.forTenant.mockImplementation((_c, fn) => fn(tx));

      await service.cancelRequisitionApproval(context, 'user-1', 'job-1');

      expect(approvals.isConfigurer).toHaveBeenCalledWith(context, 'user-1');
      expect(approvals.cancelForSubject).toHaveBeenCalledWith(context, 'job', 'job-1', 'user-1', false);
      expect(tx.job.updateMany).toHaveBeenCalledWith({
        where: { id: 'job-1', organizationId: 'org-1' },
        data: { status: 'draft' },
      });
    });
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

  describe('getJob approval summary', () => {
    const tx = () => ({
      job: { findFirst: jest.fn().mockResolvedValue({ id: 'job-1' }) },
      jobExam: { findMany: jest.fn().mockResolvedValue([]) },
    });

    it('returns approval: null when there is no open request for the job', async () => {
      tenantPrisma.forTenant.mockImplementation((_c, fn) => fn(tx()));
      approvals.getSummariesFor.mockResolvedValue(new Map());

      const job = await service.getJob(context, 'job-1');

      expect(approvals.getSummariesFor).toHaveBeenCalledWith(context, 'job', ['job-1']);
      expect(job.approval).toBeNull();
    });

    it('attaches the approval summary with currentStep for a job with an open request', async () => {
      tenantPrisma.forTenant.mockImplementation((_c, fn) => fn(tx()));
      const summary = { status: 'pending_approval', currentStep: 1, steps: [{ name: 'Step 1', state: 'approved' as const }] };
      approvals.getSummariesFor.mockResolvedValue(new Map([['job-1', summary]]));

      const job = await service.getJob(context, 'job-1');

      expect(job.approval).toEqual(summary);
    });
  });

  describe('updateJob publicApplyEnabled toggle', () => {
    it('mints an applyToken via randomUUID when enabling for the first time', async () => {
      const update = jest.fn().mockImplementation(({ data }) => ({ id: 'job-1', ...data }));
      const tx = {
        job: {
          findFirst: jest.fn().mockResolvedValue({ id: 'job-1', status: 'open', applyToken: null, publicApplyEnabled: false }),
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
          findFirst: jest.fn().mockResolvedValue({ id: 'job-1', status: 'open', applyToken: 'existing-token', publicApplyEnabled: false }),
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

  // A 2-stage pipeline fixture reused across getBoard/counts tests: 'applied' (active) and
  // 'interview'/'rejected'-category stages, each with one status whose id doubles as a stand-in
  // for a custom org-chosen name (proves grouping goes through statusId/stageId, not stage-name
  // string matching).
  const boardPipeline = (id = 'p1') => ({
    id,
    name: 'Default',
    stages: [
      { id: 'st-applied', name: 'applied', category: 'active', position: 0, statuses: [{ id: 'status-applied', name: 'applied', position: 0 }] },
      { id: 'st-interview', name: 'interview', category: 'active', position: 1, statuses: [{ id: 'status-interview', name: 'interview', position: 0 }] },
      { id: 'st-rejected', name: 'rejected', category: 'rejected', position: 2, statuses: [{ id: 'status-rejected', name: 'rejected', position: 0 }] },
    ],
  });

  it('getBoard groups entries by the job pipeline\'s stages', async () => {
    const tx = {
      job: { findFirst: jest.fn().mockResolvedValue({ id: 'job-1', pipeline: boardPipeline() }) },
      jobExam: { findMany: jest.fn().mockResolvedValue([{ examId: 'e1' }]) },
      pipelineEntry: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'en1', candidateId: 'c1', enteredVia: 'manual', rejectedReason: null,
            status: { id: 'status-applied', stage: { id: 'st-applied', category: 'active' } },
            candidate: { name: 'Amy', email: 'amy@x.com',
              invitations: [{ examId: 'e1', exam: { title: 'Backend' }, attempt: { result: { passFail: 'pass', percentage: 82 } } }] },
            feedback: [{ rating: 4 }, { rating: null }] },
          { id: 'en2', candidateId: 'c2', enteredVia: 'exam', rejectedReason: 'failed screen',
            status: { id: 'status-rejected', stage: { id: 'st-rejected', category: 'rejected' } },
            candidate: { name: 'Bo', email: 'bo@x.com', invitations: [] }, feedback: [] },
        ]),
      },
    };
    tenantPrisma.forTenant.mockImplementation((_c, fn) => fn(tx));

    const board = await service.getBoard(context, 'job-1');

    expect(board.pipeline.stages.map((s) => s.name)).toEqual(['applied', 'interview', 'rejected']);
    expect(board.columns['st-applied'].map((r) => r.candidateId)).toContain('c1');
    expect(board.columns['st-applied'][0]).toMatchObject({
      entryId: 'en1', statusId: 'status-applied', stageId: 'st-applied', category: 'active',
      avgRating: 4, feedbackCount: 2, examResults: [{ examId: 'e1', passFail: 'pass', score: 82 }],
    });
    expect(board.columns['st-interview']).toHaveLength(0);
    expect(board.columns['st-rejected']).toHaveLength(1);
    expect(board.columns['st-rejected'][0]).toMatchObject({ entryId: 'en2', category: 'rejected', rejectedReason: 'failed screen' });
  });

  it('getBoard includes fit fields per entry (score, status, stale)', async () => {
    // Job's current criteria hash is computed from these fields (see computeCriteriaHash).
    const job = { id: 'job-1', title: 'Backend Eng', description: 'desc', fitCriteria: 'crit', fitRubric: null, pipeline: boardPipeline() };
    const currentHash = computeCriteriaHash({
      title: job.title, description: job.description, fitCriteria: job.fitCriteria, fitRubric: job.fitRubric,
    });
    const tx = {
      job: { findFirst: jest.fn().mockResolvedValue(job) },
      jobExam: { findMany: jest.fn().mockResolvedValue([]) },
      pipelineEntry: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'en1', candidateId: 'c1', enteredVia: 'manual', rejectedReason: null,
            status: { id: 'status-applied', stage: { id: 'st-applied', category: 'active' } },
            candidate: { name: 'Amy', email: 'amy@x.com', invitations: [] },
            feedback: [],
            fitAssessment: { status: 'done', overallScore: 77, criteriaHash: 'H' } }, // stale: 'H' !== currentHash
          { id: 'en2', candidateId: 'c2', enteredVia: 'manual', rejectedReason: null,
            status: { id: 'status-applied', stage: { id: 'st-applied', category: 'active' } },
            candidate: { name: 'Bo', email: 'bo@x.com', invitations: [] },
            feedback: [],
            fitAssessment: null },
        ]),
      },
    };
    tenantPrisma.forTenant.mockImplementation((_c, fn) => fn(tx));

    const board = await service.getBoard(context, 'job-1');

    const scored = board.columns['st-applied'].find((r) => r.entryId === 'en1')!;
    expect(scored.fitScore).toBe(77);
    expect(scored.fitStatus).toBe('done');
    expect(scored.fitStale).toBe(true); // stored hash 'H' !== currentHash

    const unscored = board.columns['st-applied'].find((r) => r.entryId === 'en2')!;
    expect(unscored.fitScore).toBeNull();
    expect(unscored.fitStatus).toBeNull();
    expect(unscored.fitStale).toBe(false);
  });

  it('getBoard marks fitStale false when the stored criteriaHash matches the current hash', async () => {
    const job = { id: 'job-1', title: 'Backend Eng', description: 'desc', fitCriteria: 'crit', fitRubric: null, pipeline: boardPipeline() };
    const currentHash = computeCriteriaHash({
      title: job.title, description: job.description, fitCriteria: job.fitCriteria, fitRubric: job.fitRubric,
    });
    const tx = {
      job: { findFirst: jest.fn().mockResolvedValue(job) },
      jobExam: { findMany: jest.fn().mockResolvedValue([]) },
      pipelineEntry: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'en1', candidateId: 'c1', enteredVia: 'manual', rejectedReason: null,
            status: { id: 'status-applied', stage: { id: 'st-applied', category: 'active' } },
            candidate: { name: 'Amy', email: 'amy@x.com', invitations: [] },
            feedback: [],
            fitAssessment: { status: 'done', overallScore: 90, criteriaHash: currentHash } },
        ]),
      },
    };
    tenantPrisma.forTenant.mockImplementation((_c, fn) => fn(tx));

    const board = await service.getBoard(context, 'job-1');

    expect(board.columns['st-applied'][0].fitStale).toBe(false);
  });

  it('getBoard skips entries with no resolved status (can\'t be placed on a dynamic column)', async () => {
    const tx = {
      job: { findFirst: jest.fn().mockResolvedValue({ id: 'job-1', pipeline: boardPipeline() }) },
      jobExam: { findMany: jest.fn().mockResolvedValue([]) },
      pipelineEntry: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'en1', candidateId: 'c1', enteredVia: 'manual', rejectedReason: null, status: null,
            candidate: { name: 'Amy', email: 'amy@x.com', invitations: [] }, feedback: [] },
        ]),
      },
    };
    tenantPrisma.forTenant.mockImplementation((_c, fn) => fn(tx));

    const board = await service.getBoard(context, 'job-1');

    expect(Object.values(board.columns).flat()).toHaveLength(0);
  });

  it('getBoard omits archived entries from all columns', async () => {
    const entries = [
      { id: 'active-entry', candidateId: 'c1', enteredVia: 'manual', rejectedReason: null, archivedAt: null,
        status: { id: 'status-applied', stage: { id: 'st-applied', category: 'active' } },
        candidate: { name: 'Amy', email: 'amy@x.com', invitations: [] }, feedback: [] },
      { id: 'archived-entry', candidateId: 'c2', enteredVia: 'manual', rejectedReason: null, archivedAt: new Date(),
        status: { id: 'status-applied', stage: { id: 'st-applied', category: 'active' } },
        candidate: { name: 'Bo', email: 'bo@x.com', invitations: [] }, feedback: [] },
    ];
    const tx = {
      job: { findFirst: jest.fn().mockResolvedValue({ id: 'job1', pipeline: boardPipeline() }) },
      jobExam: { findMany: jest.fn().mockResolvedValue([]) },
      pipelineEntry: {
        // Stands in for Prisma's real filtering: only excludes archived rows once the service
        // actually asks for `archivedAt: null` in the where clause.
        findMany: jest.fn(({ where }: any) => Promise.resolve(where.archivedAt === null ? entries.filter((e) => e.archivedAt === null) : entries)),
      },
    };
    tenantPrisma.forTenant.mockImplementation((_c, fn) => fn(tx));

    const board = await service.getBoard(context, 'job1');

    const allRows = Object.values(board.columns).flat();
    expect(allRows.map((r) => r.entryId)).not.toContain('archived-entry');
    expect(allRows.map((r) => r.entryId)).toContain('active-entry');
  });

  it('stageCountsFor rolls counts up by category across custom stage names', async () => {
    const pipeline = {
      stages: [
        { id: 'st-a', name: 'New', category: 'active', position: 0, statuses: [{ id: 'sa1' }] },
        { id: 'st-h', name: 'Onboarded', category: 'hired', position: 1, statuses: [{ id: 'sh1' }, { id: 'sh2' }] },
        { id: 'st-r', name: 'Passed', category: 'rejected', position: 2, statuses: [{ id: 'sr1' }] },
      ],
    };
    const tx = {
      job: { findFirst: jest.fn().mockResolvedValue({ id: 'job1', pipeline }) },
      pipelineEntry: {
        groupBy: jest.fn().mockResolvedValue([
          { statusId: 'sa1', _count: 3 },
          { statusId: 'sh1', _count: 1 },
          { statusId: 'sh2', _count: 1 },
          { statusId: 'sr1', _count: 2 },
        ]),
      },
    };
    tenantPrisma.forTenant.mockImplementation((_c, fn) => fn(tx));

    const { byStageId, byCategory } = await service.stageCountsFor(context, 'job1');

    expect(tx.pipelineEntry.groupBy).toHaveBeenCalledWith({ by: ['statusId'], where: { jobId: 'job1', archivedAt: null }, _count: true });
    expect(byStageId).toEqual({ 'st-a': 3, 'st-h': 2, 'st-r': 2 });
    expect(byCategory.active).toBe(3);
    expect(byCategory.hired).toBe(2);
    expect(byCategory.rejected).toBe(2);
    expect(byCategory.offer).toBe(0);
    expect(byCategory.archived).toBe(0);
  });

  it('listJobs folds per-job status counts into byStageId/byCategory', async () => {
    const pipeline = boardPipeline();
    const tx = {
      job: { findMany: jest.fn().mockResolvedValue([{ id: 'job-1', pipelineId: 'p1' }, { id: 'job-2', pipelineId: 'p1' }]) },
      pipeline: { findMany: jest.fn().mockResolvedValue([pipeline]) },
      pipelineEntry: {
        groupBy: jest.fn().mockResolvedValue([
          { jobId: 'job-1', statusId: 'status-applied', _count: 3 },
          { jobId: 'job-1', statusId: 'status-rejected', _count: 2 },
        ]),
      },
    };
    tenantPrisma.forTenant.mockImplementation((_c, fn) => fn(tx));

    const jobs = await service.listJobs(context);

    expect(tx.pipelineEntry.groupBy).toHaveBeenCalledWith({
      by: ['jobId', 'statusId'], where: { organizationId: 'org-1', archivedAt: null }, _count: true,
    });
    expect(jobs.find((j) => j.id === 'job-1')!.stageCounts).toEqual({
      byStageId: { 'st-applied': 3, 'st-interview': 0, 'st-rejected': 2 },
      byCategory: { active: 3, offer: 0, hired: 0, rejected: 2, archived: 0 },
    });
    expect(jobs.find((j) => j.id === 'job-2')!.stageCounts).toEqual({
      byStageId: { 'st-applied': 0, 'st-interview': 0, 'st-rejected': 0 },
      byCategory: { active: 0, offer: 0, hired: 0, rejected: 0, archived: 0 },
    });
  });

  it('listJobs batches the approval summary lookup in one call and attaches it per row', async () => {
    const tx = {
      job: { findMany: jest.fn().mockResolvedValue([{ id: 'job-1' }, { id: 'job-2' }]) },
      pipelineEntry: { groupBy: jest.fn().mockResolvedValue([]) },
    };
    tenantPrisma.forTenant.mockImplementation((_c, fn) => fn(tx));
    const summary = { status: 'pending_approval', currentStep: 0, steps: [] };
    approvals.getSummariesFor.mockResolvedValue(new Map([['job-1', summary]]));

    const jobs = await service.listJobs(context);

    expect(approvals.getSummariesFor).toHaveBeenCalledTimes(1);
    expect(approvals.getSummariesFor).toHaveBeenCalledWith(context, 'job', ['job-1', 'job-2']);
    expect(jobs.find((j) => j.id === 'job-1')!.approval).toEqual(summary);
    expect(jobs.find((j) => j.id === 'job-2')!.approval).toBeNull();
  });

  describe('addEntry', () => {
    it('upserts at applied/manual, audits entry.added, and is idempotent on re-add (update:{})', async () => {
      const upsert = jest.fn().mockResolvedValue({ id: 'en1', stage: 'applied', enteredVia: 'manual' });
      const tx = {
        job: { findFirst: jest.fn().mockResolvedValue({ id: 'job-1', status: 'open' }) },
        candidate: { findFirst: jest.fn().mockResolvedValue({ id: 'c1', organizationId: 'org-1' }) },
        pipelineEntry: { upsert },
      };
      tenantPrisma.forTenant.mockImplementation((_c, fn) => fn(withRecomputeMocks(tx)));

      const out = await service.addEntry(context, 'user-1', 'job-1', { candidateId: 'c1' });

      expect(out).toEqual({ id: 'en1', stage: 'applied', enteredVia: 'manual' });
      expect(upsert).toHaveBeenCalledWith({
        where: { jobId_candidateId: { jobId: 'job-1', candidateId: 'c1' } },
        create: { organizationId: 'org-1', jobId: 'job-1', candidateId: 'c1', enteredVia: 'manual' },
        update: {}, // never overwrite enteredVia on re-add
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
        job: { findFirst: jest.fn().mockResolvedValue({ id: 'job-1', status: 'open' }) },
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
        job: { findFirst: jest.fn().mockResolvedValue({ id: 'job-1', status: 'open' }) },
        candidate: { upsert: candidateUpsert },
        pipelineEntry: { upsert },
      };
      tenantPrisma.forTenant.mockImplementation((_c, fn) => fn(withRecomputeMocks(tx)));

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

    it("places a new candidate at the first active status of the job's pipeline", async () => {
      const upsert = jest.fn().mockImplementation(({ create }) => Promise.resolve(create));
      const tx = {
        job: {
          findFirst: jest.fn().mockResolvedValue({
            id: 'job1',
            status: 'open',
            pipeline: {
              stages: [
                { category: 'active', statuses: [{ id: 'st-app', position: 0 }, { id: 'st-screen', position: 1 }] },
                { category: 'rejected', statuses: [{ id: 'st-rej', position: 0 }] },
              ],
            },
          }),
        },
        candidate: { findFirst: jest.fn().mockResolvedValue({ id: 'c1', organizationId: 'org-1' }) },
        pipelineEntry: { upsert },
      };
      tenantPrisma.forTenant.mockImplementation((_c, fn) => fn(withRecomputeMocks(tx)));

      const entry = await service.addEntry(context, 'u1', 'job1', { candidateId: 'c1' });

      expect(entry.statusId).toBe('st-app');
      expect(upsert.mock.calls[0][0].create).toMatchObject({ statusId: 'st-app' });
    });

    it('recomputes the candidate global stage to engaged after creating the entry', async () => {
      const upsert = jest.fn().mockResolvedValue({ id: 'en1', enteredVia: 'manual' });
      const candidateUpdate = jest.fn().mockResolvedValue({});
      const tx = {
        job: { findFirst: jest.fn().mockResolvedValue({ id: 'job1', status: 'open' }) },
        candidate: { findFirst: jest.fn().mockResolvedValue({ id: 'c1', organizationId: 'org-1' }), update: candidateUpdate },
        pipelineEntry: {
          upsert,
          findMany: jest.fn().mockResolvedValue([{ archivedAt: null, status: { stage: { category: 'active' } } }]),
        },
        candidateEmail: { count: jest.fn().mockResolvedValue(0) },
      };
      tenantPrisma.forTenant.mockImplementation((_c, fn) => fn(tx));

      await service.addEntry(context, 'u1', 'job1', { candidateId: 'c1', enteredVia: 'manual' } as any);

      expect(candidateUpdate).toHaveBeenCalledWith(expect.objectContaining({
        where: { id: 'c1' },
        data: expect.objectContaining({ globalStage: 'engaged' }),
      }));
    });
  });

  describe('assignEntry', () => {
    function assignTx(overrides: any = {}) {
      return {
        pipelineEntry: {
          findFirst: jest.fn().mockResolvedValue({ id: 'en1', candidateId: 'cand-1', candidate: { name: 'Asha Rao' } }),
          update: jest.fn().mockResolvedValue({ id: 'en1' }),
        },
        user: { findFirst: jest.fn().mockResolvedValue({ id: 'user-2' }) },
        ...overrides,
      };
    }

    it('sets the assignee, audits entry.assigned, and notifies the new assignee', async () => {
      const tx = assignTx();
      tenantPrisma.forTenant.mockImplementation((_c, fn) => fn(tx));

      const out = await service.assignEntry(context, 'user-1', 'en1', 'user-2');

      expect(out).toEqual({ success: true });
      expect(tx.pipelineEntry.update).toHaveBeenCalledWith({ where: { id: 'en1' }, data: { assignedUserId: 'user-2' } });
      expect(audit.record).toHaveBeenCalledWith(context, expect.objectContaining({ action: 'entry.assigned', entityId: 'en1' }));
      expect(notifications.notify).toHaveBeenCalledWith(
        context, 'user-1', ['user-2'], 'assigned',
        expect.objectContaining({ entityType: 'pipeline_entry', entityId: 'en1', contextText: 'Asha Rao', linkPath: '/candidates/cand-1' }),
      );
    });

    it('unassigns (null) without notifying anyone', async () => {
      const tx = assignTx();
      tenantPrisma.forTenant.mockImplementation((_c, fn) => fn(tx));

      await service.assignEntry(context, 'user-1', 'en1', null);

      expect(tx.pipelineEntry.update).toHaveBeenCalledWith({ where: { id: 'en1' }, data: { assignedUserId: null } });
      expect(notifications.notify).not.toHaveBeenCalled();
    });

    it('rejects an assignee that is not a member of the org', async () => {
      const tx = assignTx({ user: { findFirst: jest.fn().mockResolvedValue(null) } });
      tenantPrisma.forTenant.mockImplementation((_c, fn) => fn(tx));

      await expect(service.assignEntry(context, 'user-1', 'en1', 'outsider')).rejects.toThrow(BadRequestException);
      expect(tx.pipelineEntry.update).not.toHaveBeenCalled();
    });
  });

  describe('exportJobCandidatesCsv', () => {
    it('builds a header + one row per candidate, comma-quoted and formula-injection-safe', async () => {
      const tx = {
        job: { findFirst: jest.fn().mockResolvedValue({ id: 'job-1' }) },
        pipelineEntry: {
          findMany: jest.fn().mockResolvedValue([
            { status: { stage: { name: 'hired' } }, rejected: false, createdAt: new Date('2026-08-01T00:00:00.000Z'), candidate: { name: 'Asha, Rao', email: 'asha@example.com', phone: '+91' } },
            { status: { stage: { name: 'applied' } }, rejected: true, createdAt: new Date('2026-08-02T00:00:00.000Z'), candidate: { name: '=cmd()', email: 'x@y.com', phone: null } },
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
    it('statusId move (active category) clears reject fields, sets statusId, and audits entry.stage_changed', async () => {
      const update = jest.fn().mockResolvedValue({ id: 'en1', statusId: 'st-int' });
      const tx = {
        pipelineEntry: {
          findFirst: jest.fn().mockResolvedValue({ id: 'en1', jobId: 'job-1', job: { pipelineId: 'p1' }, status: null }),
          update,
        },
      };
      tenantPrisma.forTenant.mockImplementation((_c, fn) => fn(withRecomputeMocks(tx)));
      pipelines.resolveStatus.mockResolvedValue({ status: { id: 'st-int', name: 'interview' }, stage: { id: 'stage-int', pipelineId: 'p1', category: 'active' } });

      const { entry } = await service.patchEntry(context, 'user-1', 'en1', { statusId: 'st-int' });

      expect(pipelines.resolveStatus).toHaveBeenCalledWith(context, 'st-int');
      // The flat pipeline_entries.stage column is gone -- statusId is the only source of truth now.
      expect(update).toHaveBeenCalledWith({
        where: { id: 'en1' },
        data: { statusId: 'st-int', rejected: false, rejectedReason: null, rejectedAt: null, archivedAt: null },
      });
      expect(entry.statusId).toBe('st-int');
      expect(audit.record).toHaveBeenCalledWith(context, expect.objectContaining({ action: 'entry.stage_changed', entityId: 'en1' }));
    });

    it('emits candidate.hired (subject/role/linkPath) when moved to a hired-category status', async () => {
      const update = jest.fn().mockResolvedValue({ id: 'en1', statusId: 'st-hired' });
      const tx = {
        pipelineEntry: {
          findFirst: jest.fn().mockResolvedValue({ id: 'en1', jobId: 'job-1', job: { pipelineId: 'p1' }, status: { stage: { category: 'offer' } } }),
          update,
          findUnique: jest.fn().mockResolvedValue({ candidateId: 'cand-1', candidate: { name: 'Asha Rao' }, job: { title: 'Backend Engineer' } }),
        },
      };
      tenantPrisma.forTenant.mockImplementation((_c, fn) => fn(withRecomputeMocks(tx)));
      pipelines.resolveStatus.mockResolvedValue({ status: { id: 'st-hired', name: 'hired' }, stage: { pipelineId: 'p1', category: 'hired' } });

      await service.patchEntry(context, 'user-1', 'en1', { statusId: 'st-hired' });

      expect(integrationEvents.emit).toHaveBeenCalledWith(
        'org-1',
        'candidate.hired',
        expect.objectContaining({ subject: 'Asha Rao', roleTitle: 'Backend Engineer', linkPath: '/candidates/cand-1' }),
      );
    });

    it("on hire, archives the candidate's other active entries when the org toggle is on", async () => {
      const update = jest.fn().mockResolvedValue({ id: 'en1', statusId: 'st-hired' });
      const tx = {
        pipelineEntry: {
          findFirst: jest.fn().mockResolvedValue({ id: 'en1', candidateId: 'cand-1', jobId: 'job-1', job: { pipelineId: 'p1' }, status: { stage: { category: 'offer' } } }),
          update,
          updateMany: jest.fn().mockResolvedValue({ count: 1 }),
          findUnique: jest.fn().mockResolvedValue({ candidateId: 'cand-1', candidate: { name: 'Asha Rao' }, job: { title: 'Backend Engineer' } }),
        },
        organization: { findFirst: jest.fn().mockResolvedValue({ autoArchiveSiblingsOnHire: true }) },
      };
      tenantPrisma.forTenant.mockImplementation((_c, fn) => fn(withRecomputeMocks(tx)));
      pipelines.resolveStatus.mockResolvedValue({ status: { id: 'st-hired', name: 'hired' }, stage: { pipelineId: 'p1', category: 'hired' } });

      await service.patchEntry(context, 'user-1', 'en1', { statusId: 'st-hired' });

      expect(tx.organization.findFirst).toHaveBeenCalledWith({ where: { id: 'org-1' }, select: { autoArchiveSiblingsOnHire: true } });
      expect(tx.pipelineEntry.updateMany).toHaveBeenCalledWith({
        where: { organizationId: 'org-1', candidateId: 'cand-1', archivedAt: null, id: { not: 'en1' } },
        data: { archivedAt: expect.any(Date) },
      });
    });

    it('does NOT archive siblings on hire when the org toggle is off', async () => {
      const update = jest.fn().mockResolvedValue({ id: 'en1', statusId: 'st-hired' });
      const tx = {
        pipelineEntry: {
          findFirst: jest.fn().mockResolvedValue({ id: 'en1', candidateId: 'cand-1', jobId: 'job-1', job: { pipelineId: 'p1' }, status: { stage: { category: 'offer' } } }),
          update,
          updateMany: jest.fn(),
          findUnique: jest.fn().mockResolvedValue({ candidateId: 'cand-1', candidate: { name: 'Asha Rao' }, job: { title: 'Backend Engineer' } }),
        },
        organization: { findFirst: jest.fn().mockResolvedValue({ autoArchiveSiblingsOnHire: false }) },
      };
      tenantPrisma.forTenant.mockImplementation((_c, fn) => fn(withRecomputeMocks(tx)));
      pipelines.resolveStatus.mockResolvedValue({ status: { id: 'st-hired', name: 'hired' }, stage: { pipelineId: 'p1', category: 'hired' } });

      await service.patchEntry(context, 'user-1', 'en1', { statusId: 'st-hired' });

      expect(tx.pipelineEntry.updateMany).not.toHaveBeenCalled();
    });

    it('does not emit candidate.hired on a non-hired status move', async () => {
      const tx = {
        pipelineEntry: {
          findFirst: jest.fn().mockResolvedValue({ id: 'en1', jobId: 'job-1', job: { pipelineId: 'p1' }, status: { stage: { category: 'offer' } } }),
          update: jest.fn().mockResolvedValue({ id: 'en1', statusId: 'st-int' }),
        },
      };
      tenantPrisma.forTenant.mockImplementation((_c, fn) => fn(withRecomputeMocks(tx)));
      pipelines.resolveStatus.mockResolvedValue({ status: { id: 'st-int', name: 'interview' }, stage: { pipelineId: 'p1', category: 'active' } });

      await service.patchEntry(context, 'user-1', 'en1', { statusId: 'st-int' });

      expect(integrationEvents.emit).not.toHaveBeenCalled();
    });

    it('does not re-emit candidate.hired when the entry is already in a hired-category status (idempotent)', async () => {
      const tx = {
        pipelineEntry: {
          findFirst: jest.fn().mockResolvedValue({ id: 'en1', jobId: 'job-1', job: { pipelineId: 'p1' }, status: { stage: { category: 'hired' } } }),
          update: jest.fn().mockResolvedValue({ id: 'en1', statusId: 'st-hired' }),
          findUnique: jest.fn(),
        },
      };
      tenantPrisma.forTenant.mockImplementation((_c, fn) => fn(withRecomputeMocks(tx)));
      pipelines.resolveStatus.mockResolvedValue({ status: { id: 'st-hired', name: 'hired' }, stage: { pipelineId: 'p1', category: 'hired' } });

      await service.patchEntry(context, 'user-1', 'en1', { statusId: 'st-hired' });

      expect(integrationEvents.emit).not.toHaveBeenCalled();
    });

    it('rejects an unresolvable statusId with BadRequestException', async () => {
      const tx = {
        pipelineEntry: {
          findFirst: jest.fn().mockResolvedValue({ id: 'en1', jobId: 'job-1', job: { pipelineId: 'p1' }, status: null }),
          update: jest.fn(),
        },
      };
      tenantPrisma.forTenant.mockImplementation((_c, fn) => fn(tx));
      pipelines.resolveStatus.mockResolvedValue(null);

      await expect(service.patchEntry(context, 'user-1', 'en1', { statusId: 'bogus' })).rejects.toThrow(BadRequestException);
    });

    it("rejects a status that does not belong to the job's pipeline", async () => {
      const tx = {
        pipelineEntry: {
          findFirst: jest.fn().mockResolvedValue({ id: 'en1', jobId: 'job-1', job: { pipelineId: 'p1' }, status: null }),
          update: jest.fn(),
        },
      };
      tenantPrisma.forTenant.mockImplementation((_c, fn) => fn(tx));
      pipelines.resolveStatus.mockResolvedValue({ status: { id: 'st-other', name: 'other' }, stage: { pipelineId: 'p2', category: 'active' } });

      await expect(service.patchEntry(context, 'user-1', 'en1', { statusId: 'st-other' })).rejects.toThrow(/pipeline/i);
      expect(tx.pipelineEntry.update).not.toHaveBeenCalled();
    });

    it('statusId move to a rejected-category status sets the rejected mirror (via the statusId branch, not dto.rejected)', async () => {
      const update = jest.fn().mockImplementation(({ data }: { data: Record<string, unknown> }) => Promise.resolve({ id: 'en1', ...data }));
      const tx = {
        pipelineEntry: {
          findFirst: jest.fn().mockResolvedValue({ id: 'en1', jobId: 'job-1', job: { pipelineId: 'p1' }, status: null, stage: 'applied' }),
          update,
        },
      };
      tenantPrisma.forTenant.mockImplementation((_c, fn) => fn(withRecomputeMocks(tx)));
      pipelines.resolveStatus.mockResolvedValue({ status: { id: 'st-rej', name: 'Not a Fit' }, stage: { pipelineId: 'p1', category: 'rejected' } });

      const { entry } = await service.patchEntry(context, 'user-1', 'en1', { statusId: 'st-rej' });

      expect(entry.rejected).toBe(true);
      expect(entry.rejectedAt).toBeInstanceOf(Date);
      expect(entry.archivedAt).toBeNull();
      // Confirms this went through the statusId ternary, not the legacy dto.rejected:true branch.
      expect(audit.record).toHaveBeenCalledWith(context, expect.objectContaining({ action: 'entry.stage_changed', entityId: 'en1' }));
    });

    it('statusId move to an archived-category status sets archivedAt', async () => {
      const update = jest.fn().mockImplementation(({ data }: { data: Record<string, unknown> }) => Promise.resolve({ id: 'en1', ...data }));
      const tx = {
        pipelineEntry: {
          findFirst: jest.fn().mockResolvedValue({ id: 'en1', jobId: 'job-1', job: { pipelineId: 'p1' }, status: null, stage: 'applied' }),
          update,
        },
      };
      tenantPrisma.forTenant.mockImplementation((_c, fn) => fn(withRecomputeMocks(tx)));
      pipelines.resolveStatus.mockResolvedValue({ status: { id: 'st-arch', name: 'Archived' }, stage: { pipelineId: 'p1', category: 'archived' } });

      const { entry } = await service.patchEntry(context, 'user-1', 'en1', { statusId: 'st-arch' });

      expect(entry.archivedAt).toBeInstanceOf(Date);
      expect(entry.rejected).toBe(false);
    });

    it("rejected:true sets flag+reason+rejectedAt, moves to the pipeline's rejected status, and audits entry.rejected", async () => {
      const update = jest.fn().mockResolvedValue({ id: 'en1', rejected: true });
      const tx = {
        pipelineEntry: {
          findFirst: jest.fn().mockResolvedValue({ id: 'en1', jobId: 'job-1', job: { pipelineId: 'p1' }, status: null }),
          update,
        },
        pipelineStage: { findFirst: jest.fn().mockResolvedValue({ id: 'stage-rej', statuses: [{ id: 'st-rej' }] }) },
      };
      tenantPrisma.forTenant.mockImplementation((_c, fn) => fn(withRecomputeMocks(tx)));

      await service.patchEntry(context, 'user-1', 'en1', { rejected: true, reason: 'not a fit' });

      expect(tx.pipelineStage.findFirst).toHaveBeenCalledWith({
        where: { pipelineId: 'p1', category: 'rejected' },
        orderBy: { position: 'asc' },
        include: { statuses: { orderBy: { position: 'asc' }, take: 1 } },
      });
      expect(update).toHaveBeenCalledWith({
        where: { id: 'en1' },
        data: { statusId: 'st-rej', rejected: true, rejectedReason: 'not a fit', rejectedAt: expect.any(Date), archivedAt: null },
      });
      expect(audit.record).toHaveBeenCalledWith(context, expect.objectContaining({ action: 'entry.rejected', entityId: 'en1' }));
    });

    it('rejected:false clears the reject fields and audits entry.unrejected', async () => {
      const update = jest.fn().mockResolvedValue({ id: 'en1', rejected: false });
      const tx = {
        pipelineEntry: {
          findFirst: jest.fn().mockResolvedValue({ id: 'en1', jobId: 'job-1', job: { pipelineId: 'p1' }, status: null }),
          update,
        },
      };
      tenantPrisma.forTenant.mockImplementation((_c, fn) => fn(withRecomputeMocks(tx)));

      await service.patchEntry(context, 'user-1', 'en1', { rejected: false });

      expect(update).toHaveBeenCalledWith({
        where: { id: 'en1' },
        data: { rejected: false, rejectedReason: null, rejectedAt: null, archivedAt: null },
      });
      expect(audit.record).toHaveBeenCalledWith(context, expect.objectContaining({ action: 'entry.unrejected', entityId: 'en1' }));
    });

    it('throws BadRequestException for a patch with neither statusId nor rejected, and never calls update', async () => {
      const update = jest.fn();
      const tx = { pipelineEntry: { findFirst: jest.fn().mockResolvedValue({ id: 'en1', jobId: 'job-1' }), update } };
      tenantPrisma.forTenant.mockImplementation((_c, fn) => fn(tx));

      await expect(service.patchEntry(context, 'user-1', 'en1', { reason: 'typo' } as any)).rejects.toThrow(BadRequestException);
      expect(update).not.toHaveBeenCalled();
    });

    it('throws NotFoundException for an unknown entry', async () => {
      const tx = { pipelineEntry: { findFirst: jest.fn().mockResolvedValue(null) } };
      tenantPrisma.forTenant.mockImplementation((_c, fn) => fn(tx));

      await expect(service.patchEntry(context, 'user-1', 'missing', { statusId: 'st-int' })).rejects.toThrow(NotFoundException);
    });

    describe('stage-move comms hook', () => {
      const tx = {
        pipelineEntry: {
          findFirst: jest.fn().mockResolvedValue({ id: 'entry-1', jobId: 'job-1', job: { pipelineId: 'p1' }, status: null }),
          update: jest.fn().mockResolvedValue({ id: 'entry-1', statusId: 'st-offer' }),
        },
        pipelineStage: { findFirst: jest.fn().mockResolvedValue({ id: 'stage-rejected', statuses: [{ id: 'st-rej' }] }) },
      };
      beforeEach(() => {
        tenantPrisma.forTenant.mockImplementation((_c, fn) => fn(withRecomputeMocks(tx)));
        pipelines.resolveStatus.mockResolvedValue({ status: { id: 'st-offer', name: 'offer' }, stage: { id: 'stage-offer', pipelineId: 'p1', category: 'offer' } });
      });

      it('auto-sends when the target stage resolves an auto template', async () => {
        templates.resolveForStage.mockResolvedValue({ id: 't1', subject: 's', body: 'b', triggerMode: 'auto' });

        const result = await service.patchEntry(context, 'user-1', 'entry-1', { statusId: 'st-offer' });

        expect(templates.resolveForStage).toHaveBeenCalledWith(context, 'stage-offer');
        expect(messages.sendMessage).toHaveBeenCalledWith(context, null, 'entry-1', expect.objectContaining({ source: 'stage_auto', templateId: 't1', subject: 's', body: 'b' }));
        expect(result.pendingMessage).toBeUndefined();
      });

      it('returns a pendingMessage (does not send) for a prompt template', async () => {
        templates.resolveForStage.mockResolvedValue({ id: 't1', subject: 's', body: 'b', triggerMode: 'prompt' });

        const r = await service.patchEntry(context, 'user-1', 'entry-1', { statusId: 'st-offer' });

        expect(r.pendingMessage).toMatchObject({ templateId: 't1', subject: 's', body: 'b' });
        expect(messages.sendMessage).not.toHaveBeenCalled();
      });

      it('maps a rejection to the rejected-category stage', async () => {
        templates.resolveForStage.mockResolvedValue(null);

        await service.patchEntry(context, 'user-1', 'entry-1', { rejected: true });

        expect(templates.resolveForStage).toHaveBeenCalledWith(context, 'stage-rejected');
      });

      it('does nothing when no template resolves', async () => {
        templates.resolveForStage.mockResolvedValue(null);

        const r = await service.patchEntry(context, 'user-1', 'entry-1', { statusId: 'st-offer' });

        expect(r.pendingMessage).toBeUndefined();
        expect(messages.sendMessage).not.toHaveBeenCalled();
      });

      it('does not resolve a template (or send) when neither statusId nor rejected:true is set', async () => {
        await service.patchEntry(context, 'user-1', 'entry-1', { rejected: false });

        expect(templates.resolveForStage).not.toHaveBeenCalled();
        expect(messages.sendMessage).not.toHaveBeenCalled();
      });

      it('still returns the moved entry when the post-commit comms resolution throws', async () => {
        templates.resolveForStage.mockRejectedValue(new Error('pool exhausted'));

        const result = await service.patchEntry(context, 'user-1', 'entry-1', { statusId: 'st-offer' });

        expect(result.entry).toEqual({ id: 'entry-1', statusId: 'st-offer' });
        expect(result.pendingMessage).toBeUndefined();
      });
    });

    it('recomputes the candidate global stage once after a status change', async () => {
      const update = jest.fn().mockResolvedValue({ id: 'en1', statusId: 'st-int' });
      const candidateUpdate = jest.fn().mockResolvedValue({});
      const tx = {
        pipelineEntry: {
          findFirst: jest.fn().mockResolvedValue({ id: 'en1', jobId: 'job-1', candidateId: 'c1', job: { pipelineId: 'p1' }, status: null }),
          update,
          findMany: jest.fn().mockResolvedValue([{ archivedAt: null, status: { stage: { category: 'active' } } }]),
        },
        candidate: { update: candidateUpdate },
        candidateEmail: { count: jest.fn().mockResolvedValue(0) },
      };
      tenantPrisma.forTenant.mockImplementation((_c, fn) => fn(tx));
      pipelines.resolveStatus.mockResolvedValue({ status: { id: 'st-int', name: 'interview' }, stage: { id: 'stage-int', pipelineId: 'p1', category: 'active' } });

      await service.patchEntry(context, 'user-1', 'en1', { statusId: 'st-int' });

      expect(candidateUpdate).toHaveBeenCalledTimes(1);
      expect(candidateUpdate).toHaveBeenCalledWith(expect.objectContaining({
        where: { id: 'c1' },
        data: expect.objectContaining({ globalStage: 'engaged' }),
      }));
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
      expect(upsert.mock.calls[0][0].create).toMatchObject({ enteredVia: 'exam' });
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
        create: { organizationId: 'org-1', jobId: 'job-1', candidateId: 'c1', enteredVia: 'exam' },
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
      create: { organizationId: 'org-1', jobId: 'job-1', candidateId: 'cand-1', enteredVia: 'drive' },
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

    it('notifies @mentioned teammates (with candidate context) after saving feedback', async () => {
      const create = jest.fn().mockResolvedValue({ id: 'fb1', entryId: 'en1' });
      const tx = {
        pipelineEntry: { findFirst: jest.fn().mockResolvedValue({ id: 'en1', candidateId: 'cand-1', candidate: { name: 'Asha Rao' } }) },
        pipelineFeedback: { create },
      };
      tenantPrisma.forTenant.mockImplementation((_c, fn) => fn(tx));

      await service.addFeedback(context, 'user-1', 'en1', { note: 'great, @Bola take a look', mentionedUserIds: ['user-2'] });

      expect(notifications.createMentions).toHaveBeenCalledWith(
        context,
        'user-1',
        ['user-2'],
        expect.objectContaining({ entityType: 'pipeline_entry', entityId: 'en1', contextText: 'Asha Rao', linkPath: '/candidates/cand-1' }),
      );
    });

    it('does not notify when no one is mentioned', async () => {
      const create = jest.fn().mockResolvedValue({ id: 'fb1' });
      const tx = {
        pipelineEntry: { findFirst: jest.fn().mockResolvedValue({ id: 'en1', candidateId: 'c', candidate: { name: 'X' } }) },
        pipelineFeedback: { create },
      };
      tenantPrisma.forTenant.mockImplementation((_c, fn) => fn(tx));

      await service.addFeedback(context, 'user-1', 'en1', { rating: 4 });

      expect(notifications.createMentions).not.toHaveBeenCalled();
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
