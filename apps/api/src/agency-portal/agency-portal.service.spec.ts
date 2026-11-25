import { Test } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { AgencyPortalService } from './agency-portal.service';
import { TenantPrismaService, BlobStorageService } from '@exam-platform/shared';

// Generic AND-of-provided-conditions matcher mirroring real Prisma `where` semantics: a key
// ABSENT from `where` imposes no constraint (same as a dropped WHERE clause on a real DB), so a
// production mutation that removes a filter key actually changes what this mock returns --
// unlike a mock that special-cases exact field lists, which would silently keep passing.
function matches(row: any, where: any): boolean {
  if (where == null) return true;
  for (const key of Object.keys(where)) {
    if (key === 'OR') continue; // the share-expiry OR is checked by its own tests below
    const expected = where[key];
    if (expected !== null && typeof expected === 'object' && !Array.isArray(expected)) {
      if (!matches(row?.[key], expected)) return false;
    } else if (row?.[key] !== expected) {
      return false;
    }
  }
  return true;
}

describe('AgencyPortalService', () => {
  let service: AgencyPortalService;
  let tenantPrisma: { forTenant: jest.Mock };
  let blobStorage: { upload: jest.Mock };

  const agencies = [
    { id: 'agency-1', organizationId: 'org-1', name: 'Acme Staffing', portalToken: 'T', active: true },
    { id: 'agency-2', organizationId: 'org-1', name: 'Other Agency', portalToken: 'T2', active: true },
    { id: 'agency-3', organizationId: 'org-1', name: 'Deactivated Agency', portalToken: 'DEAD', active: false },
  ];

  const agencyJobs = [
    { agencyId: 'agency-1', jobId: 'job-open', job: { id: 'job-open', title: 'Open Role', location: 'NY', department: 'Eng', status: 'open' } },
    { agencyId: 'agency-1', jobId: 'job-closed', job: { id: 'job-closed', title: 'Closed Role', location: 'NY', department: 'Eng', status: 'closed' } },
    { agencyId: 'agency-2', jobId: 'job-other', job: { id: 'job-other', title: "Other Agency's Role", location: 'SF', department: 'Sales', status: 'open' } },
  ];

  const submissions = [
    { id: 'sub-1', agencyId: 'agency-1', jobId: 'job-open', status: 'pending', isDuplicate: false, candidateName: 'Alice', createdAt: new Date('2026-09-01'), job: { title: 'Open Role' } },
    { id: 'sub-2', agencyId: 'agency-2', jobId: 'job-other', status: 'pending', isDuplicate: false, candidateName: 'Bob', createdAt: new Date('2026-09-02'), job: { title: "Other Agency's Role" } },
  ];

  type Prior = { agencyId: string; jobId: string; candidateEmail: string; createdAt: Date };
  function makeTx(
    candidateRows: { organizationId: string; email: string }[] = [],
    opts: { share?: Record<string, unknown>; prior?: Prior[]; pipeline?: { jobId: string; email: string; createdAt: Date }[]; ownershipDays?: string; used?: number } = {},
  ) {
    return {
      setting: { findFirst: jest.fn(async () => (opts.ownershipDays ? { value: opts.ownershipDays } : null)) },
      staffingClient: { findMany: jest.fn(async () => [{ id: 'client-1', name: 'Globex' }]) },
      pipelineEntry: {
        findFirst: jest.fn(async ({ where }: any) => (opts.pipeline ?? []).find((r) => r.jobId === where.jobId && r.email.toLowerCase() === where.candidate.email.equals.toLowerCase() && r.createdAt >= where.createdAt.gte) ?? null),
      },
      agency: {
        findFirst: jest.fn(async ({ where }: any) => agencies.find((a) => matches(a, where)) ?? null),
      },
      agencyJob: {
        // Mirrors the real query's `select: { job: { select: { id, title, location, department } } }`
        // -- status is filtered ON but never PROJECTED, same as a real Prisma select.
        findMany: jest.fn(async ({ where }: any) =>
          agencyJobs
            .filter((r) => matches(r, where))
            .map((r: any) => ({ rateCapPaise: null, maxSubmissions: null, expiresOn: null, maskClient: false, ...r, ...(opts.share ?? {}), job: { id: r.job.id, title: r.job.title, location: r.job.location, department: r.job.department, staffingClientId: (opts.share as any)?.clientId ?? null } })),
        ),
        findFirst: jest.fn(async ({ where }: any) => {
          const r = agencyJobs.find((x) => matches(x, where));
          return r ? { rateCapPaise: null, maxSubmissions: null, expiresOn: null, ...r, ...(opts.share ?? {}) } : null;
        }),
      },
      agencySubmission: {
        // Mirrors the real query's `select: { id, jobId, status, candidateName, createdAt, job: { title } }`
        // -- isDuplicate is stored on the row but never PROJECTED to the public portal (email-enumeration
        // oracle fix), same as a real Prisma select would drop it.
        findMany: jest.fn(async ({ where }: any) =>
          submissions
            .filter((r) => matches(r, where))
            .map((r) => ({
              id: r.id,
              jobId: r.jobId,
              status: r.status,
              candidateName: r.candidateName,
              createdAt: r.createdAt,
              duplicateOfAgencyId: (r as any).duplicateOfAgencyId ?? null,
              ownerUntil: null,
              job: { title: r.job.title },
            })),
        ),
        create: jest.fn(async ({ data }: any) => ({ id: 'new-sub-id', ...data })),
        count: jest.fn(async () => opts.used ?? 0),
        findFirst: jest.fn(async ({ where }: any) =>
          (opts.prior ?? [])
            .filter((r) => r.jobId === where.jobId && r.candidateEmail.toLowerCase() === where.candidateEmail.equals.toLowerCase() && r.createdAt >= where.createdAt.gte)
            .sort((a, b) => +a.createdAt - +b.createdAt)[0] ?? null,
        ),
      },
      candidate: {
        findUnique: jest.fn(async ({ where }: any) => {
          const key = where.organizationId_email;
          return candidateRows.find((c) => c.organizationId === key.organizationId && c.email === key.email) ?? null;
        }),
      },
    };
  }

  const validPdf = Buffer.from('%PDF-1.7 résumé bytes').toString('base64');

  beforeEach(async () => {
    tenantPrisma = { forTenant: jest.fn() };
    blobStorage = { upload: jest.fn().mockResolvedValue('candidates/org-1/some-uuid.pdf') };
    const moduleRef = await Test.createTestingModule({
      providers: [
        AgencyPortalService,
        { provide: TenantPrismaService, useValue: tenantPrisma },
        { provide: BlobStorageService, useValue: blobStorage },
      ],
    }).compile();
    service = moduleRef.get(AgencyPortalService);
  });

  describe('getPortal', () => {
    it('returns only this agency name, its OPEN assigned jobs, and only its own submissions (leak filter)', async () => {
      const tx = makeTx();
      tenantPrisma.forTenant.mockImplementationOnce((_ctx, fn) => fn(tx));

      const result = await service.getPortal('T');

      expect(result.agencyName).toBe('Acme Staffing');
      expect(result.jobs).toEqual([{ id: 'job-open', title: 'Open Role', location: 'NY', department: 'Eng', client: null, rateCap: null, maxSubmissions: null, expiresOn: null }]);
      expect(result.jobs).toHaveLength(1);
      expect(result.submissions).toHaveLength(1);
      expect(result.submissions[0].id).toBe('sub-1');
      // Flat jobTitle (not a nested job.title) -- matches the public page's s.jobTitle read and
      // the authed /agency-submissions endpoint's shape.
      expect(result.submissions[0].jobTitle).toBe('Open Role');
      expect(result.submissions[0]).not.toHaveProperty('job');
      // Never another agency's job or submission leaking through.
      expect(result.jobs.some((j: any) => j.id === 'job-other')).toBe(false);
      expect(result.submissions.some((s: any) => s.id === 'sub-2')).toBe(false);
      // isDuplicate must never reach the public portal response (email-enumeration oracle) --
      // it stays stored on the row for the recruiter queue only.
      expect(result.submissions[0]).not.toHaveProperty('isDuplicate');
    });

    it('shows the rate cap and the client name, hides a masked client, and never names who holds a duplicate', async () => {
      const shown = makeTx([], { share: { rateCapPaise: 150050n, maxSubmissions: 3, expiresOn: new Date('2099-01-31T00:00:00Z'), clientId: 'client-1' } });
      tenantPrisma.forTenant.mockImplementationOnce((_ctx, fn) => fn(shown));
      const a = await service.getPortal('T');
      expect(a.jobs[0]).toMatchObject({ client: 'Globex', rateCap: '1500.50', maxSubmissions: 3, expiresOn: '2099-01-31' });
      const masked = makeTx([], { share: { rateCapPaise: 150050n, maskClient: true, clientId: 'client-1' } });
      tenantPrisma.forTenant.mockImplementationOnce((_ctx, fn) => fn(masked));
      const b = await service.getPortal('T');
      expect(b.jobs[0].client).toBeNull();
      (submissions[0] as any).duplicateOfAgencyId = 'agency-2';
      try {
        const dup = makeTx();
        tenantPrisma.forTenant.mockImplementationOnce((_ctx, fn) => fn(dup));
        const c = await service.getPortal('T');
        expect(c.submissions[0].status).toBe('duplicate');
        expect(JSON.stringify(c)).not.toContain('agency-2');
      } finally {
        delete (submissions[0] as any).duplicateOfAgencyId;
      }
    });

    it('throws NotFoundException for an unknown token', async () => {
      const tx = makeTx();
      tenantPrisma.forTenant.mockImplementationOnce((_ctx, fn) => fn(tx));
      await expect(service.getPortal('no-such-token')).rejects.toThrow(NotFoundException);
    });

    it('throws the SAME NotFoundException for a deactivated agency as for an unknown token (anti-oracle)', async () => {
      const txUnknown = makeTx();
      tenantPrisma.forTenant.mockImplementationOnce((_ctx, fn) => fn(txUnknown));
      let unknownError: any;
      try {
        await service.getPortal('no-such-token');
      } catch (e) {
        unknownError = e;
      }

      const txDeactivated = makeTx();
      tenantPrisma.forTenant.mockImplementationOnce((_ctx, fn) => fn(txDeactivated));
      let deactivatedError: any;
      try {
        await service.getPortal('DEAD');
      } catch (e) {
        deactivatedError = e;
      }

      expect(unknownError).toBeInstanceOf(NotFoundException);
      expect(deactivatedError).toBeInstanceOf(NotFoundException);
      expect(deactivatedError.getStatus()).toBe(unknownError.getStatus());
      expect(deactivatedError.message).toBe(unknownError.message);
    });
  });

  describe('submit', () => {
    const validDto = { jobId: 'job-open', name: 'Carol Candidate', email: 'carol@example.com', resumeBase64: validPdf };

    it('rejects a non-PDF résumé with BadRequestException before any DB write', async () => {
      const tx = makeTx();
      await expect(
        service.submit('T', { ...validDto, resumeBase64: Buffer.from('not a pdf').toString('base64') }),
      ).rejects.toThrow(BadRequestException);
      expect(tenantPrisma.forTenant).not.toHaveBeenCalled();
      expect(tx.agencySubmission.create).not.toHaveBeenCalled();
    });

    it('throws BadRequestException for a job assigned to a DIFFERENT agency (mutation guard: dropping the agencyId filter would let this through)', async () => {
      const tx = makeTx();
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));
      // job-other is open, but assigned to agency-2, not agency-1 (token T).
      await expect(service.submit('T', { ...validDto, jobId: 'job-other' })).rejects.toThrow(BadRequestException);
      expect(tx.agencySubmission.create).not.toHaveBeenCalled();
    });

    it('throws BadRequestException for a CLOSED job assigned to this agency (mutation guard: dropping the open-status filter would let this through)', async () => {
      const tx = makeTx();
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));
      await expect(service.submit('T', { ...validDto, jobId: 'job-closed' })).rejects.toThrow(BadRequestException);
      expect(tx.agencySubmission.create).not.toHaveBeenCalled();
    });

    it('throws NotFoundException for an unknown/deactivated portal token', async () => {
      const tx = makeTx();
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));
      await expect(service.submit('DEAD', validDto)).rejects.toThrow(NotFoundException);
      await expect(service.submit('no-such-token', validDto)).rejects.toThrow(NotFoundException);
    });

    it('creates a submission with isDuplicate:true when the email already exists for this org, and uploads outside the write tx', async () => {
      const tx = makeTx([{ organizationId: 'org-1', email: 'carol@example.com' }]);
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

      const result = await service.submit('T', validDto);

      // The public response must never leak isDuplicate (email-enumeration oracle) -- only { id }.
      expect(result).toEqual({ id: expect.any(String) });
      expect(result).not.toHaveProperty('isDuplicate');
      expect(blobStorage.upload).toHaveBeenCalledTimes(1);
      expect(blobStorage.upload).toHaveBeenCalledWith(expect.stringMatching(/^candidates\/org-1\/.+\.pdf$/), expect.any(Buffer), 'application/pdf');
      expect(tx.agencySubmission.create).toHaveBeenCalledTimes(1);
      const createArgs = tx.agencySubmission.create.mock.calls[0][0];
      expect(createArgs.data).toMatchObject({
        organizationId: 'org-1',
        agencyId: 'agency-1',
        jobId: 'job-open',
        candidateName: 'Carol Candidate',
        candidateEmail: 'carol@example.com',
        isDuplicate: true,
      });
    });

    it('creates a submission with isDuplicate:false for a brand-new email, and writes no candidate/pipeline row', async () => {
      const tx = makeTx([]); // no existing candidate anywhere
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

      const result = await service.submit('T', validDto);

      expect(result.id).toBeTruthy();
      expect(result).not.toHaveProperty('isDuplicate');
      expect(tx.agencySubmission.create).toHaveBeenCalledTimes(1);
      const createArgs = tx.agencySubmission.create.mock.calls[0][0];
      expect(createArgs.data).toMatchObject({ isDuplicate: false });
      // No candidate or pipeline row written on submit -- only agencySubmission.create, and the
      // fixture tx doesn't even expose candidate.create/pipelineEntry.create, so calling either
      // would throw and fail the test.
      expect((tx as any).candidate.create).toBeUndefined();
      expect((tx as any).pipelineEntry.create).toBeUndefined();
      expect(createArgs.data).toMatchObject({ duplicateOfAgencyId: null, ownerUntil: null, quotedRatePaise: null });
    });
  });

  // HIR-21 staffing vendors: rate cap, consent, limits and the ownership window.
  describe('submit (staffing share terms)', () => {
    const dto = { jobId: 'job-open', name: 'Carol Candidate', email: 'carol@example.com', resumeBase64: validPdf };
    const capped = { rateCapPaise: 150000n };

    it('a capped share takes the quote in paise with right to represent and consent', async () => {
      const tx = makeTx([], { share: capped });
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));
      await service.submit('T', { ...dto, quotedRate: '1600.50', rightToRepresent: true, consent: true });
      // Over the cap is still saved: the company sees it as over cap and decides (exception or not).
      expect(tx.agencySubmission.create.mock.calls[0][0].data).toMatchObject({ quotedRatePaise: 160050n, rightToRepresent: true, consent: true });
    });

    it('a capped share refuses a missing quote, and a missing right to represent or consent', async () => {
      const tx = makeTx([], { share: capped });
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));
      await expect(service.submit('T', { ...dto, rightToRepresent: true, consent: true })).rejects.toThrow('Enter your rate');
      await expect(service.submit('T', { ...dto, quotedRate: '1200', consent: true })).rejects.toThrow('right to represent');
      await expect(service.submit('T', { ...dto, quotedRate: '1200', rightToRepresent: true })).rejects.toThrow('right to represent');
      expect(tx.agencySubmission.create).not.toHaveBeenCalled();
    });

    it('refuses an expired share and a vendor at its submission limit', async () => {
      const expired = makeTx([], { share: { expiresOn: new Date('2020-01-01T00:00:00Z') } });
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(expired));
      await expect(service.submit('T', dto)).rejects.toThrow('not accepting');
      const full = makeTx([], { share: { maxSubmissions: 2 }, used: 2 });
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(full));
      await expect(service.submit('T', dto)).rejects.toThrow('most submissions allowed');
      const room = makeTx([], { share: { maxSubmissions: 2 }, used: 1 });
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(room));
      await expect(service.submit('T', dto)).resolves.toEqual({ id: expect.any(String) });
    });

    it('a later vendor for the same person and job is a duplicate held by the first until the window ends', async () => {
      const first = new Date(Date.now() - 10 * 86_400_000);
      const tx = makeTx([], { prior: [{ agencyId: 'agency-2', jobId: 'job-open', candidateEmail: 'CAROL@example.com', createdAt: first }], ownershipDays: '30' });
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));
      await service.submit('T', dto);
      const data = tx.agencySubmission.create.mock.calls[0][0].data;
      expect(data.duplicateOfAgencyId).toBe('agency-2');
      expect(data.ownerUntil.toISOString().slice(0, 10)).toBe(new Date(first.getTime() + 330 * 60_000 + 30 * 86_400_000).toISOString().slice(0, 10));
    });

    it('outside the ownership window the person is free again', async () => {
      const old = new Date(Date.now() - 100 * 86_400_000);
      const tx = makeTx([], { prior: [{ agencyId: 'agency-2', jobId: 'job-open', candidateEmail: 'carol@example.com', createdAt: old }] }); // default 90 days
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));
      await service.submit('T', dto);
      expect(tx.agencySubmission.create.mock.calls[0][0].data).toMatchObject({ duplicateOfAgencyId: null, ownerUntil: null });
    });

    it('the same vendor sending the same person twice is refused', async () => {
      const tx = makeTx([], { prior: [{ agencyId: 'agency-1', jobId: 'job-open', candidateEmail: 'carol@example.com', createdAt: new Date() }] });
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));
      await expect(service.submit('T', dto)).rejects.toThrow('already submitted');
      expect(tx.agencySubmission.create).not.toHaveBeenCalled();
    });

    it("someone already in the job's own pipeline is held by the company (no other vendor named)", async () => {
      const tx = makeTx([], { pipeline: [{ jobId: 'job-open', email: 'carol@example.com', createdAt: new Date(Date.now() - 86_400_000) }] });
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));
      await service.submit('T', dto);
      const data = tx.agencySubmission.create.mock.calls[0][0].data;
      expect(data.duplicateOfAgencyId).toBeNull();
      expect(data.ownerUntil).toBeInstanceOf(Date);
    });
  });
});
