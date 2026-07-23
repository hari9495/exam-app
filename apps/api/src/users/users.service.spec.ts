import { Test } from '@nestjs/testing';
import { BadRequestException, ConflictException, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { UsersService } from './users.service';
import { TenantPrismaService } from '@exam-platform/shared';
import { AuditService } from '@exam-platform/shared';
import { EmailService } from '../email/email.service';

describe('UsersService', () => {
  let service: UsersService;
  let tenantPrisma: { forTenant: jest.Mock };
  let audit: { record: jest.Mock };
  let jwt: { verify: jest.Mock };
  let emailService: { send: jest.Mock };

  beforeEach(async () => {
    tenantPrisma = { forTenant: jest.fn() };
    audit = { record: jest.fn() };
    jwt = { verify: jest.fn() };
    emailService = { send: jest.fn().mockResolvedValue({ success: true }) };
    const moduleRef = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: TenantPrismaService, useValue: tenantPrisma },
        { provide: AuditService, useValue: audit },
        { provide: JwtService, useValue: jwt },
        { provide: EmailService, useValue: emailService },
      ],
    }).compile();
    service = moduleRef.get(UsersService);
  });

  it('rejects creating a user with no organization context', async () => {
    await expect(
      service.create({ organizationId: null, isSuperAdmin: true }, { email: 'a@b.com', password: 'password1', role: 'recruiter' }),
    ).rejects.toThrow(BadRequestException);
  });

  it('creates a user scoped to the caller\'s organization', async () => {
    tenantPrisma.forTenant.mockResolvedValue({
      id: 'user-1',
      email: 'a@b.com',
      organizationId: 'org-1',
      role: 'recruiter',
      status: 'active',
      lastLoginAt: null,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
    });

    const result = await service.create(
      { organizationId: 'org-1', isSuperAdmin: false },
      { email: 'a@b.com', password: 'password1', role: 'recruiter' },
    );

    expect(result.organizationId).toBe('org-1');
    expect(tenantPrisma.forTenant).toHaveBeenCalledWith(
      { organizationId: 'org-1', isSuperAdmin: false },
      expect.any(Function),
    );
  });

  it('never returns a passwordHash from create()', async () => {
    tenantPrisma.forTenant.mockResolvedValue({
      id: 'user-1',
      email: 'a@b.com',
      organizationId: 'org-1',
      role: 'recruiter',
      status: 'active',
      lastLoginAt: null,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
    });

    const result = await service.create(
      { organizationId: 'org-1', isSuperAdmin: false },
      { email: 'a@b.com', password: 'password1', role: 'recruiter' },
    );

    expect(result).not.toHaveProperty('passwordHash');
  });

  it('includes name in the created user response', async () => {
    tenantPrisma.forTenant.mockResolvedValue({
      id: 'user-1',
      email: 'a@b.com',
      name: null,
      organizationId: 'org-1',
      role: 'recruiter',
      status: 'active',
      lastLoginAt: null,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
    });

    const result = await service.create(
      { organizationId: 'org-1', isSuperAdmin: false },
      { email: 'a@b.com', password: 'password1', role: 'recruiter' },
    );

    expect(result).toHaveProperty('name', null);
  });

  it('getMe returns the caller\'s own user record', async () => {
    tenantPrisma.forTenant.mockResolvedValue({
      id: 'user-1',
      email: 'a@b.com',
      name: 'Jane Recruiter',
      organizationId: 'org-1',
      role: 'recruiter',
      status: 'active',
      lastLoginAt: null,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
    });

    const result = await service.getMe({ organizationId: 'org-1', isSuperAdmin: false }, 'user-1');

    expect(result.name).toBe('Jane Recruiter');
    expect(tenantPrisma.forTenant).toHaveBeenCalledWith(
      { organizationId: 'org-1', isSuperAdmin: false },
      expect.any(Function),
    );
  });

  it('updateMe updates only the name field', async () => {
    tenantPrisma.forTenant.mockResolvedValue({
      id: 'user-1',
      email: 'a@b.com',
      name: 'New Name',
      organizationId: 'org-1',
      role: 'recruiter',
      status: 'active',
      lastLoginAt: null,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
    });

    const result = await service.updateMe({ organizationId: 'org-1', isSuperAdmin: false }, 'user-1', {
      name: 'New Name',
    });

    expect(result.name).toBe('New Name');
    expect(tenantPrisma.forTenant).toHaveBeenCalledWith(
      { organizationId: 'org-1', isSuperAdmin: false },
      expect.any(Function),
    );
  });

  it('changePassword rejects a wrong current password', async () => {
    const storedHash = await argon2.hash('correct-password');
    tenantPrisma.forTenant.mockImplementation(async (_context: unknown, fn: (tx: unknown) => unknown) =>
      fn({ user: { findUniqueOrThrow: async () => ({ id: 'user-1', passwordHash: storedHash }) } }),
    );

    await expect(
      service.changePassword(
        { organizationId: 'org-1', isSuperAdmin: false },
        'user-1',
        { currentPassword: 'wrong-password', newPassword: 'NewPassw0rd!' },
        undefined,
      ),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('changePassword updates the hash and revokes other sessions, keeping the caller\'s own session alive', async () => {
    const storedHash = await argon2.hash('correct-password');
    const userUpdate = jest.fn();
    const refreshTokenUpdateMany = jest.fn();
    tenantPrisma.forTenant.mockImplementation(async (_context: unknown, fn: (tx: unknown) => unknown) =>
      fn({
        user: {
          findUniqueOrThrow: async () => ({ id: 'user-1', passwordHash: storedHash }),
          update: userUpdate,
        },
        refreshToken: { updateMany: refreshTokenUpdateMany },
      }),
    );
    jwt.verify.mockReturnValue({ sub: 'user-1', familyId: 'family-current' });

    await service.changePassword(
      { organizationId: 'org-1', isSuperAdmin: false },
      'user-1',
      { currentPassword: 'correct-password', newPassword: 'NewPassw0rd!' },
      'raw-refresh-token',
    );

    expect(userUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'user-1' }, data: expect.objectContaining({ passwordHash: expect.any(String) }) }),
    );
    expect(refreshTokenUpdateMany).toHaveBeenCalledWith({
      where: { userId: 'user-1', revokedAt: null, familyId: { not: 'family-current' } },
      data: { revokedAt: expect.any(Date) },
    });
    expect(audit.record).toHaveBeenCalledWith(
      { organizationId: 'org-1', isSuperAdmin: false },
      { actorUserId: 'user-1', action: 'password.changed', entityType: 'user', entityId: 'user-1' },
    );
  });

  it('listSuperAdmins returns a paginated page of only super_admin users via the bypass context', async () => {
    tenantPrisma.forTenant.mockImplementation(async (_context: unknown, fn: (tx: unknown) => unknown) =>
      fn({
        user: {
          findMany: async () => [{ id: 'sa-1', email: 'super1@platform.test', createdAt: new Date('2026-01-01T00:00:00.000Z') }],
          count: async () => 1,
        },
      }),
    );

    const result = await service.listSuperAdmins({ organizationId: null, isSuperAdmin: true });

    expect(result).toEqual({
      data: [{ id: 'sa-1', email: 'super1@platform.test', createdAt: new Date('2026-01-01T00:00:00.000Z') }],
      total: 1,
      page: 1,
      pageSize: 20,
      totalPages: 1,
    });
    expect(tenantPrisma.forTenant).toHaveBeenCalledWith(
      { organizationId: null, isSuperAdmin: true },
      expect.any(Function),
    );
  });

  it('list returns a paginated page of users scoped to the caller\'s organization', async () => {
    tenantPrisma.forTenant.mockImplementation(async (_context: unknown, fn: (tx: unknown) => unknown) =>
      fn({
        user: {
          findMany: async () => [
            { id: 'user-1', email: 'a@b.com', organizationId: 'org-1', role: 'recruiter', status: 'active', lastLoginAt: null, createdAt: new Date('2026-01-01T00:00:00.000Z') },
          ],
          count: async () => 1,
        },
      }),
    );

    const result = await service.list({ organizationId: 'org-1', isSuperAdmin: false });

    expect(result).toEqual({
      data: [
        { id: 'user-1', email: 'a@b.com', organizationId: 'org-1', role: 'recruiter', status: 'active', lastLoginAt: null, createdAt: new Date('2026-01-01T00:00:00.000Z') },
      ],
      total: 1,
      page: 1,
      pageSize: 20,
      totalPages: 1,
    });
  });

  it('inviteSuperAdmin rejects an email that already has a platform account', async () => {
    tenantPrisma.forTenant.mockImplementation(async (_context: unknown, fn: (tx: unknown) => unknown) =>
      fn({ user: { findFirst: async () => ({ id: 'existing-sa' }) } }),
    );

    await expect(
      service.inviteSuperAdmin({ organizationId: null, isSuperAdmin: true }, 'actor-1', { email: 'dup@platform.test' }),
    ).rejects.toThrow(ConflictException);
  });

  it('inviteSuperAdmin creates a null-org super_admin user and records an audit event', async () => {
    let createCall: unknown;
    let tokenCreateCall: unknown;
    tenantPrisma.forTenant.mockImplementation(async (_context: unknown, fn: (tx: unknown) => unknown) =>
      fn({
        user: {
          findFirst: async () => null,
          create: async (args: unknown) => {
            createCall = args;
            return { id: 'new-sa', email: 'new@platform.test', createdAt: new Date('2026-01-01T00:00:00.000Z') };
          },
        },
        passwordResetToken: {
          create: async (args: unknown) => {
            tokenCreateCall = args;
            return {};
          },
        },
      }),
    );

    const result = await service.inviteSuperAdmin(
      { organizationId: null, isSuperAdmin: true },
      'actor-1',
      { email: 'new@platform.test' },
    );

    expect(result.email).toBe('new@platform.test');
    expect(createCall).toEqual(
      expect.objectContaining({ data: expect.objectContaining({ organizationId: null, email: 'new@platform.test', role: 'super_admin' }) }),
    );
    expect(tokenCreateCall).toEqual(
      expect.objectContaining({ data: expect.objectContaining({ userId: 'new-sa' }) }),
    );
    expect(audit.record).toHaveBeenCalledWith(
      { organizationId: null, isSuperAdmin: true },
      { actorUserId: 'actor-1', action: 'user.super_admin_invited', entityType: 'user', entityId: 'new-sa' },
    );
  });

  it('promoteSuperAdmin rejects when no user matches the email', async () => {
    tenantPrisma.forTenant.mockImplementation(async (_context: unknown, fn: (tx: unknown) => unknown) =>
      fn({ user: { findMany: async () => [] } }),
    );

    await expect(
      service.promoteSuperAdmin({ organizationId: null, isSuperAdmin: true }, 'actor-1', { email: 'nobody@x.test' }),
    ).rejects.toThrow(NotFoundException);
  });

  it('promoteSuperAdmin rejects when the email matches more than one account across orgs', async () => {
    tenantPrisma.forTenant.mockImplementation(async (_context: unknown, fn: (tx: unknown) => unknown) =>
      fn({
        user: {
          findMany: async () => [
            { id: 'u-1', role: 'recruiter' },
            { id: 'u-2', role: 'org_admin' },
          ],
        },
      }),
    );

    await expect(
      service.promoteSuperAdmin({ organizationId: null, isSuperAdmin: true }, 'actor-1', { email: 'shared@x.test' }),
    ).rejects.toThrow(ConflictException);
  });

  it('promoteSuperAdmin rejects a user who is already a super_admin', async () => {
    tenantPrisma.forTenant.mockImplementation(async (_context: unknown, fn: (tx: unknown) => unknown) =>
      fn({ user: { findMany: async () => [{ id: 'u-1', role: 'super_admin' }] } }),
    );

    await expect(
      service.promoteSuperAdmin({ organizationId: null, isSuperAdmin: true }, 'actor-1', { email: 'already@x.test' }),
    ).rejects.toThrow(ConflictException);
  });

  it('promoteSuperAdmin clears organizationId and sets role on the matched user', async () => {
    let updateCall: unknown;
    tenantPrisma.forTenant.mockImplementation(async (_context: unknown, fn: (tx: unknown) => unknown) =>
      fn({
        user: {
          findMany: async () => [{ id: 'u-1', role: 'org_admin' }],
          update: async (args: unknown) => {
            updateCall = args;
            return { id: 'u-1', email: 'promote@x.test', createdAt: new Date('2026-01-01T00:00:00.000Z') };
          },
        },
      }),
    );

    const result = await service.promoteSuperAdmin(
      { organizationId: null, isSuperAdmin: true },
      'actor-1',
      { email: 'promote@x.test' },
    );

    expect(result.id).toBe('u-1');
    expect(updateCall).toEqual(
      expect.objectContaining({
        where: { id: 'u-1' },
        data: expect.objectContaining({ organizationId: null, role: 'super_admin' }),
      }),
    );
    expect(audit.record).toHaveBeenCalledWith(
      { organizationId: null, isSuperAdmin: true },
      { actorUserId: 'actor-1', action: 'user.super_admin_promoted', entityType: 'user', entityId: 'u-1' },
    );
  });

  describe('listDirectory', () => {
    it('queries across all organizations with no organizationId filter, and includes each user\'s org name', async () => {
      const findMany = jest.fn().mockResolvedValue([
        { id: 'u1', organizationId: 'org-1', email: 'a@acme.test', name: 'A', role: 'recruiter', status: 'active', lastLoginAt: null, createdAt: new Date(), organization: { name: 'Acme Inc' } },
        { id: 'u2', organizationId: null, email: 'b@platform.test', name: 'B', role: 'super_admin', status: 'active', lastLoginAt: null, createdAt: new Date(), organization: null },
      ]);
      const count = jest.fn().mockResolvedValue(2);
      tenantPrisma.forTenant.mockImplementation(async (_context: unknown, fn: (tx: unknown) => unknown) =>
        fn({ user: { findMany, count } }),
      );

      const result = await service.listDirectory({ organizationId: null, isSuperAdmin: true }, {});

      expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ where: {} }));
      expect(result.data).toEqual([
        expect.objectContaining({ id: 'u1', organizationName: 'Acme Inc' }),
        expect.objectContaining({ id: 'u2', organizationName: null }),
      ]);
    });
  });
});
