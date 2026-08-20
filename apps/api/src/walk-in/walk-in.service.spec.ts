import { Test } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { WalkInService } from './walk-in.service';
import { PrismaService, TenantPrismaService, AuditService, BlobStorageService } from '@exam-platform/shared';
import { IntegrationEventsService } from '../integrations/integration-events.service';
import { EmailService } from '../email/email.service';
import { PipelineService } from '../pipeline/pipeline.service';
import { EMAIL_LOGO_SAS_TTL_MS } from '../invitations/invitations.service';

describe('WalkInService', () => {
  let service: WalkInService;
  let prisma: { organization: { findUnique: jest.Mock } };
  let tenantPrisma: { forTenant: jest.Mock };
  let audit: { record: jest.Mock };
  let integrationEvents: { emit: jest.Mock };
  let emailService: { send: jest.Mock };
  let blobStorage: { signIfOurs: jest.Mock };
  let pipelineService: { upsertDriveEntry: jest.Mock };

  beforeEach(async () => {
    prisma = { organization: { findUnique: jest.fn() } };
    tenantPrisma = { forTenant: jest.fn() };
    audit = { record: jest.fn() };
    integrationEvents = { emit: jest.fn() };
    emailService = { send: jest.fn().mockResolvedValue({ success: true }) };
    // Passes the value through unchanged by default, matching signIfOurs' real behavior for a
    // null logoPath or an unconfigured storage account.
    blobStorage = { signIfOurs: jest.fn((value) => Promise.resolve(value)) };
    pipelineService = { upsertDriveEntry: jest.fn().mockResolvedValue(undefined) };
    const moduleRef = await Test.createTestingModule({
      providers: [
        WalkInService,
        { provide: PrismaService, useValue: prisma },
        { provide: TenantPrismaService, useValue: tenantPrisma },
        { provide: AuditService, useValue: audit },
        { provide: IntegrationEventsService, useValue: integrationEvents },
        { provide: EmailService, useValue: emailService },
        { provide: BlobStorageService, useValue: blobStorage },
        { provide: PipelineService, useValue: pipelineService },
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
      expect(integrationEvents.emit).toHaveBeenCalledWith(
        'org-1',
        'invitation.created',
        expect.objectContaining({ id: 'inv-1', subject: 'alice@test.com', linkPath: '/candidates' }),
      );
      // A brand-new candidate row (this is a first-time registrant) also fires candidate.applied.
      expect(integrationEvents.emit).toHaveBeenCalledWith(
        'org-1',
        'candidate.applied',
        expect.objectContaining({ subject: 'Alice', source: 'walk-in', linkPath: '/candidates/cand-1' }),
      );

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

    it('signs a private-container logo URL before embedding it in the walk-in email, with a long TTL that outlasts the send-to-open delay', async () => {
      prisma.organization.findUnique.mockResolvedValue({
        id: 'org-1', slug: 'demo-org',
        logoPath: 'https://sfstoragepoc.blob.core.windows.net/ptc-vss-sf-interview-storage-container/logos/org-1.png',
        name: 'Acme Hiring',
      });
      blobStorage.signIfOurs.mockResolvedValue('https://sfstoragepoc.blob.core.windows.net/ptc-vss-sf-interview-storage-container/logos/org-1.png?sv=2024&sig=abc123');
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

      await service.register('demo-org', dto);
      await new Promise((resolve) => setImmediate(resolve));

      expect(blobStorage.signIfOurs).toHaveBeenCalledWith(
        'https://sfstoragepoc.blob.core.windows.net/ptc-vss-sf-interview-storage-container/logos/org-1.png',
        EMAIL_LOGO_SAS_TTL_MS,
      );
      const html = emailService.send.mock.calls[0][0].html;
      expect(html).toContain(
        `<img src="https://sfstoragepoc.blob.core.windows.net/ptc-vss-sf-interview-storage-container/logos/org-1.png?sv=2024&sig=abc123" alt="Organization logo" height="40" />`,
      );
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
          // A real candidate row always has a name. A stored FULL name is never rewritten by a
          // walk-in registration (see expandedName), which is what the assertion below pins.
          findFirst: jest.fn().mockResolvedValue({ id: 'cand-1', email: 'alice@test.com', name: 'Alice Anderson' }),
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
      // Not a new candidate -- only invitation.created should fire, no candidate.applied.
      expect(integrationEvents.emit).toHaveBeenCalledTimes(1);
      expect(integrationEvents.emit).toHaveBeenCalledWith('org-1', 'invitation.created', expect.anything());
    });

    it('stamps driveSessionId on a new invitation when a drive is live for the exam\'s group', async () => {
      prisma.organization.findUnique.mockResolvedValue({ id: 'org-1', slug: 'demo-org' });
      const tx = {
        exam: {
          findFirst: jest.fn().mockResolvedValue({
            id: 'exam-1', status: 'published', walkInEnabled: true, walkInGroupId: 'group-1', schedulingEnabled: false, availabilityWindowEnd: null,
          }),
        },
        candidate: {
          findFirst: jest.fn().mockResolvedValue(null),
          create: jest.fn().mockResolvedValue({ id: 'cand-1', email: 'alice@test.com', name: 'Alice' }),
        },
        walkInGroup: { findUnique: jest.fn().mockResolvedValue({ jobId: null }) },
        driveSession: {
          findFirst: jest.fn().mockResolvedValue({ id: 'drive-1' }),
        },
        invitation: {
          findFirst: jest.fn().mockResolvedValue(null),
          create: jest.fn().mockResolvedValue({ id: 'inv-1', examId: 'exam-1', candidateId: 'cand-1', status: 'invited', token: 'raw-token' }),
        },
      };
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

      await service.register('demo-org', dto);

      expect(tx.driveSession.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            walkInGroupId: 'group-1',
            startsAt: { lte: expect.any(Date) },
            endsAt: { gte: expect.any(Date) },
          }),
        }),
      );
      expect(tx.invitation.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ driveSessionId: 'drive-1' }) }),
      );
    });

    it('leaves driveSessionId unset when no drive is currently live -- identical to pre-drives behaviour', async () => {
      prisma.organization.findUnique.mockResolvedValue({ id: 'org-1', slug: 'demo-org', logoPath: null, name: 'Acme Hiring' });
      const tx = {
        exam: {
          findFirst: jest.fn().mockResolvedValue({
            id: 'exam-1', title: 'Backend Round', durationMinutes: 60, status: 'published', walkInEnabled: true, walkInGroupId: 'group-1', schedulingEnabled: false, availabilityWindowStart: null, availabilityWindowEnd: null,
          }),
        },
        candidate: {
          findFirst: jest.fn().mockResolvedValue(null),
          create: jest.fn().mockResolvedValue({ id: 'cand-1', email: 'alice@test.com', name: 'Alice' }),
        },
        walkInGroup: { findUnique: jest.fn().mockResolvedValue({ jobId: null }) },
        driveSession: {
          findFirst: jest.fn().mockResolvedValue(null),
        },
        invitation: {
          findFirst: jest.fn().mockResolvedValue(null),
          create: jest.fn().mockResolvedValue({ id: 'inv-1', examId: 'exam-1', candidateId: 'cand-1', status: 'invited', token: 'raw-token' }),
        },
      };
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

      await service.register('demo-org', dto);

      expect(tx.invitation.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ driveSessionId: null }) }),
      );
    });

    it('does not look up a drive session at all when the exam has no walk-in group -- today\'s behaviour, unchanged', async () => {
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

      await service.register('demo-org', dto);

      // tx.driveSession is intentionally absent from this mock -- if the service touched it
      // for a group-less exam, this test would throw rather than silently pass.
      expect(tx.invitation.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ driveSessionId: null }) }),
      );
    });

    it('stamps driveSessionId on a reused live invitation when it was not already stamped (decision: stamp on reuse too)', async () => {
      prisma.organization.findUnique.mockResolvedValue({ id: 'org-1', slug: 'demo-org' });
      const tx = {
        exam: {
          findFirst: jest.fn().mockResolvedValue({
            id: 'exam-1', status: 'published', walkInEnabled: true, walkInGroupId: 'group-1', schedulingEnabled: false, availabilityWindowEnd: null,
          }),
        },
        candidate: {
          findFirst: jest.fn().mockResolvedValue({ id: 'cand-1', email: 'alice@test.com', name: 'Alice Anderson' }),
          update: jest.fn(),
        },
        walkInGroup: { findUnique: jest.fn().mockResolvedValue({ jobId: null }) },
        driveSession: {
          findFirst: jest.fn().mockResolvedValue({ id: 'drive-1' }),
        },
        invitation: {
          findFirst: jest.fn().mockResolvedValue({ id: 'inv-1', examId: 'exam-1', candidateId: 'cand-1', status: 'invited', token: 'existing-token', driveSessionId: null }),
          create: jest.fn(),
          update: jest.fn().mockResolvedValue({ id: 'inv-1', examId: 'exam-1', candidateId: 'cand-1', status: 'invited', token: 'existing-token', driveSessionId: 'drive-1' }),
        },
      };
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

      const result = await service.register('demo-org', dto);

      expect(tx.invitation.update).toHaveBeenCalledWith({
        where: { id: 'inv-1' },
        data: { driveSessionId: 'drive-1' },
      });
      expect(tx.invitation.create).not.toHaveBeenCalled();
      expect(result).toEqual({ token: 'existing-token' });
    });

    it('does not re-stamp a reused invitation that already carries a driveSessionId', async () => {
      prisma.organization.findUnique.mockResolvedValue({ id: 'org-1', slug: 'demo-org' });
      const tx = {
        exam: {
          findFirst: jest.fn().mockResolvedValue({
            id: 'exam-1', status: 'published', walkInEnabled: true, walkInGroupId: 'group-1', schedulingEnabled: false, availabilityWindowEnd: null,
          }),
        },
        candidate: {
          findFirst: jest.fn().mockResolvedValue({ id: 'cand-1', email: 'alice@test.com', name: 'Alice Anderson' }),
          update: jest.fn(),
        },
        walkInGroup: { findUnique: jest.fn().mockResolvedValue({ jobId: null }) },
        driveSession: {
          findFirst: jest.fn().mockResolvedValue({ id: 'drive-2' }),
        },
        invitation: {
          findFirst: jest.fn().mockResolvedValue({ id: 'inv-1', examId: 'exam-1', candidateId: 'cand-1', status: 'invited', token: 'existing-token', driveSessionId: 'drive-1' }),
          create: jest.fn(),
          update: jest.fn(),
        },
      };
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

      const result = await service.register('demo-org', dto);

      expect(tx.invitation.update).not.toHaveBeenCalled();
      expect(result).toEqual({ token: 'existing-token' });
    });

    it('expands a stored one-word name with the fuller one the candidate just typed', async () => {
      // The registration form collects First/Middle/Last and sends them composed. A candidate
      // whose record was hand-created as just "Alice" would otherwise be greeted "Dear Alice"
      // in their own invite email forever, because a public endpoint never overwrites details.
      prisma.organization.findUnique.mockResolvedValue({ id: 'org-1', slug: 'demo-org' });
      const tx = {
        exam: {
          findFirst: jest.fn().mockResolvedValue({
            id: 'exam-1', status: 'published', walkInEnabled: true, schedulingEnabled: false, availabilityWindowEnd: null,
          }),
        },
        candidate: {
          findFirst: jest.fn().mockResolvedValue({ id: 'cand-1', email: 'alice@test.com', name: 'Alice' }),
          update: jest.fn(),
        },
        invitation: {
          findFirst: jest.fn().mockResolvedValue({ id: 'inv-1', examId: 'exam-1', candidateId: 'cand-1', status: 'invited', token: 'existing-token' }),
          create: jest.fn(),
        },
      };
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

      await service.register('demo-org', { ...dto, name: 'Alice Jane Anderson' });

      expect(tx.candidate.update).toHaveBeenCalledWith({
        where: { id: 'cand-1' },
        data: { name: 'Alice Jane Anderson' },
      });
    });

    it('refuses to replace a stored one-word name with an unrelated one', async () => {
      // Anyone can learn an email address, so expansion must keep the word it started from.
      prisma.organization.findUnique.mockResolvedValue({ id: 'org-1', slug: 'demo-org' });
      const tx = {
        exam: {
          findFirst: jest.fn().mockResolvedValue({
            id: 'exam-1', status: 'published', walkInEnabled: true, schedulingEnabled: false, availabilityWindowEnd: null,
          }),
        },
        candidate: {
          findFirst: jest.fn().mockResolvedValue({ id: 'cand-1', email: 'alice@test.com', name: 'Alice' }),
          update: jest.fn(),
        },
        invitation: {
          findFirst: jest.fn().mockResolvedValue({ id: 'inv-1', examId: 'exam-1', candidateId: 'cand-1', status: 'invited', token: 'existing-token' }),
          create: jest.fn(),
        },
      };
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

      await service.register('demo-org', { ...dto, name: 'Mallory Smith' });

      expect(tx.candidate.update).not.toHaveBeenCalled();
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
          // A real candidate row always has a name. A stored FULL name is never rewritten by a
          // walk-in registration (see expandedName), which is what the assertion below pins.
          findFirst: jest.fn().mockResolvedValue({ id: 'cand-1', email: 'alice@test.com', name: 'Alice Anderson' }),
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

    describe('drive-sourced pipeline entry', () => {
      it('upserts a pipeline entry with the group\'s jobId + candidate id when the walk-in group is linked to a job', async () => {
        prisma.organization.findUnique.mockResolvedValue({ id: 'org-1', slug: 'demo-org' });
        const tx = {
          exam: {
            findFirst: jest.fn().mockResolvedValue({
              id: 'exam-1', status: 'published', walkInEnabled: true, walkInGroupId: 'group-1', schedulingEnabled: false, availabilityWindowEnd: null,
            }),
          },
          candidate: {
            findFirst: jest.fn().mockResolvedValue(null),
            create: jest.fn().mockResolvedValue({ id: 'cand-1', email: 'alice@test.com', name: 'Alice' }),
          },
          walkInGroup: { findUnique: jest.fn().mockResolvedValue({ jobId: 'job-1' }) },
          driveSession: { findFirst: jest.fn().mockResolvedValue(null) },
          invitation: {
            findFirst: jest.fn().mockResolvedValue(null),
            create: jest.fn().mockResolvedValue({ id: 'inv-1', examId: 'exam-1', candidateId: 'cand-1', status: 'invited', token: 'raw-token' }),
          },
        };
        tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

        await service.register('demo-org', dto);

        expect(tx.walkInGroup.findUnique).toHaveBeenCalledWith({ where: { id: 'group-1' }, select: { jobId: true } });
        expect(pipelineService.upsertDriveEntry).toHaveBeenCalledWith(tx, expect.objectContaining({ organizationId: 'org-1' }), 'job-1', 'cand-1');
      });

      it('also fires on the reuse-existing-invitation branch', async () => {
        prisma.organization.findUnique.mockResolvedValue({ id: 'org-1', slug: 'demo-org' });
        const tx = {
          exam: {
            findFirst: jest.fn().mockResolvedValue({
              id: 'exam-1', status: 'published', walkInEnabled: true, walkInGroupId: 'group-1', schedulingEnabled: false, availabilityWindowEnd: null,
            }),
          },
          candidate: {
            findFirst: jest.fn().mockResolvedValue({ id: 'cand-1', email: 'alice@test.com', name: 'Alice Anderson' }),
            update: jest.fn(),
          },
          walkInGroup: { findUnique: jest.fn().mockResolvedValue({ jobId: 'job-1' }) },
          driveSession: { findFirst: jest.fn().mockResolvedValue(null) },
          invitation: {
            findFirst: jest.fn().mockResolvedValue({ id: 'inv-1', examId: 'exam-1', candidateId: 'cand-1', status: 'invited', token: 'existing-token' }),
            create: jest.fn(),
          },
        };
        tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

        await service.register('demo-org', dto);

        expect(pipelineService.upsertDriveEntry).toHaveBeenCalledWith(tx, expect.objectContaining({ organizationId: 'org-1' }), 'job-1', 'cand-1');
      });

      it('does not call upsertDriveEntry when the walk-in group has no linked job', async () => {
        prisma.organization.findUnique.mockResolvedValue({ id: 'org-1', slug: 'demo-org' });
        const tx = {
          exam: {
            findFirst: jest.fn().mockResolvedValue({
              id: 'exam-1', status: 'published', walkInEnabled: true, walkInGroupId: 'group-1', schedulingEnabled: false, availabilityWindowEnd: null,
            }),
          },
          candidate: {
            findFirst: jest.fn().mockResolvedValue(null),
            create: jest.fn().mockResolvedValue({ id: 'cand-1', email: 'alice@test.com', name: 'Alice' }),
          },
          walkInGroup: { findUnique: jest.fn().mockResolvedValue({ jobId: null }) },
          driveSession: { findFirst: jest.fn().mockResolvedValue(null) },
          invitation: {
            findFirst: jest.fn().mockResolvedValue(null),
            create: jest.fn().mockResolvedValue({ id: 'inv-1', examId: 'exam-1', candidateId: 'cand-1', status: 'invited', token: 'raw-token' }),
          },
        };
        tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

        await service.register('demo-org', dto);

        expect(pipelineService.upsertDriveEntry).not.toHaveBeenCalled();
      });

      it('does not look up the walk-in group or call upsertDriveEntry when the exam has no walk-in group', async () => {
        prisma.organization.findUnique.mockResolvedValue({ id: 'org-1', slug: 'demo-org' });
        const tx = {
          exam: {
            findFirst: jest.fn().mockResolvedValue({
              id: 'exam-1', status: 'published', walkInEnabled: true, schedulingEnabled: false, availabilityWindowEnd: null,
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

        // tx.walkInGroup is intentionally absent -- if the service touched it for a group-less
        // exam, this test would throw rather than silently pass.
        await service.register('demo-org', dto);

        expect(pipelineService.upsertDriveEntry).not.toHaveBeenCalled();
      });
    });
  });
});
