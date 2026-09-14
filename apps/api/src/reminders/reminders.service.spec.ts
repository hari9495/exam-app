import { RemindersService } from './reminders.service';

const DAY = 24 * 60 * 60 * 1000;
const ctx = { organizationId: 'org-1', isSuperAdmin: false };

describe('RemindersService', () => {
  let tenantPrisma: { forTenant: jest.Mock };
  let notifications: { notifySystem: jest.Mock };
  let service: RemindersService;
  const now = new Date('2026-09-14T12:00:00.000Z');

  beforeEach(() => {
    tenantPrisma = { forTenant: jest.fn((_c: unknown, fn: (tx: unknown) => unknown) => fn(tx)) };
    notifications = { notifySystem: jest.fn().mockResolvedValue(undefined) };
    service = new RemindersService(tenantPrisma as any, notifications as any);
  });

  // Single tx stub reused across a reminder's own queries (findMany/findFirst).
  let tx: any;

  it('pending grading: notifies the entry assignee, skips unassigned', async () => {
    tx = {
      attempt: { findMany: jest.fn().mockResolvedValue([{ candidateId: 'c1', examId: 'e1' }, { candidateId: 'c2', examId: 'e2' }]) },
      candidate: { findMany: jest.fn().mockResolvedValue([{ id: 'c1', name: 'Ada' }, { id: 'c2', name: 'Bo' }]) },
      jobExam: { findMany: jest.fn().mockResolvedValue([{ jobId: 'j1' }]) },
      pipelineEntry: { findFirst: jest.fn().mockResolvedValueOnce({ assignedUserId: 'u1' }).mockResolvedValueOnce(null) },
    };
    await (service as any).remindPendingGrading(ctx, now);
    expect(notifications.notifySystem).toHaveBeenCalledTimes(1);
    expect(notifications.notifySystem).toHaveBeenCalledWith(ctx, ['u1'], 'reminder.pending_grading', expect.objectContaining({ entityId: 'c1', contextText: 'Ada' }), expect.objectContaining({ subject: expect.stringContaining('Ada') }));
  });

  it('expiring offers: notifies the sender, skips offers with no sender', async () => {
    tx = {
      offer: { findMany: jest.fn().mockResolvedValue([{ candidateId: 'c1', sentByUserId: 'u2' }, { candidateId: 'c2', sentByUserId: null }]) },
      candidate: { findMany: jest.fn().mockResolvedValue([{ id: 'c1', name: 'Ada' }, { id: 'c2', name: 'Bo' }]) },
    };
    await (service as any).remindExpiringOffers(ctx, now);
    expect(notifications.notifySystem).toHaveBeenCalledTimes(1);
    expect(notifications.notifySystem).toHaveBeenCalledWith(ctx, ['u2'], 'reminder.offer_expiring', expect.objectContaining({ entityId: 'c1' }), expect.anything());
  });

  it('upcoming interviews: notifies panelists only when the confirmed slot is within 24h', async () => {
    tx = {
      interview: {
        findMany: jest.fn().mockResolvedValue([
          { candidateId: 'c1', confirmedSlotId: 's1', slots: [{ id: 's1', startsAt: new Date(now.getTime() + 12 * 60 * 60 * 1000) }], panelists: [{ userId: 'p1' }, { userId: 'p2' }] },
          { candidateId: 'c2', confirmedSlotId: 's2', slots: [{ id: 's2', startsAt: new Date(now.getTime() + 3 * DAY) }], panelists: [{ userId: 'p3' }] }, // too far out
        ]),
      },
      candidate: { findMany: jest.fn().mockResolvedValue([{ id: 'c1', name: 'Ada' }, { id: 'c2', name: 'Bo' }]) },
    };
    await (service as any).remindUpcomingInterviews(ctx, now);
    expect(notifications.notifySystem).toHaveBeenCalledTimes(1);
    expect(notifications.notifySystem).toHaveBeenCalledWith(ctx, ['p1', 'p2'], 'reminder.interview_upcoming', expect.objectContaining({ entityId: 'c1' }), expect.anything());
  });

  it('feedback owed: notifies only panelists who have not left feedback, for interviews that just ended', async () => {
    tx = {
      interview: {
        findMany: jest.fn().mockResolvedValue([
          { candidateId: 'c1', confirmedSlotId: 's1', pipelineEntryId: 'en1', slots: [{ id: 's1', endsAt: new Date(now.getTime() - 1.5 * DAY) }], panelists: [{ userId: 'p1' }, { userId: 'p2' }] },
        ]),
      },
      candidate: { findMany: jest.fn().mockResolvedValue([{ id: 'c1', name: 'Ada' }]) },
      pipelineFeedback: { findMany: jest.fn().mockResolvedValue([{ authorUserId: 'p1' }]) },
    };
    await (service as any).remindFeedbackOwed(ctx, now);
    expect(notifications.notifySystem).toHaveBeenCalledTimes(1);
    expect(notifications.notifySystem).toHaveBeenCalledWith(ctx, ['p2'], 'reminder.feedback_owed', expect.objectContaining({ entityId: 'c1' }), expect.anything());
  });

  it('feedback owed: sends nothing when every panelist already left feedback', async () => {
    tx = {
      interview: {
        findMany: jest.fn().mockResolvedValue([
          { candidateId: 'c1', confirmedSlotId: 's1', pipelineEntryId: 'en1', slots: [{ id: 's1', endsAt: new Date(now.getTime() - 1.5 * DAY) }], panelists: [{ userId: 'p1' }] },
        ]),
      },
      candidate: { findMany: jest.fn().mockResolvedValue([{ id: 'c1', name: 'Ada' }]) },
      pipelineFeedback: { findMany: jest.fn().mockResolvedValue([{ authorUserId: 'p1' }]) },
    };
    await (service as any).remindFeedbackOwed(ctx, now);
    expect(notifications.notifySystem).not.toHaveBeenCalled();
  });

  describe('sweep', () => {
    it('does nothing when no org has reminders enabled', async () => {
      tenantPrisma.forTenant.mockImplementationOnce((_c: unknown, fn: (tx: unknown) => unknown) => fn({ organization: { findMany: jest.fn().mockResolvedValue([]) } }));
      await service.sweep(now);
      expect(notifications.notifySystem).not.toHaveBeenCalled();
    });

    it('runs the reminder categories for each enabled org', async () => {
      // 1st forTenant: org list. Subsequent: each reminder's own tx (all queries empty here).
      tenantPrisma.forTenant.mockImplementationOnce((_c: unknown, fn: (tx: unknown) => unknown) =>
        fn({ organization: { findMany: jest.fn().mockResolvedValue([{ id: 'org-1' }]) } }),
      );
      const emptyTx = new Proxy({}, { get: () => ({ findMany: jest.fn().mockResolvedValue([]), findFirst: jest.fn().mockResolvedValue(null) }) });
      tenantPrisma.forTenant.mockImplementation((_c: unknown, fn: (tx: unknown) => unknown) => fn(emptyTx));

      await service.sweep(now);
      // org list + 5 reminder categories = at least 6 forTenant calls, no notifications (all empty).
      expect(tenantPrisma.forTenant.mock.calls.length).toBeGreaterThanOrEqual(6);
      expect(notifications.notifySystem).not.toHaveBeenCalled();
    });
  });
});
