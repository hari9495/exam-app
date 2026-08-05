import { Test } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { WalkInService } from './walk-in.service';
import { PrismaService, TenantPrismaService, AuditService } from '@exam-platform/shared';
import { WebhooksService } from '../webhooks/webhooks.service';
import { EmailService } from '../email/email.service';

describe('WalkInService', () => {
  let service: WalkInService;
  let prisma: { organization: { findUnique: jest.Mock } };
  let tenantPrisma: { forTenant: jest.Mock };
  let audit: { record: jest.Mock };
  let webhooksService: { enqueue: jest.Mock };
  let emailService: { send: jest.Mock };

  beforeEach(async () => {
    prisma = { organization: { findUnique: jest.fn() } };
    tenantPrisma = { forTenant: jest.fn() };
    audit = { record: jest.fn() };
    webhooksService = { enqueue: jest.fn() };
    emailService = { send: jest.fn().mockResolvedValue({ success: true }) };
    const moduleRef = await Test.createTestingModule({
      providers: [
        WalkInService,
        { provide: PrismaService, useValue: prisma },
        { provide: TenantPrismaService, useValue: tenantPrisma },
        { provide: AuditService, useValue: audit },
        { provide: WebhooksService, useValue: webhooksService },
        { provide: EmailService, useValue: emailService },
      ],
    }).compile();
    service = moduleRef.get(WalkInService);
  });

  describe('listExams', () => {
    it('throws NotFoundException for an unknown org slug', async () => {
      prisma.organization.findUnique.mockResolvedValue(null);
      await expect(service.listExams('nope')).rejects.toThrow(NotFoundException);
    });

    it('returns only published, walk-in-enabled exams for the org', async () => {
      prisma.organization.findUnique.mockResolvedValue({ id: 'org-1', slug: 'demo-org' });
      const tx = {
        exam: {
          findMany: jest
            .fn()
            .mockResolvedValue([{ id: 'exam-1', title: 'Backend Round', durationMinutes: 60, walkInListed: true }]),
        },
      };
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

      const result = await service.listExams('demo-org');

      expect(tx.exam.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { organizationId: 'org-1', status: 'published', walkInEnabled: true } }),
      );
      expect(result).toEqual([{ id: 'exam-1', title: 'Backend Round', durationMinutes: 60, walkInListed: true }]);
    });

    it('scopes to a single group when a groupId is given, on top of the usual filters', async () => {
      prisma.organization.findUnique.mockResolvedValue({ id: 'org-1', slug: 'demo-org' });
      const tx = { exam: { findMany: jest.fn().mockResolvedValue([]) } };
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

      await service.listExams('demo-org', 'group-1');

      expect(tx.exam.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { organizationId: 'org-1', status: 'published', walkInEnabled: true, walkInGroupId: 'group-1' },
        }),
      );
    });
  });

  describe('register', () => {
    const dto = { examId: 'exam-1', name: 'Alice', email: 'alice@test.com' };

    it('throws NotFoundException for an unknown org slug', async () => {
      prisma.organization.findUnique.mockResolvedValue(null);
      await expect(service.register('nope', dto)).rejects.toThrow(NotFoundException);
    });

    it('rejects when the exam is not walk-in-enabled', async () => {
      prisma.organization.findUnique.mockResolvedValue({ id: 'org-1', slug: 'demo-org' });
      const tx = {
        exam: { findFirst: jest.fn().mockResolvedValue({ id: 'exam-1', status: 'published', walkInEnabled: false }) },
      };
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

      await expect(service.register('demo-org', dto)).rejects.toThrow(BadRequestException);
    });

    it('creates a new candidate and invitation for a first-time registrant', async () => {
      prisma.organization.findUnique.mockResolvedValue({ id: 'org-1', slug: 'demo-org', logoPath: null, name: 'Acme Hiring' });
      const tx = {
        exam: {
          findFirst: jest.fn().mockResolvedValue({
            id: 'exam-1', title: 'Backend Round', durationMinutes: 60, status: 'published', walkInEnabled: true, schedulingEnabled: false, availabilityWindowStart: null, availabilityWindowEnd: null,
          }),
        },
        candidate: {
          findFirst: jest.fn().mockResolvedValue(null),
          create: jest.fn().mockResolvedValue({ id: 'cand-1', email: 'alice@test.com', name: 'Alice' }),
        },
        invitation: {
          findFirst: jest.fn().mockResolvedValue(null),
          create: jest.fn().mockResolvedValue({ id: 'inv-1', examId: 'exam-1', candidateId: 'cand-1', status: 'invited', token: 'raw-token' }),
        },
      };
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

      const result = await service.register('demo-org', dto);

      expect(tx.candidate.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ organizationId: 'org-1', email: 'alice@test.com', name: 'Alice' }) }),
      );
      expect(tx.invitation.create).toHaveBeenCalledWith(
        // emailStatus 'none': the walk-in courtesy email is untracked, so the row must
        // not enter the recruiter-facing email lifecycle (no "In queue" badge).
        expect.objectContaining({ data: expect.objectContaining({ examId: 'exam-1', candidateId: 'cand-1', source: 'walk_in', emailStatus: 'none' }) }),
      );
      expect(result).toEqual({ token: 'raw-token' });
      expect(webhooksService.enqueue).toHaveBeenCalledWith('org-1', 'invitation.created', expect.objectContaining({ id: 'inv-1' }));

      // Email dispatch is fire-and-forget -- flush the microtask queue before asserting.
      await new Promise((resolve) => setImmediate(resolve));

      // Always emails the exam link rather than relying on the browser that registered
      // (often a phone, scanned from a QR code) to also be the device the exam is taken on.
      expect(emailService.send).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'alice@test.com',
          organizationId: 'org-1',
          subject: 'Your Backend Round assessment - link and instructions',
          html: expect.stringContaining('token=raw-token'),
        }),
      );
      // Same branded layout as recruiter invitations, not the old bare link-only note.
      const html = emailService.send.mock.calls[0][0].html;
      expect(html).toContain('Dear Alice,');
      expect(html).toContain('Thanks for registering for the <strong>Backend Round</strong> assessment');
      expect(html).toContain('Duration:</strong> 60 minutes');
      expect(html).toContain('Before You Begin');
      expect(html).toContain('Examination Rules &amp; Guidelines');
      expect(html).toContain('Best regards,<br/>Acme Hiring');
      expect(html).toContain('please do not reply');
    });

    it('reuses the existing candidate and a live invitation instead of creating a duplicate', async () => {
      prisma.organization.findUnique.mockResolvedValue({ id: 'org-1', slug: 'demo-org' });
      const tx = {
        exam: {
          findFirst: jest.fn().mockResolvedValue({
            id: 'exam-1', status: 'published', walkInEnabled: true, schedulingEnabled: false, availabilityWindowEnd: null,
          }),
        },
        candidate: {
          findFirst: jest.fn().mockResolvedValue({ id: 'cand-1', email: 'alice@test.com' }),
          update: jest.fn(),
        },
        invitation: {
          findFirst: jest.fn().mockResolvedValue({ id: 'inv-1', examId: 'exam-1', candidateId: 'cand-1', status: 'invited', token: 'existing-token' }),
          create: jest.fn(),
        },
      };
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

      const result = await service.register('demo-org', dto);

      expect(tx.invitation.create).not.toHaveBeenCalled();
      expect(tx.candidate.update).not.toHaveBeenCalled();
      expect(result).toEqual({ token: 'existing-token' });
    });

    it('issues a new token for an existing candidate whose prior invitation has expired', async () => {
      // The live-invitation query filters on `expiresAt: { gt: now }`, so an expired invitation
      // never matches it -- findFirst resolving null here is exactly what "expired" looks like
      // from this service's point of view, same as "never invited to this exam before".
      prisma.organization.findUnique.mockResolvedValue({ id: 'org-1', slug: 'demo-org' });
      const tx = {
        exam: {
          findFirst: jest.fn().mockResolvedValue({
            id: 'exam-1', status: 'published', walkInEnabled: true, schedulingEnabled: false, availabilityWindowEnd: null,
          }),
        },
        candidate: {
          findFirst: jest.fn().mockResolvedValue({ id: 'cand-1', email: 'alice@test.com' }),
          update: jest.fn(),
        },
        invitation: {
          findFirst: jest.fn().mockResolvedValue(null),
          create: jest.fn().mockResolvedValue({ id: 'inv-2', examId: 'exam-1', candidateId: 'cand-1', status: 'invited', token: 'fresh-token' }),
        },
      };
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

      const result = await service.register('demo-org', dto);

      expect(tx.invitation.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ candidateId: 'cand-1', source: 'walk_in' }) }),
      );
      expect(tx.candidate.update).not.toHaveBeenCalled();
      expect(result).toEqual({ token: 'fresh-token' });
    });
  });
});
