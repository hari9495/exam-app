import { BadRequestException } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { NOTIFICATION_TYPES } from './notification-types';

describe('NotificationsService', () => {
  let service: NotificationsService;
  let tenantPrisma: { forTenant: jest.Mock };
  let email: { send: jest.Mock };
  const context = { organizationId: 'org-1', isSuperAdmin: false } as any;

  beforeEach(() => {
    tenantPrisma = { forTenant: jest.fn() };
    email = { send: jest.fn().mockResolvedValue({ success: true }) };
    service = new NotificationsService(tenantPrisma as any, email as any);
  });

  const target = { entityType: 'pipeline_entry', entityId: 'en1', contextText: 'Asha Rao', linkPath: '/candidates/c1' };

  describe('createMentions', () => {
    it('creates one notification per valid teammate, dropping the actor and unknown/cross-org ids', async () => {
      const create = jest.fn();
      // user.findMany returns only the org-valid ids (simulates the org filter): user-2 valid, user-9 not returned
      const tx = {
        user: {
          findMany: jest.fn().mockResolvedValue([{ id: 'user-2', email: null, name: null }]),
          findUnique: jest.fn().mockResolvedValue({ name: 'User One' }),
        },
        userNotification: { create },
        userNotificationPreference: { findMany: jest.fn().mockResolvedValue([]) },
      };
      tenantPrisma.forTenant.mockImplementation((_c, fn) => fn(tx));

      await service.createMentions(context, 'user-1', ['user-2', 'user-9', 'user-1'], target);

      // user.findMany was asked about user-2 and user-9 (self 'user-1' filtered before the query)
      expect(tx.user.findMany.mock.calls[0][0].where.id.in).toEqual(['user-2', 'user-9']);
      expect(create).toHaveBeenCalledTimes(1);
      expect(create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ recipientUserId: 'user-2', actorUserId: 'user-1', type: 'mention', linkPath: '/candidates/c1', contextText: 'Asha Rao' }) }),
      );
      // user-2 has no email on file, so no email is attempted (only the bell row is created)
      expect(email.send).not.toHaveBeenCalled();
    });

    it('is a no-op when only the actor is mentioned (never opens a tx)', async () => {
      await service.createMentions(context, 'user-1', ['user-1'], target);
      expect(tenantPrisma.forTenant).not.toHaveBeenCalled();
    });
  });

  describe('notify: email delivery', () => {
    let tx: {
      user: { findMany: jest.Mock; findUnique: jest.Mock };
      userNotification: { create: jest.Mock };
      userNotificationPreference: { findMany: jest.Mock };
    };

    beforeEach(() => {
      tx = {
        user: { findMany: jest.fn(), findUnique: jest.fn().mockResolvedValue({ name: 'U One' }) },
        userNotification: { create: jest.fn() },
        userNotificationPreference: { findMany: jest.fn() },
      };
      tenantPrisma.forTenant.mockImplementation((_c, fn) => fn(tx));
    });

    it('emails opted-in recipients after creating bell rows, best-effort', async () => {
      tx.user.findMany.mockResolvedValue([{ id: 'u2', email: 'u2@x.test', name: 'U Two' }]);
      tx.userNotificationPreference.findMany.mockResolvedValue([]); // all ON
      email.send.mockResolvedValue({ success: true });

      await service.notify(context, 'u1', ['u2'], 'mention', target);

      expect(tx.userNotification.create).toHaveBeenCalled();
      expect(email.send).toHaveBeenCalledWith(
        expect.objectContaining({ to: 'u2@x.test', organizationId: context.organizationId }),
      );
    });

    it('does not throw when send fails', async () => {
      tx.user.findMany.mockResolvedValue([{ id: 'u2', email: 'u2@x.test', name: 'U Two' }]);
      tx.userNotificationPreference.findMany.mockResolvedValue([]);
      email.send.mockRejectedValue(new Error('smtp down'));

      await expect(service.notify(context, 'u1', ['u2'], 'mention', target)).resolves.toBeUndefined();
      expect(tx.userNotification.create).toHaveBeenCalled();
    });

    it('skips email for an opted-out recipient but still creates the bell row', async () => {
      tx.user.findMany.mockResolvedValue([{ id: 'u2', email: 'u2@x.test', name: 'U Two' }]);
      tx.userNotificationPreference.findMany.mockResolvedValue([{ type: 'mention', emailEnabled: false }]);

      await service.notify(context, 'u1', ['u2'], 'mention', target);

      expect(tx.userNotification.create).toHaveBeenCalled();
      expect(email.send).not.toHaveBeenCalled();
    });

    it('never emails the actor even if somehow present after filtering', async () => {
      tx.user.findMany.mockResolvedValue([]);
      await service.notify(context, 'u1', ['u1'], 'mention', target);
      // actor-only recipient list is filtered before the tx even opens
      expect(tenantPrisma.forTenant).not.toHaveBeenCalled();
      expect(email.send).not.toHaveBeenCalled();
    });
  });

  describe('markRead', () => {
    it('scopes the update to the recipient (a user cannot mark a colleague\'s notification read)', async () => {
      const updateMany = jest.fn().mockResolvedValue({ count: 1 });
      tenantPrisma.forTenant.mockImplementation((_c, fn) => fn({ userNotification: { updateMany } }));

      await service.markRead(context, 'user-2', 'notif-1');

      expect(updateMany).toHaveBeenCalledWith({ where: { id: 'notif-1', recipientUserId: 'user-2', readAt: null }, data: { readAt: expect.any(Date) } });
    });
  });

  describe('unreadCount', () => {
    it('counts only the recipient\'s unread notifications', async () => {
      const count = jest.fn().mockResolvedValue(3);
      tenantPrisma.forTenant.mockImplementation((_c, fn) => fn({ userNotification: { count } }));

      expect(await service.unreadCount(context, 'user-2')).toEqual({ count: 3 });
      expect(count).toHaveBeenCalledWith({ where: { recipientUserId: 'user-2', readAt: null } });
    });
  });

  describe('email preferences', () => {
    let tx: { userNotificationPreference: { findMany: jest.Mock; upsert: jest.Mock; deleteMany: jest.Mock } };
    const ctx = context;

    beforeEach(() => {
      tx = { userNotificationPreference: { findMany: jest.fn(), upsert: jest.fn(), deleteMany: jest.fn() } };
      tenantPrisma.forTenant.mockImplementation((_c, fn) => fn(tx));
    });

    it('getPreferences defaults every type to ON when no rows', async () => {
      tx.userNotificationPreference.findMany.mockResolvedValue([]);
      const prefs = await service.getPreferences(ctx, 'u1');
      expect(prefs).toHaveLength(NOTIFICATION_TYPES.length);
      expect(prefs.every((p) => p.emailEnabled)).toBe(true);
    });

    it('getPreferences reflects an opt-out row', async () => {
      tx.userNotificationPreference.findMany.mockResolvedValue([{ type: 'assigned', emailEnabled: false }]);
      const prefs = await service.getPreferences(ctx, 'u1');
      expect(prefs.find((p) => p.type === 'assigned')?.emailEnabled).toBe(false);
    });

    it('setPreference(false) upserts, (true) deletes', async () => {
      await service.setPreference(ctx, 'u1', 'assigned', false);
      expect(tx.userNotificationPreference.upsert).toHaveBeenCalled();
      await service.setPreference(ctx, 'u1', 'assigned', true);
      expect(tx.userNotificationPreference.deleteMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ userId: 'u1', type: 'assigned' }) }),
      );
    });

    it('setPreference rejects an unknown type', async () => {
      await expect(service.setPreference(ctx, 'u1', 'bogus', false)).rejects.toBeInstanceOf(BadRequestException);
    });
  });
});
