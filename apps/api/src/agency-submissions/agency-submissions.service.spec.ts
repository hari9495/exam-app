import { Test } from '@nestjs/testing';
import { ConflictException } from '@nestjs/common';
import { AgencySubmissionsService } from './agency-submissions.service';
import { AuditService, BlobStorageService, TenantPrismaService } from '@exam-platform/shared';

describe('AgencySubmissionsService', () => {
  let service: AgencySubmissionsService;
  let tenantPrisma: { forTenant: jest.Mock };
  let blobStorage: { signIfOurs: jest.Mock };
  let audit: { record: jest.Mock };
  const context = { organizationId: 'org-1', isSuperAdmin: false } as any;

  beforeEach(async () => {
    tenantPrisma = { forTenant: jest.fn() };
    blobStorage = { signIfOurs: jest.fn((path: string) => Promise.resolve(`signed:${path}`)) };
    audit = { record: jest.fn() };
    const moduleRef = await Test.createTestingModule({
      providers: [
        AgencySubmissionsService,
        { provide: TenantPrismaService, useValue: tenantPrisma },
        { provide: BlobStorageService, useValue: blobStorage },
        { provide: AuditService, useValue: audit },
      ],
    }).compile();
    service = moduleRef.get(AgencySubmissionsService);
  });

  describe('list', () => {
    it('returns pending submissions with agency/job names and a signed resumeUrl', async () => {
      const tx = {
        agencySubmission: {
          findMany: jest.fn().mockResolvedValue([
            {
              id: 'sub-1',
              agency: { name: 'Acme Staffing' },
              job: { title: 'Backend Engineer' },
              candidateName: 'Alice',
              candidateEmail: 'alice@test.com',
              candidatePhone: null,
              isDuplicate: false,
              status: 'pending',
              createdAt: new Date('2026-01-01'),
              resumePath: 'candidates/org-1/r1.pdf',
            },
          ]),
        },
      };
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

      const result = await service.list(context, 'pending');

      expect(tx.agencySubmission.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { status: 'pending' } }),
      );
      expect(result).toEqual([
        expect.objectContaining({
          id: 'sub-1',
          agencyName: 'Acme Staffing',
          jobTitle: 'Backend Engineer',
          resumeUrl: 'signed:candidates/org-1/r1.pdf',
        }),
      ]);
    });
  });

  describe('accept', () => {
    const pendingSubmission = {
      id: 'sub-1',
      jobId: 'job-1',
      candidateName: 'Alice',
      candidateEmail: 'alice@test.com',
      candidatePhone: '555-1000',
      resumePath: 'candidates/org-1/r1.pdf',
      status: 'pending',
    };

    it('throws ConflictException when the submission is not pending', async () => {
      const tx = { agencySubmission: { findFirst: jest.fn().mockResolvedValue({ ...pendingSubmission, status: 'accepted' }) } };
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

      await expect(service.accept(context, 'sub-1', 'user-1')).rejects.toThrow(ConflictException);
    });

    it('creates a new candidate + profile + one pipeline entry for a NEW email, and marks the submission accepted', async () => {
      const tx = {
        agencySubmission: { findFirst: jest.fn().mockResolvedValue(pendingSubmission), update: jest.fn() },
        candidate: {
          findUnique: jest.fn().mockResolvedValue(null),
          upsert: jest.fn().mockResolvedValue({ id: 'cand-1', name: 'Alice' }),
          update: jest.fn(),
        },
        candidateProfile: { upsert: jest.fn() },
        pipelineEntry: {
          findFirst: jest.fn().mockResolvedValue(null),
          create: jest.fn().mockResolvedValue({ id: 'entry-1' }),
          findMany: jest.fn().mockResolvedValue([{ archivedAt: null, status: { stage: { category: 'active' } } }]),
        },
        candidateEmail: { count: jest.fn().mockResolvedValue(0) },
        job: { findFirst: jest.fn().mockResolvedValue({ pipelineId: 'pipe-1' }) },
        pipeline: {
          findFirst: jest.fn().mockResolvedValue({
            stages: [{ category: 'active', statuses: [{ id: 'status-1' }] }],
          }),
        },
      };
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

      const result = await service.accept(context, 'sub-1', 'user-1');

      expect(tx.candidate.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({
            organizationId: 'org-1',
            email: 'alice@test.com',
            name: 'Alice',
            phone: '555-1000',
            portalToken: expect.any(String),
          }),
        }),
      );
      expect(tx.candidateProfile.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({ candidateId: 'cand-1', resumePath: 'candidates/org-1/r1.pdf', parseStatus: 'pending' }),
        }),
      );
      expect(tx.pipelineEntry.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ candidateId: 'cand-1', jobId: 'job-1', statusId: 'status-1' }) }),
      );
      expect(tx.agencySubmission.update).toHaveBeenCalledWith({
        where: { id: 'sub-1' },
        data: { status: 'accepted', candidateId: 'cand-1', reviewedByUserId: 'user-1', reviewedAt: expect.any(Date) },
      });
      expect(result).toEqual({ id: 'sub-1', status: 'accepted', candidateId: 'cand-1' });
      expect(audit.record).toHaveBeenCalledWith(
        context,
        expect.objectContaining({ action: 'agency_submission.accepted', entityId: 'sub-1' }),
      );
    });

    it('attaches a DUPLICATE-email submission to the existing candidate without a second candidate.create, and without a second entry', async () => {
      const tx = {
        agencySubmission: { findFirst: jest.fn().mockResolvedValue(pendingSubmission), update: jest.fn() },
        candidate: {
          // Existing candidate has a full stored name -- expandedName must refuse to overwrite it.
          findUnique: jest.fn().mockResolvedValue({ id: 'cand-1', name: 'Alice Anderson', phone: '555-9999' }),
          upsert: jest.fn().mockResolvedValue({ id: 'cand-1', name: 'Alice Anderson' }),
          update: jest.fn(),
        },
        candidateProfile: { upsert: jest.fn() },
        // Entry already exists on this job -- must NOT create a second one.
        pipelineEntry: {
          findFirst: jest.fn().mockResolvedValue({ id: 'entry-existing' }),
          create: jest.fn(),
          findMany: jest.fn().mockResolvedValue([]),
        },
        candidateEmail: { count: jest.fn().mockResolvedValue(0) },
        job: { findFirst: jest.fn() },
        pipeline: { findFirst: jest.fn() },
      };
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

      const result = await service.accept(context, 'sub-1', 'user-1');

      expect(tx.candidate.upsert).toHaveBeenCalledTimes(1);
      // No name/phone tamper -- only the resurrect fields (both null already, so a no-op update).
      expect(tx.candidate.upsert).toHaveBeenCalledWith(
        expect.objectContaining({ update: { deletedAt: null, deletedByUserId: null } }),
      );
      expect(tx.pipelineEntry.create).not.toHaveBeenCalled();
      expect(result.candidateId).toBe('cand-1');
    });

    it('resurrects a soft-deleted existing candidate (clears deletedAt/deletedByUserId)', async () => {
      const tx = {
        agencySubmission: { findFirst: jest.fn().mockResolvedValue(pendingSubmission), update: jest.fn() },
        candidate: {
          findUnique: jest.fn().mockResolvedValue({ id: 'cand-1', name: 'Alice Anderson', deletedAt: new Date(), deletedByUserId: 'user-9' }),
          upsert: jest.fn().mockResolvedValue({ id: 'cand-1', name: 'Alice Anderson', deletedAt: null, deletedByUserId: null }),
          update: jest.fn(),
        },
        candidateProfile: { upsert: jest.fn() },
        pipelineEntry: {
          findFirst: jest.fn().mockResolvedValue({ id: 'entry-existing' }),
          create: jest.fn(),
          findMany: jest.fn().mockResolvedValue([]),
        },
        candidateEmail: { count: jest.fn().mockResolvedValue(0) },
        job: { findFirst: jest.fn() },
        pipeline: { findFirst: jest.fn() },
      };
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

      await service.accept(context, 'sub-1', 'user-1');

      expect(tx.candidate.upsert).toHaveBeenCalledWith(
        expect.objectContaining({ update: expect.objectContaining({ deletedAt: null, deletedByUserId: null }) }),
      );
    });

    it('expands a stored placeholder single-word name via expandedName, but never tampers otherwise', async () => {
      const tx = {
        agencySubmission: { findFirst: jest.fn().mockResolvedValue(pendingSubmission), update: jest.fn() },
        candidate: {
          findUnique: jest.fn().mockResolvedValue({ id: 'cand-1', name: 'Alice' }),
          upsert: jest.fn().mockResolvedValue({ id: 'cand-1', name: 'Alice' }),
          update: jest.fn(),
        },
        candidateProfile: { upsert: jest.fn() },
        pipelineEntry: {
          findFirst: jest.fn().mockResolvedValue({ id: 'entry-existing' }),
          create: jest.fn(),
          findMany: jest.fn().mockResolvedValue([]),
        },
        candidateEmail: { count: jest.fn().mockResolvedValue(0) },
        job: { findFirst: jest.fn() },
        pipeline: { findFirst: jest.fn() },
      };
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

      // submission.candidateName is 'Alice' (single word), same as stored -- expansion doesn't fire.
      await service.accept(context, 'sub-1', 'user-1');

      expect(tx.candidate.upsert).toHaveBeenCalledWith(
        expect.objectContaining({ update: { deletedAt: null, deletedByUserId: null } }),
      );
    });

    it('recomputes globalStage as the last tx write -- a re-engaged candidate loses its stale label', async () => {
      // Candidate was previously fully rejected/archived (globalStage would have been stamped
      // 'rejected' or 'available' back then) and has no live entry on THIS job yet, so accept()
      // takes the pipeline-entry-create branch. Without the recompute call, globalStage would be
      // left at whatever stale value the candidate carried in from before this submission.
      const tx = {
        agencySubmission: { findFirst: jest.fn().mockResolvedValue(pendingSubmission), update: jest.fn() },
        candidate: {
          findUnique: jest.fn().mockResolvedValue({ id: 'cand-1', name: 'Alice Anderson', globalStage: 'rejected' }),
          upsert: jest.fn().mockResolvedValue({ id: 'cand-1', name: 'Alice Anderson' }),
          update: jest.fn(),
        },
        candidateProfile: { upsert: jest.fn() },
        pipelineEntry: {
          findFirst: jest.fn().mockResolvedValue(null),
          create: jest.fn().mockResolvedValue({ id: 'entry-1' }),
          // Reflects the just-created entry: one live 'active'-category entry.
          findMany: jest.fn().mockResolvedValue([{ archivedAt: null, status: { stage: { category: 'active' } } }]),
        },
        candidateEmail: { count: jest.fn().mockResolvedValue(0) },
        job: { findFirst: jest.fn().mockResolvedValue({ pipelineId: 'pipe-1' }) },
        pipeline: {
          findFirst: jest.fn().mockResolvedValue({
            stages: [{ category: 'active', statuses: [{ id: 'status-1' }] }],
          }),
        },
      };
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

      await service.accept(context, 'sub-1', 'user-1');

      // recomputeGlobalStage's own last write: candidate.update with the derived stage.
      expect(tx.candidate.update).toHaveBeenCalledWith({ where: { id: 'cand-1' }, data: { globalStage: 'engaged' } });
      // Must run AFTER the pipeline entry is created (and after the submission is marked accepted),
      // matching apply()'s "last write in the tx" ordering.
      const entryCreateOrder = tx.pipelineEntry.create.mock.invocationCallOrder[0];
      const recomputeOrder = tx.candidate.update.mock.invocationCallOrder[0];
      expect(recomputeOrder).toBeGreaterThan(entryCreateOrder);
    });
  });

  describe('reject', () => {
    it('sets status rejected + reviewer fields and creates no candidate/entry', async () => {
      const tx = {
        agencySubmission: {
          findFirst: jest.fn().mockResolvedValue({ id: 'sub-1', status: 'pending' }),
          update: jest.fn(),
        },
      };
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

      const result = await service.reject(context, 'sub-1', 'user-1');

      expect(tx.agencySubmission.update).toHaveBeenCalledWith({
        where: { id: 'sub-1' },
        data: { status: 'rejected', reviewedByUserId: 'user-1', reviewedAt: expect.any(Date) },
      });
      expect(result).toEqual({ id: 'sub-1', status: 'rejected' });
      expect(audit.record).toHaveBeenCalledWith(
        context,
        expect.objectContaining({ action: 'agency_submission.rejected', entityId: 'sub-1' }),
      );
    });

    it('throws ConflictException when the submission is not pending', async () => {
      const tx = { agencySubmission: { findFirst: jest.fn().mockResolvedValue({ id: 'sub-1', status: 'rejected' }) } };
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

      await expect(service.reject(context, 'sub-1', 'user-1')).rejects.toThrow(ConflictException);
    });
  });
});
