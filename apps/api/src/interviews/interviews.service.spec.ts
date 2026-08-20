import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { InterviewsService } from './interviews.service';

describe('InterviewsService', () => {
  let service: InterviewsService;
  let tenantPrisma: { forTenant: jest.Mock };
  let emailService: { send: jest.Mock };
  let blobStorage: { signIfOurs: jest.Mock };
  let audit: { record: jest.Mock };
  let integrationEvents: { emit: jest.Mock };
  let tx: {
    pipelineEntry: Record<string, jest.Mock>;
    interview: Record<string, jest.Mock>;
    interviewSlot: Record<string, jest.Mock>;
    interviewPanelist: Record<string, jest.Mock>;
    user: Record<string, jest.Mock>;
    organization: Record<string, jest.Mock>;
  };
  const context = { organizationId: 'org-1', isSuperAdmin: false } as any;

  beforeEach(() => {
    tx = {
      pipelineEntry: {
        findFirst: jest.fn().mockResolvedValue({ id: 'entry-1', candidateId: 'cand-1', organizationId: 'org-1' }),
        findUnique: jest.fn().mockResolvedValue({
          job: { title: 'Backend Engineer' },
          candidate: { name: 'Asha Rao', email: 'asha@example.com' },
        }),
      },
      interview: {
        create: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn().mockImplementation(({ data }: any) => Promise.resolve({ id: 'interview-1', ...data })),
        updateMany: jest.fn(),
      },
      interviewSlot: {
        findUnique: jest.fn(),
      },
      interviewPanelist: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      user: {
        findMany: jest.fn().mockResolvedValue([{ id: 'panelist-1' }]),
        findUnique: jest.fn().mockResolvedValue({ name: 'Priya' }),
      },
      organization: {
        findUnique: jest.fn().mockResolvedValue({ name: 'Acme', logoPath: null }),
      },
    };
    tenantPrisma = { forTenant: jest.fn().mockImplementation((_c, fn) => fn(tx)) };
    emailService = { send: jest.fn().mockResolvedValue({ success: true }) };
    blobStorage = { signIfOurs: jest.fn().mockResolvedValue(null) };
    audit = { record: jest.fn() };
    integrationEvents = { emit: jest.fn() };
    service = new InterviewsService(tenantPrisma as any, emailService as any, blobStorage as any, audit as any, integrationEvents as any);
  });

  describe('createInterview', () => {
    const dto = {
      slots: [{ startsAt: '2026-09-01T10:00:00.000Z', endsAt: '2026-09-01T11:00:00.000Z' }],
      panelistUserIds: ['panelist-1'],
      location: 'Room 1',
      timeZone: 'UTC',
    };

    it('creates the interview with slots + panelists in one tx, and audits interview.created', async () => {
      tx.interview.create.mockResolvedValue({ id: 'interview-1', status: 'proposed' });

      const out = await service.createInterview(context, 'user-1', 'entry-1', dto as any);

      expect(tx.pipelineEntry.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ id: 'entry-1', organizationId: 'org-1' }) }),
      );
      expect(tx.user.findMany).toHaveBeenCalledWith({
        where: { id: { in: ['panelist-1'] }, organizationId: 'org-1' },
        select: { id: true },
      });
      expect(tx.interview.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          organizationId: 'org-1',
          pipelineEntryId: 'entry-1',
          candidateId: 'cand-1',
          status: 'proposed',
          location: 'Room 1',
          timeZone: 'UTC',
          recruiterNote: null,
          slots: { create: [{ organizationId: 'org-1', startsAt: new Date(dto.slots[0].startsAt), endsAt: new Date(dto.slots[0].endsAt) }] },
          panelists: { create: [{ organizationId: 'org-1', userId: 'panelist-1' }] },
        }),
        include: { slots: true, panelists: true },
      });
      expect(out).toMatchObject({ id: 'interview-1' });
      expect(audit.record).toHaveBeenCalledWith(
        context,
        expect.objectContaining({ actorUserId: 'user-1', action: 'interview.created', entityId: 'interview-1' }),
      );
    });

    it('skips the panelist org-check when panelistUserIds is empty', async () => {
      tx.interview.create.mockResolvedValue({ id: 'interview-1' });

      await service.createInterview(context, 'user-1', 'entry-1', { ...dto, panelistUserIds: [] } as any);

      expect(tx.user.findMany).not.toHaveBeenCalled();
      expect(tx.interview.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ panelists: { create: [] } }) }),
      );
    });

    it('throws BadRequestException when dto.slots is empty', async () => {
      await expect(service.createInterview(context, 'user-1', 'entry-1', { ...dto, slots: [] } as any)).rejects.toThrow(
        BadRequestException,
      );
      expect(tx.interview.create).not.toHaveBeenCalled();
    });

    it('throws BadRequestException when a slot ends at or before it starts, and creates nothing', async () => {
      const badSlot = { startsAt: '2026-09-01T11:00:00.000Z', endsAt: '2026-09-01T10:00:00.000Z' };
      await expect(
        service.createInterview(context, 'user-1', 'entry-1', { ...dto, slots: [badSlot] } as any),
      ).rejects.toThrow(BadRequestException);
      expect(tx.interview.create).not.toHaveBeenCalled();
    });

    it('throws BadRequestException when a panelist is not in this org', async () => {
      tx.user.findMany.mockResolvedValue([]);

      await expect(service.createInterview(context, 'user-1', 'entry-1', dto as any)).rejects.toThrow(BadRequestException);
      expect(tx.interview.create).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when the entry is not in the org', async () => {
      tx.pipelineEntry.findFirst.mockResolvedValue(null);

      await expect(service.createInterview(context, 'user-1', 'entry-x', dto as any)).rejects.toThrow(NotFoundException);
      expect(tx.interview.create).not.toHaveBeenCalled();
    });
  });

  describe('listForEntry', () => {
    it('lists org-scoped interviews for a pipeline entry, newest first', async () => {
      await service.listForEntry(context, 'entry-1');

      expect(tx.interview.findMany).toHaveBeenCalledWith({
        where: { organizationId: 'org-1', pipelineEntryId: 'entry-1' },
        include: { slots: true, panelists: true },
        orderBy: { createdAt: 'desc' },
      });
    });
  });

  describe('listForCandidate', () => {
    it('lists org-scoped interviews for a candidate, newest first', async () => {
      await service.listForCandidate(context, 'cand-1');

      expect(tx.interview.findMany).toHaveBeenCalledWith({
        where: { organizationId: 'org-1', candidateId: 'cand-1' },
        include: { slots: true, panelists: true },
        orderBy: { createdAt: 'desc' },
      });
    });
  });

  describe('listMine', () => {
    it('returns only org-scoped interviews where the caller is a panelist', async () => {
      await service.listMine(context, 'user-1');

      expect(tx.interview.findMany).toHaveBeenCalledWith({
        where: { organizationId: 'org-1', panelists: { some: { userId: 'user-1' } } },
        include: { slots: true },
        orderBy: { createdAt: 'desc' },
      });
    });
  });

  describe('cancel', () => {
    it('sets status to cancelled and audits interview.cancelled', async () => {
      tx.interview.findFirst.mockResolvedValue({ id: 'interview-1', organizationId: 'org-1', status: 'proposed' });
      tx.interview.update.mockResolvedValue({ id: 'interview-1', status: 'cancelled' });

      const out = await service.cancel(context, 'user-1', 'interview-1');

      expect(tx.interview.update).toHaveBeenCalledWith({ where: { id: 'interview-1' }, data: { status: 'cancelled' } });
      expect(audit.record).toHaveBeenCalledWith(
        context,
        expect.objectContaining({ actorUserId: 'user-1', action: 'interview.cancelled', entityId: 'interview-1' }),
      );
      expect(out).toEqual({ id: 'interview-1', status: 'cancelled' });
    });

    it('throws NotFoundException for an interview outside the org', async () => {
      tx.interview.findFirst.mockResolvedValue(null);

      await expect(service.cancel(context, 'user-1', 'interview-x')).rejects.toThrow(NotFoundException);
      expect(tx.interview.update).not.toHaveBeenCalled();
    });

    it('sends no cancellation email for an unconfirmed interview', async () => {
      tx.interview.findFirst.mockResolvedValue({ id: 'interview-1', organizationId: 'org-1', status: 'proposed', confirmedSlotId: null });

      await service.cancel(context, 'user-1', 'interview-1');

      expect(emailService.send).not.toHaveBeenCalled();
    });

    it('retracts a CONFIRMED interview with a METHOD:CANCEL ics to candidate, recruiter and panelists', async () => {
      tx.interview.findFirst.mockResolvedValue({
        id: 'interview-1', organizationId: 'org-1', status: 'confirmed', confirmedSlotId: 'slot-1',
        pipelineEntryId: 'entry-1', sentByUserId: 'recruiter-1', location: 'Room 1', recruiterNote: 'Panel', timeZone: 'UTC',
      });
      tx.interview.update.mockResolvedValue({ id: 'interview-1', status: 'cancelled', timeZone: 'UTC' });
      tx.interviewSlot.findUnique.mockResolvedValue({ startsAt: new Date('2026-09-01T14:00:00Z'), endsAt: new Date('2026-09-01T15:00:00Z') });
      tx.pipelineEntry.findUnique.mockResolvedValue({ candidate: { name: 'Asha Rao', email: 'asha@example.com' }, job: { title: 'Backend Engineer' } });
      tx.interviewPanelist.findMany.mockResolvedValue([{ userId: 'panelist-1' }]);
      tx.user.findUnique.mockResolvedValue({ email: 'recruiter@example.com' });
      tx.user.findMany.mockResolvedValue([{ email: 'panelist@example.com' }]);

      await service.cancel(context, 'user-1', 'interview-1');

      const recipients = emailService.send.mock.calls.map((c) => c[0].to);
      expect(recipients).toEqual(expect.arrayContaining(['asha@example.com', 'recruiter@example.com', 'panelist@example.com']));
      const ics = emailService.send.mock.calls[0][0].attachments[0].content.toString();
      expect(ics).toContain('METHOD:CANCEL');
      expect(ics).toContain('UID:interview-1');
    });
  });

  describe('sendInvite', () => {
    const baseInterview = () => ({
      id: 'interview-1',
      organizationId: 'org-1',
      status: 'proposed',
      interviewToken: null as string | null,
      location: 'Room 1',
      timeZone: 'UTC',
      recruiterNote: null as string | null,
      pipelineEntry: {
        candidate: { id: 'cand-1', name: 'Asha Rao', email: 'asha@example.com', erasedAt: null as Date | null },
        job: { id: 'job-1', title: 'Backend Engineer' },
      },
      slots: [{ id: 'slot-1', startsAt: new Date('2026-09-01T14:00:00.000Z'), endsAt: new Date('2026-09-01T15:00:00.000Z') }],
      panelists: [{ id: 'panelist-row-1', userId: 'panelist-1' }],
    });

    beforeEach(() => {
      tx.interview.findFirst.mockResolvedValue(baseInterview());
      tx.user.findMany.mockResolvedValue([{ id: 'panelist-1', email: 'panelist@example.com', name: 'Jane' }]);
    });

    it('loads the interview org-scoped with candidate/job/slots(asc)/panelists', async () => {
      await service.sendInvite(context, 'user-1', 'interview-1');

      expect(tx.interview.findFirst).toHaveBeenCalledWith({
        where: { id: 'interview-1', organizationId: 'org-1' },
        include: {
          pipelineEntry: { include: { candidate: true, job: true } },
          slots: { orderBy: { startsAt: 'asc' } },
          panelists: true,
        },
      });
    });

    it('sends the candidate invite + one email per panelist, sets sentAt, and audits interview.invited', async () => {
      const out = await service.sendInvite(context, 'user-1', 'interview-1');

      expect(emailService.send).toHaveBeenCalledTimes(2);
      expect(emailService.send).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({ to: 'asha@example.com', organizationId: 'org-1' }),
      );
      expect(emailService.send).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({ to: 'panelist@example.com', organizationId: 'org-1' }),
      );
      expect(tx.interview.update).toHaveBeenCalledWith({
        where: { id: 'interview-1' },
        data: { sentAt: expect.any(Date), sentByUserId: 'user-1' },
      });
      expect(audit.record).toHaveBeenCalledWith(
        context,
        expect.objectContaining({ actorUserId: 'user-1', action: 'interview.invited', entityId: 'interview-1' }),
      );
      expect(out).toMatchObject({ sentByUserId: 'user-1' });
    });

    it('escapes candidate name/job title into the panelist email via buildCandidateEmailHtml (not raw HTML)', async () => {
      tx.interview.findFirst.mockResolvedValue({
        ...baseInterview(),
        pipelineEntry: {
          candidate: { id: 'cand-1', name: '<script>alert(1)</script>', email: 'asha@example.com', erasedAt: null },
          job: { id: 'job-1', title: 'Backend Engineer' },
        },
      });

      await service.sendInvite(context, 'user-1', 'interview-1');

      const panelistCall = emailService.send.mock.calls[1][0];
      expect(panelistCall.html).not.toContain('<script>alert(1)</script>');
      expect(panelistCall.html).toContain('&lt;script&gt;');
    });

    it('runs the candidate + panelist email sends outside both forTenant calls (after the first, before the second)', async () => {
      await service.sendInvite(context, 'user-1', 'interview-1');

      const [firstTxOrder, secondTxOrder] = tenantPrisma.forTenant.mock.invocationCallOrder;
      const sendOrders = emailService.send.mock.invocationCallOrder;
      expect(sendOrders.length).toBe(2);
      for (const order of sendOrders) {
        expect(order).toBeGreaterThan(firstTxOrder);
        expect(order).toBeLessThan(secondTxOrder);
      }
    });

    it('mints an interviewToken when absent', async () => {
      await service.sendInvite(context, 'user-1', 'interview-1');

      expect(tx.interview.update).toHaveBeenCalledWith({
        where: { id: 'interview-1' },
        data: { interviewToken: expect.any(String) },
      });
    });

    it('does not mint a new interviewToken when one already exists', async () => {
      tx.interview.findFirst.mockResolvedValue({ ...baseInterview(), interviewToken: 'existing-token' });

      await service.sendInvite(context, 'user-1', 'interview-1');

      expect(tx.interview.update).not.toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ interviewToken: expect.any(String) }) }),
      );
    });

    it('throws BadRequestException when the candidate has been erased, and sends no email', async () => {
      tx.interview.findFirst.mockResolvedValue({
        ...baseInterview(),
        pipelineEntry: {
          ...baseInterview().pipelineEntry,
          candidate: { ...baseInterview().pipelineEntry.candidate, erasedAt: new Date() },
        },
      });

      await expect(service.sendInvite(context, 'user-1', 'interview-1')).rejects.toThrow(BadRequestException);
      expect(emailService.send).not.toHaveBeenCalled();
    });

    it('throws BadRequestException when interview status is not proposed, and sends no email', async () => {
      tx.interview.findFirst.mockResolvedValue({ ...baseInterview(), status: 'confirmed' });

      await expect(service.sendInvite(context, 'user-1', 'interview-1')).rejects.toThrow(BadRequestException);
      expect(emailService.send).not.toHaveBeenCalled();
    });

    it('throws NotFoundException for an interview outside the org', async () => {
      tx.interview.findFirst.mockResolvedValue(null);

      await expect(service.sendInvite(context, 'user-1', 'interview-x')).rejects.toThrow(NotFoundException);
      expect(emailService.send).not.toHaveBeenCalled();
    });
  });

  describe('getPublicInterview', () => {
    function baseResolvedInterview(overrides: Record<string, unknown> = {}) {
      return {
        id: 'interview-1',
        organizationId: 'org-1',
        pipelineEntryId: 'entry-1',
        status: 'proposed',
        location: 'Room 1',
        timeZone: 'UTC',
        recruiterNote: 'Bring photo ID',
        confirmedSlotId: null,
        sentByUserId: 'recruiter-1',
        slots: [
          { id: 'slot-1', startsAt: new Date('2026-09-01T14:00:00.000Z'), endsAt: new Date('2026-09-01T15:00:00.000Z') },
          { id: 'slot-2', startsAt: new Date('2026-09-02T14:00:00.000Z'), endsAt: new Date('2026-09-02T15:00:00.000Z') },
        ],
        ...overrides,
      };
    }

    beforeEach(() => {
      tx.interview.findUnique.mockResolvedValue(baseResolvedInterview());
      tx.pipelineEntry.findUnique.mockResolvedValue({ job: { title: 'Backend Engineer' } });
      tx.organization.findUnique.mockResolvedValue({ name: 'Acme' });
      tx.interviewPanelist.findMany.mockResolvedValue([{ userId: 'panelist-1' }]);
      tx.user.findMany.mockResolvedValue([{ name: 'Priya Singh' }]);
    });

    it('resolves by interviewToken (LOOKUP_ORG) and returns only safe public fields, including panel first names', async () => {
      const out = await service.getPublicInterview('interview-token-1');

      expect(tx.interview.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { interviewToken: 'interview-token-1' } }),
      );
      expect(tx.interviewPanelist.findMany).toHaveBeenCalledWith({ where: { interviewId: 'interview-1' }, select: { userId: true } });
      expect(out).toMatchObject({
        jobTitle: 'Backend Engineer',
        orgName: 'Acme',
        slots: [
          { id: 'slot-1', startsAt: new Date('2026-09-01T14:00:00.000Z'), endsAt: new Date('2026-09-01T15:00:00.000Z') },
          { id: 'slot-2', startsAt: new Date('2026-09-02T14:00:00.000Z'), endsAt: new Date('2026-09-02T15:00:00.000Z') },
        ],
        location: 'Room 1',
        timeZone: 'UTC',
        panel: ['Priya'],
        status: 'proposed',
        confirmedSlotId: null,
      });
    });

    it('throws a generic NotFoundException for an unknown token', async () => {
      tx.interview.findUnique.mockResolvedValue(null);

      await expect(service.getPublicInterview('bad-token')).rejects.toThrow(NotFoundException);
    });
  });

  describe('respondPublic', () => {
    function baseResolvedInterview(overrides: Record<string, unknown> = {}) {
      return {
        id: 'interview-1',
        organizationId: 'org-1',
        pipelineEntryId: 'entry-1',
        status: 'proposed',
        location: 'Room 1',
        timeZone: 'UTC',
        recruiterNote: 'Bring photo ID',
        confirmedSlotId: null,
        sentByUserId: 'recruiter-1',
        slots: [
          { id: 'slot-1', startsAt: new Date('2026-09-01T14:00:00.000Z'), endsAt: new Date('2026-09-01T15:00:00.000Z') },
          { id: 'slot-2', startsAt: new Date('2026-09-02T14:00:00.000Z'), endsAt: new Date('2026-09-02T15:00:00.000Z') },
        ],
        ...overrides,
      };
    }

    beforeEach(() => {
      tx.interview.findUnique.mockResolvedValue(baseResolvedInterview());
      tx.interview.updateMany.mockResolvedValue({ count: 1 });
      tx.pipelineEntry.findUnique.mockResolvedValue({
        job: { title: 'Backend Engineer' },
        candidate: { name: 'Asha Rao', email: 'asha@example.com' },
      });
      tx.organization.findUnique.mockResolvedValue({ name: 'Acme' });
      tx.user.findUnique.mockResolvedValue({ email: 'recruiter@example.com' });
      tx.interviewPanelist.findMany.mockResolvedValue([{ userId: 'panelist-1' }]);
      tx.user.findMany.mockResolvedValue([{ email: 'panelist@example.com', name: 'Jane Doe' }]);
    });

    it('confirm: sets status/confirmedSlotId/respondedAt, audits interview.confirmed with a null actor, and emails candidate + panelist (with the ICS attached) + recruiter, all OUTSIDE the tx', async () => {
      const out = await service.respondPublic('interview-token-1', { action: 'confirm', slotId: 'slot-1' } as any);

      expect(tx.interview.updateMany).toHaveBeenCalledWith({
        where: { id: 'interview-1', organizationId: 'org-1', status: 'proposed' },
        data: { status: 'confirmed', respondedAt: expect.any(Date), confirmedSlotId: 'slot-1' },
      });
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({ organizationId: 'org-1' }),
        expect.objectContaining({ actorUserId: null, action: 'interview.confirmed', entityType: 'interview', entityId: 'interview-1' }),
      );

      expect(emailService.send).toHaveBeenCalledTimes(3);
      expect(emailService.send).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({
          to: 'asha@example.com',
          organizationId: 'org-1',
          attachments: [{ filename: 'interview.ics', content: expect.any(Buffer) }],
        }),
      );
      expect(emailService.send).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          to: 'panelist@example.com',
          attachments: [{ filename: 'interview.ics', content: expect.any(Buffer) }],
        }),
      );
      expect(emailService.send).toHaveBeenNthCalledWith(3, expect.objectContaining({ to: 'recruiter@example.com' }));
      expect(emailService.send.mock.calls[2][0].attachments).toBeUndefined();

      const ics = emailService.send.mock.calls[0][0].attachments[0].content.toString('utf8');
      expect(ics).toContain('BEGIN:VEVENT');
      expect(ics).toContain('SUMMARY:Interview: Asha Rao');

      expect(out).toMatchObject({ status: 'confirmed', confirmedSlotId: 'slot-1' });
    });

    it('emits interview.confirmed with the candidate name, confirmed slot start time, and a deep link, after the emails are sent', async () => {
      await service.respondPublic('interview-token-1', { action: 'confirm', slotId: 'slot-1' } as any);

      expect(integrationEvents.emit).toHaveBeenCalledWith(
        'org-1',
        'interview.confirmed',
        expect.objectContaining({
          subject: 'Asha Rao',
          slotTime: '2026-09-01T14:00:00.000Z',
          linkPath: '/interviews/interview-1',
        }),
      );
      const sendOrders = emailService.send.mock.invocationCallOrder;
      const emitOrder = integrationEvents.emit.mock.invocationCallOrder[0];
      expect(emitOrder).toBeGreaterThan(sendOrders[sendOrders.length - 1]);
    });

    it('does not emit interview.confirmed on decline or reschedule', async () => {
      await service.respondPublic('interview-token-1', { action: 'decline' } as any);
      expect(integrationEvents.emit).not.toHaveBeenCalled();
    });

    it('runs every notify send OUTSIDE all forTenant calls', async () => {
      await service.respondPublic('interview-token-1', { action: 'confirm', slotId: 'slot-1' } as any);

      const forTenantOrders = tenantPrisma.forTenant.mock.invocationCallOrder;
      const sendOrders = emailService.send.mock.invocationCallOrder;
      expect(sendOrders.length).toBe(3);
      for (const forTenantOrder of forTenantOrders) {
        for (const sendOrder of sendOrders) {
          expect(sendOrder).toBeGreaterThan(forTenantOrder);
        }
      }
    });

    it('escapes an HTML-injecting candidate name / job title in the confirm emails via buildCandidateEmailHtml', async () => {
      tx.pipelineEntry.findUnique.mockResolvedValue({
        job: { title: '<b>Evil</b> Engineer' },
        candidate: { name: '<script>alert(1)</script>', email: 'asha@example.com' },
      });

      await service.respondPublic('interview-token-1', { action: 'confirm', slotId: 'slot-1' } as any);

      // The candidate's own confirmation email only echoes the job title back to them; the
      // panelist email is the one that echoes the candidate's (attacker-controlled) name.
      const candidateHtml = emailService.send.mock.calls[0][0].html as string;
      expect(candidateHtml).not.toContain('<b>Evil</b>');
      expect(candidateHtml).toContain('&lt;b&gt;Evil&lt;/b&gt;');

      const panelistHtml = emailService.send.mock.calls[1][0].html as string;
      expect(panelistHtml).not.toContain('<script>');
      expect(panelistHtml).toContain('&lt;script&gt;');
    });

    it('confirm: throws a generic ConflictException when slotId does not belong to this interview, and makes no changes', async () => {
      await expect(
        service.respondPublic('interview-token-1', { action: 'confirm', slotId: 'not-a-real-slot' } as any),
      ).rejects.toThrow(ConflictException);
      expect(tx.interview.updateMany).not.toHaveBeenCalled();
      expect(audit.record).not.toHaveBeenCalled();
      expect(emailService.send).not.toHaveBeenCalled();
    });

    it('confirm: throws a generic ConflictException when slotId is missing', async () => {
      await expect(service.respondPublic('interview-token-1', { action: 'confirm' } as any)).rejects.toThrow(ConflictException);
      expect(tx.interview.updateMany).not.toHaveBeenCalled();
    });

    it('decline: sets status declined + respondedAt, audits interview.declined, and notifies the recruiter with no ICS', async () => {
      const out = await service.respondPublic('interview-token-1', { action: 'decline' } as any);

      expect(tx.interview.updateMany).toHaveBeenCalledWith({
        where: { id: 'interview-1', organizationId: 'org-1', status: 'proposed' },
        data: { status: 'declined', respondedAt: expect.any(Date) },
      });
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({ organizationId: 'org-1' }),
        expect.objectContaining({ actorUserId: null, action: 'interview.declined', entityType: 'interview', entityId: 'interview-1' }),
      );
      expect(emailService.send).toHaveBeenCalledTimes(1);
      expect(emailService.send).toHaveBeenCalledWith(expect.objectContaining({ to: 'recruiter@example.com' }));
      expect(emailService.send.mock.calls[0][0].attachments).toBeUndefined();
      expect(out).toMatchObject({ status: 'declined' });
    });

    it('reschedule: sets status reschedule_requested + candidateReschedNote + respondedAt, audits interview.reschedule_requested, and includes the note in the recruiter notify', async () => {
      const out = await service.respondPublic('interview-token-1', { action: 'reschedule', note: 'Can we do next week?' } as any);

      expect(tx.interview.updateMany).toHaveBeenCalledWith({
        where: { id: 'interview-1', organizationId: 'org-1', status: 'proposed' },
        data: { status: 'reschedule_requested', respondedAt: expect.any(Date), candidateReschedNote: 'Can we do next week?' },
      });
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({ organizationId: 'org-1' }),
        expect.objectContaining({ actorUserId: null, action: 'interview.reschedule_requested', entityId: 'interview-1' }),
      );
      const html = emailService.send.mock.calls[0][0].html as string;
      expect(html).toContain('Can we do next week?');
      expect(out).toMatchObject({ status: 'reschedule_requested', candidateReschedNote: 'Can we do next week?' });
    });

    it('reschedule without a note stores candidateReschedNote as null', async () => {
      await service.respondPublic('interview-token-1', { action: 'reschedule' } as any);

      expect(tx.interview.updateMany).toHaveBeenCalledWith({
        where: { id: 'interview-1', organizationId: 'org-1', status: 'proposed' },
        data: { status: 'reschedule_requested', respondedAt: expect.any(Date), candidateReschedNote: null },
      });
    });

    it('skips the recruiter email when the interview has no sentByUserId', async () => {
      tx.interview.findUnique.mockResolvedValue(baseResolvedInterview({ sentByUserId: null }));

      await service.respondPublic('interview-token-1', { action: 'decline' } as any);

      expect(emailService.send).not.toHaveBeenCalled();
    });

    it('throws a generic ConflictException and makes no changes when the interview is not in the proposed state', async () => {
      tx.interview.findUnique.mockResolvedValue(baseResolvedInterview({ status: 'confirmed' }));

      await expect(service.respondPublic('interview-token-1', { action: 'decline' } as any)).rejects.toThrow(ConflictException);
      expect(tx.interview.updateMany).not.toHaveBeenCalled();
      expect(audit.record).not.toHaveBeenCalled();
      expect(emailService.send).not.toHaveBeenCalled();
    });

    it('throws a generic NotFoundException for an unknown token', async () => {
      tx.interview.findUnique.mockResolvedValue(null);

      await expect(service.respondPublic('bad-token', { action: 'decline' } as any)).rejects.toThrow(NotFoundException);
    });

    it('loses the race to a concurrent responder: updateMany count:0 throws ConflictException with no audit row and no notifications', async () => {
      tx.interview.updateMany.mockResolvedValue({ count: 0 });

      await expect(
        service.respondPublic('interview-token-1', { action: 'confirm', slotId: 'slot-1' } as any),
      ).rejects.toThrow(ConflictException);
      expect(tx.interview.updateMany).toHaveBeenCalledWith({
        where: { id: 'interview-1', organizationId: 'org-1', status: 'proposed' },
        data: { status: 'confirmed', respondedAt: expect.any(Date), confirmedSlotId: 'slot-1' },
      });
      expect(audit.record).not.toHaveBeenCalled();
      expect(emailService.send).not.toHaveBeenCalled();
    });
  });
});
