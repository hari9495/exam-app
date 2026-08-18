import { BadRequestException, NotFoundException } from '@nestjs/common';
import { InterviewsService } from './interviews.service';

describe('InterviewsService', () => {
  let service: InterviewsService;
  let tenantPrisma: { forTenant: jest.Mock };
  let audit: { record: jest.Mock };
  let tx: {
    pipelineEntry: Record<string, jest.Mock>;
    interview: Record<string, jest.Mock>;
    user: Record<string, jest.Mock>;
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
      },
    };
    tenantPrisma = { forTenant: jest.fn().mockImplementation((_c, fn) => fn(tx)) };
    audit = { record: jest.fn() };
    service = new InterviewsService(tenantPrisma as any, audit as any);
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
});
