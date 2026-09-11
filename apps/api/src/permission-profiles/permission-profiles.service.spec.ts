import { Test } from '@nestjs/testing';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PermissionProfilesService } from './permission-profiles.service';
import { PrismaService, TenantPrismaService, AuditService } from '@exam-platform/shared';

describe('PermissionProfilesService', () => {
  let service: PermissionProfilesService;
  let prisma: { permission: { findMany: jest.Mock } };
  let tenantPrisma: { forTenant: jest.Mock };
  let audit: { record: jest.Mock };
  const context = { organizationId: 'org-1', isSuperAdmin: false } as any;

  const CATALOG = [
    { key: 'org:manage_settings', description: 'Manage settings' },
    { key: 'pipeline:manage', description: 'Manage pipeline' },
    { key: 'org:manage_users', description: 'Manage users' },
    { key: 'org:manage_billing', description: 'Manage billing' },
    { key: 'platform:manage_organizations', description: 'Manage platform orgs' },
  ];

  function knownRequestError(code: string) {
    return new Prisma.PrismaClientKnownRequestError('Unique constraint failed', { code, clientVersion: 'test' });
  }

  beforeEach(async () => {
    prisma = { permission: { findMany: jest.fn().mockResolvedValue(CATALOG) } };
    tenantPrisma = { forTenant: jest.fn() };
    audit = { record: jest.fn() };
    const moduleRef = await Test.createTestingModule({
      providers: [
        PermissionProfilesService,
        { provide: PrismaService, useValue: prisma },
        { provide: TenantPrismaService, useValue: tenantPrisma },
        { provide: AuditService, useValue: audit },
      ],
    }).compile();
    service = moduleRef.get(PermissionProfilesService);
  });

  describe('assignablePermissions', () => {
    it('returns the catalog minus the 3 non-assignable keys', async () => {
      const result = await service.assignablePermissions();
      expect(result).toEqual([
        { key: 'org:manage_settings', description: 'Manage settings' },
        { key: 'pipeline:manage', description: 'Manage pipeline' },
      ]);
    });
  });

  describe('list', () => {
    it('returns profiles with parsed permissions + assignedUserCount, via forTenant', async () => {
      const tx = {
        permissionProfile: {
          findMany: jest.fn().mockResolvedValue([
            { id: 'p1', organizationId: 'org-1', name: 'Recruiter Lite', permissionsJson: '["pipeline:manage"]', createdAt: 1, updatedAt: 2 },
          ]),
        },
        user: { count: jest.fn().mockResolvedValue(3) },
      };
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

      const result = await service.list(context);

      expect(tenantPrisma.forTenant).toHaveBeenCalledWith(context, expect.any(Function));
      expect(tx.permissionProfile.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { organizationId: 'org-1' } }));
      expect(tx.user.count).toHaveBeenCalledWith({ where: { permissionProfileId: 'p1' } });
      expect(result).toEqual([
        {
          id: 'p1',
          organizationId: 'org-1',
          name: 'Recruiter Lite',
          permissions: ['pipeline:manage'],
          assignedUserCount: 3,
          createdAt: 1,
          updatedAt: 2,
        },
      ]);
    });
  });

  describe('create', () => {
    it('persists permissionsJson and audits permission_profile.created', async () => {
      const tx = {
        permissionProfile: {
          create: jest.fn().mockResolvedValue({
            id: 'p1',
            organizationId: 'org-1',
            name: 'Recruiter Lite',
            permissionsJson: '["pipeline:manage"]',
            createdAt: 1,
            updatedAt: 2,
          }),
        },
      };
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

      const result = await service.create(context, 'user-1', { name: 'Recruiter Lite', permissions: ['pipeline:manage'] });

      expect(tx.permissionProfile.create).toHaveBeenCalledWith({
        data: { organizationId: 'org-1', name: 'Recruiter Lite', permissionsJson: '["pipeline:manage"]' },
      });
      expect(audit.record).toHaveBeenCalledWith(
        context,
        expect.objectContaining({ actorUserId: 'user-1', action: 'permission_profile.created', entityId: 'p1' }),
      );
      expect(result.assignedUserCount).toBe(0);
      expect(result.permissions).toEqual(['pipeline:manage']);
    });

    it('rejects a non-assignable key without touching the DB', async () => {
      await expect(service.create(context, 'user-1', { name: 'X', permissions: ['org:manage_users'] })).rejects.toThrow(
        BadRequestException,
      );
      expect(tenantPrisma.forTenant).not.toHaveBeenCalled();
    });

    it('rejects a key the Permission catalog does not recognize', async () => {
      await expect(service.create(context, 'user-1', { name: 'X', permissions: ['nonsense:key'] })).rejects.toThrow(
        BadRequestException,
      );
      expect(tenantPrisma.forTenant).not.toHaveBeenCalled();
    });

    it('surfaces a duplicate name unique violation as 409', async () => {
      const tx = { permissionProfile: { create: jest.fn().mockRejectedValue(knownRequestError('P2002')) } };
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

      await expect(service.create(context, 'user-1', { name: 'Dup', permissions: ['pipeline:manage'] })).rejects.toThrow(
        ConflictException,
      );
    });
  });

  describe('update', () => {
    it('validates permissions and audits permission_profile.updated', async () => {
      const tx = {
        permissionProfile: {
          findFirst: jest.fn().mockResolvedValue({ id: 'p1', organizationId: 'org-1', name: 'Old' }),
          update: jest.fn().mockResolvedValue({
            id: 'p1',
            organizationId: 'org-1',
            name: 'New',
            permissionsJson: '["org:manage_settings"]',
            createdAt: 1,
            updatedAt: 2,
          }),
        },
        user: { count: jest.fn().mockResolvedValue(1) },
      };
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

      const result = await service.update(context, 'user-1', 'p1', { name: 'New', permissions: ['org:manage_settings'] });

      expect(tx.permissionProfile.update).toHaveBeenCalledWith({
        where: { id: 'p1' },
        data: { name: 'New', permissionsJson: '["org:manage_settings"]' },
      });
      expect(audit.record).toHaveBeenCalledWith(context, expect.objectContaining({ action: 'permission_profile.updated', entityId: 'p1' }));
      expect(result.assignedUserCount).toBe(1);
    });

    it('rejects a non-assignable key', async () => {
      await expect(service.update(context, 'user-1', 'p1', { permissions: ['org:manage_billing'] })).rejects.toThrow(
        BadRequestException,
      );
      expect(tenantPrisma.forTenant).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when the profile does not belong to this org', async () => {
      const tx = { permissionProfile: { findFirst: jest.fn().mockResolvedValue(null) } };
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

      await expect(service.update(context, 'user-1', 'missing', { name: 'X' })).rejects.toThrow(NotFoundException);
    });

    it('surfaces a duplicate name unique violation as 409', async () => {
      const tx = {
        permissionProfile: {
          findFirst: jest.fn().mockResolvedValue({ id: 'p1', organizationId: 'org-1', name: 'Old' }),
          update: jest.fn().mockRejectedValue(knownRequestError('P2002')),
        },
      };
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

      await expect(service.update(context, 'user-1', 'p1', { name: 'Dup' })).rejects.toThrow(ConflictException);
    });
  });

  describe('remove', () => {
    it('deletes and audits permission_profile.deleted when no user is assigned', async () => {
      const tx = {
        permissionProfile: { findFirst: jest.fn().mockResolvedValue({ id: 'p1', organizationId: 'org-1' }), delete: jest.fn() },
        user: { count: jest.fn().mockResolvedValue(0) },
      };
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

      const result = await service.remove(context, 'user-1', 'p1');

      expect(tx.permissionProfile.delete).toHaveBeenCalledWith({ where: { id: 'p1' } });
      expect(audit.record).toHaveBeenCalledWith(context, expect.objectContaining({ action: 'permission_profile.deleted', entityId: 'p1' }));
      expect(result).toEqual({ success: true });
    });

    it('throws ConflictException naming the assignee count instead of cascading/nulling', async () => {
      const tx = {
        permissionProfile: { findFirst: jest.fn().mockResolvedValue({ id: 'p1', organizationId: 'org-1' }), delete: jest.fn() },
        user: { count: jest.fn().mockResolvedValue(4) },
      };
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

      await expect(service.remove(context, 'user-1', 'p1')).rejects.toThrow(ConflictException);
      await expect(service.remove(context, 'user-1', 'p1')).rejects.toThrow(/4/);
      expect(tx.permissionProfile.delete).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when the profile does not belong to this org', async () => {
      const tx = { permissionProfile: { findFirst: jest.fn().mockResolvedValue(null) } };
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

      await expect(service.remove(context, 'user-1', 'missing')).rejects.toThrow(NotFoundException);
    });
  });
});
