import { CertificateTemplatesService } from './certificate-templates.service';
import { CERTIFICATE_DEFAULT } from '@exam-platform/shared';

describe('CertificateTemplatesService', () => {
  let tx: any;
  let tenantPrisma: any;
  let audit: { record: jest.Mock };
  let service: CertificateTemplatesService;
  const context = { organizationId: 'org-1', isSuperAdmin: false } as any;

  beforeEach(() => {
    tx = { certificateTemplate: { findUnique: jest.fn().mockResolvedValue(null), upsert: jest.fn() } };
    tenantPrisma = { forTenant: jest.fn(async (_c: unknown, fn: any) => fn(tx)) };
    audit = { record: jest.fn() };
    service = new CertificateTemplatesService(tenantPrisma, audit as any);
  });

  describe('get', () => {
    it('returns the built-in default (isDefault) when the org has no row', async () => {
      const view = await service.get(context);
      expect(view).toEqual({ ...CERTIFICATE_DEFAULT, signatoryName: '', enabled: true, isDefault: true });
    });

    it('returns the saved row when present', async () => {
      tx.certificateTemplate.findUnique.mockResolvedValue({ title: 'T', bodyText: 'B', signatoryName: 'S', enabled: false });
      const view = await service.get(context);
      expect(view).toEqual({ title: 'T', bodyText: 'B', signatoryName: 'S', enabled: false, isDefault: false });
    });
  });

  describe('upsert', () => {
    it('upserts by organization and audits', async () => {
      tx.certificateTemplate.upsert.mockResolvedValue({ id: 'ct1', title: 'T', bodyText: 'B', signatoryName: null, enabled: true });
      await service.upsert(context, 'u1', { title: 'T', bodyText: 'B' });
      expect(tx.certificateTemplate.upsert).toHaveBeenCalledWith(expect.objectContaining({ where: { organizationId: 'org-1' } }));
      expect(audit.record).toHaveBeenCalledWith(context, expect.objectContaining({ action: 'certificate_template.saved', entityId: 'ct1' }));
    });
  });

  describe('resolveCopy', () => {
    it('falls back to the default for a missing or disabled row, and uses an enabled row', async () => {
      expect(await service.resolveCopy(context)).toEqual(CERTIFICATE_DEFAULT); // missing

      tx.certificateTemplate.findUnique.mockResolvedValue({ title: 'T', bodyText: 'B', signatoryName: 'S', enabled: false });
      expect(await service.resolveCopy(context)).toEqual(CERTIFICATE_DEFAULT); // disabled

      tx.certificateTemplate.findUnique.mockResolvedValue({ title: 'T', bodyText: 'B', signatoryName: 'S', enabled: true });
      expect(await service.resolveCopy(context)).toEqual({ title: 'T', bodyText: 'B', signatoryName: 'S' });
    });
  });
});
