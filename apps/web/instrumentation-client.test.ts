import * as Sentry from '@sentry/nextjs';

jest.mock('@sentry/nextjs', () => ({
  init: jest.fn(),
  captureRouterTransitionStart: jest.fn(),
}));

// sendDefaultPii: false is a deny-list in @sentry/node v10, not an off switch -- it doesn't
// cover "email" or "search", and requestDataIntegration always attaches the request URL
// regardless. beforeSend strips request/breadcrumbs wholesale as a fail-closed backstop.
describe('instrumentation-client.ts beforeSend', () => {
  const OLD_ENV = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...OLD_ENV, NEXT_PUBLIC_SENTRY_DSN: 'https://key@example.invalid/1' };
  });

  afterAll(() => {
    process.env = OLD_ENV;
  });

  it('strips request and breadcrumbs from a kept event, and never throws on an event lacking them', () => {
    // Module init runs Sentry.init() as a side effect of import when a DSN is present.
    require('./instrumentation-client');

    const options = (Sentry.init as jest.Mock).mock.calls[0][0];
    const event = {
      request: { url: 'https://api.example.com/lookup?email=candidate@example.com' },
      breadcrumbs: [{ category: 'http', data: { url: 'https://webhook.customer.example/x?token=secret' } }],
      tags: { service: 'web' },
    };

    const result = options.beforeSend(event);
    expect(result).not.toHaveProperty('request');
    expect(result).not.toHaveProperty('breadcrumbs');
    expect(result.tags).toEqual({ service: 'web' });

    expect(() => options.beforeSend({ tags: {} })).not.toThrow();
  });
});
