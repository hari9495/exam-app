import { Test } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { InvitationsService } from './invitations.service';
import { TenantPrismaService, AuditService } from '@exam-platform/shared';
import { EmailService } from '../email/email.service';

describe('InvitationsService', () => {
  let service: InvitationsService;
  let tenantPrisma: { forTenant: jest.Mock };
  let emailService: { send: jest.Mock };
  let audit: { record: jest.Mock };
  const context = { organizationId: 'org-1', isSuperAdmin: false };

  beforeEach(async () => {
    tenantPrisma = { forTenant: jest.fn() };
    emailService = { send: jest.fn().mockResolvedValue({ success: true, previewUrl: 'https://ethereal.email/x' }) };
    audit = { record: jest.fn() };
    const moduleRef = await Test.createTestingModule({
      providers: [
        InvitationsService,
        { provide: TenantPrismaService, useValue: tenantPrisma },
        { provide: EmailService, useValue: emailService },
        { provide: AuditService, useValue: audit },
      ],
    }).compile();
    service = moduleRef.get(InvitationsService);
  });

  it('invites every requested candidate to a published exam and sends an email for each', async () => {
    const createTx = {
      exam: { findFirst: jest.fn().mockResolvedValue({ id: 'exam-1', title: 'Backend Round', status: 'published' }) },
      candidate: { findMany: jest.fn().mockResolvedValue([{ id: 'cand-1', email: 'a@test.com', name: 'Alice', erasedAt: null }]) },
      invitation: {
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn().mockResolvedValue({ id: 'inv-1', examId: 'exam-1', candidateId: 'cand-1', status: 'invited' }),
      },
    };
    const notifTx = { notification: { create: jest.fn().mockResolvedValue({ id: 'notif-1' }) } };
    tenantPrisma.forTenant
      .mockImplementationOnce((_ctx, fn) => fn(createTx))
      .mockImplementationOnce((_ctx, fn) => fn(notifTx));

    const result = await service.bulkInvite(context, 'exam-1', ['cand-1']);

    expect(result.created).toHaveLength(1);
    expect(result.skipped).toHaveLength(0);

    // Email dispatch is fire-and-forget (the HTTP response no longer waits on it) --
    // flush the microtask queue so the background send + notification write settle
    // before asserting on them.
    await new Promise((resolve) => setImmediate(resolve));

    expect(emailService.send).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'a@test.com', subject: "You've been invited to an exam" }),
    );
    expect(notifTx.notification.create).toHaveBeenCalledWith({
      data: { invitationId: 'inv-1', status: 'sent', sentAt: expect.any(Date) },
    });
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

  it('lists invitations for an exam', async () => {
    const tx = {
      exam: { findFirst: jest.fn().mockResolvedValue({ id: 'exam-1' }) },
      invitation: { findMany: jest.fn().mockResolvedValue([{ id: 'inv-1' }]) },
    };
    tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

    const result = await service.list(context, 'exam-1');

    expect(result).toHaveLength(1);
    expect(tx.invitation.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        select: expect.objectContaining({ candidate: true }),
      }),
    );
    const selectArg = tx.invitation.findMany.mock.calls[0][0].select;
    expect(selectArg).not.toHaveProperty('token');
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
    const notifTx = { notification: { create: jest.fn().mockResolvedValue({ id: 'notif-2' }) } };
    tenantPrisma.forTenant
      .mockImplementationOnce((_ctx, fn) => fn(resendTx))
      .mockImplementationOnce((_ctx, fn) => fn(notifTx));

    const result = await service.resend(context, 'inv-1');

    expect(result).toEqual(updated);
    expect(resendTx.invitation.update).toHaveBeenCalledWith({
      where: { id: 'inv-1' },
      data: { token: expect.any(String), expiresAt: expect.any(Date) },
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

    await service.resend(context, 'inv-1');

    expect(tx.invitation.update).toHaveBeenCalledWith({
      where: { id: 'inv-1' },
      data: { token: expect.any(String), expiresAt: new Date('2026-08-01T00:00:00.000Z') },
    });
  });

  it('throws NotFoundException when resending an invitation that does not exist', async () => {
    const tx = { invitation: { findFirst: jest.fn().mockResolvedValue(null) } };
    tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

    await expect(service.resend(context, 'missing-inv')).rejects.toThrow(NotFoundException);
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

    await expect(service.resend(context, 'inv-1')).rejects.toThrow(BadRequestException);
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
});
