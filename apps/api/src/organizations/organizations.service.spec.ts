const mockTransporterVerify = jest.fn();
jest.mock('nodemailer', () => ({
  createTransport: () => ({ verify: mockTransporterVerify }),
}));

const mockAnthropicCreate = jest.fn();
jest.mock('@anthropic-ai/sdk', () => jest.fn().mockImplementation(() => ({ messages: { create: mockAnthropicCreate } })));

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
import { PrismaService, TenantPrismaService, AuditService, OrgSecretsCryptoService } from '@exam-platform/shared';
import { EmailService } from '../email/email.service';

describe('OrganizationsService', () => {
  let service: OrganizationsService;
  let prisma: {
    organization: { findUnique: jest.Mock; create: jest.Mock; update: jest.Mock; findMany: jest.Mock };
    plan: { findFirst: jest.Mock };
    webhookDelivery: { findMany: jest.Mock };
  };
  let tenantPrisma: { forTenant: jest.Mock };
  let audit: { record: jest.Mock };
  let emailService: { send: jest.Mock };
  let cryptoService: { encrypt: jest.Mock; decrypt: jest.Mock };

  beforeEach(async () => {
    mockTransporterVerify.mockReset();
    mockAnthropicCreate.mockReset();
    prisma = {
      organization: { findUnique: jest.fn(), create: jest.fn(), update: jest.fn(), findMany: jest.fn() },
      plan: { findFirst: jest.fn() },
      webhookDelivery: { findMany: jest.fn() },
    };
    tenantPrisma = { forTenant: jest.fn() };
    audit = { record: jest.fn() };
    emailService = { send: jest.fn().mockResolvedValue({ success: true }) };
    cryptoService = { encrypt: jest.fn(), decrypt: jest.fn() };
    const moduleRef = await Test.createTestingModule({
      providers: [
        OrganizationsService,
        { provide: PrismaService, useValue: prisma },
        { provide: TenantPrismaService, useValue: tenantPrisma },
        { provide: AuditService, useValue: audit },
        { provide: EmailService, useValue: emailService },
        { provide: OrgSecretsCryptoService, useValue: cryptoService },
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

  describe('getIntegrations', () => {
    it('reports both as unconfigured for an org with nothing set', async () => {
      prisma.organization.findUnique.mockResolvedValue({
        smtpHost: null, smtpPort: null, emailFromAddress: null, aiApiKeyEncrypted: null, smtpPasswordEncrypted: null,
        apiKeyHash: null, apiKeyPrefix: null, apiKeyCreatedAt: null, webhookUrl: null,
      });

      const result = await service.getIntegrations({ organizationId: 'org-1', isSuperAdmin: false });

      expect(result).toEqual({
        smtpConfigured: false, aiKeyConfigured: false, smtpHost: null, smtpPort: null, emailFromAddress: null,
        apiKeyConfigured: false, apiKeyPrefix: null, apiKeyCreatedAt: null,
        webhookConfigured: false, webhookUrl: null,
      });
    });

    it('reports configured booleans and the non-secret SMTP fields, never the secrets themselves', async () => {
      const apiKeyCreatedAt = new Date('2026-01-01');
      prisma.organization.findUnique.mockResolvedValue({
        smtpHost: 'smtp.customer.test', smtpPort: 465, emailFromAddress: 'no-reply@customer.test',
        aiApiKeyEncrypted: 'encrypted-blob', smtpPasswordEncrypted: 'also-encrypted',
        apiKeyHash: 'hashed-key', apiKeyPrefix: 'pk_live_abcd', apiKeyCreatedAt,
        webhookUrl: 'https://customer.test/webhook',
      });

      const result = await service.getIntegrations({ organizationId: 'org-1', isSuperAdmin: false });

      expect(result).toEqual({
        smtpConfigured: true, aiKeyConfigured: true,
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
    const dto = { apiKey: 'sk-ant-customer-key' };

    it('validates via a real minimal messages.create() call, then encrypts and persists on success', async () => {
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
        data: { aiApiKeyEncrypted: 'encrypted-key-blob' },
      });
      expect(audit.record).toHaveBeenCalledWith(
        { organizationId: 'org-1', isSuperAdmin: false },
        { actorUserId: 'user-1', action: 'organization.ai_key_configured', entityType: 'organization', entityId: 'org-1' },
      );
      expect(result).toEqual({ aiKeyConfigured: true });
    });

    it('rejects with BadRequestException and persists nothing when the API call fails', async () => {
      mockAnthropicCreate.mockRejectedValue(new Error('authentication_error'));

      await expect(
        service.updateAiKey({ organizationId: 'org-1', isSuperAdmin: false }, 'user-1', dto),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.organization.update).not.toHaveBeenCalled();
      expect(audit.record).not.toHaveBeenCalled();
    });

    it('throws BadRequestException when the caller has no organization context', async () => {
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
