// Stub is unnecessary (no BullMQ); the service uses setInterval which we never start in tests -- we
// call sweep()/private paths via the public run path directly.
import { NotificationDigestService } from './notification-digest.service';

describe('NotificationDigestService.sweep', () => {
  let tx: any;
  let tenantPrisma: any;
  let email: { send: jest.Mock };
  let notifications: { resolveEmailEnabledByType: jest.Mock };
  let service: NotificationDigestService;
  const now = new Date('2026-09-14T09:00:00.000Z');

  beforeEach(() => {
    tx = {
      organization: { findMany: jest.fn().mockResolvedValue([{ id: 'org-1' }]) },
      user: {
        findMany: jest.fn().mockResolvedValue([{ id: 'u1', email: 'u1@x.test', lastDigestSentAt: null }]),
        update: jest.fn(),
      },
      userNotification: {
        findMany: jest.fn().mockResolvedValue([
          { type: 'mention', actorUserId: 'a1', contextText: 'On the Smith candidate', linkPath: '/candidates/c1' },
          { type: 'assigned', actorUserId: 'a2', contextText: null, linkPath: '/candidates/c2' },
        ]),
      },
    };
    // actor lookup uses the same tx.user.findMany; return names on the 2nd call.
    tx.user.findMany.mockImplementation((args: any) => {
      if (args?.where?.notificationDigest === 'daily') return Promise.resolve([{ id: 'u1', email: 'u1@x.test', lastDigestSentAt: null }]);
      return Promise.resolve([{ id: 'a1', name: 'Alice' }, { id: 'a2', name: 'Bob' }]);
    });
    tenantPrisma = { forTenant: jest.fn(async (_c: unknown, fn: any) => fn(tx)) };
    email = { send: jest.fn().mockResolvedValue({ success: true }) };
    notifications = { resolveEmailEnabledByType: jest.fn().mockResolvedValue(new Map()) };
    service = new NotificationDigestService(tenantPrisma, email as any, notifications as any);
  });

  it('sends one digest email batching the unread notifications and advances the anchor', async () => {
    await service.sweep(now);
    expect(email.send).toHaveBeenCalledTimes(1);
    const sent = email.send.mock.calls[0][0];
    expect(sent.to).toBe('u1@x.test');
    expect(sent.subject).toBe('Your Workfox digest — 2 updates');
    expect(sent.html).toContain('Alice');
    expect(sent.html).toContain('On the Smith candidate');
    // anchor advanced to now
    expect(tx.user.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'u1' }, data: { lastDigestSentAt: now } }));
  });

  it('excludes notification types the user has muted, and skips the email when nothing remains (but still advances the anchor)', async () => {
    notifications.resolveEmailEnabledByType.mockResolvedValue(new Map([['mention', false], ['assigned', false]]));
    await service.sweep(now);
    expect(email.send).not.toHaveBeenCalled();
    expect(tx.user.update).toHaveBeenCalledWith(expect.objectContaining({ data: { lastDigestSentAt: now } }));
  });

  it('queries only daily-mode users whose last digest is due', async () => {
    await service.sweep(now);
    const where = tx.user.findMany.mock.calls[0][0].where;
    expect(where.notificationDigest).toBe('daily');
    expect(where.OR).toEqual(expect.arrayContaining([{ lastDigestSentAt: null }]));
  });
});
