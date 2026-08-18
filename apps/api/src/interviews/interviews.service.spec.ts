import { BadRequestException, NotFoundException } from '@nestjs/common';
import { InterviewsService } from './interviews.service';

describe('InterviewsService', () => {
  let service: InterviewsService;
  let tenantPrisma: { forTenant: jest.Mock };
  let emailService: { send: jest.Mock };
  let blobStorage: { signIfOurs: jest.Mock };
  let audit: { record: jest.Mock };
  let tx: {
    pipelineEntry: Record<string, jest.Mock>;
    interview: Record<string, jest.Mock>;
    user: Record<string, jest.Mock>;
    organization: Record<string, jest.Mock>;
  };
  const context = { organizationId: 'org-1', isSuperAdmin: false } as any;

  beforeEach(() => {
    tx = {
      pipelineEntry: {
        findFirst: jest.fn().mockResolvedValue({ id: 'entry-1', candidateId: 'cand-1', organizationId: 'org-1' }),
      },
      interview: {
        create: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn(),
        update: jest.fn().mockImplementation(({ data }: any) => Promise.resolve({ id: 'interview-1', ...data })),
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
    service = new InterviewsService(tenantPrisma as any, emailService as any, blobStorage as any, audit as any);
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
});
