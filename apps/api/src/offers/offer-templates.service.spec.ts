import { NotFoundException } from '@nestjs/common';
import { OfferTemplatesService } from './offer-templates.service';
import { DEFAULT_OFFER_TEMPLATE } from './default-offer-template';

describe('OfferTemplatesService', () => {
  let service: OfferTemplatesService;
  let tenantPrisma: { forTenant: jest.Mock };
  const context = { organizationId: 'org-1', isSuperAdmin: false } as any;

  beforeEach(() => {
    tenantPrisma = { forTenant: jest.fn() };
    service = new OfferTemplatesService(tenantPrisma as any);
  });

  function withTx(tx: any) {
    tenantPrisma.forTenant.mockImplementation((_ctx: any, fn: any) => fn(tx));
    return tx;
  }

  describe('getDefault', () => {
    it('returns the isDefault row when one exists', async () => {
      withTx({
        offerTemplate: {
          findFirst: jest.fn().mockResolvedValue({ id: 't1', name: 'Custom', subject: 'Custom subject', body: 'Custom body', isDefault: true }),
        },
      });

      const result = await service.getDefault(context);

      expect(result).toEqual({ id: 't1', name: 'Custom', subject: 'Custom subject', body: 'Custom body', isDefault: true });
    });

    it('falls back to DEFAULT_OFFER_TEMPLATE with id:null when the org has no default row', async () => {
      withTx({ offerTemplate: { findFirst: jest.fn().mockResolvedValue(null) } });

      const result = await service.getDefault(context);

      expect(result).toMatchObject({ id: null, isDefault: true, subject: DEFAULT_OFFER_TEMPLATE.subject, body: DEFAULT_OFFER_TEMPLATE.body });
      expect(typeof result.name).toBe('string');
    });
  });

  describe('getById', () => {
    it('returns the template when it belongs to the org', async () => {
      withTx({
        offerTemplate: {
          findFirst: jest.fn().mockResolvedValue({ id: 't1', name: 'N', subject: 'S', body: 'B', isDefault: false }),
        },
      });

      const result = await service.getById(context, 't1');

      expect(result).toEqual({ id: 't1', name: 'N', subject: 'S', body: 'B', isDefault: false });
    });

    it('throws NotFound for a template belonging to another org', async () => {
      withTx({ offerTemplate: { findFirst: jest.fn().mockResolvedValue(null) } });

      await expect(service.getById(context, 'other-org-template')).rejects.toThrow(NotFoundException);
    });
  });

});
