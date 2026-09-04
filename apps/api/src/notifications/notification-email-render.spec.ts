import { renderNotificationEmail } from './notification-email-render';
import type { NotificationTypeDef } from './notification-types';

describe('renderNotificationEmail', () => {
  const def: NotificationTypeDef = { type: 'mention', group: 'mentions', label: 'You are @mentioned in feedback' };

  it('subject contains the type label and actor name', () => {
    const out = renderNotificationEmail(def, {
      actorName: 'Ravi Kumar',
      contextText: null,
      linkPath: '/v2/candidates/c1',
      appBaseUrl: 'https://app.example.com',
    });
    expect(out.subject).toContain('You are @mentioned in feedback');
    expect(out.subject).toContain('Ravi Kumar');
  });

  it('renders an absolute link and escapes the actor name', () => {
    const out = renderNotificationEmail(def, {
      actorName: '<script>x</script>',
      contextText: 'Ravi Kumar',
      linkPath: '/v2/candidates/c1',
      appBaseUrl: 'https://app.example.com',
    });
    expect(out.html).toContain('https://app.example.com/v2/candidates/c1');
    expect(out.html).not.toContain('<script>x</script>');
    expect(out.html).toContain('Manage your notification emails');
  });

  it('links the footer to appBaseUrl + /profile', () => {
    const out = renderNotificationEmail(def, {
      actorName: null,
      contextText: null,
      linkPath: '/v2/candidates/c1',
      appBaseUrl: 'https://app.example.com',
    });
    expect(out.html).toContain('https://app.example.com/profile');
  });

  it('escapes hostile contextText too', () => {
    const out = renderNotificationEmail(def, {
      actorName: null,
      contextText: '<img src=x onerror=alert(1)>',
      linkPath: '/v2/candidates/c1',
      appBaseUrl: 'https://app.example.com',
    });
    expect(out.html).not.toContain('<img src=x onerror=alert(1)>');
  });

  it('falls back to a generic subject and body when typeDef is undefined, without throwing', () => {
    expect(() =>
      renderNotificationEmail(undefined, {
        actorName: 'Ravi Kumar',
        contextText: null,
        linkPath: '/v2/candidates/c1',
        appBaseUrl: 'https://app.example.com',
      }),
    ).not.toThrow();

    const out = renderNotificationEmail(undefined, {
      actorName: 'Ravi Kumar',
      contextText: null,
      linkPath: '/v2/candidates/c1',
      appBaseUrl: 'https://app.example.com',
    });
    expect(out.subject).toBe('You have a new notification');
    expect(out.html).toContain('https://app.example.com/v2/candidates/c1');
  });

  it('defaults actorName in subject to Someone when null', () => {
    const out = renderNotificationEmail(def, {
      actorName: null,
      contextText: null,
      linkPath: '/v2/candidates/c1',
      appBaseUrl: 'https://app.example.com',
    });
    expect(out.subject).toBe('Someone — You are @mentioned in feedback');
  });
});
