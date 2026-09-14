import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { CertificateService } from './certificate.service';

describe('CertificateService.getCertificateUrl', () => {
  let tx: any;
  let tenantPrisma: any;
  let blob: { signIfOurs: jest.Mock; upload: jest.Mock };
  let templates: { resolveCopy: jest.Mock };
  let service: CertificateService;
  const context = { organizationId: 'org-1', isSuperAdmin: false } as any;

  function attemptRow(over: any = {}) {
    return {
      id: 'a1',
      result: { id: 'r1', passFail: 'pass', percentage: 88, releaseOverride: null, certificatePath: null, ...(over.result ?? {}) },
      invitation: { candidate: { name: 'Ada' }, exam: { title: 'Algorithms', certificatesEnabled: true, resultsReleaseMode: 'immediate', ...(over.exam ?? {}) } },
    };
  }

  beforeEach(() => {
    tx = {
      attempt: { findFirst: jest.fn().mockResolvedValue(attemptRow()) },
      organization: { findUnique: jest.fn().mockResolvedValue({ name: 'Acme' }) },
      result: { update: jest.fn() },
    };
    tenantPrisma = { forTenant: jest.fn(async (_c: unknown, fn: any) => fn(tx)) };
    blob = { signIfOurs: jest.fn(async (v: unknown) => `signed:${v}`), upload: jest.fn().mockResolvedValue('blob://certs/a1.pdf') };
    templates = { resolveCopy: jest.fn().mockResolvedValue({ title: 'Cert', bodyText: 'Body', signatoryName: null }) };
    service = new CertificateService(tenantPrisma, blob as any, templates as any);
  });

  it('generates, uploads, stores the path and returns a signed url on first download', async () => {
    const res = await service.getCertificateUrl(context, 'a1', { requireReleased: true });
    expect(blob.upload).toHaveBeenCalledWith('certificates/org-1/a1.pdf', expect.any(Buffer), 'application/pdf');
    expect(tx.result.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'r1' }, data: { certificatePath: 'blob://certs/a1.pdf' } }));
    expect(res.url).toBe('signed:blob://certs/a1.pdf');
  });

  it('reuses the stored certificate path without regenerating', async () => {
    tx.attempt.findFirst.mockResolvedValue(attemptRow({ result: { certificatePath: 'blob://existing.pdf' } }));
    const res = await service.getCertificateUrl(context, 'a1', { requireReleased: true });
    expect(blob.upload).not.toHaveBeenCalled();
    expect(res.url).toBe('signed:blob://existing.pdf');
  });

  it('rejects when certificates are not enabled for the exam', async () => {
    tx.attempt.findFirst.mockResolvedValue(attemptRow({ exam: { certificatesEnabled: false } }));
    await expect(service.getCertificateUrl(context, 'a1', { requireReleased: true })).rejects.toThrow(BadRequestException);
  });

  it('rejects when the candidate did not pass', async () => {
    tx.attempt.findFirst.mockResolvedValue(attemptRow({ result: { passFail: 'fail' } }));
    await expect(service.getCertificateUrl(context, 'a1', { requireReleased: true })).rejects.toThrow(ForbiddenException);
  });

  it('rejects the candidate path when results are not released (manual mode, no override)', async () => {
    tx.attempt.findFirst.mockResolvedValue(attemptRow({ exam: { resultsReleaseMode: 'manual' } }));
    await expect(service.getCertificateUrl(context, 'a1', { requireReleased: true })).rejects.toThrow(ForbiddenException);
  });

  it('allows the recruiter path (requireReleased:false) even when unreleased', async () => {
    tx.attempt.findFirst.mockResolvedValue(attemptRow({ exam: { resultsReleaseMode: 'manual' } }));
    const res = await service.getCertificateUrl(context, 'a1', { requireReleased: false });
    expect(res.url).toBe('signed:blob://certs/a1.pdf');
  });

  it('throws NotFound for an unknown attempt', async () => {
    tx.attempt.findFirst.mockResolvedValue(null);
    await expect(service.getCertificateUrl(context, 'x', { requireReleased: false })).rejects.toThrow(NotFoundException);
  });
});

describe('CertificateService.verifyCertificate (public)', () => {
  let tx: any;
  let tenantPrisma: any;
  let service: CertificateService;

  function resultRow(over: any = {}) {
    return {
      passFail: 'pass',
      percentage: 88,
      releaseOverride: null,
      releasedAt: new Date('2026-09-14T00:00:00.000Z'),
      computedAt: new Date('2026-09-13T00:00:00.000Z'),
      attempt: {
        invitation: {
          candidate: { name: 'Ada Lovelace' },
          exam: { title: 'Algorithms', certificatesEnabled: true, resultsReleaseMode: 'immediate', organizationId: 'org-1', ...(over.exam ?? {}) },
        },
      },
      ...(over.result ?? {}),
    };
  }

  beforeEach(() => {
    tx = {
      result: { findUnique: jest.fn().mockResolvedValue(resultRow()) },
      organization: { findUnique: jest.fn().mockResolvedValue({ name: 'Acme' }) },
    };
    tenantPrisma = { forTenant: jest.fn(async (_c: unknown, fn: any) => fn(tx)) };
    service = new CertificateService(tenantPrisma, {} as any, {} as any);
  });

  it('returns the certificate facts for a genuine, released pass', async () => {
    const res = await service.verifyCertificate('r1');
    expect(res).toEqual({ valid: true, candidateName: 'Ada Lovelace', examTitle: 'Algorithms', orgName: 'Acme', scorePercent: 88, issuedAt: '2026-09-14T00:00:00.000Z' });
  });

  it('is invalid when the exam does not issue certificates', async () => {
    tx.result.findUnique.mockResolvedValue(resultRow({ exam: { certificatesEnabled: false } }));
    expect(await service.verifyCertificate('r1')).toEqual({ valid: false });
  });

  it('is invalid for a non-passing result', async () => {
    tx.result.findUnique.mockResolvedValue(resultRow({ result: { passFail: 'fail' } }));
    expect(await service.verifyCertificate('r1')).toEqual({ valid: false });
  });

  it('is invalid when results are withheld (manual mode, no override)', async () => {
    tx.result.findUnique.mockResolvedValue(resultRow({ exam: { resultsReleaseMode: 'manual' } }));
    expect(await service.verifyCertificate('r1')).toEqual({ valid: false });
  });

  it('is invalid for an unknown id', async () => {
    tx.result.findUnique.mockResolvedValue(null);
    expect(await service.verifyCertificate('nope')).toEqual({ valid: false });
  });

  it('is invalid (never throws) for a malformed id that errors the lookup', async () => {
    tx.result.findUnique.mockRejectedValue(new Error('invalid uuid'));
    expect(await service.verifyCertificate('!!!')).toEqual({ valid: false });
  });
});
