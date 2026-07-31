const mockTransporterVerify = jest.fn();
jest.mock('nodemailer', () => ({
  createTransport: () => ({ verify: mockTransporterVerify }),
}));

const mockAnthropicCreate = jest.fn();
jest.mock('@anthropic-ai/sdk', () => jest.fn().mockImplementation(() => ({ messages: { create: mockAnthropicCreate } })));

const mockOpenAiCreate = jest.fn();
jest.mock('openai', () => jest.fn().mockImplementation(() => ({ chat: { completions: { create: mockOpenAiCreate } } })));

import { Test } from '@nestjs/testing';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { createHash } from 'crypto';
import { OrganizationsService } from './organizations.service';
import { PrismaService, TenantPrismaService, AuditService, OrgSecretsCryptoService, BlobStorageService } from '@exam-platform/shared';
import { EmailService } from '../email/email.service';

describe('OrganizationsService', () => {
  let service: OrganizationsService;
  let prisma: {
    organization: { findUnique: jest.Mock; create: jest.Mock; update: jest.Mock; findMany: jest.Mock; count: jest.Mock };
    plan: { findFirst: jest.Mock };
    webhookDelivery: { findMany: jest.Mock };
    user: { findMany: jest.Mock; groupBy: jest.Mock };
    exam: { groupBy: jest.Mock; findMany: jest.Mock };
    attempt: { count: jest.Mock };
  };
  let tenantPrisma: { forTenant: jest.Mock };
  let audit: { record: jest.Mock };
  let emailService: { send: jest.Mock };
  let cryptoService: { encrypt: jest.Mock; decrypt: jest.Mock };
  let blobStorage: { upload: jest.Mock; uploadDataUri: jest.Mock; signIfOurs: jest.Mock };

  beforeEach(async () => {
    mockTransporterVerify.mockReset();
    mockAnthropicCreate.mockReset();
    mockOpenAiCreate.mockReset();
    prisma = {
      organization: { findUnique: jest.fn(), create: jest.fn(), update: jest.fn(), findMany: jest.fn(), count: jest.fn() },
      plan: { findFirst: jest.fn() },
      webhookDelivery: { findMany: jest.fn() },
      user: { findMany: jest.fn(), groupBy: jest.fn() },
      exam: { groupBy: jest.fn(), findMany: jest.fn() },
      attempt: { count: jest.fn() },
    };
    tenantPrisma = { forTenant: jest.fn() };
    audit = { record: jest.fn() };
    emailService = { send: jest.fn().mockResolvedValue({ success: true }) };
    cryptoService = { encrypt: jest.fn(), decrypt: jest.fn() };
    blobStorage = { upload: jest.fn(), uploadDataUri: jest.fn(), signIfOurs: jest.fn(async (value: unknown) => value) };
    const moduleRef = await Test.createTestingModule({
      providers: [
        OrganizationsService,
        { provide: PrismaService, useValue: prisma },
        { provide: TenantPrismaService, useValue: tenantPrisma },
        { provide: AuditService, useValue: audit },
        { provide: EmailService, useValue: emailService },
        { provide: OrgSecretsCryptoService, useValue: cryptoService },
        { provide: BlobStorageService, useValue: blobStorage },
      ],
    }).compile();
    service = moduleRef.get(OrganizationsService);
  });

  describe('create', () => {
    it('creates an organization, its first org_admin, and a password-reset token', async () => {
      prisma.organization.findUnique.mockResolvedValue(null);
      prisma.plan.findFirst.mockResolvedValue({ id: 'trial-plan-1', name: 'trial' });
      prisma.organization.create.mockResolvedValue({ id: 'org-1', name: 'Acme', slug: 'acme', region: 'us', planId: 'trial-plan-1' });
      tenantPrisma.forTenant.mockImplementation(async (_context: unknown, fn: (tx: unknown) => unknown) =>
        fn({
          user: { create: jest.fn().mockResolvedValue({ id: 'admin-1', email: 'admin@acme.test', role: 'org_admin' }) },
          passwordResetToken: { create: jest.fn().mockResolvedValue({ id: 'token-1' }) },
        }),
      );

      const result = await service.create(
        { organizationId: null, isSuperAdmin: true },
        'super-1',
        { name: 'Acme', slug: 'acme', region: 'us', adminEmail: 'admin@acme.test' },
      );

      expect(result.slug).toBe('acme');
      expect(prisma.plan.findFirst).toHaveBeenCalledWith({ where: { name: 'trial' } });
      expect(prisma.organization.create).toHaveBeenCalledWith({
        data: { name: 'Acme', slug: 'acme', region: 'us', planId: 'trial-plan-1' },
      });
      expect(tenantPrisma.forTenant).toHaveBeenCalledWith(
        { organizationId: 'org-1', isSuperAdmin: true },
        expect.any(Function),
      );
      expect(audit.record).toHaveBeenCalledWith(
        { organizationId: null, isSuperAdmin: true },
        { actorUserId: 'super-1', action: 'organization.created', entityType: 'organization', entityId: 'org-1' },
      );
    });

    it('creates the first admin with role org_admin and a genuinely hashed random password', async () => {
      prisma.organization.findUnique.mockResolvedValue(null);
      prisma.plan.findFirst.mockResolvedValue({ id: 'trial-plan-1', name: 'trial' });
      prisma.organization.create.mockResolvedValue({ id: 'org-1', name: 'Acme', slug: 'acme', region: 'us', planId: 'trial-plan-1' });
      const userCreate = jest.fn().mockResolvedValue({ id: 'admin-1', email: 'admin@acme.test', role: 'org_admin' });
      tenantPrisma.forTenant.mockImplementation(async (_context: unknown, fn: (tx: unknown) => unknown) =>
        fn({ user: { create: userCreate }, passwordResetToken: { create: jest.fn().mockResolvedValue({ id: 'token-1' }) } }),
      );

      await service.create(
        { organizationId: null, isSuperAdmin: true },
        'super-1',
        { name: 'Acme', slug: 'acme', region: 'us', adminEmail: 'admin@acme.test' },
      );

      expect(userCreate).toHaveBeenCalledWith({
        data: expect.objectContaining({ organizationId: 'org-1', email: 'admin@acme.test', role: 'org_admin' }),
      });
      const passwordHash = userCreate.mock.calls[0][0].data.passwordHash;
      expect(passwordHash).toMatch(/^\$argon2/);
    });

    it('creates a password-reset token and emails a reset-password link whose token hashes to the stored value', async () => {
      prisma.organization.findUnique.mockResolvedValue(null);
      prisma.plan.findFirst.mockResolvedValue({ id: 'trial-plan-1', name: 'trial' });
      prisma.organization.create.mockResolvedValue({ id: 'org-1', name: 'Acme', slug: 'acme', region: 'us', planId: 'trial-plan-1' });
      const tokenCreate = jest.fn().mockResolvedValue({ id: 'token-1' });
      tenantPrisma.forTenant.mockImplementation(async (_context: unknown, fn: (tx: unknown) => unknown) =>
        fn({
          user: { create: jest.fn().mockResolvedValue({ id: 'admin-1', email: 'admin@acme.test', role: 'org_admin' }) },
          passwordResetToken: { create: tokenCreate },
        }),
      );

      await service.create(
        { organizationId: null, isSuperAdmin: true },
        'super-1',
        { name: 'Acme', slug: 'acme', region: 'us', adminEmail: 'admin@acme.test' },
      );
      // dispatchWelcomeEmail is fire-and-forget; flush microtasks so it has run.
      await new Promise((resolve) => setImmediate(resolve));

      expect(tokenCreate).toHaveBeenCalledWith({
        data: expect.objectContaining({ userId: 'admin-1', expiresAt: expect.any(Date) }),
      });
      const storedTokenHash = tokenCreate.mock.calls[0][0].data.tokenHash;

      expect(emailService.send).toHaveBeenCalledWith(expect.objectContaining({ to: 'admin@acme.test' }));
      const htmlContent = emailService.send.mock.calls[0][0].html as string;
      const match = htmlContent.match(/\/reset-password\/([a-f0-9]+)/);
      expect(match).not.toBeNull();
      const rawTokenFromEmail = match![1];
      expect(createHash('sha256').update(rawTokenFromEmail).digest('hex')).toBe(storedTokenHash);
    });

    it('rejects a duplicate slug without creating any user or token', async () => {
      prisma.organization.findUnique.mockResolvedValue({ id: 'existing-org' });

      await expect(
        service.create({ organizationId: null, isSuperAdmin: true }, 'super-1', {
          name: 'Acme 2',
          slug: 'acme',
          region: 'us',
          adminEmail: 'admin@acme.test',
        }),
      ).rejects.toThrow(ConflictException);
      expect(prisma.organization.create).not.toHaveBeenCalled();
      expect(tenantPrisma.forTenant).not.toHaveBeenCalled();
    });

    it('throws if no trial plan is configured', async () => {
      prisma.organization.findUnique.mockResolvedValue(null);
      prisma.plan.findFirst.mockResolvedValue(null);

      await expect(
        service.create({ organizationId: null, isSuperAdmin: true }, 'super-1', {
          name: 'Acme',
          slug: 'acme',
          region: 'us',
          adminEmail: 'admin@acme.test',
        }),
      ).rejects.toThrow();
      expect(prisma.organization.create).not.toHaveBeenCalled();
    });
  });

  describe('list', () => {
    // Mirrors ORGANIZATION_LIST_SELECT in the service. Deliberately duplicated
    // rather than imported: if someone widens the service's select to include a
    // secret, these assertions must fail rather than silently follow it.
    const LIST_SELECT = {
      id: true,
      name: true,
      slug: true,
      region: true,
      status: true,
      createdAt: true,
    };

    // `users` and `exams` carry RLS filter predicates, so the service reads them
    // through forTenant's super-admin bypass. Run the callback against the same
    // mocked client so the enrichment queries are observable.
    function runForTenantAgainstMock() {
      tenantPrisma.forTenant.mockImplementation((_ctx: unknown, fn: (tx: unknown) => unknown) => fn(prisma));
    }

    function seedEnrichment() {
      runForTenantAgainstMock();
      prisma.user.findMany.mockResolvedValue([]);
      prisma.user.groupBy.mockResolvedValue([]);
      prisma.exam.groupBy.mockResolvedValue([]);
    }

    beforeEach(seedEnrichment);

    it('returns a paginated page of organizations ordered by newest first', async () => {
      prisma.organization.findMany.mockResolvedValue([
        { id: 'org-2', name: 'Beta', slug: 'beta', region: 'eu', createdAt: new Date('2026-01-02') },
        { id: 'org-1', name: 'Acme', slug: 'acme', region: 'us', createdAt: new Date('2026-01-01') },
      ]);
      prisma.organization.count.mockResolvedValue(2);

      const result = await service.list();

      expect(result).toEqual({
        data: expect.arrayContaining([expect.objectContaining({ id: 'org-2' }), expect.objectContaining({ id: 'org-1' })]),
        total: 2,
        page: 1,
        pageSize: 20,
        totalPages: 1,
      });
      expect(prisma.organization.findMany).toHaveBeenCalledWith({
        where: { status: { not: 'deleted' } },
        select: LIST_SELECT,
        orderBy: { createdAt: 'desc' },
        skip: 0,
        take: 20,
      });
    });

    it('filters by name or slug when search is provided', async () => {
      prisma.organization.findMany.mockResolvedValue([{ id: 'org-1', name: 'Acme', slug: 'acme', region: 'us', createdAt: new Date('2026-01-01') }]);
      prisma.organization.count.mockResolvedValue(1);

      await service.list({ search: 'acm' });

      expect(prisma.organization.findMany).toHaveBeenCalledWith({
        where: { status: { not: 'deleted' }, OR: [{ name: { contains: 'acm' } }, { slug: { contains: 'acm' } }] },
        select: LIST_SELECT,
        orderBy: { createdAt: 'desc' },
        skip: 0,
        take: 20,
      });
    });

    it('selects only non-sensitive columns', async () => {
      // Without an explicit select, Prisma returns every scalar column and the
      // controller hands them straight to the browser -- including
      // smtpPasswordEncrypted, aiApiKeyEncrypted, apiKeyHash,
      // webhookSecretEncrypted and samlIdpCertificate. Asserting on the response
      // would only test the mock, so assert on the call: that is the real contract.
      prisma.organization.findMany.mockResolvedValue([]);
      prisma.organization.count.mockResolvedValue(0);

      await service.list();

      const { select } = prisma.organization.findMany.mock.calls[0][0];
      expect(select).toEqual({
        id: true,
        name: true,
        slug: true,
        region: true,
        status: true,
        createdAt: true,
      });
      for (const key of Object.keys(select)) {
        expect(key).not.toMatch(/encrypted|hash|certificate|secret/i);
      }
    });

    describe('enrichment (primary admin + counts)', () => {
      function seedTwoOrgs() {
        prisma.organization.findMany.mockResolvedValue([
          { id: 'org-1', name: 'Acme', slug: 'acme', region: 'us', status: 'active', createdAt: new Date('2026-01-01') },
          { id: 'org-2', name: 'Beta', slug: 'beta', region: 'eu', status: 'active', createdAt: new Date('2026-01-02') },
        ]);
        prisma.organization.count.mockResolvedValue(2);
        prisma.user.findMany.mockResolvedValue([
          { organizationId: 'org-1', name: 'Ada', email: 'ada@acme.test', createdAt: new Date('2026-01-01') },
          { organizationId: 'org-1', name: 'Bob', email: 'bob@acme.test', createdAt: new Date('2026-02-01') },
        ]);
        prisma.user.groupBy.mockResolvedValue([{ organizationId: 'org-1', _count: { _all: 5 } }]);
        prisma.exam.groupBy.mockResolvedValue([{ organizationId: 'org-1', _count: { _all: 3 } }]);
      }

      it('returns the earliest org_admin as the primary admin', async () => {
        seedTwoOrgs();

        const result = await service.list();

        expect(result.data[0]).toMatchObject({
          id: 'org-1',
          primaryAdminName: 'Ada',
          primaryAdminEmail: 'ada@acme.test',
        });
      });

      it('asks the database for org_admins oldest-first, since the first seen wins', async () => {
        seedTwoOrgs();

        await service.list();

        expect(prisma.user.findMany).toHaveBeenCalledWith({
          where: { organizationId: { in: ['org-1', 'org-2'] }, role: 'org_admin' },
          select: { organizationId: true, name: true, email: true, createdAt: true },
          orderBy: { createdAt: 'asc' },
        });
      });

      it('returns a null primary admin for an organization with no org_admin', async () => {
        seedTwoOrgs();

        const result = await service.list();

        expect(result.data[1]).toMatchObject({
          id: 'org-2',
          primaryAdminName: null,
          primaryAdminEmail: null,
        });
      });

      it('renders a name-less admin as null rather than inventing one', async () => {
        // User.name is nullable and organization creation does not set it, so a
        // freshly created org has an admin with an email but no name.
        seedTwoOrgs();
        prisma.user.findMany.mockResolvedValue([
          { organizationId: 'org-1', name: null, email: 'ada@acme.test', createdAt: new Date('2026-01-01') },
        ]);

        const result = await service.list();

        expect(result.data[0]).toMatchObject({ primaryAdminName: null, primaryAdminEmail: 'ada@acme.test' });
      });

      it('returns user and exam counts, defaulting to zero', async () => {
        seedTwoOrgs();

        const result = await service.list();

        expect(result.data[0]).toMatchObject({ userCount: 5, examCount: 3 });
        expect(result.data[1]).toMatchObject({ userCount: 0, examCount: 0 });
      });

      it('reads the RLS-protected tables through the super-admin bypass', async () => {
        // `users` and `exams` carry RLS filter predicates. On the raw client the
        // predicate sees no session context, matches nothing, and every count
        // silently reads 0 -- no error, just wrong numbers.
        seedTwoOrgs();

        await service.list();

        expect(tenantPrisma.forTenant).toHaveBeenCalledWith(
          { organizationId: null, isSuperAdmin: true },
          expect.any(Function),
        );
      });

      it('issues a constant number of queries regardless of organization count', async () => {
        // One forTenant call holds one pooled connection; per-organization
        // queries would hold 3N and the pool is this platform's known ceiling.
        seedTwoOrgs();
        prisma.organization.findMany.mockResolvedValue(
          Array.from({ length: 25 }, (_, i) => ({
            id: `org-${i}`, name: `Org ${i}`, slug: `org-${i}`, region: 'us', status: 'active', createdAt: new Date('2026-01-01'),
          })),
        );

        await service.list();

        expect(tenantPrisma.forTenant).toHaveBeenCalledTimes(1);
        expect(prisma.user.findMany).toHaveBeenCalledTimes(1);
        expect(prisma.user.groupBy).toHaveBeenCalledTimes(1);
        expect(prisma.exam.groupBy).toHaveBeenCalledTimes(1);
      });

      it('does not open a transaction when there are no organizations', async () => {
        prisma.organization.findMany.mockResolvedValue([]);
        prisma.organization.count.mockResolvedValue(0);

        const result = await service.list();

        expect(result.data).toEqual([]);
        expect(tenantPrisma.forTenant).not.toHaveBeenCalled();
      });
    });
  });

  describe('updatePlatform', () => {
    beforeEach(() => {
      // updatePlatform re-enriches the updated row, which reads RLS-protected
      // tables through forTenant.
      tenantPrisma.forTenant.mockImplementation((_ctx: unknown, fn: (tx: unknown) => unknown) => fn(prisma));
      prisma.user.findMany.mockResolvedValue([]);
      prisma.user.groupBy.mockResolvedValue([]);
      prisma.exam.groupBy.mockResolvedValue([]);
    });

    function seedExisting() {
      prisma.organization.findUnique.mockResolvedValue({ id: 'org-1', name: 'Acme', slug: 'acme', region: 'us', status: 'active' });
      prisma.organization.update.mockResolvedValue({
        id: 'org-1', name: 'Acme Inc', slug: 'acme', region: 'eu', status: 'active', createdAt: new Date('2026-01-01'),
      });
    }

    it('updates name and region and audits the change', async () => {
      seedExisting();

      const result = await service.updatePlatform('actor-1', 'org-1', { name: 'Acme Inc', region: 'eu' });

      expect(prisma.organization.update).toHaveBeenCalledWith({
        where: { id: 'org-1' },
        data: { name: 'Acme Inc', region: 'eu' },
        select: expect.objectContaining({ id: true, name: true, slug: true, status: true }),
      });
      expect(result).toMatchObject({ id: 'org-1', name: 'Acme Inc', region: 'eu' });
      expect(audit.record).toHaveBeenCalledWith(
        { organizationId: 'org-1', isSuperAdmin: true },
        { actorUserId: 'actor-1', action: 'platform.organization_updated', entityType: 'organization', entityId: 'org-1' },
      );
    });

    it('omits fields the caller did not send', async () => {
      seedExisting();

      await service.updatePlatform('actor-1', 'org-1', { name: 'Acme Inc' });

      expect(prisma.organization.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { name: 'Acme Inc' } }),
      );
    });

    it('never writes the slug, even if one is smuggled into the payload', async () => {
      // The slug appears in invitation URLs and SAML entity IDs; changing it
      // would break live links. The DTO has no slug field, but a stray property
      // must not reach Prisma either.
      seedExisting();

      await service.updatePlatform('actor-1', 'org-1', { name: 'Acme Inc', slug: 'hijacked' } as never);

      const data = prisma.organization.update.mock.calls[0][0].data;
      expect(data).not.toHaveProperty('slug');
    });

    it('returns the row re-enriched, not fabricated zeros', async () => {
      seedExisting();
      prisma.user.groupBy.mockResolvedValue([{ organizationId: 'org-1', _count: { _all: 7 } }]);
      prisma.exam.groupBy.mockResolvedValue([{ organizationId: 'org-1', _count: { _all: 2 } }]);

      const result = await service.updatePlatform('actor-1', 'org-1', { name: 'Acme Inc' });

      expect(result).toMatchObject({ userCount: 7, examCount: 2 });
    });

    it('throws NotFound for an unknown organization and writes nothing', async () => {
      prisma.organization.findUnique.mockResolvedValue(null);

      await expect(service.updatePlatform('actor-1', 'nope', { name: 'X' })).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.organization.update).not.toHaveBeenCalled();
      expect(audit.record).not.toHaveBeenCalled();
    });
  });

  describe('setStatus', () => {
    beforeEach(() => {
      tenantPrisma.forTenant.mockImplementation((_ctx: unknown, fn: (tx: unknown) => unknown) => fn(prisma));
      prisma.user.findMany.mockResolvedValue([]);
      prisma.user.groupBy.mockResolvedValue([]);
      prisma.exam.groupBy.mockResolvedValue([]);
    });

    it('suspends an organization and audits it', async () => {
      prisma.organization.findUnique.mockResolvedValue({ id: 'org-1', name: 'Acme', slug: 'acme', status: 'active' });
      prisma.organization.update.mockResolvedValue({
        id: 'org-1', name: 'Acme', slug: 'acme', region: 'us', status: 'suspended', createdAt: new Date('2026-01-01'),
      });

      const result = await service.setStatus('actor-1', 'org-1', 'suspended');

      expect(prisma.organization.update).toHaveBeenCalledWith({
        where: { id: 'org-1' },
        data: { status: 'suspended' },
        select: expect.objectContaining({ status: true }),
      });
      expect(result.status).toBe('suspended');
      expect(audit.record).toHaveBeenCalledWith(
        { organizationId: 'org-1', isSuperAdmin: true },
        { actorUserId: 'actor-1', action: 'platform.organization_suspended', entityType: 'organization', entityId: 'org-1' },
      );
    });

    it('records a distinct audit action when reactivating', async () => {
      prisma.organization.findUnique.mockResolvedValue({ id: 'org-1', name: 'Acme', slug: 'acme', status: 'suspended' });
      prisma.organization.update.mockResolvedValue({
        id: 'org-1', name: 'Acme', slug: 'acme', region: 'us', status: 'active', createdAt: new Date('2026-01-01'),
      });

      await service.setStatus('actor-1', 'org-1', 'active');

      expect(audit.record).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ action: 'platform.organization_reactivated' }),
      );
    });

    it('refuses to reactivate a deleted organization', async () => {
      // Reactivating through this endpoint would be a silent undelete that
      // bypasses whatever restore flow we eventually build.
      prisma.organization.findUnique.mockResolvedValue({ id: 'org-1', name: 'Acme', slug: 'acme', status: 'deleted' });

      await expect(service.setStatus('actor-1', 'org-1', 'active')).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.organization.update).not.toHaveBeenCalled();
    });

    it('throws NotFound for an unknown organization', async () => {
      prisma.organization.findUnique.mockResolvedValue(null);

      await expect(service.setStatus('actor-1', 'nope', 'suspended')).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.organization.update).not.toHaveBeenCalled();
    });
  });

  describe('softDelete', () => {
    beforeEach(() => {
      tenantPrisma.forTenant.mockImplementation((_ctx: unknown, fn: (tx: unknown) => unknown) => fn(prisma));
      prisma.user.findMany.mockResolvedValue([]);
      prisma.user.groupBy.mockResolvedValue([]);
      prisma.exam.groupBy.mockResolvedValue([]);
      prisma.exam.findMany.mockResolvedValue([{ id: 'exam-1' }]);
      prisma.attempt.count.mockResolvedValue(0);
    });

    function seedActive() {
      prisma.organization.findUnique.mockResolvedValue({ id: 'org-1', name: 'Acme', slug: 'acme', status: 'active' });
      prisma.organization.update.mockResolvedValue({ id: 'org-1', status: 'deleted' });
    }

    it('marks the organization deleted and audits it', async () => {
      seedActive();

      const result = await service.softDelete('actor-1', 'org-1');

      expect(prisma.organization.update).toHaveBeenCalledWith({
        where: { id: 'org-1' },
        data: { status: 'deleted' },
        select: { id: true, status: true },
      });
      expect(result).toEqual({ id: 'org-1', status: 'deleted' });
      expect(audit.record).toHaveBeenCalledWith(
        { organizationId: 'org-1', isSuperAdmin: true },
        { actorUserId: 'actor-1', action: 'platform.organization_deleted', entityType: 'organization', entityId: 'org-1' },
      );
    });

    it('refuses while an exam is in progress and leaves the status unchanged', async () => {
      seedActive();
      prisma.attempt.count.mockResolvedValue(2);

      await expect(service.softDelete('actor-1', 'org-1')).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.organization.update).not.toHaveBeenCalled();
      expect(audit.record).not.toHaveBeenCalled();
    });

    it('scopes the live-attempt count to the org via its exam ids', async () => {
      // Attempt has no `exam` relation -- only a scalar examId -- so the org
      // filter has to go through exam ids. `exams` IS RLS-protected, hence the
      // super-admin bypass; without it the exam list comes back empty and the
      // guard would pass while an exam was live.
      seedActive();

      await service.softDelete('actor-1', 'org-1');

      expect(tenantPrisma.forTenant).toHaveBeenCalledWith(
        { organizationId: 'org-1', isSuperAdmin: true },
        expect.any(Function),
      );
      expect(prisma.exam.findMany).toHaveBeenCalledWith({ where: { organizationId: 'org-1' }, select: { id: true } });
      expect(prisma.attempt.count).toHaveBeenCalledWith({
        where: { status: 'in_progress', examId: { in: ['exam-1'] } },
      });
    });

    it('skips the attempt count entirely for an organization with no exams', async () => {
      seedActive();
      prisma.exam.findMany.mockResolvedValue([]);

      await service.softDelete('actor-1', 'org-1');

      expect(prisma.attempt.count).not.toHaveBeenCalled();
      expect(prisma.organization.update).toHaveBeenCalled();
    });

    it('is idempotent for an already-deleted organization', async () => {
      prisma.organization.findUnique.mockResolvedValue({ id: 'org-1', name: 'Acme', slug: 'acme', status: 'deleted' });

      const result = await service.softDelete('actor-1', 'org-1');

      expect(result).toEqual({ id: 'org-1', status: 'deleted' });
      expect(prisma.organization.update).not.toHaveBeenCalled();
    });

    it('throws NotFound for an unknown organization', async () => {
      prisma.organization.findUnique.mockResolvedValue(null);

      await expect(service.softDelete('actor-1', 'nope')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('excludes deleted organizations from the list', async () => {
      prisma.organization.findMany.mockResolvedValue([]);
      prisma.organization.count.mockResolvedValue(0);

      await service.list();

      expect(prisma.organization.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ status: { not: 'deleted' } }) }),
      );
    });
  });

  describe('getBranding', () => {
    it('returns null logoUrl/colors for an org with nothing set', async () => {
      prisma.organization.findUnique.mockResolvedValue({ id: 'org-1', name: 'Acme Corp', logoPath: null, primaryColor: null, accentColor: null });

      const result = await service.getBranding({ organizationId: 'org-1', isSuperAdmin: false });

      expect(result).toEqual({ name: 'Acme Corp', logoUrl: null, primaryColor: null, accentColor: null });
    });

    it('returns logoUrl as the stored logoPath blob URL', async () => {
      prisma.organization.findUnique.mockResolvedValue({ id: 'org-1', name: 'Acme Corp', logoPath: 'https://sfstoragepoc.blob.core.windows.net/ptc-vss-sf-interview-storage-container/logos/org-1.png', primaryColor: '#1a73e8', accentColor: '#fbbc04' });

      const result = await service.getBranding({ organizationId: 'org-1', isSuperAdmin: false });

      expect(result).toEqual({ name: 'Acme Corp', logoUrl: 'https://sfstoragepoc.blob.core.windows.net/ptc-vss-sf-interview-storage-container/logos/org-1.png', primaryColor: '#1a73e8', accentColor: '#fbbc04' });
    });

    it('throws BadRequestException when the caller has no organization context', async () => {
      await expect(service.getBranding({ organizationId: null, isSuperAdmin: true })).rejects.toThrow(BadRequestException);
      expect(prisma.organization.findUnique).not.toHaveBeenCalled();
    });

    // The blob container is private, so an unsigned logo URL 403s in the
    // browser -- an <img src> or a favicon href pointing at it renders nothing.
    // signIfOurs is mocked as a pass-through here (matching its real behaviour
    // when storage is unconfigured), which means dropping the call would leave
    // every other assertion in this file green. Assert the call itself.
    it('signs the logo URL, because the container is private', async () => {
      const logoPath = 'https://sfstoragepoc.blob.core.windows.net/ptc-vss-sf-interview-storage-container/logos/org-1.png';
      prisma.organization.findUnique.mockResolvedValue({ id: 'org-1', name: 'Acme Corp', logoPath, primaryColor: null, accentColor: null });
      blobStorage.signIfOurs.mockResolvedValueOnce(`${logoPath}?sig=redacted`);

      const result = await service.getBranding({ organizationId: 'org-1', isSuperAdmin: false });

      expect(blobStorage.signIfOurs).toHaveBeenCalledWith(logoPath);
      expect(result.logoUrl).toBe(`${logoPath}?sig=redacted`);
    });

    it('passes null through signing rather than fabricating a URL', async () => {
      prisma.organization.findUnique.mockResolvedValue({ id: 'org-1', name: 'Acme Corp', logoPath: null, primaryColor: null, accentColor: null });

      const result = await service.getBranding({ organizationId: 'org-1', isSuperAdmin: false });

      expect(result.logoUrl).toBeNull();
    });
  });

  describe('updateBrandingColors', () => {
    it('updates only the provided fields and returns the fresh branding', async () => {
      prisma.organization.update.mockResolvedValue({ id: 'org-1', name: 'Acme Corp', logoPath: null, primaryColor: '#1a73e8', accentColor: null });

      const result = await service.updateBrandingColors({ organizationId: 'org-1', isSuperAdmin: false }, 'user-1', { primaryColor: '#1a73e8' });

      expect(prisma.organization.update).toHaveBeenCalledWith({ where: { id: 'org-1' }, data: { primaryColor: '#1a73e8' } });
      expect(audit.record).toHaveBeenCalledWith(
        { organizationId: 'org-1', isSuperAdmin: false },
        { actorUserId: 'user-1', action: 'organization.branding_updated', entityType: 'organization', entityId: 'org-1' },
      );
      expect(result).toEqual({ name: 'Acme Corp', logoUrl: null, primaryColor: '#1a73e8', accentColor: null });
    });

    it('throws BadRequestException when the caller has no organization context', async () => {
      await expect(
        service.updateBrandingColors({ organizationId: null, isSuperAdmin: true }, 'user-1', { primaryColor: '#1a73e8' }),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.organization.update).not.toHaveBeenCalled();
    });
  });

  describe('uploadLogo', () => {
    const pngFile = { mimetype: 'image/png', size: 1024, buffer: Buffer.from('fake-png-bytes') } as Express.Multer.File;

    beforeEach(() => {
      blobStorage.upload.mockReset().mockResolvedValue('https://sfstoragepoc.blob.core.windows.net/ptc-vss-sf-interview-storage-container/logos/org-1.png');
    });

    it('uploads the file to blob storage under logos/{orgId} and updates logoPath', async () => {
      prisma.organization.update.mockResolvedValue({
        id: 'org-1',
        logoPath: 'https://sfstoragepoc.blob.core.windows.net/ptc-vss-sf-interview-storage-container/logos/org-1.png',
        primaryColor: null,
        accentColor: null,
      });

      const result = await service.uploadLogo({ organizationId: 'org-1', isSuperAdmin: false }, 'user-1', pngFile);

      expect(blobStorage.upload).toHaveBeenCalledWith(expect.stringContaining('logos/org-1-'), pngFile.buffer, 'image/png');
      expect(prisma.organization.update).toHaveBeenCalledWith({
        where: { id: 'org-1' },
        data: { logoPath: 'https://sfstoragepoc.blob.core.windows.net/ptc-vss-sf-interview-storage-container/logos/org-1.png' },
      });
      expect(audit.record).toHaveBeenCalledWith(
        { organizationId: 'org-1', isSuperAdmin: false },
        { actorUserId: 'user-1', action: 'organization.logo_updated', entityType: 'organization', entityId: 'org-1' },
      );
      expect(result.logoUrl).toBe('https://sfstoragepoc.blob.core.windows.net/ptc-vss-sf-interview-storage-container/logos/org-1.png');
    });

    it('rejects a non-image mimetype without uploading anything', async () => {
      const badFile = { mimetype: 'application/pdf', size: 1024, buffer: Buffer.from('x') } as Express.Multer.File;

      await expect(service.uploadLogo({ organizationId: 'org-1', isSuperAdmin: false }, 'user-1', badFile)).rejects.toThrow(BadRequestException);
      expect(blobStorage.upload).not.toHaveBeenCalled();
    });

    it('rejects a file over 2MB without uploading anything', async () => {
      const bigFile = { mimetype: 'image/png', size: 2 * 1024 * 1024 + 1, buffer: Buffer.from('x') } as Express.Multer.File;

      await expect(service.uploadLogo({ organizationId: 'org-1', isSuperAdmin: false }, 'user-1', bigFile)).rejects.toThrow(BadRequestException);
      expect(blobStorage.upload).not.toHaveBeenCalled();
    });

    it('throws BadRequestException when the caller has no organization context', async () => {
      await expect(service.uploadLogo({ organizationId: null, isSuperAdmin: true }, 'user-1', pngFile)).rejects.toThrow(BadRequestException);
      expect(blobStorage.upload).not.toHaveBeenCalled();
    });
  });

  describe('getPublicBrandingBySlug', () => {
    it('returns branding for an existing slug, with no auth/tenant context required', async () => {
      prisma.organization.findUnique.mockResolvedValue({ id: 'org-1', name: 'Acme Corp', logoPath: 'https://sfstoragepoc.blob.core.windows.net/ptc-vss-sf-interview-storage-container/logos/org-1.png', primaryColor: '#1a73e8', accentColor: null });

      const result = await service.getPublicBrandingBySlug('acme');

      expect(prisma.organization.findUnique).toHaveBeenCalledWith({ where: { slug: 'acme' } });
      expect(result).toEqual({ name: 'Acme Corp', logoUrl: 'https://sfstoragepoc.blob.core.windows.net/ptc-vss-sf-interview-storage-container/logos/org-1.png', primaryColor: '#1a73e8', accentColor: null });
    });

    it('throws NotFoundException for an unknown slug', async () => {
      prisma.organization.findUnique.mockResolvedValue(null);

      await expect(service.getPublicBrandingBySlug('nope')).rejects.toThrow(NotFoundException);
    });
  });

  describe('getUsage', () => {
    const context = { organizationId: 'org-1', isSuperAdmin: false };

    it('returns the plan limit alongside a zero breakdown for an org with no usage yet', async () => {
      prisma.organization.findUnique.mockResolvedValue({ id: 'org-1', plan: { aiCreditLimit: 100 } });
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) =>
        fn({ aiCreditUsage: { groupBy: jest.fn().mockResolvedValue([]) } }),
      );

      const result = await service.getUsage(context);

      expect(result).toEqual({
        aiCreditLimit: 100,
        totalUsed: 0,
        breakdown: { questionGeneration: 0, insightGeneration: 0 },
      });
    });

    it('sums usage per source into the breakdown', async () => {
      prisma.organization.findUnique.mockResolvedValue({ id: 'org-1', plan: { aiCreditLimit: 100 } });
      const groupBy = jest.fn().mockResolvedValue([
        { source: 'question_generation', _sum: { credits: 7 } },
        { source: 'insight_generation', _sum: { credits: 3 } },
      ]);
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn({ aiCreditUsage: { groupBy } }));

      const result = await service.getUsage(context);

      expect(result).toEqual({
        aiCreditLimit: 100,
        totalUsed: 10,
        breakdown: { questionGeneration: 7, insightGeneration: 3 },
      });
      expect(groupBy).toHaveBeenCalledWith({
        by: ['source'],
        where: { organizationId: 'org-1' },
        _sum: { credits: true },
      });
    });
  });

  describe('getIntegrations', () => {
    it('reports both as unconfigured for an org with nothing set', async () => {
      prisma.organization.findUnique.mockResolvedValue({
        smtpHost: null, smtpPort: null, emailFromAddress: null, aiApiKeyEncrypted: null, smtpPasswordEncrypted: null,
        aiProvider: 'anthropic', aiBaseUrl: null, aiModelFast: null, aiModelStandard: null,
        apiKeyHash: null, apiKeyPrefix: null, apiKeyCreatedAt: null, webhookUrl: null,
      });

      const result = await service.getIntegrations({ organizationId: 'org-1', isSuperAdmin: false });

      expect(result).toEqual({
        smtpConfigured: false, aiKeyConfigured: false, aiProvider: 'anthropic', aiBaseUrl: null, aiModelFast: null, aiModelStandard: null,
        smtpHost: null, smtpPort: null, emailFromAddress: null,
        apiKeyConfigured: false, apiKeyPrefix: null, apiKeyCreatedAt: null,
        webhookConfigured: false, webhookUrl: null,
      });
    });

    it('reports configured booleans and the non-secret SMTP fields, never the secrets themselves', async () => {
      const apiKeyCreatedAt = new Date('2026-01-01');
      prisma.organization.findUnique.mockResolvedValue({
        smtpHost: 'smtp.customer.test', smtpPort: 465, emailFromAddress: 'no-reply@customer.test',
        aiApiKeyEncrypted: 'encrypted-blob', smtpPasswordEncrypted: 'also-encrypted',
        aiProvider: 'anthropic', aiBaseUrl: null, aiModelFast: null, aiModelStandard: null,
        apiKeyHash: 'hashed-key', apiKeyPrefix: 'pk_live_abcd', apiKeyCreatedAt,
        webhookUrl: 'https://customer.test/webhook',
      });

      const result = await service.getIntegrations({ organizationId: 'org-1', isSuperAdmin: false });

      expect(result).toEqual({
        smtpConfigured: true, aiKeyConfigured: true, aiProvider: 'anthropic', aiBaseUrl: null, aiModelFast: null, aiModelStandard: null,
        smtpHost: 'smtp.customer.test', smtpPort: 465, emailFromAddress: 'no-reply@customer.test',
        apiKeyConfigured: true, apiKeyPrefix: 'pk_live_abcd', apiKeyCreatedAt,
        webhookConfigured: true, webhookUrl: 'https://customer.test/webhook',
      });
      expect(result).not.toHaveProperty('smtpPasswordEncrypted');
      expect(result).not.toHaveProperty('aiApiKeyEncrypted');
      expect(result).not.toHaveProperty('apiKeyHash');
    });

    it('throws BadRequestException when the caller has no organization context', async () => {
      await expect(service.getIntegrations({ organizationId: null, isSuperAdmin: true })).rejects.toThrow(BadRequestException);
      expect(prisma.organization.findUnique).not.toHaveBeenCalled();
    });
  });

  describe('updateSmtpSettings', () => {
    const dto = { host: 'smtp.customer.test', port: 587, user: 'customer-user', password: 'customer-pass', fromAddress: 'no-reply@customer.test' };

    it('validates via a real transporter.verify() call, then encrypts and persists on success', async () => {
      mockTransporterVerify.mockResolvedValue(true);
      cryptoService.encrypt.mockReturnValue('encrypted-password-blob');
      prisma.organization.update.mockResolvedValue({});

      const result = await service.updateSmtpSettings({ organizationId: 'org-1', isSuperAdmin: false }, 'user-1', dto);

      expect(mockTransporterVerify).toHaveBeenCalledTimes(1);
      expect(cryptoService.encrypt).toHaveBeenCalledWith('customer-pass');
      expect(prisma.organization.update).toHaveBeenCalledWith({
        where: { id: 'org-1' },
        data: {
          smtpHost: 'smtp.customer.test', smtpPort: 587, smtpUser: 'customer-user',
          smtpPasswordEncrypted: 'encrypted-password-blob', emailFromAddress: 'no-reply@customer.test',
        },
      });
      expect(audit.record).toHaveBeenCalledWith(
        { organizationId: 'org-1', isSuperAdmin: false },
        { actorUserId: 'user-1', action: 'organization.smtp_configured', entityType: 'organization', entityId: 'org-1' },
      );
      expect(result).toEqual({ smtpConfigured: true });
    });

    it('rejects with BadRequestException and persists nothing when verify() fails', async () => {
      mockTransporterVerify.mockRejectedValue(new Error('Invalid login'));

      await expect(
        service.updateSmtpSettings({ organizationId: 'org-1', isSuperAdmin: false }, 'user-1', dto),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.organization.update).not.toHaveBeenCalled();
      expect(audit.record).not.toHaveBeenCalled();
    });

    it('throws BadRequestException when the caller has no organization context', async () => {
      await expect(
        service.updateSmtpSettings({ organizationId: null, isSuperAdmin: true }, 'user-1', dto),
      ).rejects.toThrow(BadRequestException);
      expect(mockTransporterVerify).not.toHaveBeenCalled();
    });
  });

  describe('generateApiKey', () => {
    it('stores a hashed key and returns the full key exactly once', async () => {
      prisma.organization.update.mockResolvedValue({ id: 'org-1' });

      const result = await service.generateApiKey({ organizationId: 'org-1', isSuperAdmin: false }, 'user-1');

      expect(result.apiKey).toMatch(/^pk_live_[0-9a-f]{64}$/);
      expect(result.apiKeyPrefix).toBe(result.apiKey.slice(0, 12));
      expect(prisma.organization.update).toHaveBeenCalledWith({
        where: { id: 'org-1' },
        data: expect.objectContaining({
          apiKeyHash: expect.any(String),
          apiKeyPrefix: result.apiKeyPrefix,
          apiKeyCreatedAt: expect.any(Date),
        }),
      });
      const writtenHash = prisma.organization.update.mock.calls[0][0].data.apiKeyHash;
      expect(writtenHash).not.toBe(result.apiKey);
      expect(writtenHash).toHaveLength(64);
      expect(audit.record).toHaveBeenCalledWith(
        { organizationId: 'org-1', isSuperAdmin: false },
        expect.objectContaining({ action: 'organization.api_key_generated' }),
      );
    });

    it('overwrites a previous key on regeneration, invalidating it', async () => {
      prisma.organization.update.mockResolvedValue({ id: 'org-1' });

      const first = await service.generateApiKey({ organizationId: 'org-1', isSuperAdmin: false }, 'user-1');
      const second = await service.generateApiKey({ organizationId: 'org-1', isSuperAdmin: false }, 'user-1');

      expect(first.apiKey).not.toBe(second.apiKey);
      expect(prisma.organization.update).toHaveBeenCalledTimes(2);
    });

    it('throws BadRequestException when the caller has no organization context', async () => {
      await expect(service.generateApiKey({ organizationId: null, isSuperAdmin: true }, 'user-1')).rejects.toThrow(BadRequestException);
      expect(prisma.organization.update).not.toHaveBeenCalled();
    });
  });

  describe('revokeApiKey', () => {
    it('clears the stored key', async () => {
      prisma.organization.update.mockResolvedValue({ id: 'org-1' });

      const result = await service.revokeApiKey({ organizationId: 'org-1', isSuperAdmin: false }, 'user-1');

      expect(result).toEqual({ apiKeyConfigured: false });
      expect(prisma.organization.update).toHaveBeenCalledWith({
        where: { id: 'org-1' },
        data: { apiKeyHash: null, apiKeyPrefix: null, apiKeyCreatedAt: null },
      });
      expect(audit.record).toHaveBeenCalledWith(
        { organizationId: 'org-1', isSuperAdmin: false },
        expect.objectContaining({ action: 'organization.api_key_revoked' }),
      );
    });

    it('throws BadRequestException when the caller has no organization context', async () => {
      await expect(service.revokeApiKey({ organizationId: null, isSuperAdmin: true }, 'user-1')).rejects.toThrow(BadRequestException);
      expect(prisma.organization.update).not.toHaveBeenCalled();
    });
  });

  describe('updateAiKey', () => {
    it('validates an Anthropic key via a real minimal ping, then encrypts and persists on success', async () => {
      const dto = { provider: 'anthropic' as const, apiKey: 'sk-ant-customer-key' };
      mockAnthropicCreate.mockResolvedValue({ content: [] });
      cryptoService.encrypt.mockReturnValue('encrypted-key-blob');
      prisma.organization.update.mockResolvedValue({});

      const result = await service.updateAiKey({ organizationId: 'org-1', isSuperAdmin: false }, 'user-1', dto);

      expect(mockAnthropicCreate).toHaveBeenCalledWith(
        expect.objectContaining({ max_tokens: 1, messages: [{ role: 'user', content: 'Hi' }] }),
      );
      expect(cryptoService.encrypt).toHaveBeenCalledWith('sk-ant-customer-key');
      expect(prisma.organization.update).toHaveBeenCalledWith({
        where: { id: 'org-1' },
        data: { aiProvider: 'anthropic', aiApiKeyEncrypted: 'encrypted-key-blob', aiBaseUrl: null, aiModelFast: null, aiModelStandard: null },
      });
      expect(audit.record).toHaveBeenCalledWith(
        { organizationId: 'org-1', isSuperAdmin: false },
        { actorUserId: 'user-1', action: 'organization.ai_key_configured', entityType: 'organization', entityId: 'org-1' },
      );
      expect(result).toEqual({ aiKeyConfigured: true });
    });

    it('validates and persists an openai-compatible provider with its base URL and model names', async () => {
      const dto = {
        provider: 'openai-compatible' as const,
        apiKey: 'azure-key',
        baseUrl: 'https://example.openai.azure.com/openai/v1',
        modelFast: 'gpt-fast',
        modelStandard: 'gpt-standard',
      };
      mockOpenAiCreate.mockResolvedValue({ choices: [{ message: {} }] });
      cryptoService.encrypt.mockReturnValue('encrypted-key-blob');
      prisma.organization.update.mockResolvedValue({});

      const result = await service.updateAiKey({ organizationId: 'org-1', isSuperAdmin: false }, 'user-1', dto);

      expect(mockOpenAiCreate).toHaveBeenCalledWith(
        expect.objectContaining({ model: 'gpt-fast', max_tokens: 1, messages: [{ role: 'user', content: 'Hi' }] }),
      );
      expect(prisma.organization.update).toHaveBeenCalledWith({
        where: { id: 'org-1' },
        data: {
          aiProvider: 'openai-compatible',
          aiApiKeyEncrypted: 'encrypted-key-blob',
          aiBaseUrl: 'https://example.openai.azure.com/openai/v1',
          aiModelFast: 'gpt-fast',
          aiModelStandard: 'gpt-standard',
        },
      });
      expect(result).toEqual({ aiKeyConfigured: true });
    });

    it('rejects with BadRequestException and persists nothing when the ping fails', async () => {
      const dto = { provider: 'anthropic' as const, apiKey: 'sk-ant-customer-key' };
      mockAnthropicCreate.mockRejectedValue(new Error('authentication_error'));

      await expect(
        service.updateAiKey({ organizationId: 'org-1', isSuperAdmin: false }, 'user-1', dto),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.organization.update).not.toHaveBeenCalled();
      expect(audit.record).not.toHaveBeenCalled();
    });

    it('throws BadRequestException when the caller has no organization context', async () => {
      const dto = { provider: 'anthropic' as const, apiKey: 'sk-ant-customer-key' };
      await expect(
        service.updateAiKey({ organizationId: null, isSuperAdmin: true }, 'user-1', dto),
      ).rejects.toThrow(BadRequestException);
      expect(mockAnthropicCreate).not.toHaveBeenCalled();
    });
  });

  describe('updateWebhookUrl', () => {
    it('saves the URL and audits the change', async () => {
      prisma.organization.update.mockResolvedValue({ id: 'org-1' });

      const result = await service.updateWebhookUrl(
        { organizationId: 'org-1', isSuperAdmin: false },
        'user-1',
        { url: 'https://example.com/hook' },
      );

      expect(result).toEqual({ webhookUrl: 'https://example.com/hook' });
      expect(prisma.organization.update).toHaveBeenCalledWith({ where: { id: 'org-1' }, data: { webhookUrl: 'https://example.com/hook' } });
      expect(audit.record).toHaveBeenCalledWith(
        { organizationId: 'org-1', isSuperAdmin: false },
        expect.objectContaining({ action: 'organization.webhook_url_updated' }),
      );
    });

    it('throws BadRequestException when the caller has no organization context', async () => {
      await expect(
        service.updateWebhookUrl({ organizationId: null, isSuperAdmin: true }, 'user-1', { url: 'https://example.com/hook' }),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.organization.update).not.toHaveBeenCalled();
    });
  });

  describe('generateWebhookSecret', () => {
    it('encrypts and stores a new secret, returning the plaintext once', async () => {
      prisma.organization.update.mockResolvedValue({ id: 'org-1' });
      cryptoService.encrypt.mockReturnValue('encrypted-blob');

      const result = await service.generateWebhookSecret({ organizationId: 'org-1', isSuperAdmin: false }, 'user-1');

      expect(result.webhookSecret).toMatch(/^[0-9a-f]{64}$/);
      expect(cryptoService.encrypt).toHaveBeenCalledWith(result.webhookSecret);
      expect(prisma.organization.update).toHaveBeenCalledWith({ where: { id: 'org-1' }, data: { webhookSecretEncrypted: 'encrypted-blob' } });
      expect(audit.record).toHaveBeenCalledWith(
        { organizationId: 'org-1', isSuperAdmin: false },
        expect.objectContaining({ action: 'organization.webhook_secret_generated' }),
      );
    });

    it('throws BadRequestException when the caller has no organization context', async () => {
      await expect(
        service.generateWebhookSecret({ organizationId: null, isSuperAdmin: true }, 'user-1'),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.organization.update).not.toHaveBeenCalled();
    });
  });

  describe('getSsoSettings', () => {
    it('returns the current SSO config for the org', async () => {
      prisma.organization.findUnique.mockResolvedValue({
        samlEnabled: true, samlIdpEntityId: 'https://idp.test/entity', samlIdpSsoUrl: 'https://idp.test/sso',
        samlIdpCertificate: '-----BEGIN CERTIFICATE-----\nfake\n-----END CERTIFICATE-----',
      });

      const result = await service.getSsoSettings({ organizationId: 'org-1', isSuperAdmin: false });

      expect(result).toEqual({
        samlEnabled: true, samlIdpEntityId: 'https://idp.test/entity', samlIdpSsoUrl: 'https://idp.test/sso',
        samlIdpCertificate: '-----BEGIN CERTIFICATE-----\nfake\n-----END CERTIFICATE-----',
      });
    });
  });

  describe('updateSsoSettings', () => {
    const context = { organizationId: 'org-1', isSuperAdmin: false };

    it('rejects an invalid SSO URL', async () => {
      await expect(
        service.updateSsoSettings(context, 'user-1', { samlIdpSsoUrl: 'not-a-url' }),
      ).rejects.toThrow();
      expect(prisma.organization.update).not.toHaveBeenCalled();
    });

    it('rejects a malformed certificate', async () => {
      await expect(
        service.updateSsoSettings(context, 'user-1', { samlIdpCertificate: 'not a real cert' }),
      ).rejects.toThrow();
      expect(prisma.organization.update).not.toHaveBeenCalled();
    });

    it('rejects enabling SSO when the three IdP fields are not all present', async () => {
      prisma.organization.findUnique.mockResolvedValue({ samlIdpEntityId: null, samlIdpSsoUrl: null, samlIdpCertificate: null });

      await expect(service.updateSsoSettings(context, 'user-1', { samlEnabled: true })).rejects.toThrow();
      expect(prisma.organization.update).not.toHaveBeenCalled();
    });

    it('saves valid partial IdP fields and audits the change', async () => {
      prisma.organization.update.mockResolvedValue({
        samlEnabled: false, samlIdpEntityId: 'https://idp.test/entity', samlIdpSsoUrl: null, samlIdpCertificate: null,
      });

      const result = await service.updateSsoSettings(context, 'user-1', { samlIdpEntityId: 'https://idp.test/entity' });

      expect(prisma.organization.update).toHaveBeenCalledWith({
        where: { id: 'org-1' },
        data: { samlIdpEntityId: 'https://idp.test/entity' },
      });
      expect(audit.record).toHaveBeenCalledWith(context, expect.objectContaining({ action: 'organization.sso_configured' }));
      expect(result.samlIdpEntityId).toBe('https://idp.test/entity');
    });

    it('accepts enabling SSO once all three IdP fields are present after the update', async () => {
      prisma.organization.findUnique.mockResolvedValue({
        samlIdpEntityId: 'https://idp.test/entity', samlIdpSsoUrl: 'https://idp.test/sso',
        samlIdpCertificate: '-----BEGIN CERTIFICATE-----\nfake\n-----END CERTIFICATE-----',
      });
      prisma.organization.update.mockResolvedValue({
        samlEnabled: true, samlIdpEntityId: 'https://idp.test/entity', samlIdpSsoUrl: 'https://idp.test/sso',
        samlIdpCertificate: '-----BEGIN CERTIFICATE-----\nfake\n-----END CERTIFICATE-----',
      });

      const result = await service.updateSsoSettings(context, 'user-1', { samlEnabled: true });

      expect(result.samlEnabled).toBe(true);
    });
  });

  describe('listWebhookDeliveries', () => {
    it('returns the most recent 50 deliveries for the org', async () => {
      prisma.webhookDelivery.findMany.mockResolvedValue([{ id: 'delivery-1', eventType: 'invitation.created', status: 'delivered', httpStatusCode: 200, createdAt: new Date() }]);

      const result = await service.listWebhookDeliveries({ organizationId: 'org-1', isSuperAdmin: false });

      expect(result).toHaveLength(1);
      expect(prisma.webhookDelivery.findMany).toHaveBeenCalledWith({
        where: { organizationId: 'org-1' },
        orderBy: { createdAt: 'desc' },
        take: 50,
        select: { id: true, eventType: true, status: true, httpStatusCode: true, createdAt: true },
      });
    });

    it('throws BadRequestException when the caller has no organization context', async () => {
      await expect(
        service.listWebhookDeliveries({ organizationId: null, isSuperAdmin: true }),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.webhookDelivery.findMany).not.toHaveBeenCalled();
    });
  });
});
