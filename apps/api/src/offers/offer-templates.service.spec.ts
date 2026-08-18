import { OfferTemplatesService } from './offer-templates.service';
import { DEFAULT_OFFER_TEMPLATE } from './default-offer-template';

describe('OfferTemplatesService', () => {
  let service: OfferTemplatesService;
  let tenantPrisma: { forTenant: jest.Mock };
  let audit: { record: jest.Mock };
  let tx: { offerTemplate: Record<string, jest.Mock> };
  const context = { organizationId: 'org-1', isSuperAdmin: false } as any;

  beforeEach(() => {
    tx = {
      offerTemplate: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn(),
        update: jest.fn(),
      },
    };
    tenantPrisma = { forTenant: jest.fn().mockImplementation((_c, fn) => fn(tx)) };
    audit = { record: jest.fn() };
    service = new OfferTemplatesService(tenantPrisma as any, audit as any);
  });

  describe('getWithDefault', () => {
    it('returns the code default when no row is saved for the org', async () => {
      tx.offerTemplate.findFirst.mockResolvedValue(null);

      const result = await service.getWithDefault(context);

      expect(result).toEqual({ id: null, ...DEFAULT_OFFER_TEMPLATE });
      expect(tx.offerTemplate.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ organizationId: 'org-1' }) }),
      );
    });

    it('returns the saved row when present', async () => {
      tx.offerTemplate.findFirst.mockResolvedValue({ id: 't1', subject: 'Custom subject', body: 'Custom body' });

      const result = await service.getWithDefault(context);

      expect(result).toEqual({ id: 't1', subject: 'Custom subject', body: 'Custom body' });
    });
  });

  describe('upsert', () => {
    it('creates a new org-scoped row when none exists, and audits offer_template.saved', async () => {
      tx.offerTemplate.findFirst.mockResolvedValue(null);
      tx.offerTemplate.create.mockResolvedValue({ id: 'new-1', subject: 'S', body: 'B' });

      const out = await service.upsert(context, 'user-1', { subject: 'S', body: 'B' });

      expect(tx.offerTemplate.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ organizationId: 'org-1', subject: 'S', body: 'B' }),
      });
      expect(out).toMatchObject({ id: 'new-1' });
      expect(audit.record).toHaveBeenCalledWith(
        context,
        expect.objectContaining({ actorUserId: 'user-1', action: 'offer_template.saved', entityId: 'new-1' }),
      );
    });

    it('updates the existing org row instead of creating a second one', async () => {
      tx.offerTemplate.findFirst.mockResolvedValue({ id: 'existing-1', organizationId: 'org-1' });
      tx.offerTemplate.update.mockResolvedValue({ id: 'existing-1', subject: 'S2', body: 'B2' });

      await service.upsert(context, 'user-1', { subject: 'S2', body: 'B2' });

      expect(tx.offerTemplate.create).not.toHaveBeenCalled();
      expect(tx.offerTemplate.update).toHaveBeenCalledWith({
        where: { id: 'existing-1' },
        data: expect.objectContaining({ subject: 'S2', body: 'B2' }),
      });
      expect(audit.record).toHaveBeenCalledWith(
        context,
        expect.objectContaining({ action: 'offer_template.saved', entityId: 'existing-1' }),
      );
    });
  });
});
