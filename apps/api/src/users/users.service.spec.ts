import { Test } from '@nestjs/testing';
import { BadRequestException, ConflictException, ForbiddenException, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { UsersService } from './users.service';
import { TenantPrismaService } from '@exam-platform/shared';
import { AuditService } from '@exam-platform/shared';
import { BlobStorageService } from '@exam-platform/shared';
import { EmailService } from '../email/email.service';
import { QuotaService } from '../billing/quota.service';

describe('UsersService', () => {
  let service: UsersService;
  let tenantPrisma: { forTenant: jest.Mock };
  let audit: { record: jest.Mock };
  let jwt: { verify: jest.Mock };
  let emailService: { send: jest.Mock };
  let blobStorage: { upload: jest.Mock; signIfOurs: jest.Mock };
  let quota: { checkSoftLimit: jest.Mock };

  beforeEach(async () => {
    tenantPrisma = { forTenant: jest.fn() };
    audit = { record: jest.fn() };
    jwt = { verify: jest.fn() };
    emailService = { send: jest.fn().mockResolvedValue({ success: true }) };
    blobStorage = {
      upload: jest.fn().mockResolvedValue('https://blob.test/container/avatars/user-1-123.png'),
      // Stands in for the real SAS signing: returns the path with a token appended.
      signIfOurs: jest.fn(async (value: unknown) => (value == null ? null : `${value as string}?sig=abc`)),
    };
    quota = { checkSoftLimit: jest.fn().mockResolvedValue({ warn: false, threshold: null, used: 0, limit: 0 }) };
    const moduleRef = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: TenantPrismaService, useValue: tenantPrisma },
        { provide: AuditService, useValue: audit },
        { provide: JwtService, useValue: jwt },
        { provide: EmailService, useValue: emailService },
        { provide: BlobStorageService, useValue: blobStorage },
        { provide: QuotaService, useValue: quota },
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

  it('checks the soft seat limit after a successful create', async () => {
    tenantPrisma.forTenant.mockResolvedValue({
      id: 'user-1',
      email: 'a@b.com',
      organizationId: 'org-1',
      role: 'recruiter',
      status: 'active',
      lastLoginAt: null,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
    });

    await service.create({ organizationId: 'org-1', isSuperAdmin: false }, { email: 'a@b.com', password: 'password1', role: 'recruiter' });

    expect(quota.checkSoftLimit).toHaveBeenCalledWith({ organizationId: 'org-1', isSuperAdmin: false }, 'seats');
  });

  it('still returns the created user when the soft seat-limit check rejects', async () => {
    tenantPrisma.forTenant.mockResolvedValue({
      id: 'user-1',
      email: 'a@b.com',
      organizationId: 'org-1',
      role: 'recruiter',
      status: 'active',
      lastLoginAt: null,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
    });
    quota.checkSoftLimit.mockRejectedValueOnce(new Error('billing DB unreachable'));

    const result = await service.create(
      { organizationId: 'org-1', isSuperAdmin: false },
      { email: 'a@b.com', password: 'password1', role: 'recruiter' },
    );

    expect(result.id).toBe('user-1');
  });

  describe('create - SSO-enabled org', () => {
    const ctx = { organizationId: 'org-1', isSuperAdmin: false };

    it('ignores a supplied password and generates a random one when the org has SSO enabled', async () => {
      const tx = {
        organization: { findUnique: jest.fn().mockResolvedValue({ samlEnabled: true }) },
        user: {
          findFirst: jest.fn().mockResolvedValue(null),
          create: jest.fn().mockResolvedValue({ id: 'u1', email: 'a@b.com', organizationId: 'org-1', role: 'recruiter' }),
        },
      };
      tenantPrisma.forTenant.mockImplementation((_c: unknown, fn: (t: unknown) => unknown) => fn(tx));

      const result = await service.create(ctx, { email: 'a@b.com', role: 'recruiter' });

      expect(result.id).toBe('u1');
      const createCall = tx.user.create.mock.calls[0][0];
      // The generated hash must not be a hash of nothing -- argon2.hash was actually called
      // with a real (random) value, not skipped.
      expect(await argon2.verify(createCall.data.passwordHash, '')).toBe(false);
    });

    it('rejects creation with no password when the org does NOT have SSO enabled', async () => {
      const tx = {
        organization: { findUnique: jest.fn().mockResolvedValue({ samlEnabled: false }) },
        user: { findFirst: jest.fn().mockResolvedValue(null) },
      };
      tenantPrisma.forTenant.mockImplementation((_c: unknown, fn: (t: unknown) => unknown) => fn(tx));

      await expect(service.create(ctx, { email: 'a@b.com', role: 'recruiter' })).rejects.toThrow(
        'Password is required',
      );
    });

    // Regression for ADO #6847: a duplicate insert previously fell through to Prisma's raw P2002
    // with no exception filter to translate it, surfacing a generic 500 instead of a clear message.
    it('rejects with a clear message when a user with that email already exists in the org', async () => {
      const tx = {
        user: { findFirst: jest.fn().mockResolvedValue({ id: 'existing-1', email: 'a@b.com' }) },
      };
      tenantPrisma.forTenant.mockImplementation((_c: unknown, fn: (t: unknown) => unknown) => fn(tx));

      await expect(service.create(ctx, { email: 'a@b.com', password: 'password1', role: 'recruiter' })).rejects.toThrow(
        new ConflictException('A user with this email already exists in your organization.'),
      );
    });
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

  it('getMe signs the stored avatar path and never returns the raw path', async () => {
    tenantPrisma.forTenant.mockResolvedValue({
      id: 'user-1',
      email: 'a@b.com',
      name: 'Jane Recruiter',
      organizationId: 'org-1',
      role: 'recruiter',
      status: 'active',
      avatarPath: 'https://blob.test/container/avatars/user-1-123.png',
      lastLoginAt: null,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
    });

    const result = await service.getMe({ organizationId: 'org-1', isSuperAdmin: false }, 'user-1');

    // The container is private -- an unsigned path renders as a broken image in the browser.
    expect(result.avatarUrl).toBe('https://blob.test/container/avatars/user-1-123.png?sig=abc');
    expect(result).not.toHaveProperty('avatarPath');
  });

  it('getMe reports no avatar as null rather than omitting it', async () => {
    tenantPrisma.forTenant.mockResolvedValue({
      id: 'user-1',
      email: 'a@b.com',
      name: 'Jane Recruiter',
      organizationId: 'org-1',
      role: 'recruiter',
      status: 'active',
      avatarPath: null,
      lastLoginAt: null,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
    });

    const result = await service.getMe({ organizationId: 'org-1', isSuperAdmin: false }, 'user-1');

    expect(result.avatarUrl).toBeNull();
  });

  it('uploadAvatar stores the blob and saves its path against the caller', async () => {
    tenantPrisma.forTenant.mockImplementation(async (_ctx: unknown, fn: (tx: unknown) => unknown) => {
      const tx = { user: { update: jest.fn().mockResolvedValue({ id: 'user-1', email: 'a@b.com', name: null, organizationId: 'org-1', role: 'recruiter', status: 'active', avatarPath: 'https://blob.test/container/avatars/user-1-123.png', lastLoginAt: null, createdAt: new Date('2026-01-01T00:00:00.000Z') }) } };
      const result = await fn(tx);
      expect(tx.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'user-1' },
          data: { avatarPath: 'https://blob.test/container/avatars/user-1-123.png' },
        }),
      );
      return result;
    });

    const result = await service.uploadAvatar({ organizationId: 'org-1', isSuperAdmin: false }, 'user-1', {
      mimetype: 'image/png',
      size: 1000,
      buffer: Buffer.from('png'),
    } as Express.Multer.File);

    expect(blobStorage.upload).toHaveBeenCalledWith(
      expect.stringMatching(/^avatars\/user-1-\d+\.png$/),
      expect.any(Buffer),
      'image/png',
    );
    expect(result.avatarUrl).toBe('https://blob.test/container/avatars/user-1-123.png?sig=abc');
    expect(audit.record).toHaveBeenCalledWith(
      { organizationId: 'org-1', isSuperAdmin: false },
      expect.objectContaining({ action: 'user.avatar_updated', entityId: 'user-1' }),
    );
  });

  it('uploadAvatar rejects a file type that is not PNG or JPEG', async () => {
    await expect(
      service.uploadAvatar({ organizationId: 'org-1', isSuperAdmin: false }, 'user-1', {
        mimetype: 'image/svg+xml',
        size: 1000,
        buffer: Buffer.from('svg'),
      } as Express.Multer.File),
    ).rejects.toThrow(BadRequestException);
    // Rejected before anything reached storage.
    expect(blobStorage.upload).not.toHaveBeenCalled();
  });

  it('uploadAvatar rejects a file over 1MB', async () => {
    await expect(
      service.uploadAvatar({ organizationId: 'org-1', isSuperAdmin: false }, 'user-1', {
        mimetype: 'image/png',
        size: 1024 * 1024 + 1,
        buffer: Buffer.from('png'),
      } as Express.Multer.File),
    ).rejects.toThrow(BadRequestException);
    expect(blobStorage.upload).not.toHaveBeenCalled();
  });

  it('removeAvatar clears the path back to null', async () => {
    tenantPrisma.forTenant.mockResolvedValue({
      id: 'user-1',
      email: 'a@b.com',
      name: null,
      organizationId: 'org-1',
      role: 'recruiter',
      status: 'active',
      avatarPath: null,
      lastLoginAt: null,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
    });

    const result = await service.removeAvatar({ organizationId: 'org-1', isSuperAdmin: false }, 'user-1');

    expect(result.avatarUrl).toBeNull();
    expect(audit.record).toHaveBeenCalledWith(
      { organizationId: 'org-1', isSuperAdmin: false },
      expect.objectContaining({ action: 'user.avatar_removed' }),
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

  // Regression (#6869): the staff pickers say "Search staff by name or email", but this filter
  // matched email only, so searching a person's NAME returned nothing and the audit-log actor
  // picker looked broken. The assertion is on the WHERE clause, because the bug was invisible in
  // the response shape -- the query simply never matched.
  it('list searches on name as well as email, scoped to the organization', async () => {
    let whereArg: any;
    tenantPrisma.forTenant.mockImplementation(async (_context: unknown, fn: (tx: unknown) => unknown) =>
      fn({
        user: {
          findMany: async (args: any) => {
            whereArg = args.where;
            return [];
          },
          count: async () => 0,
        },
      }),
    );

    await service.list({ organizationId: 'org-1', isSuperAdmin: false }, { search: 'Jane' });

    expect(whereArg.organizationId).toBe('org-1');
    expect(whereArg.OR).toEqual([{ email: { contains: 'Jane' } }, { name: { contains: 'Jane' } }]);
  });

  it('list applies no search filter when the term is blank', async () => {
    let whereArg: any;
    tenantPrisma.forTenant.mockImplementation(async (_context: unknown, fn: (tx: unknown) => unknown) =>
      fn({
        user: {
          findMany: async (args: any) => {
            whereArg = args.where;
            return [];
          },
          count: async () => 0,
        },
      }),
    );

    await service.list({ organizationId: 'org-1', isSuperAdmin: false }, { search: '   ' });

    expect(whereArg.OR).toBeUndefined();
    expect(whereArg.organizationId).toBe('org-1');
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

  describe('setStatus', () => {
    const ctx = { organizationId: 'org1', isSuperAdmin: false };
    const safe = { id: 't1', email: 'a@b.com', role: 'recruiter', name: null, organizationId: 'org1', status: 'deactivated', lastLoginAt: null, createdAt: new Date() };

    it('deactivates an in-org user and revokes their refresh tokens', async () => {
      const tx = {
        user: {
          findFirst: jest.fn().mockResolvedValue({ id: 't1', role: 'recruiter', organizationId: 'org1' }),
          update: jest.fn().mockResolvedValue(safe),
        },
        refreshToken: { updateMany: jest.fn().mockResolvedValue({ count: 2 }) },
      };
      tenantPrisma.forTenant.mockImplementation(async (_c: unknown, fn: (t: unknown) => unknown) => fn(tx));
      const result = await service.setStatus(ctx, 't1', 'deactivated', 'admin1');
      expect(result.status).toBe('deactivated');
      expect(tx.refreshToken.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { userId: 't1', revokedAt: null } }));
      expect(audit.record).toHaveBeenCalledWith(ctx, expect.objectContaining({ action: 'user.deactivated', actorUserId: 'admin1' }));
    });

    it('refuses to deactivate yourself', async () => {
      await expect(service.setStatus(ctx, 'admin1', 'deactivated', 'admin1')).rejects.toThrow(ForbiddenException);
    });

    it('refuses to deactivate a super_admin', async () => {
      const tx = { user: { findFirst: jest.fn().mockResolvedValue({ id: 't1', role: 'super_admin', organizationId: null }) }, refreshToken: { updateMany: jest.fn() } };
      tenantPrisma.forTenant.mockImplementation(async (_c: unknown, fn: (t: unknown) => unknown) => fn(tx));
      await expect(service.setStatus(ctx, 't1', 'deactivated', 'admin1')).rejects.toThrow(ForbiddenException);
    });

    it('throws NotFound when the target is out of scope', async () => {
      const tx = { user: { findFirst: jest.fn().mockResolvedValue(null) }, refreshToken: { updateMany: jest.fn() } };
      tenantPrisma.forTenant.mockImplementation(async (_c: unknown, fn: (t: unknown) => unknown) => fn(tx));
      await expect(service.setStatus(ctx, 'nope', 'deactivated', 'admin1')).rejects.toThrow(NotFoundException);
    });

    it('rejects when there is no organization context', async () => {
      await expect(
        service.setStatus({ organizationId: null, isSuperAdmin: true }, 't1', 'deactivated', 'admin1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('reactivates a user without touching refresh tokens', async () => {
      const activeSafe = { ...safe, status: 'active' };
      const tx = {
        user: {
          findFirst: jest.fn().mockResolvedValue({ id: 't1', role: 'recruiter', organizationId: 'org1' }),
          update: jest.fn().mockResolvedValue(activeSafe),
        },
        refreshToken: { updateMany: jest.fn() },
      };
      tenantPrisma.forTenant.mockImplementation(async (_c: unknown, fn: (t: unknown) => unknown) => fn(tx));
      const result = await service.setStatus(ctx, 't1', 'active', 'admin1');
      expect(result.status).toBe('active');
      expect(tx.refreshToken.updateMany).not.toHaveBeenCalled();
      expect(audit.record).toHaveBeenCalledWith(ctx, expect.objectContaining({ action: 'user.reactivated', actorUserId: 'admin1' }));
    });
  });

  describe('update', () => {
    const ctx = { organizationId: 'org1', isSuperAdmin: false };

    it('updates role and name for an in-org staff user', async () => {
      const tx = {
        user: {
          findFirst: jest.fn().mockResolvedValue({ id: 't1', role: 'recruiter', organizationId: 'org1' }),
          update: jest.fn().mockResolvedValue({ id: 't1', email: 'a@b.com', role: 'panel', name: 'Al', organizationId: 'org1', status: 'active', lastLoginAt: null, createdAt: new Date() }),
        },
      };
      tenantPrisma.forTenant.mockImplementation(async (_c: unknown, fn: (t: unknown) => unknown) => fn(tx));
      const result = await service.update(ctx, 't1', { role: 'panel', name: 'Al' }, 'admin1');
      expect(result.role).toBe('panel');
      expect(tx.user.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 't1' }, data: { role: 'panel', name: 'Al' } }));
      expect(audit.record).toHaveBeenCalledWith(ctx, expect.objectContaining({ action: 'user.updated', entityId: 't1', actorUserId: 'admin1' }));
    });

    it('refuses to modify a super_admin target', async () => {
      const tx = { user: { findFirst: jest.fn().mockResolvedValue({ id: 't1', role: 'super_admin', organizationId: null }) } };
      tenantPrisma.forTenant.mockImplementation(async (_c: unknown, fn: (t: unknown) => unknown) => fn(tx));
      await expect(service.update(ctx, 't1', { name: 'x' }, 'admin1')).rejects.toThrow(ForbiddenException);
    });

    it('throws NotFound when the target is out of scope', async () => {
      const tx = { user: { findFirst: jest.fn().mockResolvedValue(null) } };
      tenantPrisma.forTenant.mockImplementation(async (_c: unknown, fn: (t: unknown) => unknown) => fn(tx));
      await expect(service.update(ctx, 'nope', { name: 'x' }, 'admin1')).rejects.toThrow(NotFoundException);
    });

    it('updates only name without clobbering role when role is omitted', async () => {
      const tx = {
        user: {
          findFirst: jest.fn().mockResolvedValue({ id: 't1', role: 'recruiter', organizationId: 'org1' }),
          update: jest.fn().mockResolvedValue({ id: 't1', email: 'a@b.com', role: 'recruiter', name: 'X', organizationId: 'org1', status: 'active', lastLoginAt: null, createdAt: new Date() }),
        },
      };
      tenantPrisma.forTenant.mockImplementation(async (_c: unknown, fn: (t: unknown) => unknown) => fn(tx));
      await service.update(ctx, 't1', { name: 'X' }, 'admin1');
      expect(tx.user.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 't1' }, data: { name: 'X' } }));
    });

    it('persists managerId when updating a user\'s reporting manager', async () => {
      const tx = {
        user: {
          findFirst: jest.fn().mockResolvedValue({ id: 't1', role: 'recruiter', organizationId: 'org1' }),
          update: jest.fn().mockResolvedValue({ id: 't1', email: 'a@b.com', role: 'recruiter', name: 'Al', organizationId: 'org1', status: 'active', lastLoginAt: null, createdAt: new Date() }),
        },
      };
      tenantPrisma.forTenant.mockImplementation(async (_c: unknown, fn: (t: unknown) => unknown) => fn(tx));
      await service.update(ctx, 't1', { managerId: 'mgr1' }, 'admin1');
      expect(tx.user.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 't1' }, data: expect.objectContaining({ managerId: 'mgr1' }) }),
      );
    });

    it('refuses to set a user as their own manager', async () => {
      await expect(service.update(ctx, 't1', { managerId: 't1' }, 'admin1')).rejects.toThrow(
        new BadRequestException('A user cannot report to themselves'),
      );
    });
  });

  describe('requestPasswordReset', () => {
    const ctx = { organizationId: 'org1', isSuperAdmin: false };

    it('creates a reset token and emails the target', async () => {
      const tx = {
        organization: { findUnique: jest.fn().mockResolvedValue({ samlEnabled: false }) },
        user: { findFirst: jest.fn().mockResolvedValue({ id: 't1', email: 'a@b.com', role: 'recruiter', organizationId: 'org1' }) },
        passwordResetToken: { create: jest.fn().mockResolvedValue({ id: 'tok1' }) },
      };
      tenantPrisma.forTenant.mockImplementation(async (_c: unknown, fn: (t: unknown) => unknown) => fn(tx));
      const result = await service.requestPasswordReset(ctx, 't1', 'admin1');
      expect(result).toEqual({ success: true, emailSent: true });
      expect(tx.passwordResetToken.create).toHaveBeenCalled();
      // organizationId must reach EmailService so it resolves the org's own SMTP config
      // instead of silently falling back to the platform transporter (which has no
      // SMTP_HOST in production and fakes success via an Ethereal test account -- see
      // the "set-password link never arrives" incident this test was added to catch).
      expect(emailService.send).toHaveBeenCalledWith(expect.objectContaining({ to: 'a@b.com', organizationId: 'org1' }));
      expect(audit.record).toHaveBeenCalledWith(ctx, expect.objectContaining({ action: 'user.password_reset_requested' }));
    });

    it('skips the reset token and email when the org has SSO enabled', async () => {
      const tx = {
        organization: { findUnique: jest.fn().mockResolvedValue({ samlEnabled: true }) },
        user: { findFirst: jest.fn().mockResolvedValue({ id: 't1', email: 'a@b.com', role: 'recruiter', organizationId: 'org1' }) },
        passwordResetToken: { create: jest.fn() },
      };
      tenantPrisma.forTenant.mockImplementation(async (_c: unknown, fn: (t: unknown) => unknown) => fn(tx));

      const result = await service.requestPasswordReset(ctx, 't1', 'admin1');

      expect(result).toEqual({ success: true, emailSent: false });
      expect(tx.passwordResetToken.create).not.toHaveBeenCalled();
      expect(emailService.send).not.toHaveBeenCalled();
      expect(audit.record).toHaveBeenCalledWith(ctx, expect.objectContaining({ action: 'user.password_reset_requested' }));
    });

    // Regression for ADO #6850: requestPasswordReset previously fired the email off
    // fire-and-forget and always returned { success: true }, so a real SMTP failure
    // (rakesh.t@prudentconsulting.com never got his email) was invisible to the admin.
    it('reports emailSent: false when the email actually fails to send', async () => {
      const tx = {
        organization: { findUnique: jest.fn().mockResolvedValue({ samlEnabled: false }) },
        user: { findFirst: jest.fn().mockResolvedValue({ id: 't1', email: 'a@b.com', role: 'recruiter', organizationId: 'org1' }) },
        passwordResetToken: { create: jest.fn().mockResolvedValue({ id: 'tok1' }) },
      };
      tenantPrisma.forTenant.mockImplementation(async (_c: unknown, fn: (t: unknown) => unknown) => fn(tx));
      emailService.send.mockResolvedValueOnce({ success: false });

      const result = await service.requestPasswordReset(ctx, 't1', 'admin1');

      expect(result).toEqual({ success: true, emailSent: false });
    });

    it('throws NotFound when the target is out of scope', async () => {
      const tx = { user: { findFirst: jest.fn().mockResolvedValue(null) } };
      tenantPrisma.forTenant.mockImplementation(async (_c: unknown, fn: (t: unknown) => unknown) => fn(tx));
      await expect(service.requestPasswordReset(ctx, 'nope', 'admin1')).rejects.toThrow(NotFoundException);
    });

    it('rejects when there is no organization context', async () => {
      await expect(
        service.requestPasswordReset({ organizationId: null, isSuperAdmin: true }, 't1', 'admin1'),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('bulkCreate', () => {
    const ctx = { organizationId: 'org1', isSuperAdmin: false };
    it('creates new emails and skips existing ones', async () => {
      const created = { id: 'n1', email: 'new@b.com', role: 'recruiter', name: null, organizationId: 'org1', status: 'active', lastLoginAt: null, createdAt: new Date() };
      const tx = {
        organization: { findUnique: jest.fn().mockResolvedValue({ samlEnabled: false }) },
        user: {
          findFirst: jest.fn()
            .mockResolvedValueOnce({ id: 'dup' }) // exists@b.com -> skipped
            .mockResolvedValueOnce(null),          // new@b.com    -> created
          create: jest.fn().mockResolvedValue(created),
        },
        passwordResetToken: { create: jest.fn().mockResolvedValue({ id: 'tok' }) },
      };
      tenantPrisma.forTenant.mockImplementation(async (_c: unknown, fn: (t: unknown) => unknown) => fn(tx));
      const result = await service.bulkCreate(ctx, { emails: ['exists@b.com', 'new@b.com'], role: 'recruiter' }, 'admin1');
      expect(result.created).toHaveLength(1);
      expect(result.skipped).toEqual([{ email: 'exists@b.com', reason: 'already exists' }]);
      expect(emailService.send).toHaveBeenCalledTimes(1);
      expect(emailService.send).toHaveBeenCalledWith(expect.objectContaining({ to: 'new@b.com', organizationId: 'org1' }));
      // Fired once for the whole batch, not once per created user.
      expect(quota.checkSoftLimit).toHaveBeenCalledTimes(1);
      expect(quota.checkSoftLimit).toHaveBeenCalledWith(ctx, 'seats');
    });

    it('does not check the soft seat limit when nothing was created', async () => {
      const tx = {
        organization: { findUnique: jest.fn().mockResolvedValue({ samlEnabled: false }) },
        user: { findFirst: jest.fn().mockResolvedValue({ id: 'dup' }) },
      };
      tenantPrisma.forTenant.mockImplementation(async (_c: unknown, fn: (t: unknown) => unknown) => fn(tx));

      const result = await service.bulkCreate(ctx, { emails: ['exists@b.com'], role: 'recruiter' }, 'admin1');

      expect(result.created).toHaveLength(0);
      expect(quota.checkSoftLimit).not.toHaveBeenCalled();
    });

    it('still returns created users when the soft seat-limit check rejects', async () => {
      const created = { id: 'n1', email: 'new@b.com', role: 'recruiter', name: null, organizationId: 'org1', status: 'active', lastLoginAt: null, createdAt: new Date() };
      const tx = {
        organization: { findUnique: jest.fn().mockResolvedValue({ samlEnabled: false }) },
        user: { findFirst: jest.fn().mockResolvedValue(null), create: jest.fn().mockResolvedValue(created) },
        passwordResetToken: { create: jest.fn().mockResolvedValue({ id: 'tok' }) },
      };
      tenantPrisma.forTenant.mockImplementation(async (_c: unknown, fn: (t: unknown) => unknown) => fn(tx));
      quota.checkSoftLimit.mockRejectedValueOnce(new Error('billing DB unreachable'));

      const result = await service.bulkCreate(ctx, { emails: ['new@b.com'], role: 'recruiter' }, 'admin1');

      expect(result.created).toHaveLength(1);
      expect(result.created[0].id).toBe('n1');
    });

    it('creates users but sends no set-password email when the org has SSO enabled', async () => {
      const created = { id: 'n1', email: 'new@b.com', role: 'recruiter', name: null, organizationId: 'org1', status: 'active', lastLoginAt: null, createdAt: new Date() };
      const tx = {
        organization: { findUnique: jest.fn().mockResolvedValue({ samlEnabled: true }) },
        user: { findFirst: jest.fn().mockResolvedValue(null), create: jest.fn().mockResolvedValue(created) },
        passwordResetToken: { create: jest.fn() },
      };
      tenantPrisma.forTenant.mockImplementation(async (_c: unknown, fn: (t: unknown) => unknown) => fn(tx));

      const result = await service.bulkCreate(ctx, { emails: ['new@b.com'], role: 'recruiter' }, 'admin1');

      expect(result.created).toHaveLength(1);
      expect(tx.passwordResetToken.create).not.toHaveBeenCalled();
      expect(emailService.send).not.toHaveBeenCalled();
    });
  });
});
