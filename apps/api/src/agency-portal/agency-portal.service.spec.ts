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

  function makeTx(candidateRows: { organizationId: string; email: string }[] = []) {
    return {
      agency: {
        findFirst: jest.fn(async ({ where }: any) => agencies.find((a) => matches(a, where)) ?? null),
      },
      agencyJob: {
        // Mirrors the real query's `select: { job: { select: { id, title, location, department } } }`
        // -- status is filtered ON but never PROJECTED, same as a real Prisma select.
        findMany: jest.fn(async ({ where }: any) =>
          agencyJobs
            .filter((r) => matches(r, where))
            .map((r) => ({ job: { id: r.job.id, title: r.job.title, location: r.job.location, department: r.job.department } })),
        ),
        findFirst: jest.fn(async ({ where }: any) => agencyJobs.find((r) => matches(r, where)) ?? null),
      },
      agencySubmission: {
        findMany: jest.fn(async ({ where }: any) => submissions.filter((r) => matches(r, where))),
        create: jest.fn(async ({ data }: any) => ({ id: 'new-sub-id', ...data })),
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
      expect(result.jobs).toEqual([{ id: 'job-open', title: 'Open Role', location: 'NY', department: 'Eng' }]);
      expect(result.jobs).toHaveLength(1);
      expect(result.submissions).toHaveLength(1);
      expect(result.submissions[0].id).toBe('sub-1');
      // Never another agency's job or submission leaking through.
      expect(result.jobs.some((j: any) => j.id === 'job-other')).toBe(false);
      expect(result.submissions.some((s: any) => s.id === 'sub-2')).toBe(false);
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

      expect(result.isDuplicate).toBe(true);
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

      expect(result.isDuplicate).toBe(false);
      expect(result.id).toBeTruthy();
      expect(tx.agencySubmission.create).toHaveBeenCalledTimes(1);
      // No candidate or pipeline row written on submit -- only agencySubmission.create, and the
      // fixture tx doesn't even expose candidate.create/pipelineEntry.create, so calling either
      // would throw and fail the test.
      expect((tx as any).candidate.create).toBeUndefined();
      expect((tx as any).pipelineEntry).toBeUndefined();
    });
  });
});
