import { Test } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { createHash } from 'crypto';
import { SetupService } from './setup.service';
import { PrismaService, TenantPrismaService, AuditService } from '@exam-platform/shared';

describe('SetupService', () => {
  let service: SetupService;
  let prisma: { setupToken: { deleteMany: jest.Mock; create: jest.Mock; findUnique: jest.Mock } };
  let tenantPrisma: { forTenant: jest.Mock };
  let audit: { record: jest.Mock };

  beforeEach(async () => {
    prisma = {
      setupToken: { deleteMany: jest.fn(), create: jest.fn(), findUnique: jest.fn() },
    };
    tenantPrisma = { forTenant: jest.fn() };
    audit = { record: jest.fn() };
    const moduleRef = await Test.createTestingModule({
      providers: [
        SetupService,
        { provide: PrismaService, useValue: prisma },
        { provide: TenantPrismaService, useValue: tenantPrisma },
        { provide: AuditService, useValue: audit },
      ],
    }).compile();
    service = moduleRef.get(SetupService);
  });

  it('needsSetup returns true when zero super_admins exist', async () => {
    tenantPrisma.forTenant.mockImplementation(async (_context: unknown, fn: (tx: unknown) => unknown) =>
      fn({ user: { count: async () => 0 } }),
    );

    await expect(service.needsSetup()).resolves.toBe(true);
    expect(tenantPrisma.forTenant).toHaveBeenCalledWith({ organizationId: null, isSuperAdmin: true }, expect.any(Function));
  });

  it('needsSetup returns false when a super_admin already exists', async () => {
    tenantPrisma.forTenant.mockImplementation(async (_context: unknown, fn: (tx: unknown) => unknown) =>
      fn({ user: { count: async () => 1 } }),
    );

    await expect(service.needsSetup()).resolves.toBe(false);
  });

  it('onModuleInit generates and logs a token when setup is needed', async () => {
    tenantPrisma.forTenant.mockImplementation(async (_context: unknown, fn: (tx: unknown) => unknown) =>
      fn({ user: { count: async () => 0 } }),
    );

    await service.onModuleInit();

    expect(prisma.setupToken.deleteMany).toHaveBeenCalledWith({});
    expect(prisma.setupToken.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ tokenHash: expect.any(String), expiresAt: expect.any(Date) }) }),
    );
  });

  it('onModuleInit does nothing when a super_admin already exists', async () => {
    tenantPrisma.forTenant.mockImplementation(async (_context: unknown, fn: (tx: unknown) => unknown) =>
      fn({ user: { count: async () => 1 } }),
    );

    await service.onModuleInit();

    expect(prisma.setupToken.deleteMany).not.toHaveBeenCalled();
    expect(prisma.setupToken.create).not.toHaveBeenCalled();
  });

  it('completeSetup rejects when a super_admin already exists, even with a technically valid token', async () => {
    tenantPrisma.forTenant.mockImplementation(async (_context: unknown, fn: (tx: unknown) => unknown) =>
      fn({
        user: { count: async () => 1, create: jest.fn() },
        setupToken: { findUnique: async () => ({ tokenHash: 'irrelevant', expiresAt: new Date(Date.now() + 100000) }), deleteMany: jest.fn() },
      }),
    );

    await expect(
      service.completeSetup({ token: 'raw-token', email: 'ops@example.com', password: 'password1' }),
    ).rejects.toThrow(BadRequestException);
  });

  it('completeSetup rejects an invalid token', async () => {
    tenantPrisma.forTenant.mockImplementation(async (_context: unknown, fn: (tx: unknown) => unknown) =>
      fn({
        user: { count: async () => 0, create: jest.fn() },
        setupToken: { findUnique: async () => null, deleteMany: jest.fn() },
      }),
    );

    await expect(
      service.completeSetup({ token: 'wrong-token', email: 'ops@example.com', password: 'password1' }),
    ).rejects.toThrow(BadRequestException);
  });

  it('completeSetup rejects an expired token', async () => {
    tenantPrisma.forTenant.mockImplementation(async (_context: unknown, fn: (tx: unknown) => unknown) =>
      fn({
        user: { count: async () => 0, create: jest.fn() },
        setupToken: { findUnique: async () => ({ expiresAt: new Date(Date.now() - 1000) }), deleteMany: jest.fn() },
      }),
    );

    await expect(
      service.completeSetup({ token: 'raw-token', email: 'ops@example.com', password: 'password1' }),
    ).rejects.toThrow(BadRequestException);
  });

  it('completeSetup creates the super_admin, deletes the token, and records an audit event', async () => {
    const userCreate = jest.fn(async () => ({ id: 'new-admin-id', email: 'ops@example.com' }));
    const tokenDeleteMany = jest.fn();
    tenantPrisma.forTenant.mockImplementation(async (_context: unknown, fn: (tx: unknown) => unknown) =>
      fn({
        user: { count: async () => 0, create: userCreate },
        setupToken: { findUnique: async () => ({ expiresAt: new Date(Date.now() + 100000) }), deleteMany: tokenDeleteMany },
      }),
    );

    await service.completeSetup({ token: 'raw-token', email: 'ops@example.com', password: 'password1' });

    expect(userCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ organizationId: null, email: 'ops@example.com', role: 'super_admin' }) }),
    );
    expect(tokenDeleteMany).toHaveBeenCalledWith({});
    expect(audit.record).toHaveBeenCalledWith(
      { organizationId: null, isSuperAdmin: true },
      { actorUserId: 'new-admin-id', action: 'user.setup_wizard_completed', entityType: 'user', entityId: 'new-admin-id' },
    );
  });
});
