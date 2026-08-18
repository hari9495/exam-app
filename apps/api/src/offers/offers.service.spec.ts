import { NotFoundException } from '@nestjs/common';
import { OffersService } from './offers.service';

describe('OffersService', () => {
  let service: OffersService;
  let tenantPrisma: { forTenant: jest.Mock };
  let offerTemplates: { getWithDefault: jest.Mock };
  let audit: { record: jest.Mock };
  let tx: {
    pipelineEntry: Record<string, jest.Mock>;
    offer: Record<string, jest.Mock>;
    organization: Record<string, jest.Mock>;
  };
  const context = { organizationId: 'org-1', isSuperAdmin: false } as any;

  beforeEach(() => {
    tx = {
      pipelineEntry: {
        findFirst: jest.fn().mockResolvedValue({ id: 'entry-1', candidateId: 'cand-1', organizationId: 'org-1' }),
      },
      offer: {
        create: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
      },
      organization: {
        findUnique: jest.fn().mockResolvedValue({ name: 'Acme' }),
      },
    };
    tenantPrisma = { forTenant: jest.fn().mockImplementation((_c, fn) => fn(tx)) };
    offerTemplates = {
      getWithDefault: jest.fn().mockResolvedValue({ id: null, subject: 'Default subject', body: 'Default body' }),
    };
    audit = { record: jest.fn() };
    service = new OffersService(tenantPrisma as any, offerTemplates as any, audit as any);
  });

  describe('createOffer', () => {
    const dto = { compensation: '100k', startDate: '2026-09-01', expiresAt: '2026-09-15' };

    it('persists a draft offer with the terms and org-scoped candidate/entry, and audits offer.created', async () => {
      tx.offer.create.mockResolvedValue({ id: 'offer-1', status: 'draft', ...dto });

      const out = await service.createOffer(context, 'user-1', 'entry-1', dto as any);

      expect(tx.pipelineEntry.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ id: 'entry-1', organizationId: 'org-1' }) }),
      );
      expect(tx.offer.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          organizationId: 'org-1',
          pipelineEntryId: 'entry-1',
          candidateId: 'cand-1',
          compensation: '100k',
          status: 'draft',
          startDate: new Date('2026-09-01'),
          expiresAt: new Date('2026-09-15'),
        }),
      });
      expect(out).toMatchObject({ id: 'offer-1' });
      expect(audit.record).toHaveBeenCalledWith(
        context,
        expect.objectContaining({ actorUserId: 'user-1', action: 'offer.created', entityId: 'offer-1' }),
      );
    });

    it('resolves letterSubject/letterBody from the org template when dto omits subject/body', async () => {
      tx.offer.create.mockResolvedValue({ id: 'offer-1' });

      await service.createOffer(context, 'user-1', 'entry-1', dto as any);

      expect(offerTemplates.getWithDefault).toHaveBeenCalledWith(context);
      expect(tx.offer.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ letterSubject: 'Default subject', letterBody: 'Default body' }),
      });
    });

    it('uses dto subject/body when provided, skipping the template lookup', async () => {
      tx.offer.create.mockResolvedValue({ id: 'offer-1' });

      await service.createOffer(context, 'user-1', 'entry-1', { ...dto, subject: 'Custom subject', body: 'Custom body' } as any);

      expect(offerTemplates.getWithDefault).not.toHaveBeenCalled();
      expect(tx.offer.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ letterSubject: 'Custom subject', letterBody: 'Custom body' }),
      });
    });

    it('throws NotFoundException when the entry is not in the org', async () => {
      tx.pipelineEntry.findFirst.mockResolvedValue(null);

      await expect(service.createOffer(context, 'user-1', 'entry-x', dto as any)).rejects.toThrow(NotFoundException);
      expect(tx.offer.create).not.toHaveBeenCalled();
    });
  });

  describe('previewPdf', () => {
    it('loads the org-scoped offer and returns a Buffer', async () => {
      tx.offer.findFirst.mockResolvedValue({
        id: 'offer-1',
        organizationId: 'org-1',
        compensation: '100k',
        startDate: new Date('2026-09-01'),
        expiresAt: new Date('2026-09-15'),
        letterSubject: 'Subj {{candidateName}}',
        letterBody: 'Body {{candidateName}} {{jobTitle}} {{orgName}}',
        pipelineEntry: { candidate: { name: 'Asha' }, job: { title: 'Backend Engineer' } },
      });

      const buffer = await service.previewPdf(context, 'offer-1');

      expect(tx.offer.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ id: 'offer-1', organizationId: 'org-1' }) }),
      );
      expect(Buffer.isBuffer(buffer)).toBe(true);
      expect(buffer.length).toBeGreaterThan(0);
    });

    it('throws NotFoundException when the offer is not in the org', async () => {
      tx.offer.findFirst.mockResolvedValue(null);

      await expect(service.previewPdf(context, 'offer-x')).rejects.toThrow(NotFoundException);
    });
  });

  describe('listForEntry', () => {
    it('lists org-scoped offers for a pipeline entry, newest first', async () => {
      await service.listForEntry(context, 'entry-1');

      expect(tx.offer.findMany).toHaveBeenCalledWith({
        where: { organizationId: 'org-1', pipelineEntryId: 'entry-1' },
        orderBy: { createdAt: 'desc' },
      });
    });
  });

  describe('listForCandidate', () => {
    it('lists org-scoped offers for a candidate, newest first', async () => {
      await service.listForCandidate(context, 'cand-1');

      expect(tx.offer.findMany).toHaveBeenCalledWith({
        where: { organizationId: 'org-1', candidateId: 'cand-1' },
        orderBy: { createdAt: 'desc' },
      });
    });
  });
});
