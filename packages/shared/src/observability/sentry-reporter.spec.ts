import * as Sentry from '@sentry/node';
import { SentryReporter } from './sentry-reporter';
import type { SystemEventEntry } from '../system-events/system-events.service';

jest.mock('@sentry/node', () => ({
  init: jest.fn(),
  captureException: jest.fn(),
  flush: jest.fn().mockResolvedValue(true),
  // Deterministic (not jest.fn()'s default undefined) so two calls with the same options are
  // deep-equal in assertions -- real enough to prove the integration was actually configured.
  onUnhandledRejectionIntegration: jest.fn((options) => ({ name: 'OnUnhandledRejection', options })),
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
    const reporter = new SentryReporter('api');
    expect(() => reporter.init()).not.toThrow();
    expect(reporter.enabled).toBe(false);
    expect(Sentry.init).not.toHaveBeenCalled();
    reporter.capture(entry, new Error('boom'));
    expect(Sentry.captureException).not.toHaveBeenCalled();
  });

  it('initialises with sendDefaultPii disabled explicitly', () => {
    process.env.SENTRY_DSN = 'https://key@example.invalid/1';
    new SentryReporter('api').init();
    expect(Sentry.init).toHaveBeenCalledWith(expect.objectContaining({ sendDefaultPii: false }));
  });

  // I1: events that never pass through capture()/buildSentryPayload (e.g. raised by the SDK's
  // own default integrations) still need a severity_band or they match neither alert rule.
  it.each([
    ['api', 'digest'],
    ['exam-runtime', 'immediate'],
  ])('seeds initialScope with service=%s and its default severity_band=%s', (service, band) => {
    process.env.SENTRY_DSN = 'https://key@example.invalid/1';
    new SentryReporter(service).init();
    expect(Sentry.init).toHaveBeenCalledWith(
      expect.objectContaining({ initialScope: { tags: { service, severity_band: band } } }),
    );
  });

  // I2: the SDK's default onUnhandledRejectionIntegration only warns, which -- because Node
  // treats an unhandled rejection as fatal only when no listener is attached -- would silently
  // stop exam-runtime crash-restarting under pm2 the moment a DSN is configured. 'strict' must
  // replace the default, not add alongside it.
  it('replaces the default onUnhandledRejectionIntegration with strict mode', () => {
    process.env.SENTRY_DSN = 'https://key@example.invalid/1';
    new SentryReporter('exam-runtime').init();
    expect(Sentry.init).toHaveBeenCalledWith(
      expect.objectContaining({ integrations: [Sentry.onUnhandledRejectionIntegration({ mode: 'strict' })] }),
    );
  });

  it('captures with allow-listed tags once enabled', () => {
    process.env.SENTRY_DSN = 'https://key@example.invalid/1';
    const reporter = new SentryReporter('api');
    reporter.init();
    reporter.capture(entry, new Error('boom'));
    expect(Sentry.captureException).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({ tags: expect.objectContaining({ service: 'api', severity_band: 'digest' }) }),
    );
  });

  it('drops the event and does not throw when payload building fails', () => {
    process.env.SENTRY_DSN = 'https://key@example.invalid/1';
    const reporter = new SentryReporter('api');
    reporter.init();
    // A getter that throws simulates a bug in payload construction.
    const poisoned = { get service() { throw new Error('payload bug'); } } as unknown as SystemEventEntry;
    expect(() => reporter.capture(poisoned, new Error('boom'))).not.toThrow();
    expect(Sentry.captureException).not.toHaveBeenCalled();
  });

  it('stops sending past the per-minute cap but never throws', () => {
    process.env.SENTRY_DSN = 'https://key@example.invalid/1';
    const reporter = new SentryReporter('api', 2, 60_000);
    reporter.init();
    for (let i = 0; i < 5; i += 1) reporter.capture(entry, new Error('boom'));
    expect((Sentry.captureException as jest.Mock).mock.calls).toHaveLength(2);
  });

  it('flush resolves even when disabled', async () => {
    await expect(new SentryReporter('api').flush(100)).resolves.toBeUndefined();
  });

  describe('never throws, even when the SDK misbehaves', () => {
    it('does not throw when Sentry.init throws, and enabled stays false', () => {
      process.env.SENTRY_DSN = 'https://key@example.invalid/1';
      (Sentry.init as jest.Mock).mockImplementationOnce(() => {
        throw new Error('init exploded');
      });
      const reporter = new SentryReporter('api');
      expect(() => reporter.init()).not.toThrow();
      expect(reporter.enabled).toBe(false);
    });

    it('does not throw when Sentry.captureException throws during capture()', () => {
      process.env.SENTRY_DSN = 'https://key@example.invalid/1';
      const reporter = new SentryReporter('api');
      reporter.init();
      (Sentry.captureException as jest.Mock).mockImplementationOnce(() => {
        throw new Error('capture exploded');
      });
      expect(() => reporter.capture(entry, new Error('boom'))).not.toThrow();
    });

    it('does not throw when Sentry.flush rejects during flush()', async () => {
      process.env.SENTRY_DSN = 'https://key@example.invalid/1';
      const reporter = new SentryReporter('api');
      reporter.init();
      (Sentry.flush as jest.Mock).mockRejectedValueOnce(new Error('flush exploded'));
      await expect(reporter.flush(100)).resolves.toBeUndefined();
    });

    it('does not throw when capture() is called before init() has ever run', () => {
      const reporter = new SentryReporter('api');
      expect(() => reporter.capture(entry, new Error('boom'))).not.toThrow();
      expect(Sentry.captureException).not.toHaveBeenCalled();
    });
  });

  // sendDefaultPii: false is a deny-list in @sentry/node v10, not an off switch -- it doesn't
  // cover "email" or "search", and requestDataIntegration always attaches the request URL, and
  // breadcrumbs record outgoing query strings (one target is a customer webhook URL). This must
  // be stripped wholesale in beforeSend as a fail-closed backstop.
  describe('beforeSend strips request and breadcrumbs', () => {
    function initAndGetBeforeSend(): (event: Record<string, unknown>) => unknown {
      process.env.SENTRY_DSN = 'https://key@example.invalid/1';
      new SentryReporter('api').init();
      const options = (Sentry.init as jest.Mock).mock.calls[0][0];
      return options.beforeSend;
    }

    it('removes request and breadcrumbs from the event before send', () => {
      const beforeSend = initAndGetBeforeSend();
      const event = {
        request: { url: 'https://api.example.com/lookup?email=candidate@example.com', headers: {} },
        breadcrumbs: [{ category: 'http', data: { url: 'https://webhook.customer.example/x?token=secret' } }],
        tags: { service: 'api' },
      };
      const result = beforeSend(event) as Record<string, unknown>;
      expect(result).not.toHaveProperty('request');
      expect(result).not.toHaveProperty('breadcrumbs');
      expect(result.tags).toEqual({ service: 'api' });
    });

    it('does not throw when the event has neither field', () => {
      const beforeSend = initAndGetBeforeSend();
      expect(() => beforeSend({ tags: {} })).not.toThrow();
    });
  });

  it('logs once when payload building fails repeatedly, without flooding', () => {
    process.env.SENTRY_DSN = 'https://key@example.invalid/1';
    const reporter = new SentryReporter('api');
    reporter.init();
    const warnSpy = jest.spyOn((reporter as unknown as { logger: { warn: (msg: string) => void } }).logger, 'warn');
    const poisoned = { get service() { throw new Error('payload bug'); } } as unknown as SystemEventEntry;

    for (let i = 0; i < 5; i += 1) {
      expect(() => reporter.capture(poisoned, new Error('boom'))).not.toThrow();
    }

    expect(Sentry.captureException).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });
});
