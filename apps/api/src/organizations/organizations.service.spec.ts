jest.mock('fs/promises', () => ({
  mkdir: jest.fn(),
  writeFile: jest.fn(),
}));

import * as fs from 'fs/promises';

import { Test } from '@nestjs/testing';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { sep } from 'path';
import { createHash } from 'crypto';
import { OrganizationsService } from './organizations.service';
import { PrismaService, TenantPrismaService, AuditService } from '@exam-platform/shared';
import { EmailService } from '../email/email.service';

describe('OrganizationsService', () => {
  let service: OrganizationsService;
  let prisma: {
    organization: { findUnique: jest.Mock; create: jest.Mock; update: jest.Mock; findMany: jest.Mock };
    plan: { findFirst: jest.Mock };
  };
  let tenantPrisma: { forTenant: jest.Mock };
  let audit: { record: jest.Mock };
  let emailService: { send: jest.Mock };

  beforeEach(async () => {
    prisma = {
      organization: { findUnique: jest.fn(), create: jest.fn(), update: jest.fn(), findMany: jest.fn() },
      plan: { findFirst: jest.fn() },
    };
    tenantPrisma = { forTenant: jest.fn() };
    audit = { record: jest.fn() };
    emailService = { send: jest.fn().mockResolvedValue({ success: true }) };
    const moduleRef = await Test.createTestingModule({
      providers: [
        OrganizationsService,
        { provide: PrismaService, useValue: prisma },
        { provide: TenantPrismaService, useValue: tenantPrisma },
        { provide: AuditService, useValue: audit },
        { provide: EmailService, useValue: emailService },
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
    it('returns all organizations ordered by newest first', async () => {
      prisma.organization.findMany.mockResolvedValue([
        { id: 'org-2', name: 'Beta', slug: 'beta', region: 'eu', createdAt: new Date('2026-01-02') },
        { id: 'org-1', name: 'Acme', slug: 'acme', region: 'us', createdAt: new Date('2026-01-01') },
      ]);

      const result = await service.list();

      expect(result).toHaveLength(2);
      expect(prisma.organization.findMany).toHaveBeenCalledWith({ orderBy: { createdAt: 'desc' } });
    });
  });

  describe('getBranding', () => {
    it('returns null logoUrl/colors for an org with nothing set', async () => {
      prisma.organization.findUnique.mockResolvedValue({ id: 'org-1', logoPath: null, primaryColor: null, accentColor: null });

      const result = await service.getBranding({ organizationId: 'org-1', isSuperAdmin: false });

      expect(result).toEqual({ logoUrl: null, primaryColor: null, accentColor: null });
    });

    it('derives logoUrl from logoPath and API_ORIGIN', async () => {
      process.env.API_ORIGIN = 'http://localhost:3001';
      prisma.organization.findUnique.mockResolvedValue({ id: 'org-1', logoPath: 'logos/org-1.png', primaryColor: '#1a73e8', accentColor: '#fbbc04' });

      const result = await service.getBranding({ organizationId: 'org-1', isSuperAdmin: false });

      expect(result).toEqual({ logoUrl: 'http://localhost:3001/uploads/logos/org-1.png', primaryColor: '#1a73e8', accentColor: '#fbbc04' });
    });

    it('throws BadRequestException when the caller has no organization context', async () => {
      await expect(service.getBranding({ organizationId: null, isSuperAdmin: true })).rejects.toThrow(BadRequestException);
      expect(prisma.organization.findUnique).not.toHaveBeenCalled();
    });
  });

  describe('updateBrandingColors', () => {
    it('updates only the provided fields and returns the fresh branding', async () => {
      prisma.organization.update.mockResolvedValue({ id: 'org-1', logoPath: null, primaryColor: '#1a73e8', accentColor: null });

      const result = await service.updateBrandingColors({ organizationId: 'org-1', isSuperAdmin: false }, 'user-1', { primaryColor: '#1a73e8' });

      expect(prisma.organization.update).toHaveBeenCalledWith({ where: { id: 'org-1' }, data: { primaryColor: '#1a73e8' } });
      expect(audit.record).toHaveBeenCalledWith(
        { organizationId: 'org-1', isSuperAdmin: false },
        { actorUserId: 'user-1', action: 'organization.branding_updated', entityType: 'organization', entityId: 'org-1' },
      );
      expect(result).toEqual({ logoUrl: null, primaryColor: '#1a73e8', accentColor: null });
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
      process.env.API_ORIGIN = 'http://localhost:3001';
      (fs.mkdir as jest.Mock).mockReset().mockResolvedValue(undefined);
      (fs.writeFile as jest.Mock).mockReset().mockResolvedValue(undefined);
    });

    it('writes the file to logos/{orgId}.png and updates logoPath', async () => {
      prisma.organization.update.mockResolvedValue({ id: 'org-1', logoPath: 'logos/org-1.png', primaryColor: null, accentColor: null });

      const result = await service.uploadLogo({ organizationId: 'org-1', isSuperAdmin: false }, 'user-1', pngFile);

      expect(fs.writeFile).toHaveBeenCalledWith(expect.stringContaining(`logos${sep}org-1.png`), pngFile.buffer);
      expect(prisma.organization.update).toHaveBeenCalledWith({ where: { id: 'org-1' }, data: { logoPath: 'logos/org-1.png' } });
      expect(audit.record).toHaveBeenCalledWith(
        { organizationId: 'org-1', isSuperAdmin: false },
        { actorUserId: 'user-1', action: 'organization.logo_updated', entityType: 'organization', entityId: 'org-1' },
      );
      expect(result.logoUrl).toBe('http://localhost:3001/uploads/logos/org-1.png');
    });

    it('rejects a non-image mimetype without writing any file', async () => {
      const badFile = { mimetype: 'application/pdf', size: 1024, buffer: Buffer.from('x') } as Express.Multer.File;

      await expect(service.uploadLogo({ organizationId: 'org-1', isSuperAdmin: false }, 'user-1', badFile)).rejects.toThrow(BadRequestException);
      expect(fs.writeFile).not.toHaveBeenCalled();
    });

    it('rejects a file over 2MB without writing any file', async () => {
      const bigFile = { mimetype: 'image/png', size: 2 * 1024 * 1024 + 1, buffer: Buffer.from('x') } as Express.Multer.File;

      await expect(service.uploadLogo({ organizationId: 'org-1', isSuperAdmin: false }, 'user-1', bigFile)).rejects.toThrow(BadRequestException);
      expect(fs.writeFile).not.toHaveBeenCalled();
    });

    it('throws BadRequestException when the caller has no organization context', async () => {
      await expect(service.uploadLogo({ organizationId: null, isSuperAdmin: true }, 'user-1', pngFile)).rejects.toThrow(BadRequestException);
      expect(fs.writeFile).not.toHaveBeenCalled();
    });
  });

  describe('getPublicBrandingBySlug', () => {
    it('returns branding for an existing slug, with no auth/tenant context required', async () => {
      process.env.API_ORIGIN = 'http://localhost:3001';
      prisma.organization.findUnique.mockResolvedValue({ id: 'org-1', logoPath: 'logos/org-1.png', primaryColor: '#1a73e8', accentColor: null });

      const result = await service.getPublicBrandingBySlug('acme');

      expect(prisma.organization.findUnique).toHaveBeenCalledWith({ where: { slug: 'acme' } });
      expect(result).toEqual({ logoUrl: 'http://localhost:3001/uploads/logos/org-1.png', primaryColor: '#1a73e8', accentColor: null });
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
});
