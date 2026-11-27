import { inQuietHours, istHm, pushDefault, pushKeys, pushTitle, validEndpoint } from './push-rules';

describe('T2-E 52 push rules (answers 2875 to 2877)', () => {
  it('quiet hours wrap over midnight (21:00-08:00 by default); equal ends are never quiet', () => {
    expect(inQuietHours('22:30', '21:00', '08:00')).toBe(true);
    expect(inQuietHours('07:59', '21:00', '08:00')).toBe(true);
    expect(inQuietHours('08:00', '21:00', '08:00')).toBe(false);
    expect(inQuietHours('13:00', '12:00', '14:00')).toBe(true);
    expect(inQuietHours('13:00', '09:00', '09:00')).toBe(false);
    expect(istHm(new Date('2026-11-27T16:00:00Z'))).toBe('21:30');
  });

  it('approvals push by default, the rest not; titles are the neutral kind label', () => {
    expect(pushDefault('approval.requested')).toBe(true);
    expect(pushDefault('assigned')).toBe(false);
    expect(pushTitle('approval.requested')).toBe('A request needs your approval');
    expect(pushTitle('not.a.kind')).toBe('You have something new in YukthiX');
    // Answer 2901: the timesheet line kinds have their own neutral title and push by default (approvals group).
    expect(pushTitle('time.timesheet.lines')).toBe('Timesheet hours are waiting for your approval');
    expect(pushDefault('time.timesheet.line')).toBe(true);
  });

  it('negative: only https push addresses; no keys in config means no push', () => {
    expect(validEndpoint('https://fcm.googleapis.com/fcm/send/abc')).toBe(true);
    expect(validEndpoint('http://evil.test/x')).toBe(false);
    expect(validEndpoint('not a url')).toBe(false);
    expect(validEndpoint('https://web.push.apple.com/abc')).toBe(true);
    expect(validEndpoint('https://updates.push.services.mozilla.com/wpush/v2/abc')).toBe(true);
    expect(validEndpoint('https://169.254.169.254/latest')).toBe(false);
    expect(validEndpoint('https://localhost/x')).toBe(false);
    expect(validEndpoint('https://fcm.googleapis.com.evil.test/x')).toBe(false);
    expect(validEndpoint('https://fcm.googleapis.com:8443/x')).toBe(false);
    expect(pushKeys({})).toBeNull();
    expect(pushKeys({ WEB_PUSH_PUBLIC_KEY: 'fake-public', WEB_PUSH_PRIVATE_KEY: 'fake-private', WEB_PUSH_SUBJECT: 'mailto:ops@example.test' })).toEqual({ publicKey: 'fake-public', privateKey: 'fake-private', subject: 'mailto:ops@example.test' });
  });
});
