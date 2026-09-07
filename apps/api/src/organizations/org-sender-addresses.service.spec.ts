import { Test } from '@nestjs/testing';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { OrgSenderAddressesService } from './org-sender-addresses.service';
import { TenantPrismaService, AuditService } from '@exam-platform/shared';

describe('OrgSenderAddressesService', () => {
  let service: OrgSenderAddressesService;
  let tenantPrisma: { forTenant: jest.Mock };
  let audit: { record: jest.Mock };
  const context = { organizationId: 'org-1', isSuperAdmin: false };

  beforeEach(async () => {
    tenantPrisma = { forTenant: jest.fn() };
    audit = { record: jest.fn() };
    const moduleRef = await Test.createTestingModule({
      providers: [
        OrgSenderAddressesService,
        { provide: TenantPrismaService, useValue: tenantPrisma },
        { provide: AuditService, useValue: audit },
      ],
    }).compile();
    service = moduleRef.get(OrgSenderAddressesService);
  });

  function knownRequestError(code: string) {
    return new Prisma.PrismaClientKnownRequestError('Unique constraint failed', { code, clientVersion: 'test' });
  }

  describe('list', () => {
    it('returns the org senders, default first', async () => {
      const tx = {
        orgSenderAddress: {
          findMany: jest.fn().mockResolvedValue([
            { id: 's1', label: 'Careers', isDefault: true },
            { id: 's2', label: 'Talent', isDefault: false },
          ]),
        },
      };
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

      const result = await service.list(context);

      expect(tx.orgSenderAddress.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { organizationId: 'org-1' },
          orderBy: [{ isDefault: 'desc' }, { label: 'asc' }],
        }),
      );
      expect(result).toEqual([
        { id: 's1', label: 'Careers', isDefault: true },
        { id: 's2', label: 'Talent', isDefault: false },
      ]);
    });
  });

  describe('create', () => {
    it('forces the first sender for an org to be default (clear-siblings is a no-op with none)', async () => {
      const tx = {
        orgSenderAddress: {
          count: jest.fn().mockResolvedValue(0),
          updateMany: jest.fn().mockResolvedValue({ count: 0 }),
          create: jest.fn().mockResolvedValue({ id: 's1', label: 'Careers', address: 'careers@acme.com', isDefault: true }),
        },
      };
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

      const result = await service.create(context, 'user-1', { label: 'Careers', address: 'careers@acme.com' });

      expect(tx.orgSenderAddress.updateMany).toHaveBeenCalledWith({
        where: { organizationId: 'org-1', isDefault: true },
        data: { isDefault: false },
      });
      expect(tx.orgSenderAddress.create).toHaveBeenCalledWith({
        data: { organizationId: 'org-1', label: 'Careers', address: 'careers@acme.com', isDefault: true },
      });
      expect(result).toEqual({ id: 's1', label: 'Careers', address: 'careers@acme.com', isDefault: true });
      expect(audit.record).toHaveBeenCalledWith(context, expect.objectContaining({ action: 'org_sender_address.created', entityId: 's1' }));
    });

    it('clears sibling defaults when isDefault is explicitly requested on a non-first sender', async () => {
      const tx = {
        orgSenderAddress: {
          count: jest.fn().mockResolvedValue(1),
          updateMany: jest.fn().mockResolvedValue({ count: 1 }),
          create: jest.fn().mockResolvedValue({ id: 's2', label: 'Talent', address: 'talent@acme.com', isDefault: true }),
        },
      };
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

      await service.create(context, 'user-1', { label: 'Talent', address: 'talent@acme.com', isDefault: true });

      expect(tx.orgSenderAddress.updateMany).toHaveBeenCalledWith({
        where: { organizationId: 'org-1', isDefault: true },
        data: { isDefault: false },
      });
      expect(tx.orgSenderAddress.create).toHaveBeenCalledWith({
        data: { organizationId: 'org-1', label: 'Talent', address: 'talent@acme.com', isDefault: true },
      });
    });

    it('does not force or clear default for a non-first sender with isDefault omitted', async () => {
      const tx = {
        orgSenderAddress: {
          count: jest.fn().mockResolvedValue(1),
          updateMany: jest.fn(),
          create: jest.fn().mockResolvedValue({ id: 's2', label: 'Talent', address: 'talent@acme.com', isDefault: false }),
        },
      };
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

      await service.create(context, 'user-1', { label: 'Talent', address: 'talent@acme.com' });

      expect(tx.orgSenderAddress.updateMany).not.toHaveBeenCalled();
      expect(tx.orgSenderAddress.create).toHaveBeenCalledWith({
        data: { organizationId: 'org-1', label: 'Talent', address: 'talent@acme.com', isDefault: false },
      });
    });

    it('surfaces a duplicate address as a conflict', async () => {
      const tx = {
        orgSenderAddress: {
          count: jest.fn().mockResolvedValue(1),
          updateMany: jest.fn(),
          create: jest.fn().mockRejectedValue(knownRequestError('P2002')),
        },
      };
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

      await expect(service.create(context, 'user-1', { label: 'Dup', address: 'careers@acme.com' })).rejects.toThrow(ConflictException);
      expect(audit.record).not.toHaveBeenCalled();
    });
  });

  describe('update', () => {
    it('clears sibling defaults and sets self when isDefault:true', async () => {
      const tx = {
        orgSenderAddress: {
          findFirst: jest.fn().mockResolvedValue({ id: 's2', label: 'Talent', address: 'talent@acme.com', isDefault: false }),
          updateMany: jest.fn().mockResolvedValue({ count: 1 }),
          update: jest.fn().mockResolvedValue({ id: 's2', label: 'Talent', address: 'talent@acme.com', isDefault: true }),
        },
      };
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

      const result = await service.update(context, 'user-1', 's2', { isDefault: true });

      expect(tx.orgSenderAddress.updateMany).toHaveBeenCalledWith({
        where: { organizationId: 'org-1', isDefault: true },
        data: { isDefault: false },
      });
      expect(tx.orgSenderAddress.update).toHaveBeenCalledWith({ where: { id: 's2' }, data: { isDefault: true } });
      expect(result).toEqual({ id: 's2', label: 'Talent', address: 'talent@acme.com', isDefault: true });
      expect(audit.record).toHaveBeenCalledWith(context, expect.objectContaining({ action: 'org_sender_address.updated', entityId: 's2' }));
    });

    it('ignores isDefault:false -- never zeroes out the default', async () => {
      const tx = {
        orgSenderAddress: {
          findFirst: jest.fn().mockResolvedValue({ id: 's1', label: 'Careers', address: 'careers@acme.com', isDefault: true }),
          updateMany: jest.fn(),
          update: jest.fn().mockResolvedValue({ id: 's1', label: 'Careers', address: 'careers@acme.com', isDefault: true }),
        },
      };
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

      await service.update(context, 'user-1', 's1', { isDefault: false });

      expect(tx.orgSenderAddress.updateMany).not.toHaveBeenCalled();
      expect(tx.orgSenderAddress.update).toHaveBeenCalledWith({ where: { id: 's1' }, data: {} });
    });

    it('updates label/address without touching isDefault when omitted', async () => {
      const tx = {
        orgSenderAddress: {
          findFirst: jest.fn().mockResolvedValue({ id: 's1', label: 'Careers', address: 'careers@acme.com', isDefault: true }),
          updateMany: jest.fn(),
          update: jest.fn().mockResolvedValue({ id: 's1', label: 'Careers Team', address: 'careers@acme.com', isDefault: true }),
        },
      };
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

      await service.update(context, 'user-1', 's1', { label: 'Careers Team' });

      expect(tx.orgSenderAddress.update).toHaveBeenCalledWith({ where: { id: 's1' }, data: { label: 'Careers Team' } });
    });

    it('throws when the sender does not exist', async () => {
      const tx = { orgSenderAddress: { findFirst: jest.fn().mockResolvedValue(null) } };
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

      await expect(service.update(context, 'user-1', 'missing', { label: 'X' })).rejects.toThrow(NotFoundException);
    });

    it('surfaces a duplicate address as a conflict', async () => {
      const tx = {
        orgSenderAddress: {
          findFirst: jest.fn().mockResolvedValue({ id: 's1', label: 'Careers', address: 'careers@acme.com', isDefault: true }),
          update: jest.fn().mockRejectedValue(knownRequestError('P2002')),
        },
      };
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

      await expect(service.update(context, 'user-1', 's1', { address: 'talent@acme.com' })).rejects.toThrow(ConflictException);
    });
  });

  describe('remove', () => {
    it('deletes a non-default sender without promoting anyone', async () => {
      const tx = {
        orgSenderAddress: {
          findFirst: jest.fn().mockResolvedValue({ id: 's2', label: 'Talent', isDefault: false }),
          delete: jest.fn().mockResolvedValue({ id: 's2' }),
          update: jest.fn(),
        },
      };
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

      const result = await service.remove(context, 'user-1', 's2');

      expect(tx.orgSenderAddress.delete).toHaveBeenCalledWith({ where: { id: 's2' } });
      expect(tx.orgSenderAddress.update).not.toHaveBeenCalled();
      expect(result).toEqual({ success: true });
      expect(audit.record).toHaveBeenCalledWith(context, expect.objectContaining({ action: 'org_sender_address.deleted', entityId: 's2' }));
    });

    it('promotes the most-recently-updated survivor when the default is removed', async () => {
      const tx = {
        orgSenderAddress: {
          findFirst: jest
            .fn()
            .mockResolvedValueOnce({ id: 's1', label: 'Careers', isDefault: true }) // the existing lookup
            .mockResolvedValueOnce({ id: 's2', label: 'Talent', isDefault: false }), // most-recently-updated survivor
          delete: jest.fn().mockResolvedValue({ id: 's1' }),
          update: jest.fn().mockResolvedValue({ id: 's2', isDefault: true }),
        },
      };
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

      await service.remove(context, 'user-1', 's1');

      expect(tx.orgSenderAddress.delete).toHaveBeenCalledWith({ where: { id: 's1' } });
      expect(tx.orgSenderAddress.findFirst).toHaveBeenNthCalledWith(2, {
        where: { organizationId: 'org-1' },
        orderBy: { updatedAt: 'desc' },
      });
      expect(tx.orgSenderAddress.update).toHaveBeenCalledWith({ where: { id: 's2' }, data: { isDefault: true } });
    });

    it('removing the last sender leaves none (no promotion)', async () => {
      const tx = {
        orgSenderAddress: {
          findFirst: jest
            .fn()
            .mockResolvedValueOnce({ id: 's1', label: 'Careers', isDefault: true })
            .mockResolvedValueOnce(null),
          delete: jest.fn().mockResolvedValue({ id: 's1' }),
          update: jest.fn(),
        },
      };
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

      await service.remove(context, 'user-1', 's1');

      expect(tx.orgSenderAddress.update).not.toHaveBeenCalled();
    });

    it('throws when the sender does not exist', async () => {
      const tx = { orgSenderAddress: { findFirst: jest.fn().mockResolvedValue(null) } };
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

      await expect(service.remove(context, 'user-1', 'missing')).rejects.toThrow(NotFoundException);
    });
  });
});
