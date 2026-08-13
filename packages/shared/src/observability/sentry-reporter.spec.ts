import * as Sentry from '@sentry/node';
import { SentryReporter } from './sentry-reporter';
import type { SystemEventEntry } from '../system-events/system-events.service';

jest.mock('@sentry/node', () => ({
  init: jest.fn(),
  captureException: jest.fn(),
  flush: jest.fn().mockResolvedValue(true),
}));

const entry: SystemEventEntry = {
  organizationId: 'org-1',
  service: 'api',
  severity: 'error',
  message: 'TypeError: boom',
  context: { status: 500 },
} as SystemEventEntry;

describe('SentryReporter', () => {
  const OLD_ENV = process.env;
  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...OLD_ENV };
    delete process.env.SENTRY_DSN;
  });
  afterAll(() => { process.env = OLD_ENV; });

  it('stays inert and does not throw when no DSN is configured', () => {
    const reporter = new SentryReporter();
    expect(() => reporter.init()).not.toThrow();
    expect(reporter.enabled).toBe(false);
    expect(Sentry.init).not.toHaveBeenCalled();
    reporter.capture(entry, new Error('boom'));
    expect(Sentry.captureException).not.toHaveBeenCalled();
  });

  it('initialises with sendDefaultPii disabled explicitly', () => {
    process.env.SENTRY_DSN = 'https://key@example.invalid/1';
    new SentryReporter().init();
    expect(Sentry.init).toHaveBeenCalledWith(expect.objectContaining({ sendDefaultPii: false }));
  });

  it('captures with allow-listed tags once enabled', () => {
    process.env.SENTRY_DSN = 'https://key@example.invalid/1';
    const reporter = new SentryReporter();
    reporter.init();
    reporter.capture(entry, new Error('boom'));
    expect(Sentry.captureException).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({ tags: expect.objectContaining({ service: 'api', severity_band: 'digest' }) }),
    );
  });

  it('drops the event and does not throw when payload building fails', () => {
    process.env.SENTRY_DSN = 'https://key@example.invalid/1';
    const reporter = new SentryReporter();
    reporter.init();
    // A getter that throws simulates a bug in payload construction.
    const poisoned = { get service() { throw new Error('payload bug'); } } as unknown as SystemEventEntry;
    expect(() => reporter.capture(poisoned, new Error('boom'))).not.toThrow();
    expect(Sentry.captureException).not.toHaveBeenCalled();
  });

  it('stops sending past the per-minute cap but never throws', () => {
    process.env.SENTRY_DSN = 'https://key@example.invalid/1';
    const reporter = new SentryReporter(2, 60_000);
    reporter.init();
    for (let i = 0; i < 5; i += 1) reporter.capture(entry, new Error('boom'));
    expect((Sentry.captureException as jest.Mock).mock.calls).toHaveLength(2);
  });

  it('flush resolves even when disabled', async () => {
    await expect(new SentryReporter().flush(100)).resolves.toBeUndefined();
  });
});
