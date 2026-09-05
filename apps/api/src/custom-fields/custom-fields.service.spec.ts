import { BadRequestException, NotFoundException } from '@nestjs/common';
import { CustomFieldsService, slugify } from './custom-fields.service';

describe('slugify', () => {
  it('lowercases, trims, and replaces non-alphanumerics with underscores', () => {
    expect(slugify('  Visa Status! ')).toBe('visa_status');
  });

  it('falls back to "field" when nothing alphanumeric remains', () => {
    expect(slugify('***')).toBe('field');
  });
});

describe('CustomFieldsService', () => {
  let service: CustomFieldsService;
  let tenantPrisma: { forTenant: jest.Mock };
  let tx: {
    customFieldDefinition: {
      findMany: jest.Mock;
      findFirst: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
    };
  };
  const context = { organizationId: 'org-1', isSuperAdmin: false } as any;

  beforeEach(() => {
    tx = {
      customFieldDefinition: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
    };
    tenantPrisma = { forTenant: jest.fn().mockImplementation((_c, fn) => fn(tx)) };
    service = new CustomFieldsService(tenantPrisma as any);
  });

  describe('list', () => {
    it('returns active-only by default, ordered by position', async () => {
      tx.customFieldDefinition.findMany.mockResolvedValue([{ id: 'f1' }]);

      const result = await service.list(context, 'candidate');

      expect(result).toEqual([{ id: 'f1' }]);
      expect(tx.customFieldDefinition.findMany).toHaveBeenCalledWith({
        where: { organizationId: 'org-1', entityType: 'candidate', archivedAt: null },
        orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
      });
    });

    it('includes archived rows when includeArchived is true', async () => {
      tx.customFieldDefinition.findMany.mockResolvedValue([]);

      await service.list(context, 'candidate', true);

      expect(tx.customFieldDefinition.findMany).toHaveBeenCalledWith({
        where: { organizationId: 'org-1', entityType: 'candidate' },
        orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
      });
    });
  });

  describe('create', () => {
    it('slugifies and uniquifies key on collision', async () => {
      tx.customFieldDefinition.findFirst
        .mockResolvedValueOnce({ id: 'existing' }) // 'visa' taken
        .mockResolvedValueOnce(null); // 'visa-2' free
      tx.customFieldDefinition.create.mockImplementation(({ data }: any) => Promise.resolve({ id: 'new', ...data }));

      const result = await service.create(context, { entityType: 'candidate', label: 'Visa', fieldType: 'text' } as any);

      expect(tx.customFieldDefinition.findFirst).toHaveBeenCalledTimes(2);
      expect(tx.customFieldDefinition.findFirst).toHaveBeenNthCalledWith(1, {
        where: { organizationId: 'org-1', entityType: 'candidate', key: 'visa' },
        select: { id: true },
      });
      expect(tx.customFieldDefinition.findFirst).toHaveBeenNthCalledWith(2, {
        where: { organizationId: 'org-1', entityType: 'candidate', key: 'visa-2' },
        select: { id: true },
      });
      expect(result.key).toBe('visa-2');
    });

    it('uses the plain slug when there is no collision', async () => {
      tx.customFieldDefinition.findFirst.mockResolvedValue(null);
      tx.customFieldDefinition.create.mockImplementation(({ data }: any) => Promise.resolve({ id: 'new', ...data }));

      const result = await service.create(context, { entityType: 'candidate', label: 'Visa', fieldType: 'text' } as any);

      expect(tx.customFieldDefinition.findFirst).toHaveBeenCalledTimes(1);
      expect(result.key).toBe('visa');
    });

    it('rejects a select field with no options', async () => {
      await expect(
        service.create(context, { entityType: 'candidate', label: 'Src', fieldType: 'select' } as any),
      ).rejects.toThrow(BadRequestException);
      expect(tx.customFieldDefinition.findFirst).not.toHaveBeenCalled();
      expect(tx.customFieldDefinition.create).not.toHaveBeenCalled();
    });

    it('stores deduped options JSON for a select field', async () => {
      tx.customFieldDefinition.findFirst.mockResolvedValue(null);
      tx.customFieldDefinition.create.mockImplementation(({ data }: any) => Promise.resolve({ id: 'new', ...data }));

      const result = await service.create(context, {
        entityType: 'candidate',
        label: 'Source',
        fieldType: 'select',
        options: ['Referral', ' Referral ', 'LinkedIn'],
      } as any);

      expect(result.optionsJson).toBe(JSON.stringify(['Referral', 'LinkedIn']));
    });

    it('forces showOnApply false for job entityType even if requested', async () => {
      tx.customFieldDefinition.findFirst.mockResolvedValue(null);
      tx.customFieldDefinition.create.mockImplementation(({ data }: any) => Promise.resolve({ id: 'new', ...data }));

      const result = await service.create(context, {
        entityType: 'job',
        label: 'Budget',
        fieldType: 'text',
        showOnApply: true,
      } as any);

      expect(result.showOnApply).toBe(false);
    });
  });

  describe('update', () => {
    it('never writes entityType, key, or fieldType even when passed', async () => {
      tx.customFieldDefinition.findFirst.mockResolvedValue({
        id: 'f1',
        organizationId: 'org-1',
        entityType: 'candidate',
        key: 'visa',
        fieldType: 'text',
      });
      tx.customFieldDefinition.update.mockResolvedValue({ id: 'f1' });

      await service.update(context, 'f1', {
        label: 'New Label',
        entityType: 'job',
        key: 'hacked',
        fieldType: 'number',
      } as any);

      const dataArg = tx.customFieldDefinition.update.mock.calls[0][0].data;
      expect(dataArg).not.toHaveProperty('entityType');
      expect(dataArg).not.toHaveProperty('key');
      expect(dataArg).not.toHaveProperty('fieldType');
      expect(dataArg).toEqual({ label: 'New Label' });
    });

    it('throws NotFoundException when the field does not exist', async () => {
      tx.customFieldDefinition.findFirst.mockResolvedValue(null);

      await expect(service.update(context, 'missing', { label: 'X' } as any)).rejects.toThrow(NotFoundException);
      expect(tx.customFieldDefinition.update).not.toHaveBeenCalled();
    });

    it('rejects clearing a select field down to zero options', async () => {
      tx.customFieldDefinition.findFirst.mockResolvedValue({
        id: 'f1',
        organizationId: 'org-1',
        entityType: 'candidate',
        key: 'src',
        fieldType: 'select',
      });

      await expect(service.update(context, 'f1', { options: [] } as any)).rejects.toThrow(BadRequestException);
      expect(tx.customFieldDefinition.update).not.toHaveBeenCalled();
    });

    it('only writes showOnApply for candidate-entity fields', async () => {
      tx.customFieldDefinition.findFirst.mockResolvedValue({
        id: 'f1',
        organizationId: 'org-1',
        entityType: 'job',
        key: 'budget',
        fieldType: 'text',
      });
      tx.customFieldDefinition.update.mockResolvedValue({ id: 'f1' });

      await service.update(context, 'f1', { showOnApply: true } as any);

      const dataArg = tx.customFieldDefinition.update.mock.calls[0][0].data;
      expect(dataArg).not.toHaveProperty('showOnApply');
    });
  });

  describe('archive', () => {
    it('sets archivedAt', async () => {
      tx.customFieldDefinition.findFirst.mockResolvedValue({ id: 'f1' });
      tx.customFieldDefinition.update.mockResolvedValue({});

      const result = await service.archive(context, 'f1');

      expect(result.id).toBe('f1');
      expect(result.archivedAt).toBeInstanceOf(Date);
      expect(tx.customFieldDefinition.update).toHaveBeenCalledWith({
        where: { id: 'f1' },
        data: { archivedAt: result.archivedAt },
      });
    });

    it('throws NotFoundException when the field does not exist', async () => {
      tx.customFieldDefinition.findFirst.mockResolvedValue(null);

      await expect(service.archive(context, 'missing')).rejects.toThrow(NotFoundException);
      expect(tx.customFieldDefinition.update).not.toHaveBeenCalled();
    });
  });
});
