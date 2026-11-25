import { ageOn, audienceSkip, daysLeft, inWindow, istDay, validSteps } from './crm-rules';
import { openDob, sealDob } from './minor';

const ok = { poolConsent: true, emailOptedOut: false, whatsappOptedIn: true, whatsappOptedOut: false, hasPhone: true, minor: false, erased: false };
const T = '11111111-1111-1111-1111-111111111111';

describe('HIR-20 campaign audience (consent-based)', () => {
  it('enrols a consenting, opted-in adult on either channel', () => {
    expect(audienceSkip(ok, 'email')).toBeNull();
    expect(audienceSkip(ok, 'whatsapp')).toBeNull();
  });
  it('needs the talent-pool consent', () => {
    expect(audienceSkip({ ...ok, poolConsent: false }, 'email')).toBe('no_consent');
  });
  it('honours an email unsubscribe and a WhatsApp opt-out', () => {
    expect(audienceSkip({ ...ok, emailOptedOut: true }, 'email')).toBe('opted_out');
    expect(audienceSkip({ ...ok, emailOptedOut: true }, 'whatsapp')).toBeNull();
    expect(audienceSkip({ ...ok, whatsappOptedOut: true }, 'whatsapp')).toBe('opted_out');
  });
  it('sends WhatsApp only to people who opted in and have a number', () => {
    expect(audienceSkip({ ...ok, whatsappOptedIn: false }, 'whatsapp')).toBe('no_consent');
    expect(audienceSkip({ ...ok, hasPhone: false }, 'whatsapp')).toBe('no_consent');
    expect(audienceSkip({ ...ok, whatsappOptedIn: false }, 'email')).toBeNull();
  });
  it('never enrols someone under 18 or erased', () => {
    expect(audienceSkip({ ...ok, minor: true }, 'email')).toBe('minor');
    expect(audienceSkip({ ...ok, erased: true }, 'email')).toBe('erased');
  });
});

describe('HIR-20 sequence steps', () => {
  it('takes messages and waits', () => {
    expect(validSteps([{ kind: 'message', templateId: T }, { kind: 'wait', days: 7 }, { kind: 'message', templateId: T }])).toHaveLength(3);
  });
  it('refuses empty, waits only, bad waits and over 10 steps', () => {
    expect(validSteps([])).toBe('Add at least one step.');
    expect(validSteps([{ kind: 'wait', days: 3 }])).toBe('Add at least one message step.');
    expect(validSteps([{ kind: 'wait', days: 0 }])).toMatch(/Step 1/);
    expect(validSteps([{ kind: 'wait', days: 61 }])).toMatch(/Step 1/);
    expect(validSteps([{ kind: 'message', templateId: 'x' }])).toMatch(/Step 1/);
    expect(validSteps(Array.from({ length: 11 }, () => ({ kind: 'message', templateId: T })))).toBe('A sequence has at most 10 steps.');
  });
});

describe('HIR-20 send window (IST)', () => {
  it('sends inside 9 am to 9 pm IST and not outside', () => {
    expect(inWindow('09-21', new Date('2026-11-10T03:30:00Z'))).toBe(true); // 9:00 IST
    expect(inWindow('09-21', new Date('2026-11-10T03:29:00Z'))).toBe(false); // 8:59 IST
    expect(inWindow('09-21', new Date('2026-11-10T15:29:00Z'))).toBe(true); // 20:59 IST
    expect(inWindow('09-21', new Date('2026-11-10T15:30:00Z'))).toBe(false); // 21:00 IST
    expect(inWindow('00-24', new Date('2026-11-10T20:00:00Z'))).toBe(true);
    expect(inWindow('bad', new Date())).toBe(false);
  });
  it('counts the day in IST', () => {
    expect(istDay(new Date('2026-11-10T19:00:00Z'))).toBe('2026-11-11');
  });
});

describe('HIR-05 age and HIR-20 purge', () => {
  it('counts whole years, birthday included', () => {
    expect(ageOn('2008-11-10', '2026-11-10')).toBe(18);
    expect(ageOn('2008-11-11', '2026-11-10')).toBe(17);
    expect(ageOn('2008-02-29', '2026-02-28')).toBe(17);
  });
  it('shows days left, never below zero', () => {
    const now = new Date('2026-11-10T00:00:00Z');
    expect(daysLeft(new Date('2026-12-10T00:00:00Z'), now)).toBe(30);
    expect(daysLeft(new Date('2026-11-01T00:00:00Z'), now)).toBe(0);
  });
});

describe('HIR-05 sealed date of birth', () => {
  const key = process.env.ORG_SECRETS_ENCRYPTION_KEY;
  beforeAll(() => {
    process.env.ORG_SECRETS_ENCRYPTION_KEY = key ?? 'a'.repeat(64);
  });
  afterAll(() => {
    process.env.ORG_SECRETS_ENCRYPTION_KEY = key;
  });
  it('opens only for its own company and candidate', () => {
    const s = sealDob('org-1', 'c-1', '2009-02-14');
    expect(s).not.toContain('2009');
    expect(openDob('org-1', 'c-1', s)).toBe('2009-02-14');
    expect(openDob('org-2', 'c-1', s)).toBeNull();
    expect(openDob('org-1', 'c-2', s)).toBeNull();
    expect(openDob('org-1', 'c-1', 'garbage')).toBeNull();
  });
});
