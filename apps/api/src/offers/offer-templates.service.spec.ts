import { ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { OfferTemplatesService } from './offer-templates.service';
import { DEFAULT_OFFER_TEMPLATE } from './default-offer-template';

describe('OfferTemplatesService', () => {
  let service: OfferTemplatesService;
  let tenantPrisma: { forTenant: jest.Mock };
  let audit: { record: jest.Mock };
  const context = { organizationId: 'org-1', isSuperAdmin: false } as any;

  function knownRequestError(code: string) {
    return new Prisma.PrismaClientKnownRequestError('Unique constraint failed', { code, clientVersion: 'test' });
  }

  beforeEach(() => {
    tenantPrisma = { forTenant: jest.fn() };
    audit = { record: jest.fn() };
    service = new OfferTemplatesService(tenantPrisma as any, audit as any);
  });

  function withTx(tx: any) {
    tenantPrisma.forTenant.mockImplementation((_ctx: any, fn: any) => fn(tx));
    return tx;
  }

  describe('list', () => {
    it('returns every org template ordered default-first then by name', async () => {
      const rows = [
        { id: 't-default', name: 'Default offer letter', subject: 'S', body: 'B', isDefault: true },
        { id: 't-2', name: 'Zeta', subject: 'S', body: 'B', isDefault: false },
      ];
      const tx = withTx({ offerTemplate: { findMany: jest.fn().mockResolvedValue(rows) } });

      const result = await service.list(context);

      expect(tx.offerTemplate.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { organizationId: 'org-1' },
          orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
        }),
      );
      expect(result).toEqual([
        { id: 't-default', name: 'Default offer letter', subject: 'S', body: 'B', isDefault: true },
        { id: 't-2', name: 'Zeta', subject: 'S', body: 'B', isDefault: false },
      ]);
    });
  });

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

  describe('create', () => {
    it('forces isDefault true for the first template in an org, regardless of dto.isDefault', async () => {
      const tx = withTx({
        offerTemplate: {
          count: jest.fn().mockResolvedValue(0),
          updateMany: jest.fn().mockResolvedValue({ count: 0 }),
          create: jest.fn().mockResolvedValue({ id: 'new-1', name: 'First', subject: 'S', body: 'B', isDefault: true }),
        },
      });

      const result = await service.create(context, 'user-1', { name: 'First', subject: 'S', body: 'B', isDefault: false });

      expect(tx.offerTemplate.updateMany).toHaveBeenCalledWith({
        where: { organizationId: 'org-1', isDefault: true },
        data: { isDefault: false },
      });
      expect(tx.offerTemplate.create).toHaveBeenCalledWith({
        data: { organizationId: 'org-1', name: 'First', subject: 'S', body: 'B', isDefault: true },
      });
      expect(result.isDefault).toBe(true);
      expect(audit.record).toHaveBeenCalledWith(
        context,
        expect.objectContaining({ actorUserId: 'user-1', action: 'offer_template.created', entityId: 'new-1' }),
      );
    });

    it('clears sibling defaults before creating a second template with isDefault:true', async () => {
      const tx = withTx({
        offerTemplate: {
          count: jest.fn().mockResolvedValue(1),
          updateMany: jest.fn().mockResolvedValue({ count: 1 }),
          create: jest.fn().mockResolvedValue({ id: 'new-2', name: 'Second', subject: 'S', body: 'B', isDefault: true }),
        },
      });

      await service.create(context, 'user-1', { name: 'Second', subject: 'S', body: 'B', isDefault: true });

      expect(tx.offerTemplate.updateMany).toHaveBeenCalledWith({
        where: { organizationId: 'org-1', isDefault: true },
        data: { isDefault: false },
      });
      expect(tx.offerTemplate.create).toHaveBeenCalledWith({
        data: { organizationId: 'org-1', name: 'Second', subject: 'S', body: 'B', isDefault: true },
      });
    });

    it('does not touch siblings when creating a non-default template in a non-empty org', async () => {
      const tx = withTx({
        offerTemplate: {
          count: jest.fn().mockResolvedValue(1),
          updateMany: jest.fn(),
          create: jest.fn().mockResolvedValue({ id: 'new-3', name: 'Third', subject: 'S', body: 'B', isDefault: false }),
        },
      });

      await service.create(context, 'user-1', { name: 'Third', subject: 'S', body: 'B' });

      expect(tx.offerTemplate.updateMany).not.toHaveBeenCalled();
      expect(tx.offerTemplate.create).toHaveBeenCalledWith({
        data: { organizationId: 'org-1', name: 'Third', subject: 'S', body: 'B', isDefault: false },
      });
    });

    it('surfaces a duplicate name as a conflict', async () => {
      withTx({
        offerTemplate: {
          count: jest.fn().mockResolvedValue(1),
          updateMany: jest.fn(),
          create: jest.fn().mockRejectedValue(knownRequestError('P2002')),
        },
      });

      await expect(service.create(context, 'user-1', { name: 'Dup', subject: 'S', body: 'B' })).rejects.toThrow(ConflictException);
    });
  });

  describe('update', () => {
    it('clears sibling defaults before setting isDefault:true on this template', async () => {
      const tx = withTx({
        offerTemplate: {
          findFirst: jest.fn().mockResolvedValue({ id: 't1', name: 'N', subject: 'S', body: 'B', isDefault: false }),
          updateMany: jest.fn().mockResolvedValue({ count: 1 }),
          update: jest.fn().mockResolvedValue({ id: 't1', name: 'N', subject: 'S', body: 'B', isDefault: true }),
        },
      });

      const result = await service.update(context, 'user-1', 't1', { isDefault: true });

      expect(tx.offerTemplate.updateMany).toHaveBeenCalledWith({
        where: { organizationId: 'org-1', isDefault: true },
        data: { isDefault: false },
      });
      expect(tx.offerTemplate.update).toHaveBeenCalledWith({ where: { id: 't1' }, data: { isDefault: true } });
      expect(result.isDefault).toBe(true);
      expect(audit.record).toHaveBeenCalledWith(
        context,
        expect.objectContaining({ actorUserId: 'user-1', action: 'offer_template.updated', entityId: 't1' }),
      );
    });

    it('ignores isDefault:false so the org never ends up with zero defaults', async () => {
      const tx = withTx({
        offerTemplate: {
          findFirst: jest.fn().mockResolvedValue({ id: 't1', name: 'N', subject: 'S', body: 'B', isDefault: true }),
          updateMany: jest.fn(),
          update: jest.fn().mockResolvedValue({ id: 't1', name: 'Renamed', subject: 'S', body: 'B', isDefault: true }),
        },
      });

      await service.update(context, 'user-1', 't1', { name: 'Renamed', isDefault: false });

      expect(tx.offerTemplate.updateMany).not.toHaveBeenCalled();
      expect(tx.offerTemplate.update).toHaveBeenCalledWith({ where: { id: 't1' }, data: { name: 'Renamed' } });
    });

    it('updates only the supplied fields', async () => {
      const tx = withTx({
        offerTemplate: {
          findFirst: jest.fn().mockResolvedValue({ id: 't1', name: 'N', subject: 'S', body: 'B', isDefault: false }),
          update: jest.fn().mockResolvedValue({ id: 't1', name: 'N', subject: 'New subject', body: 'B', isDefault: false }),
        },
      });

      await service.update(context, 'user-1', 't1', { subject: 'New subject' });

      expect(tx.offerTemplate.update).toHaveBeenCalledWith({ where: { id: 't1' }, data: { subject: 'New subject' } });
    });

    it('throws NotFound for a template belonging to another org', async () => {
      withTx({ offerTemplate: { findFirst: jest.fn().mockResolvedValue(null) } });

      await expect(service.update(context, 'user-1', 'other-org-template', { name: 'X' })).rejects.toThrow(NotFoundException);
    });

    it('surfaces a duplicate name as a conflict', async () => {
      withTx({
        offerTemplate: {
          findFirst: jest.fn().mockResolvedValue({ id: 't1', name: 'N', subject: 'S', body: 'B', isDefault: false }),
          update: jest.fn().mockRejectedValue(knownRequestError('P2002')),
        },
      });

      await expect(service.update(context, 'user-1', 't1', { name: 'Taken' })).rejects.toThrow(ConflictException);
    });
  });

  describe('remove', () => {
    it('deletes a non-default template without promoting anyone', async () => {
      const tx = withTx({
        offerTemplate: {
          findFirst: jest.fn().mockResolvedValue({ id: 't2', name: 'N', subject: 'S', body: 'B', isDefault: false }),
          delete: jest.fn().mockResolvedValue({}),
          updateMany: jest.fn(),
          update: jest.fn(),
        },
      });

      await service.remove(context, 'user-1', 't2');

      expect(tx.offerTemplate.delete).toHaveBeenCalledWith({ where: { id: 't2' } });
      expect(tx.offerTemplate.updateMany).not.toHaveBeenCalled();
      expect(tx.offerTemplate.update).not.toHaveBeenCalled();
      expect(audit.record).toHaveBeenCalledWith(
        context,
        expect.objectContaining({ actorUserId: 'user-1', action: 'offer_template.deleted', entityId: 't2' }),
      );
    });

    it('promotes the most-recently-updated remaining template when the default is removed', async () => {
      const tx = withTx({
        offerTemplate: {
          findFirst: jest
            .fn()
            .mockResolvedValueOnce({ id: 't-default', name: 'Old default', subject: 'S', body: 'B', isDefault: true })
            .mockResolvedValueOnce({ id: 't-newest', name: 'Newest', subject: 'S', body: 'B', isDefault: false }),
          delete: jest.fn().mockResolvedValue({}),
          updateMany: jest.fn().mockResolvedValue({ count: 0 }),
          update: jest.fn().mockResolvedValue({ id: 't-newest', name: 'Newest', subject: 'S', body: 'B', isDefault: true }),
        },
      });

      await service.remove(context, 'user-1', 't-default');

      expect(tx.offerTemplate.delete).toHaveBeenCalledWith({ where: { id: 't-default' } });
      expect(tx.offerTemplate.findFirst).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({ where: { organizationId: 'org-1' }, orderBy: { updatedAt: 'desc' } }),
      );
      expect(tx.offerTemplate.updateMany).toHaveBeenCalledWith({
        where: { organizationId: 'org-1', isDefault: true },
        data: { isDefault: false },
      });
      expect(tx.offerTemplate.update).toHaveBeenCalledWith({ where: { id: 't-newest' }, data: { isDefault: true } });
    });

    it('deleting the last template leaves none, so getDefault falls back to DEFAULT_OFFER_TEMPLATE', async () => {
      const tx = withTx({
        offerTemplate: {
          findFirst: jest
            .fn()
            .mockResolvedValueOnce({ id: 't-last', name: 'Last', subject: 'S', body: 'B', isDefault: true })
            .mockResolvedValueOnce(null),
          delete: jest.fn().mockResolvedValue({}),
          updateMany: jest.fn(),
          update: jest.fn(),
        },
      });

      await service.remove(context, 'user-1', 't-last');

      expect(tx.offerTemplate.update).not.toHaveBeenCalled();

      tx.offerTemplate.findFirst = jest.fn().mockResolvedValue(null);
      const result = await service.getDefault(context);
      expect(result).toMatchObject({ id: null, isDefault: true, ...DEFAULT_OFFER_TEMPLATE });
    });

    it('throws NotFound for a template belonging to another org', async () => {
      withTx({ offerTemplate: { findFirst: jest.fn().mockResolvedValue(null) } });

      await expect(service.remove(context, 'user-1', 'other-org-template')).rejects.toThrow(NotFoundException);
    });
  });
});
