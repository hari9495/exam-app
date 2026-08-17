import { Test } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PublicApplicationsService } from './public-applications.service';
import { PrismaService, TenantPrismaService, BlobStorageService } from '@exam-platform/shared';
import { JobsService } from '../jobs/jobs.service';

describe('PublicApplicationsService', () => {
  let service: PublicApplicationsService;
  let prisma: { organization: { findUnique: jest.Mock } };
  let tenantPrisma: { forTenant: jest.Mock };
  let blobStorage: { upload: jest.Mock; signIfOurs: jest.Mock };
  let jobsService: { enqueue: jest.Mock };

  const openJob = {
    id: 'job-1',
    organizationId: 'org-1',
    createdById: 'user-1',
    status: 'open',
    publicApplyEnabled: true,
    title: 'Backend',
    description: 'Build things',
  };

  beforeEach(async () => {
    prisma = { organization: { findUnique: jest.fn() } };
    tenantPrisma = { forTenant: jest.fn() };
    blobStorage = { upload: jest.fn(), signIfOurs: jest.fn(async (value) => value) };
    jobsService = { enqueue: jest.fn() };

    const moduleRef = await Test.createTestingModule({
      providers: [
        PublicApplicationsService,
        { provide: PrismaService, useValue: prisma },
        { provide: TenantPrismaService, useValue: tenantPrisma },
        { provide: BlobStorageService, useValue: blobStorage },
        { provide: JobsService, useValue: jobsService },
      ],
    }).compile();
    service = moduleRef.get(PublicApplicationsService);
  });

  describe('getPublicJob', () => {
    it('throws NotFoundException when the job is missing', async () => {
      tenantPrisma.forTenant.mockImplementationOnce((_c, fn) => fn({ job: { findUnique: jest.fn().mockResolvedValue(null) } }));
      await expect(service.getPublicJob('bad-token')).rejects.toThrow(NotFoundException);
    });

    it('throws NotFoundException (same generic message) when the job is not open', async () => {
      tenantPrisma.forTenant.mockImplementationOnce((_c, fn) =>
        fn({ job: { findUnique: jest.fn().mockResolvedValue({ ...openJob, status: 'closed' }) } }),
      );
      await expect(service.getPublicJob('tok')).rejects.toThrow('This role is not accepting applications');
    });

    it('throws NotFoundException when publicApplyEnabled is false', async () => {
      tenantPrisma.forTenant.mockImplementationOnce((_c, fn) =>
        fn({ job: { findUnique: jest.fn().mockResolvedValue({ ...openJob, publicApplyEnabled: false }) } }),
      );
      await expect(service.getPublicJob('tok')).rejects.toThrow('This role is not accepting applications');
    });

    it('returns header fields with a signed logo URL for a valid job', async () => {
      tenantPrisma.forTenant.mockImplementationOnce((_c, fn) => fn({ job: { findUnique: jest.fn().mockResolvedValue(openJob) } }));
      prisma.organization.findUnique.mockResolvedValue({ name: 'Acme', logoPath: 'logos/acme.png' });
      blobStorage.signIfOurs.mockResolvedValue('logos/acme.png?sig=abc');

      const result = await service.getPublicJob('valid-token');

      expect(tenantPrisma.forTenant).toHaveBeenCalledWith(
        { organizationId: '00000000-0000-0000-0000-000000000000', isSuperAdmin: true },
        expect.any(Function),
      );
      expect(prisma.organization.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'org-1' } }),
      );
      expect(blobStorage.signIfOurs).toHaveBeenCalledWith('logos/acme.png');
      expect(result).toEqual({
        jobTitle: 'Backend',
        jobDescription: 'Build things',
        orgName: 'Acme',
        orgLogo: 'logos/acme.png?sig=abc',
      });
    });

    it('returns orgLogo: null and skips signing when the org has no logo', async () => {
      tenantPrisma.forTenant.mockImplementationOnce((_c, fn) => fn({ job: { findUnique: jest.fn().mockResolvedValue(openJob) } }));
      prisma.organization.findUnique.mockResolvedValue({ name: 'Acme', logoPath: null });

      const result = await service.getPublicJob('valid-token');

      expect(blobStorage.signIfOurs).not.toHaveBeenCalled();
      expect(result.orgLogo).toBeNull();
    });
  });

  describe('apply', () => {
    it('rejects a non-PDF résumé with BadRequestException before any write', async () => {
      tenantPrisma.forTenant.mockImplementationOnce((_c, fn) => fn({ job: { findUnique: jest.fn().mockResolvedValue(openJob) } }));
      const notPdf = Buffer.from('hello world').toString('base64');

      await expect(
        service.apply('valid-token', { name: 'A', email: 'a@x.com', resumeBase64: notPdf }),
      ).rejects.toThrow(BadRequestException);
      expect(blobStorage.upload).not.toHaveBeenCalled();
      expect(tenantPrisma.forTenant).toHaveBeenCalledTimes(1); // only the bootstrap read, no write tx
    });

    it('rejects an oversized résumé with BadRequestException before any write', async () => {
      tenantPrisma.forTenant.mockImplementationOnce((_c, fn) => fn({ job: { findUnique: jest.fn().mockResolvedValue(openJob) } }));
      const big = Buffer.concat([Buffer.from('%PDF-1.7'), Buffer.alloc(6 * 1024 * 1024)]);

      await expect(
        service.apply('valid-token', { name: 'A', email: 'a@x.com', resumeBase64: big.toString('base64') }),
      ).rejects.toThrow(BadRequestException);
      expect(blobStorage.upload).not.toHaveBeenCalled();
      expect(tenantPrisma.forTenant).toHaveBeenCalledTimes(1); // only the bootstrap read, no write tx
    });

    it('stores résumé, upserts candidate/profile/entry, enqueues parse, returns token', async () => {
      const bootstrapTx = { job: { findUnique: jest.fn().mockResolvedValue(openJob) } };
      const writeTx = {
        candidate: {
          findUnique: jest.fn().mockResolvedValue(null),
          upsert: jest.fn().mockResolvedValue({ id: 'cand-1' }),
        },
        candidateProfile: { upsert: jest.fn().mockResolvedValue({ id: 'prof-1' }) },
        pipelineEntry: { upsert: jest.fn().mockResolvedValue({ id: 'en-1', applicationToken: 'tok-generated' }) },
      };
      tenantPrisma.forTenant
        .mockImplementationOnce((_c, fn) => fn(bootstrapTx))
        .mockImplementationOnce((_c, fn) => fn(writeTx));
      blobStorage.upload.mockResolvedValue('candidates/org-1/some-uuid.pdf');
      jobsService.enqueue.mockResolvedValue({ id: 'aijob-1' });

      const pdf = Buffer.from('%PDF-1.7 hello').toString('base64');
      const out = await service.apply('valid-token', { name: 'A', email: 'a@x.com', resumeBase64: pdf });

      expect(blobStorage.upload).toHaveBeenCalledWith(
        expect.stringMatching(/^candidates\/org-1\/.+\.pdf$/),
        expect.any(Buffer),
        'application/pdf',
      );
      expect(writeTx.candidate.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { organizationId_email: { organizationId: 'org-1', email: 'a@x.com' } },
          create: expect.objectContaining({ organizationId: 'org-1', email: 'a@x.com', name: 'A' }),
        }),
      );
      expect(writeTx.candidateProfile.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { candidateId: 'cand-1' },
          create: expect.objectContaining({ parseStatus: 'pending', resumePath: 'candidates/org-1/some-uuid.pdf' }),
          update: expect.objectContaining({
            parseStatus: 'pending',
            resumePath: 'candidates/org-1/some-uuid.pdf',
            parsedSummary: null,
            parsedSkills: null,
            parsedTitle: null,
            parsedYearsExperience: null,
            parsedAt: null,
          }),
        }),
      );
      expect(writeTx.pipelineEntry.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { jobId_candidateId: { jobId: 'job-1', candidateId: 'cand-1' } },
          create: expect.objectContaining({ stage: 'applied', enteredVia: 'application' }),
          update: {},
        }),
      );
      expect(jobsService.enqueue).toHaveBeenCalledWith(
        expect.objectContaining({ organizationId: 'org-1' }),
        'resume_parse',
        expect.stringContaining('cand-1'),
        'user-1',
      );
      expect(out).toEqual({ statusToken: 'tok-generated' });
    });

    it('re-apply returns the existing token (upsert update: {} keeps the entry as-is)', async () => {
      const bootstrapTx = { job: { findUnique: jest.fn().mockResolvedValue(openJob) } };
      const writeTx = {
        candidate: {
          findUnique: jest.fn().mockResolvedValue(null),
          upsert: jest.fn().mockResolvedValue({ id: 'cand-1' }),
        },
        candidateProfile: { upsert: jest.fn().mockResolvedValue({ id: 'prof-1' }) },
        pipelineEntry: { upsert: jest.fn().mockResolvedValue({ id: 'en-1', applicationToken: 'existing-token' }) },
      };
      tenantPrisma.forTenant
        .mockImplementationOnce((_c, fn) => fn(bootstrapTx))
        .mockImplementationOnce((_c, fn) => fn(writeTx));
      blobStorage.upload.mockResolvedValue('candidates/org-1/new-upload.pdf');
      jobsService.enqueue.mockResolvedValue({ id: 'aijob-2' });

      const pdf = Buffer.from('%PDF-1.7 hello again').toString('base64');
      const out = await service.apply('valid-token', { name: 'A', email: 'a@x.com', resumeBase64: pdf });

      expect(out).toEqual({ statusToken: 'existing-token' });
    });

    it('does not let public input overwrite an existing candidate\'s stored name/phone', async () => {
      const bootstrapTx = { job: { findUnique: jest.fn().mockResolvedValue(openJob) } };
      const writeTx = {
        candidate: {
          findUnique: jest.fn().mockResolvedValue({ id: 'cand-1', name: 'Real Name', phone: '555-0000' }),
          upsert: jest.fn().mockResolvedValue({ id: 'cand-1' }),
        },
        candidateProfile: { upsert: jest.fn().mockResolvedValue({ id: 'prof-1' }) },
        pipelineEntry: { upsert: jest.fn().mockResolvedValue({ id: 'en-1', applicationToken: 'existing-token' }) },
      };
      tenantPrisma.forTenant
        .mockImplementationOnce((_c, fn) => fn(bootstrapTx))
        .mockImplementationOnce((_c, fn) => fn(writeTx));
      blobStorage.upload.mockResolvedValue('candidates/org-1/attacker-upload.pdf');
      jobsService.enqueue.mockResolvedValue({ id: 'aijob-3' });

      const pdf = Buffer.from('%PDF-1.7 attacker').toString('base64');
      await service.apply('valid-token', {
        name: 'Attacker Supplied Name',
        email: 'a@x.com',
        phone: '999-9999',
        resumeBase64: pdf,
      });

      // stored name is two words already -- expandedName's guard means no exception applies,
      // so the update must leave name/phone untouched entirely (not even set to the submitted values).
      expect(writeTx.candidate.upsert).toHaveBeenCalledWith(expect.objectContaining({ update: {} }));
    });
  });

  describe('getApplicationStatus', () => {
    it('maps stage to a status bucket', async () => {
      tenantPrisma.forTenant.mockImplementationOnce((_c, fn) =>
        fn({
          pipelineEntry: {
            findUnique: jest.fn().mockResolvedValue({
              stage: 'interview',
              rejected: false,
              createdAt: new Date('2026-01-01T00:00:00Z'),
              job: { title: 'Backend' },
            }),
          },
        }),
      );

      const result = await service.getApplicationStatus('status-tok');

      expect(tenantPrisma.forTenant).toHaveBeenCalledWith(
        { organizationId: '00000000-0000-0000-0000-000000000000', isSuperAdmin: true },
        expect.any(Function),
      );
      expect(result).toEqual({
        jobTitle: 'Backend',
        appliedAt: new Date('2026-01-01T00:00:00Z'),
        statusBucket: 'Under review',
      });
    });

    it('throws NotFoundException for an unknown token', async () => {
      tenantPrisma.forTenant.mockImplementationOnce((_c, fn) => fn({ pipelineEntry: { findUnique: jest.fn().mockResolvedValue(null) } }));
      await expect(service.getApplicationStatus('bad-tok')).rejects.toThrow(NotFoundException);
    });
  });
});
