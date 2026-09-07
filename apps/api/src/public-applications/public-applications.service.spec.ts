import { Test } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PublicApplicationsService } from './public-applications.service';
import { PrismaService, TenantPrismaService, BlobStorageService } from '@exam-platform/shared';
import { JobsService } from '../jobs/jobs.service';
import { IntegrationEventsService } from '../integrations/integration-events.service';

// apply() now calls recomputeGlobalStage(tx, ...) as its last write, which reads
// tx.pipelineEntry.findMany + tx.candidateEmail.count and writes tx.candidate.update. Default to
// an empty/no-op shape (spread first) so a test's own mock for any of these still wins.
// It also re-derives the apply-visible custom field set (customFieldDefinition.findMany) and
// upserts/deletes customFieldValue rows -- default to no apply-visible defs so tests that don't
// care about custom fields don't need to stub them.
function withRecomputeMocks(tx: any) {
  tx.pipelineEntry = { findMany: jest.fn().mockResolvedValue([]), ...tx.pipelineEntry };
  tx.candidateEmail = { count: jest.fn().mockResolvedValue(0) };
  tx.candidate = { update: jest.fn().mockResolvedValue({}), ...tx.candidate };
  tx.customFieldDefinition = { findMany: jest.fn().mockResolvedValue([]), ...tx.customFieldDefinition };
  tx.customFieldValue = { upsert: jest.fn().mockResolvedValue({}), deleteMany: jest.fn().mockResolvedValue({}), ...tx.customFieldValue };
  return tx;
}

describe('PublicApplicationsService', () => {
  let service: PublicApplicationsService;
  let prisma: { organization: { findUnique: jest.Mock; findMany: jest.Mock } };
  let tenantPrisma: { forTenant: jest.Mock };
  let blobStorage: { upload: jest.Mock; signIfOurs: jest.Mock };
  let jobsService: { enqueue: jest.Mock };
  let integrationEvents: { emit: jest.Mock };

  const openJob = {
    id: 'job-1',
    organizationId: 'org-1',
    createdById: 'user-1',
    status: 'open',
    publicApplyEnabled: true,
    title: 'Backend',
    description: 'Build things',
    location: 'Remote',
    employmentType: 'FULL_TIME',
    createdAt: new Date('2026-08-01T00:00:00.000Z'),
  };

  beforeEach(async () => {
    prisma = { organization: { findUnique: jest.fn(), findMany: jest.fn() } };
    tenantPrisma = { forTenant: jest.fn() };
    blobStorage = { upload: jest.fn(), signIfOurs: jest.fn(async (value) => value) };
    jobsService = { enqueue: jest.fn() };
    integrationEvents = { emit: jest.fn() };

    const moduleRef = await Test.createTestingModule({
      providers: [
        PublicApplicationsService,
        { provide: PrismaService, useValue: prisma },
        { provide: TenantPrismaService, useValue: tenantPrisma },
        { provide: BlobStorageService, useValue: blobStorage },
        { provide: JobsService, useValue: jobsService },
        { provide: IntegrationEventsService, useValue: integrationEvents },
      ],
    }).compile();
    service = moduleRef.get(PublicApplicationsService);
  });

  // getPublicJob makes a second forTenant call (after resolveJob's) to load apply-visible
  // candidate custom field definitions. Default to empty so tests that don't care about
  // customFields don't need to stub it themselves.
  function mockNoCustomFieldDefs() {
    tenantPrisma.forTenant.mockImplementationOnce((_c, fn) => fn({ customFieldDefinition: { findMany: jest.fn().mockResolvedValue([]) } }));
  }

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
      mockNoCustomFieldDefs();
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
        location: 'Remote',
        employmentType: 'FULL_TIME',
        postedAt: '2026-08-01T00:00:00.000Z',
        orgName: 'Acme',
        orgLogo: 'logos/acme.png?sig=abc',
        applyConsentText: null,
        applyConsentVersion: 1,
        customFields: [],
      });
    });

    it('exposes the org’s configured apply-consent text and version', async () => {
      tenantPrisma.forTenant.mockImplementationOnce((_c, fn) => fn({ job: { findUnique: jest.fn().mockResolvedValue(openJob) } }));
      mockNoCustomFieldDefs();
      prisma.organization.findUnique.mockResolvedValue({ name: 'Acme', logoPath: null, applyConsentText: 'I agree to X', applyConsentVersion: 3 });

      const result = await service.getPublicJob('valid-token');

      expect(result.applyConsentText).toBe('I agree to X');
      expect(result.applyConsentVersion).toBe(3);
    });

    it('returns orgLogo: null and skips signing when the org has no logo', async () => {
      tenantPrisma.forTenant.mockImplementationOnce((_c, fn) => fn({ job: { findUnique: jest.fn().mockResolvedValue(openJob) } }));
      mockNoCustomFieldDefs();
      prisma.organization.findUnique.mockResolvedValue({ name: 'Acme', logoPath: null });

      const result = await service.getPublicJob('valid-token');

      expect(blobStorage.signIfOurs).not.toHaveBeenCalled();
      expect(result.orgLogo).toBeNull();
    });

    it('returns apply-visible candidate custom field definitions, mapped and ordered by position', async () => {
      tenantPrisma.forTenant.mockImplementationOnce((_c, fn) => fn({ job: { findUnique: jest.fn().mockResolvedValue(openJob) } }));
      const findMany = jest.fn().mockResolvedValue([
        { id: 'def-1', key: 'linkedin', label: 'LinkedIn', fieldType: 'text', optionsJson: null, required: false },
        {
          id: 'def-2',
          key: 'source',
          label: 'How did you hear about us?',
          fieldType: 'select',
          optionsJson: JSON.stringify(['Referral', 'Job board']),
          required: true,
        },
      ]);
      tenantPrisma.forTenant.mockImplementationOnce((_c, fn) => fn({ customFieldDefinition: { findMany } }));
      prisma.organization.findUnique.mockResolvedValue({ name: 'Acme', logoPath: null });

      const result = await service.getPublicJob('valid-token');

      expect(tenantPrisma.forTenant).toHaveBeenNthCalledWith(
        2,
        { organizationId: '00000000-0000-0000-0000-000000000000', isSuperAdmin: true },
        expect.any(Function),
      );
      expect(findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { organizationId: 'org-1', entityType: 'candidate', showOnApply: true, archivedAt: null },
          orderBy: { position: 'asc' },
        }),
      );
      expect(result.customFields).toEqual([
        { definitionId: 'def-1', key: 'linkedin', label: 'LinkedIn', fieldType: 'text', options: null, required: false },
        {
          definitionId: 'def-2',
          key: 'source',
          label: 'How did you hear about us?',
          fieldType: 'select',
          options: ['Referral', 'Job board'],
          required: true,
        },
      ]);
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
      const writeTx = withRecomputeMocks({
        candidate: {
          findUnique: jest.fn().mockResolvedValue(null),
          upsert: jest.fn().mockResolvedValue({ id: 'cand-1', portalToken: 'ptok-1' }),
        },
        candidateProfile: { upsert: jest.fn().mockResolvedValue({ id: 'prof-1' }) },
        pipelineEntry: { upsert: jest.fn().mockResolvedValue({ id: 'en-1', applicationToken: 'tok-generated' }) },
      });
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
          create: expect.objectContaining({ enteredVia: 'application' }),
          update: {},
        }),
      );
      expect(jobsService.enqueue).toHaveBeenCalledWith(
        expect.objectContaining({ organizationId: 'org-1' }),
        'resume_parse',
        expect.stringContaining('cand-1'),
        'user-1',
      );
      expect(out).toEqual({ statusToken: 'tok-generated', portalToken: 'ptok-1' });
      // A brand-new candidate (existingCandidate was null) is a new applicant.
      expect(integrationEvents.emit).toHaveBeenCalledWith(
        'org-1',
        'candidate.applied',
        expect.objectContaining({ subject: 'A', source: 'public', linkPath: '/candidates/cand-1' }),
      );
      // A public application must recompute globalStage so the candidate isn't left stale.
      expect(writeTx.candidate.update).toHaveBeenCalledWith(expect.objectContaining({
        where: { id: 'cand-1' },
        data: expect.objectContaining({ globalStage: expect.any(String) }),
      }));
    });

    it('re-apply returns the existing token (upsert update: {} keeps the entry as-is)', async () => {
      const bootstrapTx = { job: { findUnique: jest.fn().mockResolvedValue(openJob) } };
      const writeTx = {
        candidate: {
          findUnique: jest.fn().mockResolvedValue(null),
          upsert: jest.fn().mockResolvedValue({ id: 'cand-1', portalToken: 'ptok-1' }),
        },
        candidateProfile: { upsert: jest.fn().mockResolvedValue({ id: 'prof-1' }) },
        pipelineEntry: { upsert: jest.fn().mockResolvedValue({ id: 'en-1', applicationToken: 'existing-token' }) },
      };
      tenantPrisma.forTenant
        .mockImplementationOnce((_c, fn) => fn(bootstrapTx))
        .mockImplementationOnce((_c, fn) => fn(withRecomputeMocks(writeTx)));
      blobStorage.upload.mockResolvedValue('candidates/org-1/new-upload.pdf');
      jobsService.enqueue.mockResolvedValue({ id: 'aijob-2' });

      const pdf = Buffer.from('%PDF-1.7 hello again').toString('base64');
      const out = await service.apply('valid-token', { name: 'A', email: 'a@x.com', resumeBase64: pdf });

      expect(out).toEqual({ statusToken: 'existing-token', portalToken: 'ptok-1' });
    });

    it('resolves statusId from the first ACTIVE-category stage (not merely stages[0]) when the job has a pipeline', async () => {
      const jobWithPipeline = { ...openJob, pipelineId: 'pipe-1' };
      const bootstrapTx = { job: { findUnique: jest.fn().mockResolvedValue(jobWithPipeline) } };
      const writeTx = {
        candidate: {
          findUnique: jest.fn().mockResolvedValue(null),
          upsert: jest.fn().mockResolvedValue({ id: 'cand-1', portalToken: 'ptok-1' }),
        },
        candidateProfile: { upsert: jest.fn().mockResolvedValue({ id: 'prof-1' }) },
        // Two stages, deliberately with 'rejected' FIRST and 'active' SECOND, to prove the code
        // picks the first active-category stage's first status -- not stages[0] -- and not the
        // rejected stage's status either.
        pipeline: {
          findFirst: jest.fn().mockResolvedValue({
            id: 'pipe-1',
            stages: [
              { category: 'rejected', statuses: [{ id: 'st-rej-1' }, { id: 'st-rej-2' }] },
              { category: 'active', statuses: [{ id: 'st-act-1' }, { id: 'st-act-2' }] },
            ],
          }),
        },
        pipelineEntry: { upsert: jest.fn().mockResolvedValue({ id: 'en-1', applicationToken: 'tok-generated' }) },
      };
      tenantPrisma.forTenant
        .mockImplementationOnce((_c, fn) => fn(bootstrapTx))
        .mockImplementationOnce((_c, fn) => fn(withRecomputeMocks(writeTx)));
      blobStorage.upload.mockResolvedValue('candidates/org-1/some-uuid.pdf');
      jobsService.enqueue.mockResolvedValue({ id: 'aijob-4' });

      const pdf = Buffer.from('%PDF-1.7 hello').toString('base64');
      await service.apply('valid-token', { name: 'A', email: 'a@x.com', resumeBase64: pdf });

      expect(writeTx.pipeline.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'pipe-1' } }),
      );
      expect(writeTx.pipelineEntry.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({ statusId: 'st-act-1' }),
        }),
      );
    });

    it('does not let public input overwrite an existing candidate\'s stored name/phone', async () => {
      const bootstrapTx = { job: { findUnique: jest.fn().mockResolvedValue(openJob) } };
      const writeTx = {
        candidate: {
          findUnique: jest.fn().mockResolvedValue({ id: 'cand-1', name: 'Real Name', phone: '555-0000' }),
          upsert: jest.fn().mockResolvedValue({ id: 'cand-1', portalToken: 'ptok-1' }),
        },
        candidateProfile: { upsert: jest.fn().mockResolvedValue({ id: 'prof-1' }) },
        pipelineEntry: { upsert: jest.fn().mockResolvedValue({ id: 'en-1', applicationToken: 'existing-token' }) },
      };
      tenantPrisma.forTenant
        .mockImplementationOnce((_c, fn) => fn(bootstrapTx))
        .mockImplementationOnce((_c, fn) => fn(withRecomputeMocks(writeTx)));
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
      // so the update must leave name/phone untouched entirely (not even set to the submitted values) --
      // it still always clears deletedAt/deletedByUserId to resurrect a soft-deleted match.
      expect(writeTx.candidate.upsert).toHaveBeenCalledWith(
        expect.objectContaining({ update: { deletedAt: null, deletedByUserId: null } }),
      );
      // Existing candidate re-applying is not a new applicant -- no candidate.applied event.
      expect(integrationEvents.emit).not.toHaveBeenCalled();
    });
  });

  describe('apply — consent', () => {
    function buildWriteTx(existingCandidate: unknown) {
      return withRecomputeMocks({
        candidate: {
          findUnique: jest.fn().mockResolvedValue(existingCandidate),
          upsert: jest.fn().mockResolvedValue({ id: 'cand-1', portalToken: 'ptok-1' }),
        },
        candidateProfile: { upsert: jest.fn().mockResolvedValue({ id: 'prof-1' }) },
        pipelineEntry: { upsert: jest.fn().mockResolvedValue({ id: 'en-1', applicationToken: 'tok-1' }) },
      });
    }

    async function callApply(writeTx: any, consentAccepted?: boolean) {
      const bootstrapTx = { job: { findUnique: jest.fn().mockResolvedValue(openJob) } };
      tenantPrisma.forTenant
        .mockImplementationOnce((_c, fn) => fn(bootstrapTx))
        .mockImplementationOnce((_c, fn) => fn(writeTx));
      blobStorage.upload.mockResolvedValue('candidates/org-1/x.pdf');
      jobsService.enqueue.mockResolvedValue({ id: 'aijob' });
      const pdf = Buffer.from('%PDF-1.7 x').toString('base64');
      return service.apply('valid-token', {
        name: 'A',
        email: 'a@x.com',
        resumeBase64: pdf,
        ...(consentAccepted === undefined ? {} : { consentAccepted }),
      });
    }

    it('stamps a NEW candidate with consentedAt/version when the org requires consent and it is accepted', async () => {
      prisma.organization.findUnique.mockResolvedValue({ applyConsentText: 'I agree to X', applyConsentVersion: 3 });
      const writeTx = buildWriteTx(null);

      await callApply(writeTx, true);

      expect(writeTx.candidate.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({ consentedAt: expect.any(Date), consentVersion: 3 }),
          update: expect.objectContaining({ consentedAt: expect.any(Date), consentVersion: 3 }),
        }),
      );
    });

    it('stamps a RETURNING candidate with consentedAt/version when the org requires consent and it is accepted', async () => {
      prisma.organization.findUnique.mockResolvedValue({ applyConsentText: 'I agree to X', applyConsentVersion: 3 });
      // Stored name is already two words -- expandedName won't fire, isolating the assertion to consent alone.
      const writeTx = buildWriteTx({ id: 'cand-1', name: 'Real Name', phone: '555-0000' });

      await callApply(writeTx, true);

      expect(writeTx.candidate.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          update: expect.objectContaining({ consentedAt: expect.any(Date), consentVersion: 3 }),
        }),
      );
    });

    it('rejects with BadRequest and writes nothing when the org requires consent and consentAccepted is missing', async () => {
      prisma.organization.findUnique.mockResolvedValue({ applyConsentText: 'I agree to X', applyConsentVersion: 1 });
      tenantPrisma.forTenant.mockImplementationOnce((_c, fn) => fn({ job: { findUnique: jest.fn().mockResolvedValue(openJob) } }));

      await expect(
        service.apply('valid-token', { name: 'A', email: 'a@x.com', resumeBase64: Buffer.from('%PDF-1.7 x').toString('base64') }),
      ).rejects.toThrow('Consent is required to apply');
      expect(blobStorage.upload).not.toHaveBeenCalled();
      expect(tenantPrisma.forTenant).toHaveBeenCalledTimes(1); // only the bootstrap read, no write tx
    });

    it('rejects with BadRequest when the org requires consent and consentAccepted is explicitly false', async () => {
      prisma.organization.findUnique.mockResolvedValue({ applyConsentText: 'I agree to X', applyConsentVersion: 1 });
      tenantPrisma.forTenant.mockImplementationOnce((_c, fn) => fn({ job: { findUnique: jest.fn().mockResolvedValue(openJob) } }));

      await expect(callApply({}, false)).rejects.toThrow('Consent is required to apply');
      expect(blobStorage.upload).not.toHaveBeenCalled();
    });

    it('does not stamp and does not require consent when applyConsentText is null (not configured)', async () => {
      prisma.organization.findUnique.mockResolvedValue({ applyConsentText: null, applyConsentVersion: 1 });
      const writeTx = buildWriteTx(null);

      const out = await callApply(writeTx);

      expect(out.statusToken).toBe('tok-1');
      const create = writeTx.candidate.upsert.mock.calls[0][0].create;
      expect(create.consentedAt).toBeUndefined();
      expect(create.consentVersion).toBeUndefined();
    });

    it('does not stamp and does not require consent when applyConsentText is whitespace-only', async () => {
      prisma.organization.findUnique.mockResolvedValue({ applyConsentText: '   ', applyConsentVersion: 2 });
      const writeTx = buildWriteTx(null);

      const out = await callApply(writeTx);

      expect(out.statusToken).toBe('tok-1');
      const create = writeTx.candidate.upsert.mock.calls[0][0].create;
      expect(create.consentedAt).toBeUndefined();
      expect(create.consentVersion).toBeUndefined();
    });
  });

  describe('apply — custom fields (trust boundary)', () => {
    const linkedinDef = { id: 'def-linkedin', key: 'linkedin', label: 'LinkedIn', fieldType: 'text', optionsJson: null, required: false };
    const requiredSourceDef = {
      id: 'def-source',
      key: 'source',
      label: 'How did you hear about us?',
      fieldType: 'text',
      optionsJson: null,
      required: true,
    };

    function buildWriteTx(applyVisibleDefs: unknown[]) {
      return withRecomputeMocks({
        candidate: {
          findUnique: jest.fn().mockResolvedValue(null),
          upsert: jest.fn().mockResolvedValue({ id: 'cand-1', portalToken: 'ptok-1' }),
        },
        candidateProfile: { upsert: jest.fn().mockResolvedValue({ id: 'prof-1' }) },
        pipelineEntry: { upsert: jest.fn().mockResolvedValue({ id: 'en-1', applicationToken: 'tok-1' }) },
        customFieldDefinition: { findMany: jest.fn().mockResolvedValue(applyVisibleDefs) },
      });
    }

    async function callApply(writeTx: any, customFields?: Record<string, string | number | null>) {
      const bootstrapTx = { job: { findUnique: jest.fn().mockResolvedValue(openJob) } };
      tenantPrisma.forTenant
        .mockImplementationOnce((_c, fn) => fn(bootstrapTx))
        .mockImplementationOnce((_c, fn) => fn(writeTx));
      blobStorage.upload.mockResolvedValue('candidates/org-1/x.pdf');
      jobsService.enqueue.mockResolvedValue({ id: 'aijob' });
      const pdf = Buffer.from('%PDF-1.7 x').toString('base64');
      return service.apply('valid-token', { name: 'A', email: 'a@x.com', resumeBase64: pdf, ...(customFields ? { customFields } : {}) });
    }

    it('re-derives the allowed set from the DB: loads apply-visible candidate defs (candidate + showOnApply + not-archived) inside the write tx', async () => {
      const writeTx = buildWriteTx([linkedinDef]);
      await callApply(writeTx, { 'def-linkedin': 'https://linkedin.com/in/a' });

      expect(writeTx.customFieldDefinition.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { organizationId: 'org-1', entityType: 'candidate', showOnApply: true, archivedAt: null },
        }),
      );
    });

    it('persists a value for an apply-visible field on the created candidate', async () => {
      const writeTx = buildWriteTx([linkedinDef]);
      await callApply(writeTx, { 'def-linkedin': 'https://linkedin.com/in/a' });

      expect(writeTx.customFieldValue.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({
            organizationId: 'org-1',
            definitionId: 'def-linkedin',
            entityType: 'candidate',
            entityId: 'cand-1',
            valueText: 'https://linkedin.com/in/a',
          }),
        }),
      );
    });

    it('rejects a value for a definition the server did not derive as apply-visible (job field / archived / showOnApply:false), even though the client-supplied id looks valid', async () => {
      // The DB only returns linkedinDef as apply-visible; the client sends a value for a
      // *different* id -- as it would for a job-scoped def, an archived def, or a
      // showOnApply:false def, none of which the findMany above would ever return.
      const writeTx = buildWriteTx([linkedinDef]);

      await expect(callApply(writeTx, { 'def-job-scoped-or-archived': 'sneaky value' })).rejects.toThrow(BadRequestException);
      expect(writeTx.customFieldValue.upsert).not.toHaveBeenCalled();
      // Confirms nothing about this write reached the candidate-details step either.
      expect(writeTx.candidateProfile.upsert).not.toHaveBeenCalled();
    });

    it('enforces required among apply-visible fields even when the client sends no customFields at all', async () => {
      const writeTx = buildWriteTx([requiredSourceDef]);

      await expect(callApply(writeTx, undefined)).rejects.toThrow(BadRequestException);
      expect(writeTx.customFieldValue.upsert).not.toHaveBeenCalled();
    });

    it('does not throw and does not write anything when there are no apply-visible defs and the client omits customFields (existing flow stays intact)', async () => {
      const writeTx = buildWriteTx([]);
      const out = await callApply(writeTx, undefined);

      expect(out.statusToken).toBe('tok-1');
      expect(writeTx.customFieldValue.upsert).not.toHaveBeenCalled();
    });
  });

  describe('getApplicationStatus', () => {
    it('maps stage to a status bucket', async () => {
      tenantPrisma.forTenant.mockImplementationOnce((_c, fn) =>
        fn({
          pipelineEntry: {
            findUnique: jest.fn().mockResolvedValue({
              status: { stage: { name: 'interview' } },
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

  describe('getPortal', () => {
    it("aggregates the candidate's applications with their interviews and offers", async () => {
      tenantPrisma.forTenant
        .mockImplementationOnce((_c, fn) => fn({ candidate: { findUnique: jest.fn().mockResolvedValue({ id: 'cand-1', organizationId: 'org-1', erasedAt: null }) } }))
        .mockImplementationOnce((_c, fn) =>
          fn({
            candidate: {
              findUnique: jest.fn().mockResolvedValue({ name: 'Asha', email: 'a@x.com', phone: '555-1234' }),
            },
            pipelineEntry: {
              findMany: jest.fn().mockResolvedValue([
                {
                  applicationToken: 'st1',
                  status: { stage: { name: 'interview' } },
                  rejected: false,
                  createdAt: new Date('2026-08-01T00:00:00.000Z'),
                  job: { title: 'Backend' },
                  interviews: [{ interviewToken: 'it1', status: 'proposed', location: 'Room', timeZone: 'UTC', confirmedSlotId: null, slots: [{ startsAt: new Date('2026-09-01T14:00:00.000Z'), endsAt: new Date('2026-09-01T15:00:00.000Z') }] }],
                  offers: [{ offerToken: 'ot1', status: 'sent', compensation: '10L', startDate: new Date('2026-10-01T00:00:00.000Z'), expiresAt: new Date('2026-09-15T00:00:00.000Z') }],
                },
              ]),
            },
            candidateProfile: {
              findUnique: jest.fn().mockResolvedValue({ resumePath: 'candidates/org-1/resume.pdf', parseStatus: 'parsed' }),
            },
          }),
        );
      prisma.organization.findUnique.mockResolvedValue({ name: 'Acme' });

      const out = await service.getPortal('ptok-1');

      expect(out.candidateName).toBe('Asha');
      expect(out.orgName).toBe('Acme');
      expect(out.candidatePhone).toBe('555-1234');
      expect(out.resume).toEqual({ hasResume: true, parseStatus: 'parsed' });
      expect(out.applications).toHaveLength(1);
      expect(out.applications[0]).toMatchObject({ jobTitle: 'Backend', stage: 'interview', statusToken: 'st1' });
      expect(out.applications[0].interviews[0]).toMatchObject({ token: 'it1', confirmed: false });
      expect(out.applications[0].offers[0]).toMatchObject({ token: 'ot1', status: 'sent' });
    });

    it('returns candidatePhone: null and resume: hasResume false when the candidate has no phone/profile', async () => {
      tenantPrisma.forTenant
        .mockImplementationOnce((_c, fn) => fn({ candidate: { findUnique: jest.fn().mockResolvedValue({ id: 'cand-1', organizationId: 'org-1', erasedAt: null }) } }))
        .mockImplementationOnce((_c, fn) =>
          fn({
            candidate: { findUnique: jest.fn().mockResolvedValue({ name: 'Asha', email: 'a@x.com', phone: null }) },
            pipelineEntry: { findMany: jest.fn().mockResolvedValue([]) },
            candidateProfile: { findUnique: jest.fn().mockResolvedValue(null) },
          }),
        );
      prisma.organization.findUnique.mockResolvedValue({ name: 'Acme' });

      const out = await service.getPortal('ptok-1');

      expect(out.candidatePhone).toBeNull();
      expect(out.resume).toEqual({ hasResume: false, parseStatus: null });
    });

    it('throws NotFound for an unknown portal token', async () => {
      tenantPrisma.forTenant.mockImplementationOnce((_c, fn) => fn({ candidate: { findUnique: jest.fn().mockResolvedValue(null) } }));
      await expect(service.getPortal('bad')).rejects.toThrow(NotFoundException);
    });

    it('throws NotFound for an erased candidate', async () => {
      tenantPrisma.forTenant.mockImplementationOnce((_c, fn) =>
        fn({ candidate: { findUnique: jest.fn().mockResolvedValue({ id: 'cand-1', organizationId: 'org-1', erasedAt: new Date('2026-01-01T00:00:00.000Z') }) } }),
      );
      await expect(service.getPortal('erased-tok')).rejects.toThrow(NotFoundException);
    });
  });

  describe('updatePortalProfile', () => {
    it('updates only name/phone on the token\'s candidate (trims name, never touches email), then returns the getPortal payload', async () => {
      const updateMock = jest.fn().mockResolvedValue({});
      tenantPrisma.forTenant
        .mockImplementationOnce((_c, fn) => fn({ candidate: { findUnique: jest.fn().mockResolvedValue({ id: 'cand-1', organizationId: 'org-1', erasedAt: null }) } }))
        .mockImplementationOnce((_c, fn) => fn({ candidate: { update: updateMock } }))
        .mockImplementationOnce((_c, fn) => fn({ candidate: { findUnique: jest.fn().mockResolvedValue({ id: 'cand-1', organizationId: 'org-1', erasedAt: null }) } }))
        .mockImplementationOnce((_c, fn) =>
          fn({
            candidate: { findUnique: jest.fn().mockResolvedValue({ name: 'New Name', email: 'a@x.com', phone: '555-1111' }) },
            pipelineEntry: { findMany: jest.fn().mockResolvedValue([]) },
            candidateProfile: { findUnique: jest.fn().mockResolvedValue(null) },
          }),
        );
      prisma.organization.findUnique.mockResolvedValue({ name: 'Acme' });

      const out = await service.updatePortalProfile('ptok-1', { name: '  New Name  ', phone: '555-1111' });

      expect(updateMock).toHaveBeenCalledWith({ where: { id: 'cand-1' }, data: { name: 'New Name', phone: '555-1111' } });
      // never writes email
      expect(Object.keys(updateMock.mock.calls[0][0].data)).toEqual(['name', 'phone']);
      // returns the getPortal payload (proves it re-fetches rather than echoing the dto)
      expect(out.candidateName).toBe('New Name');
      expect(out.candidatePhone).toBe('555-1111');
    });

    it('rejects an empty body (neither field) with BadRequestException, before touching the DB', async () => {
      await expect(service.updatePortalProfile('ptok-1', {})).rejects.toThrow(BadRequestException);
      expect(tenantPrisma.forTenant).not.toHaveBeenCalled();
    });

    it('rejects a blank/whitespace name with BadRequestException', async () => {
      await expect(service.updatePortalProfile('ptok-1', { name: '   ' })).rejects.toThrow(BadRequestException);
      expect(tenantPrisma.forTenant).not.toHaveBeenCalled();
    });

    it('throws NotFoundException for an unknown/erased token', async () => {
      tenantPrisma.forTenant.mockImplementationOnce((_c, fn) => fn({ candidate: { findUnique: jest.fn().mockResolvedValue(null) } }));
      await expect(service.updatePortalProfile('bad-tok', { name: 'X' })).rejects.toThrow(NotFoundException);
    });
  });

  describe('uploadPortalResume', () => {
    it('rejects a non-PDF résumé with BadRequestException', async () => {
      tenantPrisma.forTenant.mockImplementationOnce((_c, fn) =>
        fn({ candidate: { findUnique: jest.fn().mockResolvedValue({ id: 'cand-1', organizationId: 'org-1', erasedAt: null }) } }),
      );
      const notPdf = Buffer.from('hello world').toString('base64');

      await expect(service.uploadPortalResume('ptok-1', { resumeBase64: notPdf })).rejects.toThrow(
        new BadRequestException('Résumé must be a PDF'),
      );
      expect(blobStorage.upload).not.toHaveBeenCalled();
    });

    it('rejects an oversized résumé with BadRequestException', async () => {
      tenantPrisma.forTenant.mockImplementationOnce((_c, fn) =>
        fn({ candidate: { findUnique: jest.fn().mockResolvedValue({ id: 'cand-1', organizationId: 'org-1', erasedAt: null }) } }),
      );
      const big = Buffer.concat([Buffer.from('%PDF-1.7'), Buffer.alloc(6 * 1024 * 1024)]);

      await expect(
        service.uploadPortalResume('ptok-1', { resumeBase64: big.toString('base64') }),
      ).rejects.toThrow(new BadRequestException('Résumé exceeds 5 MB'));
      expect(blobStorage.upload).not.toHaveBeenCalled();
    });

    it('throws NotFoundException for an unknown/erased token', async () => {
      tenantPrisma.forTenant.mockImplementationOnce((_c, fn) => fn({ candidate: { findUnique: jest.fn().mockResolvedValue(null) } }));
      await expect(service.uploadPortalResume('bad-tok', { resumeBase64: 'x' })).rejects.toThrow(NotFoundException);
      expect(blobStorage.upload).not.toHaveBeenCalled();
    });

    it('uploads OUTSIDE the tx, upserts the profile with reset parse fields, and enqueues resume_parse for the most-recent application owner', async () => {
      const callOrder: string[] = [];
      blobStorage.upload.mockImplementation(async () => {
        callOrder.push('upload');
        return 'candidates/org-1/new.pdf';
      });
      const writeTx = {
        candidateProfile: { upsert: jest.fn().mockImplementation(async () => { callOrder.push('upsert'); return {}; }) },
        pipelineEntry: { findFirst: jest.fn().mockResolvedValue({ job: { createdById: 'user-1' } }) },
      };
      const portalPayload = { candidateName: 'Asha' };
      tenantPrisma.forTenant
        .mockImplementationOnce((_c, fn) => fn({ candidate: { findUnique: jest.fn().mockResolvedValue({ id: 'cand-1', organizationId: 'org-1', erasedAt: null }) } })) // resolvePortalCandidate (for upload)
        .mockImplementationOnce((_c, fn) => fn(writeTx)) // the write tx
        .mockImplementationOnce((_c, fn) => fn({ candidate: { findUnique: jest.fn().mockResolvedValue({ id: 'cand-1', organizationId: 'org-1', erasedAt: null }) } })) // resolvePortalCandidate (inside getPortal)
        .mockImplementationOnce((_c, fn) =>
          fn({
            candidate: { findUnique: jest.fn().mockResolvedValue({ name: 'Asha', email: 'a@x.com', phone: null }) },
            pipelineEntry: { findMany: jest.fn().mockResolvedValue([]) },
            candidateProfile: { findUnique: jest.fn().mockResolvedValue(null) },
          }),
        ); // getPortal's own read tx
      prisma.organization.findUnique.mockResolvedValue({ name: 'Acme' });
      jobsService.enqueue.mockResolvedValue({ id: 'aijob-5' });

      const pdf = Buffer.from('%PDF-1.7 new résumé').toString('base64');
      const out = await service.uploadPortalResume('ptok-1', { resumeBase64: pdf });

      expect(blobStorage.upload).toHaveBeenCalledWith(
        expect.stringMatching(/^candidates\/org-1\/.+\.pdf$/),
        expect.any(Buffer),
        'application/pdf',
      );
      expect(writeTx.candidateProfile.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { candidateId: 'cand-1' },
          update: expect.objectContaining({
            resumePath: 'candidates/org-1/new.pdf',
            parseStatus: 'pending',
            parsedSummary: null,
            parsedSkills: null,
            parsedTitle: null,
            parsedYearsExperience: null,
            parsedAt: null,
          }),
        }),
      );
      // Upload happens BEFORE the tenant tx opens (blob I/O must not hold the tx open).
      expect(callOrder).toEqual(['upload', 'upsert']);
      expect(jobsService.enqueue).toHaveBeenCalledWith(
        expect.objectContaining({ organizationId: 'org-1' }),
        'resume_parse',
        expect.stringContaining('cand-1'),
        'user-1',
      );
      // Returns the getPortal payload, not an echo of the dto.
      expect(out.candidateName).toBe('Asha');
    });

    it('saves the résumé but skips the enqueue when there is no attributable owner (edge case)', async () => {
      const writeTx = {
        candidateProfile: { upsert: jest.fn().mockResolvedValue({}) },
        pipelineEntry: { findFirst: jest.fn().mockResolvedValue(null) },
      };
      tenantPrisma.forTenant
        .mockImplementationOnce((_c, fn) => fn({ candidate: { findUnique: jest.fn().mockResolvedValue({ id: 'cand-1', organizationId: 'org-1', erasedAt: null }) } }))
        .mockImplementationOnce((_c, fn) => fn(writeTx))
        .mockImplementationOnce((_c, fn) => fn({ candidate: { findUnique: jest.fn().mockResolvedValue({ id: 'cand-1', organizationId: 'org-1', erasedAt: null }) } }))
        .mockImplementationOnce((_c, fn) =>
          fn({
            candidate: { findUnique: jest.fn().mockResolvedValue({ name: 'Asha', email: 'a@x.com', phone: null }) },
            pipelineEntry: { findMany: jest.fn().mockResolvedValue([]) },
            candidateProfile: { findUnique: jest.fn().mockResolvedValue(null) },
          }),
        );
      prisma.organization.findUnique.mockResolvedValue({ name: 'Acme' });
      blobStorage.upload.mockResolvedValue('candidates/org-1/new.pdf');

      const pdf = Buffer.from('%PDF-1.7 no owner').toString('base64');
      await service.uploadPortalResume('ptok-1', { resumeBase64: pdf });

      expect(writeTx.candidateProfile.upsert).toHaveBeenCalled();
      expect(jobsService.enqueue).not.toHaveBeenCalled();
    });
  });

  describe('getJobsFeed', () => {
    it('emits an Indeed-style XML feed of open public-apply jobs, CDATA-wrapped, linking to apply pages', async () => {
      tenantPrisma.forTenant.mockImplementationOnce((_c, fn) =>
        fn({
          job: {
            findMany: jest.fn().mockResolvedValue([
              {
                title: 'Backend Engineer',
                description: 'Build <stuff> & things',
                location: 'Bengaluru',
                employmentType: 'FULL_TIME',
                createdAt: new Date('2026-08-01T00:00:00.000Z'),
                applyToken: 'tok-1',
                organizationId: 'org-1',
              },
            ]),
          },
        }),
      );
      prisma.organization.findMany.mockResolvedValue([{ id: 'org-1', name: 'Acme' }]);

      const xml = await service.getJobsFeed();

      expect(xml.startsWith('<?xml')).toBe(true);
      expect(xml).toContain('<source>');
      expect(xml).toContain('Backend Engineer');
      expect(xml).toContain('/apply/tok-1');
      expect(xml).toContain('Acme');
      expect(xml).toContain('FULL_TIME');
      // free-text is CDATA-wrapped so "<stuff> & things" can't break the XML
      expect(xml).toContain('<![CDATA[Build <stuff> & things]]>');
    });

    it('escapes a CDATA-terminator injection in free text', async () => {
      tenantPrisma.forTenant.mockImplementationOnce((_c, fn) =>
        fn({
          job: {
            findMany: jest.fn().mockResolvedValue([
              { title: 'X]]><script>', description: '', location: '', employmentType: '', createdAt: new Date(0), applyToken: 't', organizationId: 'o' },
            ]),
          },
        }),
      );
      prisma.organization.findMany.mockResolvedValue([{ id: 'o', name: 'O' }]);
      const xml = await service.getJobsFeed();
      expect(xml).not.toContain(']]><script>'); // the terminator must have been split
    });
  });

  describe('getUnsubscribe', () => {
    it('resolves by unsubscribeToken via the LOOKUP_ORG/isSuperAdmin bypass and returns optedOut + orgName', async () => {
      tenantPrisma.forTenant.mockImplementationOnce((_c, fn) =>
        fn({ candidate: { findUnique: jest.fn().mockResolvedValue({ id: 'cand-1', organizationId: 'org-1', emailOptedOutAt: null }) } }),
      );
      prisma.organization.findUnique.mockResolvedValue({ name: 'Acme' });

      const result = await service.getUnsubscribe('unsub-token-1');

      expect(tenantPrisma.forTenant).toHaveBeenCalledWith(
        { organizationId: '00000000-0000-0000-0000-000000000000', isSuperAdmin: true },
        expect.any(Function),
      );
      expect(prisma.organization.findUnique).toHaveBeenCalledWith({ where: { id: 'org-1' }, select: { name: true } });
      expect(result).toEqual({ optedOut: false, orgName: 'Acme' });
    });

    it('reports optedOut: true when emailOptedOutAt is set', async () => {
      tenantPrisma.forTenant.mockImplementationOnce((_c, fn) =>
        fn({ candidate: { findUnique: jest.fn().mockResolvedValue({ id: 'cand-1', organizationId: 'org-1', emailOptedOutAt: new Date('2026-01-01T00:00:00.000Z') }) } }),
      );
      prisma.organization.findUnique.mockResolvedValue({ name: 'Acme' });

      const result = await service.getUnsubscribe('unsub-token-1');

      expect(result).toEqual({ optedOut: true, orgName: 'Acme' });
    });

    it('throws NotFoundException for an unknown token', async () => {
      tenantPrisma.forTenant.mockImplementationOnce((_c, fn) => fn({ candidate: { findUnique: jest.fn().mockResolvedValue(null) } }));
      await expect(service.getUnsubscribe('bad-token')).rejects.toThrow(NotFoundException);
      expect(prisma.organization.findUnique).not.toHaveBeenCalled();
    });
  });

  describe('setUnsubscribe', () => {
    it('sets emailOptedOutAt to a Date when optedOut: true', async () => {
      const update = jest.fn().mockResolvedValue({});
      tenantPrisma.forTenant
        .mockImplementationOnce((_c, fn) => fn({ candidate: { findUnique: jest.fn().mockResolvedValue({ id: 'cand-1', organizationId: 'org-1', emailOptedOutAt: null }) } }))
        .mockImplementationOnce((_c, fn) => fn({ candidate: { update } }));

      const result = await service.setUnsubscribe('unsub-token-1', true);

      expect(update).toHaveBeenCalledWith({ where: { id: 'cand-1' }, data: { emailOptedOutAt: expect.any(Date) } });
      expect(result).toEqual({ optedOut: true });
    });

    it('clears emailOptedOutAt (sets null) when optedOut: false', async () => {
      const update = jest.fn().mockResolvedValue({});
      tenantPrisma.forTenant
        .mockImplementationOnce((_c, fn) => fn({ candidate: { findUnique: jest.fn().mockResolvedValue({ id: 'cand-1', organizationId: 'org-1', emailOptedOutAt: new Date() }) } }))
        .mockImplementationOnce((_c, fn) => fn({ candidate: { update } }));

      const result = await service.setUnsubscribe('unsub-token-1', false);

      expect(update).toHaveBeenCalledWith({ where: { id: 'cand-1' }, data: { emailOptedOutAt: null } });
      expect(result).toEqual({ optedOut: false });
    });

    it('throws NotFoundException for an unknown token and never writes', async () => {
      const update = jest.fn();
      tenantPrisma.forTenant.mockImplementationOnce((_c, fn) => fn({ candidate: { findUnique: jest.fn().mockResolvedValue(null) } }));

      await expect(service.setUnsubscribe('bad-token', true)).rejects.toThrow(NotFoundException);
      expect(update).not.toHaveBeenCalled();
    });
  });
});
