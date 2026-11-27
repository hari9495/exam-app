import { hindiEmail, HINDI_TEMPLATES } from './notification-hindi';
import { NotificationsService } from './notifications.service';
import { hindiReaders } from '../org-structure/ui-locale';

jest.mock('../org-structure/ui-locale', () => ({ hindiReaders: jest.fn() }));

// T2-G 84b (answer 2743): notification emails in the person's language (Hindi templates per kind).
describe('hindiEmail', () => {
  it('a self-service kind has its Hindi subject, the detail line escaped, the link and a Hindi footer', () => {
    const e = hindiEmail('approval.approved', 'Leave 3-4 Dec <ok>', '/yx/me/requests', 'https://app.test')!;
    expect(e.subject).toBe(HINDI_TEMPLATES['approval.approved']);
    expect(e.html).toContain('lang="hi"');
    expect(e.html).toContain('Leave 3-4 Dec &lt;ok&gt;');
    expect(e.html).toContain('href="https://app.test/yx/me/requests"');
    expect(e.html).toContain('अपने सूचना ईमेल');
  });
  it('negative: a kind without a Hindi template keeps its English email (null)', () => {
    expect(hindiEmail('helpdesk.backlog.alert', null, '/x', 'https://app.test')).toBeNull();
  });
});

describe('NotificationsService in the reader language', () => {
  const target = { entityType: 'leave', entityId: 'l1', contextText: '3 Dec', linkPath: '/yx/me/leave' };
  const context = { organizationId: 'org-1', isSuperAdmin: false } as never;
  const make = () => {
    const tx = {
      setting: { findMany: jest.fn().mockResolvedValue([]) },
      user: { findMany: jest.fn().mockResolvedValue([{ id: 'u-hi', email: 'hi@x.test', notificationDigest: 'immediate' }, { id: 'u-en', email: 'en@x.test', notificationDigest: 'immediate' }]) },
      userNotification: { create: jest.fn() },
      userNotificationPreference: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const email = { send: jest.fn().mockResolvedValue({ success: true }) };
    const service = new NotificationsService({ forTenant: jest.fn((_c, fn) => fn(tx)) } as never, email as never);
    return { email, service };
  };

  it('a Hindi reader gets the Hindi template; an English reader the email as written', async () => {
    (hindiReaders as jest.Mock).mockResolvedValue(new Set(['u-hi']));
    const { email, service } = make();
    await service.notifySystem(context, ['u-hi', 'u-en'], 'leave.reminder', target, { subject: 'Leave reminder', html: '<p>x</p>' });
    expect(email.send).toHaveBeenCalledWith(expect.objectContaining({ to: 'hi@x.test', subject: HINDI_TEMPLATES['leave.reminder'] }));
    expect(email.send).toHaveBeenCalledWith(expect.objectContaining({ to: 'en@x.test', subject: 'Leave reminder' }));
  });

  it('negative: a kind with no Hindi template never looks up languages and stays English', async () => {
    (hindiReaders as jest.Mock).mockClear();
    const { email, service } = make();
    await service.notifySystem(context, ['u-hi'], 'helpdesk.backlog.alert', target, { subject: 'Backlog', html: '<p>x</p>' });
    expect(hindiReaders).not.toHaveBeenCalled();
    expect(email.send).toHaveBeenCalledWith(expect.objectContaining({ to: 'hi@x.test', subject: 'Backlog' }));
  });
});
