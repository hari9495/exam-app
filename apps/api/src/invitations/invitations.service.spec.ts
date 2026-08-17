import { Test } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { InvitationsService, EMAIL_LOGO_SAS_TTL_MS } from './invitations.service';
import { TenantPrismaService, AuditService, BlobStorageService } from '@exam-platform/shared';
import { EmailService } from '../email/email.service';
import { WebhooksService } from '../webhooks/webhooks.service';

describe('InvitationsService', () => {
  let service: InvitationsService;
  let tenantPrisma: { forTenant: jest.Mock };
  let emailService: { send: jest.Mock };
  let audit: { record: jest.Mock };
  let webhooksService: { enqueue: jest.Mock };
  let blobStorage: { signIfOurs: jest.Mock };
  const context = { organizationId: 'org-1', isSuperAdmin: false };

  beforeEach(async () => {
    tenantPrisma = { forTenant: jest.fn() };
    emailService = { send: jest.fn().mockResolvedValue({ success: true, previewUrl: 'https://ethereal.email/x' }) };
    audit = { record: jest.fn() };
    webhooksService = { enqueue: jest.fn() };
    // Passes the value through unchanged by default, matching signIfOurs' real behavior for a
    // null logoPath or an unconfigured storage account -- individual tests override this to
    // verify the signing itself.
    blobStorage = { signIfOurs: jest.fn((value) => Promise.resolve(value)) };
    const moduleRef = await Test.createTestingModule({
      providers: [
        InvitationsService,
        { provide: TenantPrismaService, useValue: tenantPrisma },
        { provide: EmailService, useValue: emailService },
        { provide: AuditService, useValue: audit },
        { provide: WebhooksService, useValue: webhooksService },
        { provide: BlobStorageService, useValue: blobStorage },
      ],
    }).compile();
    service = moduleRef.get(InvitationsService);
  });

  it('stamps advancedFromExamId when the invite comes from Advance to Next Round', async () => {
    const create = jest.fn().mockResolvedValue({ id: 'inv-1', examId: 'exam-2', candidateId: 'cand-1', status: 'invited' });
    const createTx = {
      exam: {
        findFirst: jest.fn().mockResolvedValue({ id: 'exam-2', title: 'Round 2', status: 'published', durationMinutes: 60, schedulingEnabled: false, availabilityWindowStart: null }),
      },
      candidate: { findMany: jest.fn().mockResolvedValue([{ id: 'cand-1', email: 'a@test.com', name: 'Alice', erasedAt: null }]) },
      invitation: { findMany: jest.fn().mockResolvedValue([]), create },
    };
    const orgTx = { organization: { findUnique: jest.fn().mockResolvedValue({ logoPath: null, name: 'Acme Hiring' }) } };
    const notifTx = { notification: { create: jest.fn().mockResolvedValue({ id: 'notif-1' }) }, invitation: { update: jest.fn() } };
    tenantPrisma.forTenant
      .mockImplementationOnce((_ctx, fn) => fn(createTx))
      .mockImplementationOnce((_ctx, fn) => fn(orgTx))
      .mockImplementationOnce((_ctx, fn) => fn(notifTx));

    await service.bulkInvite(context, 'exam-2', ['cand-1'], 'exam-1');

    // Provenance is what lets exam-1's results table report whether THIS invite went out;
    // without it the column cannot tell an advance apart from an unrelated hand-made invite.
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ advancedFromExamId: 'exam-1' }) }));
    await new Promise((resolve) => setImmediate(resolve));
  });

  it('stamps driveSessionId on every created invitation when passed through bulkInvite', async () => {
    const create = jest.fn().mockResolvedValue({ id: 'inv-1', examId: 'exam-1', candidateId: 'cand-1', status: 'invited' });
    const createTx = {
      exam: {
        findFirst: jest.fn().mockResolvedValue({ id: 'exam-1', title: 'Backend Round', status: 'published', durationMinutes: 60, schedulingEnabled: false, availabilityWindowStart: null }),
      },
      candidate: { findMany: jest.fn().mockResolvedValue([{ id: 'cand-1', email: 'a@test.com', name: 'Alice', erasedAt: null }]) },
      invitation: { findMany: jest.fn().mockResolvedValue([]), create },
    };
    const orgTx = { organization: { findUnique: jest.fn().mockResolvedValue({ logoPath: null, name: 'Acme Hiring' }) } };
    const notifTx = { notification: { create: jest.fn().mockResolvedValue({ id: 'notif-1' }) }, invitation: { update: jest.fn() } };
    tenantPrisma.forTenant
      .mockImplementationOnce((_ctx, fn) => fn(createTx))
      .mockImplementationOnce((_ctx, fn) => fn(orgTx))
      .mockImplementationOnce((_ctx, fn) => fn(notifTx));

    await service.bulkInvite(context, 'exam-1', ['cand-1'], undefined, 'drive-1');

    expect(create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ driveSessionId: 'drive-1' }) }));
    await new Promise((resolve) => setImmediate(resolve));
  });

  it('leaves driveSessionId unset when omitted -- existing call sites are unaffected', async () => {
    const create = jest.fn().mockResolvedValue({ id: 'inv-1', examId: 'exam-1', candidateId: 'cand-1', status: 'invited' });
    const createTx = {
      exam: {
        findFirst: jest.fn().mockResolvedValue({ id: 'exam-1', title: 'Backend Round', status: 'published', durationMinutes: 60, schedulingEnabled: false, availabilityWindowStart: null }),
      },
      candidate: { findMany: jest.fn().mockResolvedValue([{ id: 'cand-1', email: 'a@test.com', name: 'Alice', erasedAt: null }]) },
      invitation: { findMany: jest.fn().mockResolvedValue([]), create },
    };
    const orgTx = { organization: { findUnique: jest.fn().mockResolvedValue({ logoPath: null, name: 'Acme Hiring' }) } };
    const notifTx = { notification: { create: jest.fn().mockResolvedValue({ id: 'notif-1' }) }, invitation: { update: jest.fn() } };
    tenantPrisma.forTenant
      .mockImplementationOnce((_ctx, fn) => fn(createTx))
      .mockImplementationOnce((_ctx, fn) => fn(orgTx))
      .mockImplementationOnce((_ctx, fn) => fn(notifTx));

    await service.bulkInvite(context, 'exam-1', ['cand-1']);

    expect(create.mock.calls[0][0].data).not.toHaveProperty('driveSessionId');
    await new Promise((resolve) => setImmediate(resolve));
  });

  it('leaves advancedFromExamId unset for an ordinary bulk invite', async () => {
    const create = jest.fn().mockResolvedValue({ id: 'inv-1', examId: 'exam-1', candidateId: 'cand-1', status: 'invited' });
    const createTx = {
      exam: {
        findFirst: jest.fn().mockResolvedValue({ id: 'exam-1', title: 'Backend Round', status: 'published', durationMinutes: 60, schedulingEnabled: false, availabilityWindowStart: null }),
      },
      candidate: { findMany: jest.fn().mockResolvedValue([{ id: 'cand-1', email: 'a@test.com', name: 'Alice', erasedAt: null }]) },
      invitation: { findMany: jest.fn().mockResolvedValue([]), create },
    };
    const orgTx = { organization: { findUnique: jest.fn().mockResolvedValue({ logoPath: null, name: 'Acme Hiring' }) } };
    const notifTx = { notification: { create: jest.fn().mockResolvedValue({ id: 'notif-1' }) }, invitation: { update: jest.fn() } };
    tenantPrisma.forTenant
      .mockImplementationOnce((_ctx, fn) => fn(createTx))
      .mockImplementationOnce((_ctx, fn) => fn(orgTx))
      .mockImplementationOnce((_ctx, fn) => fn(notifTx));

    await service.bulkInvite(context, 'exam-1', ['cand-1']);

    expect(create.mock.calls[0][0].data).not.toHaveProperty('advancedFromExamId');
    await new Promise((resolve) => setImmediate(resolve));
  });

  it('invites every requested candidate to a published exam and sends an email for each', async () => {
    const createTx = {
      exam: {
        findFirst: jest
          .fn()
          .mockResolvedValue({ id: 'exam-1', title: 'Backend Round', status: 'published', durationMinutes: 60, schedulingEnabled: false, availabilityWindowStart: null }),
      },
      candidate: { findMany: jest.fn().mockResolvedValue([{ id: 'cand-1', email: 'a@test.com', name: 'Alice', erasedAt: null }]) },
      invitation: {
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn().mockResolvedValue({ id: 'inv-1', examId: 'exam-1', candidateId: 'cand-1', status: 'invited' }),
      },
    };
    const orgTx = { organization: { findUnique: jest.fn().mockResolvedValue({ logoPath: null, name: 'Acme Hiring' }) } };
    const notifTx = { notification: { create: jest.fn().mockResolvedValue({ id: 'notif-1' }) }, invitation: { update: jest.fn() } };
    tenantPrisma.forTenant
      .mockImplementationOnce((_ctx, fn) => fn(createTx))
      .mockImplementationOnce((_ctx, fn) => fn(orgTx))
      .mockImplementationOnce((_ctx, fn) => fn(notifTx));

    const result = await service.bulkInvite(context, 'exam-1', ['cand-1']);

    expect(result.created).toHaveLength(1);
    expect(result.skipped).toHaveLength(0);

    // Email dispatch is fire-and-forget (the HTTP response no longer waits on it) --
    // flush the microtask queue so the background send + notification write settle
    // before asserting on them.
    await new Promise((resolve) => setImmediate(resolve));

    expect(emailService.send).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'a@test.com',
        subject: 'Your Backend Round assessment - invitation and instructions',
        organizationId: 'org-1',
      }),
    );
    const html = emailService.send.mock.calls[0][0].html;
    // No logo uploaded for this org (orgTx resolves logoPath: null) -- the email should
    // not contain an <img> tag at all rather than a broken/empty src.
    expect(html).not.toContain('<img');
    expect(html).toContain('Dear Alice,');
    expect(html).toContain('Duration:</strong> 60 minutes');
    expect(html).toContain('Best regards,<br/>Acme Hiring');
    // This invites the candidate to SIT the exam; it must not read as a completion notice.
    expect(html).toContain('You have been invited to take the <strong>Backend Round</strong> assessment');
    expect(html).not.toMatch(/registration .*(completed|confirmed)/i);
    // It is sent from a no-reply mailbox, so it must never ask the candidate to reply.
    expect(html).not.toMatch(/reply to this email/i);
    expect(html).toContain('please do not reply');
    // Not a scheduled exam (schedulingEnabled: false) -- no Date & Time line should appear.
    expect(html).not.toContain('Date &amp; Time');
    expect(notifTx.notification.create).toHaveBeenCalledWith({
      data: { invitationId: 'inv-1', status: 'sent', sentAt: expect.any(Date) },
    });
    // Settles the transient 'pending' emailStatus set when the invitation was created.
    expect(notifTx.invitation.update).toHaveBeenCalledWith({
      where: { id: 'inv-1' },
      data: { emailStatus: 'sent' },
    });
  });

  it('marks emailStatus failed (not sent) when the invitation email does not go through', async () => {
    emailService.send.mockResolvedValueOnce({ success: false });
    const createTx = {
      exam: { findFirst: jest.fn().mockResolvedValue({ id: 'exam-1', title: 'Backend Round', status: 'published', durationMinutes: 60, schedulingEnabled: false, availabilityWindowStart: null }) },
      candidate: { findMany: jest.fn().mockResolvedValue([{ id: 'cand-1', email: 'a@test.com', name: 'Alice', erasedAt: null }]) },
      invitation: {
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn().mockResolvedValue({ id: 'inv-1', examId: 'exam-1', candidateId: 'cand-1', status: 'invited' }),
      },
    };
    const orgTx = { organization: { findUnique: jest.fn().mockResolvedValue({ logoPath: null, name: 'Acme Hiring' }) } };
    const notifTx = { notification: { create: jest.fn().mockResolvedValue({ id: 'notif-1' }) }, invitation: { update: jest.fn() } };
    tenantPrisma.forTenant
      .mockImplementationOnce((_ctx, fn) => fn(createTx))
      .mockImplementationOnce((_ctx, fn) => fn(orgTx))
      .mockImplementationOnce((_ctx, fn) => fn(notifTx));

    await service.bulkInvite(context, 'exam-1', ['cand-1']);
    await new Promise((resolve) => setImmediate(resolve));

    expect(notifTx.notification.create).toHaveBeenCalledWith({
      data: { invitationId: 'inv-1', status: 'failed', sentAt: null },
    });
    expect(notifTx.invitation.update).toHaveBeenCalledWith({
      where: { id: 'inv-1' },
      data: { emailStatus: 'failed' },
    });
  });

  it('includes the organization logo and scheduled date/time in the invitation email when applicable', async () => {
    const createTx = {
      exam: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'exam-1',
          title: 'Backend Round',
          status: 'published',
          durationMinutes: 90,
          schedulingEnabled: true,
          availabilityWindowStart: new Date('2026-08-01T09:00:00.000Z'),
        }),
      },
      candidate: { findMany: jest.fn().mockResolvedValue([{ id: 'cand-1', email: 'a@test.com', name: 'Alice', erasedAt: null }]) },
      invitation: {
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn().mockResolvedValue({ id: 'inv-1', examId: 'exam-1', candidateId: 'cand-1', status: 'invited' }),
      },
    };
    const orgTx = {
      organization: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ logoPath: 'https://sfstoragepoc.blob.core.windows.net/ptc-vss-sf-interview-storage-container/logos/org-1.png', name: 'Acme Hiring' }),
      },
    };
    const notifTx = { notification: { create: jest.fn().mockResolvedValue({ id: 'notif-1' }) }, invitation: { update: jest.fn() } };
    tenantPrisma.forTenant
      .mockImplementationOnce((_ctx, fn) => fn(createTx))
      .mockImplementationOnce((_ctx, fn) => fn(orgTx))
      .mockImplementationOnce((_ctx, fn) => fn(notifTx));
    // The container is private -- an unsigned logoPath 403s in an email client (ADO-reported:
    // the logo showed as a broken image icon). signIfOurs mints a SAS URL for it; assert the
    // SIGNED url lands in the email, not the raw blob path, and that it's signed with a TTL
    // long enough to survive a candidate opening the email days after it was sent.
    blobStorage.signIfOurs.mockResolvedValue('https://sfstoragepoc.blob.core.windows.net/ptc-vss-sf-interview-storage-container/logos/org-1.png?sv=2024&sig=abc123');

    await service.bulkInvite(context, 'exam-1', ['cand-1']);
    await new Promise((resolve) => setImmediate(resolve));

    expect(orgTx.organization.findUnique).toHaveBeenCalledWith({ where: { id: 'org-1' }, select: { logoPath: true, name: true } });
    expect(blobStorage.signIfOurs).toHaveBeenCalledWith(
      'https://sfstoragepoc.blob.core.windows.net/ptc-vss-sf-interview-storage-container/logos/org-1.png',
      EMAIL_LOGO_SAS_TTL_MS,
    );
    const html = emailService.send.mock.calls[0][0].html;
    expect(html).toContain(
      `<img src="https://sfstoragepoc.blob.core.windows.net/ptc-vss-sf-interview-storage-container/logos/org-1.png?sv=2024&sig=abc123" alt="Organization logo" height="40" />`,
    );
    expect(html).toContain('Date &amp; Time');
    expect(html).toContain('Duration:</strong> 90 minutes');
  });

  it('rejects inviting an erased candidate', async () => {
    const tx = {
      exam: { findFirst: jest.fn().mockResolvedValue({ id: 'exam-1', title: 'Backend Round', status: 'published' }) },
      candidate: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'cand-1', email: 'a@test.com', name: 'Alice', erasedAt: null },
          { id: 'cand-2', email: 'erased-cand-2@redacted.invalid', name: 'Redacted', erasedAt: new Date('2026-06-01') },
        ]),
      },
      invitation: { findMany: jest.fn().mockResolvedValue([]), create: jest.fn() },
    };
    tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

    await expect(service.bulkInvite(context, 'exam-1', ['cand-1', 'cand-2'])).rejects.toThrow(BadRequestException);
    expect(tx.invitation.create).not.toHaveBeenCalled();
  });

  it('throws NotFoundException when the exam does not exist', async () => {
    const tx = { exam: { findFirst: jest.fn().mockResolvedValue(null) } };
    tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

    await expect(service.bulkInvite(context, 'missing-exam', ['cand-1'])).rejects.toThrow(NotFoundException);
  });

  it('throws BadRequestException when the exam is not published', async () => {
    const tx = { exam: { findFirst: jest.fn().mockResolvedValue({ id: 'exam-1', status: 'draft' }) } };
    tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

    await expect(service.bulkInvite(context, 'exam-1', ['cand-1'])).rejects.toThrow(BadRequestException);
  });

  it('throws NotFoundException when a candidateId does not resolve in this organization', async () => {
    const tx = {
      exam: { findFirst: jest.fn().mockResolvedValue({ id: 'exam-1', status: 'published' }) },
      candidate: { findMany: jest.fn().mockResolvedValue([]) },
    };
    tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

    await expect(service.bulkInvite(context, 'exam-1', ['missing-cand'])).rejects.toThrow(NotFoundException);
  });

  it('skips a candidate who already has a live invitation instead of creating a duplicate', async () => {
    const tx = {
      exam: { findFirst: jest.fn().mockResolvedValue({ id: 'exam-1', title: 'Backend Round', status: 'published' }) },
      candidate: { findMany: jest.fn().mockResolvedValue([{ id: 'cand-1', email: 'a@test.com', name: 'Alice', erasedAt: null }]) },
      invitation: {
        findMany: jest.fn().mockResolvedValue([{ candidateId: 'cand-1' }]),
        create: jest.fn(),
      },
    };
    tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

    const result = await service.bulkInvite(context, 'exam-1', ['cand-1']);

    expect(result.created).toHaveLength(0);
    expect(result.skipped).toEqual([{ candidateId: 'cand-1', reason: 'Candidate already has a live invitation for this exam' }]);
    expect(tx.invitation.create).not.toHaveBeenCalled();
    expect(emailService.send).not.toHaveBeenCalled();
  });

  it('sets expiresAt to the exam availability window end for a scheduled exam', async () => {
    const tx = {
      exam: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'exam-1',
          title: 'Backend Round',
          status: 'published',
          schedulingEnabled: true,
          availabilityWindowEnd: new Date('2026-07-27T18:00:00.000Z'),
        }),
      },
      candidate: { findMany: jest.fn().mockResolvedValue([{ id: 'cand-1', email: 'a@test.com', name: 'Alice', erasedAt: null }]) },
      invitation: {
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn().mockResolvedValue({ id: 'inv-1', examId: 'exam-1', candidateId: 'cand-1', status: 'invited' }),
      },
    };
    tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

    await service.bulkInvite(context, 'exam-1', ['cand-1']);

    expect(tx.invitation.create).toHaveBeenCalledWith({
      data: {
        examId: 'exam-1',
        candidateId: 'cand-1',
        token: expect.any(String),
        expiresAt: new Date('2026-07-27T18:00:00.000Z'),
      },
    });
  });

  it('sets expiresAt to a 7-day default for a non-scheduled exam', async () => {
    const tx = {
      exam: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'exam-1',
          title: 'Backend Round',
          status: 'published',
          schedulingEnabled: false,
          availabilityWindowEnd: null,
        }),
      },
      candidate: { findMany: jest.fn().mockResolvedValue([{ id: 'cand-1', email: 'a@test.com', name: 'Alice', erasedAt: null }]) },
      invitation: {
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn().mockResolvedValue({ id: 'inv-1', examId: 'exam-1', candidateId: 'cand-1', status: 'invited' }),
      },
    };
    tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

    await service.bulkInvite(context, 'exam-1', ['cand-1']);

    const expiresAt: Date = tx.invitation.create.mock.calls[0][0].data.expiresAt;
    const expectedExpiry = new Date();
    expectedExpiry.setDate(expectedExpiry.getDate() + 7);
    expect(Math.abs(expiresAt.getTime() - expectedExpiry.getTime())).toBeLessThan(5000);
  });

  it('records an invitation.created audit entry with the invited count and exam title', async () => {
    const createTx = {
      exam: { findFirst: jest.fn().mockResolvedValue({ id: 'exam-1', title: 'Backend Round', status: 'published' }) },
      candidate: { findMany: jest.fn().mockResolvedValue([{ id: 'cand-1', email: 'a@test.com', name: 'Alice', erasedAt: null }]) },
      invitation: {
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn().mockResolvedValue({ id: 'inv-1', examId: 'exam-1', candidateId: 'cand-1', status: 'invited' }),
      },
    };
    const notifTx = { notification: { create: jest.fn().mockResolvedValue({ id: 'notif-1' }) }, invitation: { update: jest.fn() } };
    tenantPrisma.forTenant
      .mockImplementationOnce((_ctx, fn) => fn(createTx))
      .mockImplementationOnce((_ctx, fn) => fn(notifTx));

    await service.bulkInvite(context, 'exam-1', ['cand-1']);

    expect(audit.record).toHaveBeenCalledWith(context, {
      actorUserId: null,
      action: 'invitation.created',
      entityType: 'invitation',
      metadata: { count: 1, examTitle: 'Backend Round' },
    });
  });

  it('does not record an invitation.created audit entry when every candidate is skipped', async () => {
    const tx = {
      exam: { findFirst: jest.fn().mockResolvedValue({ id: 'exam-1', title: 'Backend Round', status: 'published' }) },
      candidate: { findMany: jest.fn().mockResolvedValue([{ id: 'cand-1', email: 'a@test.com', name: 'Alice', erasedAt: null }]) },
      invitation: {
        findMany: jest.fn().mockResolvedValue([{ candidateId: 'cand-1' }]),
        create: jest.fn(),
      },
    };
    tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

    await service.bulkInvite(context, 'exam-1', ['cand-1']);

    expect(audit.record).not.toHaveBeenCalled();
  });

  it('enqueues an invitation.created webhook after successfully inviting candidates', async () => {
    const createTx = {
      exam: { findFirst: jest.fn().mockResolvedValue({ id: 'exam-1', title: 'Backend Round', status: 'published' }) },
      candidate: { findMany: jest.fn().mockResolvedValue([{ id: 'cand-1', email: 'a@test.com', name: 'Alice', erasedAt: null }]) },
      invitation: {
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn().mockResolvedValue({ id: 'inv-1', examId: 'exam-1', candidateId: 'cand-1', status: 'invited' }),
      },
    };
    const notifTx = { notification: { create: jest.fn().mockResolvedValue({ id: 'notif-1' }) }, invitation: { update: jest.fn() } };
    tenantPrisma.forTenant
      .mockImplementationOnce((_ctx, fn) => fn(createTx))
      .mockImplementationOnce((_ctx, fn) => fn(notifTx));

    await service.bulkInvite(context, 'exam-1', ['cand-1']);

    expect(webhooksService.enqueue).toHaveBeenCalledWith(
      'org-1',
      'invitation.created',
      expect.objectContaining({ id: 'inv-1', examId: 'exam-1', candidateId: 'cand-1' }),
    );
  });

  it('does not enqueue a webhook when no invitations were actually created', async () => {
    // Real bulkInvite() throws NotFoundException before reaching createdWithCandidate
    // if a requested candidateId doesn't resolve at all (see the "throws NotFoundException
    // when a candidateId does not resolve" test above) -- so the only non-throwing path
    // to zero created invitations is every candidate being skipped as already-invited,
    // matching the "skips a candidate who already has a live invitation" test's fixture.
    const tx = {
      exam: { findFirst: jest.fn().mockResolvedValue({ id: 'exam-1', title: 'Backend Round', status: 'published' }) },
      candidate: { findMany: jest.fn().mockResolvedValue([{ id: 'cand-1', email: 'a@test.com', name: 'Alice', erasedAt: null }]) },
      invitation: {
        findMany: jest.fn().mockResolvedValue([{ candidateId: 'cand-1' }]),
        create: jest.fn(),
      },
    };
    tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

    await service.bulkInvite(context, 'exam-1', ['cand-1']);

    expect(webhooksService.enqueue).not.toHaveBeenCalled();
  });

  it('lists invitations for an exam, including extraTimePercent and whether an attempt exists', async () => {
    const tx = {
      exam: { findFirst: jest.fn().mockResolvedValue({ id: 'exam-1' }) },
      invitation: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'inv-1', examId: 'exam-1', candidateId: 'cand-1', status: 'invited', extraTimePercent: 50, attempt: { id: 'attempt-1', status: 'in_progress' }, candidate: { id: 'cand-1' } },
          { id: 'inv-2', examId: 'exam-1', candidateId: 'cand-2', status: 'invited', extraTimePercent: 0, attempt: null, candidate: { id: 'cand-2' } },
        ]),
      },
    };
    tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

    const result = await service.list(context, 'exam-1');

    expect(result).toHaveLength(2);
    expect(tx.invitation.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        select: expect.objectContaining({
          candidate: true,
          extraTimePercent: true,
          emailStatus: true,
          resendCount: true,
          attempt: { select: { id: true, status: true } },
        }),
      }),
    );
    const selectArg = tx.invitation.findMany.mock.calls[0][0].select;
    expect(selectArg).not.toHaveProperty('token');
    expect(result[0]).toMatchObject({ extraTimePercent: 50, attempt: { id: 'attempt-1', status: 'in_progress' } });
    expect(result[1]).toMatchObject({ extraTimePercent: 0, attempt: null });
  });

  it('throws NotFoundException when listing invitations for an exam that does not exist', async () => {
    const tx = { exam: { findFirst: jest.fn().mockResolvedValue(null) } };
    tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

    await expect(service.list(context, 'missing-exam')).rejects.toThrow(NotFoundException);
  });

  it('resends an invitation with a new token and re-sends the email', async () => {
    const existing = {
      id: 'inv-1',
      status: 'invited',
      exam: { title: 'Backend Round', organizationId: 'org-1' },
      candidate: { email: 'a@test.com', name: 'Alice' },
    };
    const updated = { id: 'inv-1', token: 'new-token', status: 'invited' };
    const resendTx = {
      invitation: {
        findFirst: jest.fn().mockResolvedValue(existing),
        update: jest.fn().mockResolvedValue(updated),
      },
    };
    const orgTx = { organization: { findUnique: jest.fn().mockResolvedValue({ logoPath: null }) } };
    const notifTx = { notification: { create: jest.fn().mockResolvedValue({ id: 'notif-2' }) }, invitation: { update: jest.fn() } };
    tenantPrisma.forTenant
      .mockImplementationOnce((_ctx, fn) => fn(resendTx))
      .mockImplementationOnce((_ctx, fn) => fn(orgTx))
      .mockImplementationOnce((_ctx, fn) => fn(notifTx));

    const result = await service.resend(context, 'user-1', 'inv-1');

    expect(result).toEqual(updated);
    expect(resendTx.invitation.update).toHaveBeenCalledWith({
      where: { id: 'inv-1' },
      data: { token: expect.any(String), expiresAt: expect.any(Date), emailStatus: 'pending', resendCount: { increment: 1 } },
    });

    // Email dispatch is fire-and-forget -- flush the microtask queue before asserting.
    await new Promise((resolve) => setImmediate(resolve));

    expect(emailService.send).toHaveBeenCalledWith(expect.objectContaining({ to: 'a@test.com' }));
  });

  it('resend() also uses the scheduled window end, not the 7-day default, for a scheduled exam', async () => {
    const existing = {
      id: 'inv-1',
      status: 'invited',
      exam: { title: 'Backend Round', organizationId: 'org-1', schedulingEnabled: true, availabilityWindowEnd: new Date('2026-08-01T00:00:00.000Z') },
      candidate: { email: 'a@test.com', name: 'Alice' },
    };
    const updated = { id: 'inv-1', token: 'new-token', status: 'invited' };
    const tx = {
      invitation: {
        findFirst: jest.fn().mockResolvedValue(existing),
        update: jest.fn().mockResolvedValue(updated),
      },
    };
    tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

    await service.resend(context, 'user-1', 'inv-1');

    expect(tx.invitation.update).toHaveBeenCalledWith({
      where: { id: 'inv-1' },
      data: { token: expect.any(String), expiresAt: new Date('2026-08-01T00:00:00.000Z'), emailStatus: 'pending', resendCount: { increment: 1 } },
    });
  });

  it('throws NotFoundException when resending an invitation that does not exist', async () => {
    const tx = { invitation: { findFirst: jest.fn().mockResolvedValue(null) } };
    tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

    await expect(service.resend(context, 'user-1', 'missing-inv')).rejects.toThrow(NotFoundException);
  });

  it('throws BadRequestException when resending a revoked invitation', async () => {
    const tx = {
      invitation: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'inv-1',
          status: 'revoked',
          exam: { title: 'Backend Round' },
          candidate: { email: 'a@test.com' },
        }),
      },
    };
    tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

    await expect(service.resend(context, 'user-1', 'inv-1')).rejects.toThrow(BadRequestException);
  });

  it('revokes a live invitation', async () => {
    const tx = {
      invitation: {
        findFirst: jest.fn().mockResolvedValue({ id: 'inv-1', status: 'invited' }),
        update: jest.fn().mockResolvedValue({ id: 'inv-1', status: 'revoked' }),
      },
    };
    tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

    const result = await service.revoke(context, 'user-1', 'inv-1');

    expect(result.status).toBe('revoked');
    expect(tx.invitation.update).toHaveBeenCalledWith({
      where: { id: 'inv-1' },
      data: { status: 'revoked', revokedAt: expect.any(Date) },
    });
    expect(audit.record).toHaveBeenCalledWith(context, {
      actorUserId: 'user-1', action: 'invitation.revoked', entityType: 'invitation', entityId: 'inv-1',
    });
  });

  it('revoking an already-revoked invitation is a no-op, not an error, and is not re-audited', async () => {
    const tx = {
      invitation: {
        findFirst: jest.fn().mockResolvedValue({ id: 'inv-1', status: 'revoked' }),
        update: jest.fn(),
      },
    };
    tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

    const result = await service.revoke(context, 'user-1', 'inv-1');

    expect(result.status).toBe('revoked');
    expect(tx.invitation.update).not.toHaveBeenCalled();
    expect(audit.record).not.toHaveBeenCalled();
  });

  it('throws NotFoundException when revoking an invitation that does not exist', async () => {
    const tx = { invitation: { findFirst: jest.fn().mockResolvedValue(null) } };
    tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

    await expect(service.revoke(context, 'user-1', 'missing-inv')).rejects.toThrow(NotFoundException);
    expect(audit.record).not.toHaveBeenCalled();
  });

  describe('updateAccommodation', () => {
    it('updates extraTimePercent when the invitation has no attempt yet', async () => {
      const tx = {
        invitation: {
          findFirst: jest.fn().mockResolvedValue({ id: 'inv-1', exam: { organizationId: 'org-1' }, attempt: null }),
          update: jest.fn().mockResolvedValue({ id: 'inv-1', extraTimePercent: 50 }),
        },
      };
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

      const result = await service.updateAccommodation(context, 'user-1', 'inv-1', 50);

      expect(tx.invitation.update).toHaveBeenCalledWith({ where: { id: 'inv-1' }, data: { extraTimePercent: 50 } });
      expect(result.extraTimePercent).toBe(50);
    });

    it('throws BadRequestException when the invitation already has an attempt', async () => {
      const tx = {
        invitation: {
          findFirst: jest.fn().mockResolvedValue({ id: 'inv-1', exam: { organizationId: 'org-1' }, attempt: { id: 'attempt-1' } }),
          update: jest.fn(),
        },
      };
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

      await expect(service.updateAccommodation(context, 'user-1', 'inv-1', 50)).rejects.toThrow(BadRequestException);
      expect(tx.invitation.update).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when the invitation does not exist in this organization', async () => {
      const tx = { invitation: { findFirst: jest.fn().mockResolvedValue(null), update: jest.fn() } };
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

      await expect(service.updateAccommodation(context, 'user-1', 'missing', 50)).rejects.toThrow(NotFoundException);
    });
  });

  describe('bulkUploadAndInvite', () => {
    it('creates/updates candidates from a CSV, invites them, and reports skips and errors separately', async () => {
      const csv = [
        'Email,First Name,Last Name,Phone',
        'new@test.com,New,Person,',
        'existing@test.com,Existing,Updated,555-0002',
        'not-an-email,Bad,Row,',
      ].join('\n');
      const file = { originalname: 'candidates.csv', size: Buffer.byteLength(csv), buffer: Buffer.from(csv) } as Express.Multer.File;

      const examCheckTx = { exam: { findFirst: jest.fn().mockResolvedValue({ id: 'exam-1', title: 'Backend Round', status: 'published' }) } };
      const candidateLoopTx = {
        candidate: {
          findFirst: jest
            .fn()
            .mockResolvedValueOnce(null)
            .mockResolvedValueOnce({ id: 'cand-existing', email: 'existing@test.com' }),
          create: jest.fn().mockResolvedValue({ id: 'cand-new', email: 'new@test.com' }),
          update: jest.fn().mockResolvedValue({ id: 'cand-existing', email: 'existing@test.com' }),
        },
      };
      const bulkInviteTx = {
        exam: { findFirst: jest.fn().mockResolvedValue({ id: 'exam-1', title: 'Backend Round', status: 'published' }) },
        candidate: {
          findMany: jest.fn().mockResolvedValue([
            { id: 'cand-new', email: 'new@test.com', name: 'New Person', erasedAt: null },
            { id: 'cand-existing', email: 'existing@test.com', name: 'Existing Updated', erasedAt: null },
          ]),
        },
        invitation: {
          findMany: jest.fn().mockResolvedValue([{ candidateId: 'cand-existing' }]),
          create: jest.fn().mockResolvedValue({ id: 'inv-1', examId: 'exam-1', candidateId: 'cand-new', status: 'invited' }),
        },
      };
      // Three sequential forTenant calls, in order: the exam-published check, the
      // candidate create/update loop, and bulkInvite's own internal transaction.
      // A 4th call (the fire-and-forget notification write inside dispatchInvitationEmail)
      // happens asynchronously after this method returns and is not awaited here --
      // matching how the existing bulkInvite test above only asserts on it after an
      // explicit microtask flush. It's left unmocked; an unmocked forTenant call falls
      // through to undefined, which dispatchInvitationEmail awaits harmlessly since its
      // caller already wraps it in .catch().
      tenantPrisma.forTenant
        .mockImplementationOnce((_ctx, fn) => fn(examCheckTx))
        .mockImplementationOnce((_ctx, fn) => fn(candidateLoopTx))
        .mockImplementationOnce((_ctx, fn) => fn(bulkInviteTx));

      const result = await service.bulkUploadAndInvite(context, 'exam-1', file);

      expect(result.created).toHaveLength(1);
      expect(result.created[0].candidateId).toBe('cand-new');
      expect(result.skipped).toEqual([{ email: 'existing@test.com', reason: 'Candidate already has a live invitation for this exam' }]);
      expect(result.errors).toEqual([{ row: 3, message: 'Invalid or missing email: "not-an-email"' }]);
      expect(candidateLoopTx.candidate.create).toHaveBeenCalledWith({
        data: { organizationId: 'org-1', email: 'new@test.com', name: 'New Person', phone: undefined },
      });
      expect(candidateLoopTx.candidate.update).toHaveBeenCalledWith({
        where: { id: 'cand-existing' },
        data: { name: 'Existing Updated', phone: '555-0002' },
      });
    });

    it('rejects the whole request when the exam is not published, before any candidate is created', async () => {
      const csv = 'Email,First Name,Last Name,Phone\nalice@test.com,Alice,Test,';
      const file = { originalname: 'candidates.csv', size: Buffer.byteLength(csv), buffer: Buffer.from(csv) } as Express.Multer.File;
      const tx = { exam: { findFirst: jest.fn().mockResolvedValue({ id: 'exam-1', status: 'draft' }) } };
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

      await expect(service.bulkUploadAndInvite(context, 'exam-1', file)).rejects.toThrow(BadRequestException);
    });

    it('rejects a file with an unsupported extension before touching the exam or database', async () => {
      const file = { originalname: 'candidates.txt', size: 10, buffer: Buffer.from('irrelevant') } as Express.Multer.File;

      await expect(service.bulkUploadAndInvite(context, 'exam-1', file)).rejects.toThrow(BadRequestException);
      expect(tenantPrisma.forTenant).not.toHaveBeenCalled();
    });
  });
});
