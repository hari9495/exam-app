import { classifySeverity, buildSentryPayload, createRateLimiter } from './sentry-payload';
import type { SystemEventEntry } from '../system-events/system-events.service';

function entry(overrides: Partial<SystemEventEntry> = {}): SystemEventEntry {
  return {
    organizationId: 'org-1',
    service: 'api',
    severity: 'error',
    message: 'TypeError: boom',
    context: { status: 500, method: 'POST', route: '/api/v1/exams' },
    ...overrides,
  } as SystemEventEntry;
}

describe('classifySeverity', () => {
  it.each([
    ['exam-runtime', false, 'immediate'],
    ['exam-runtime', true, 'immediate'],
    ['api', true, 'immediate'],
    ['api', false, 'digest'],
    ['candidate-browser', false, 'digest'],
  ])('service=%s hasAttempt=%s -> %s', (service, hasAttempt, expected) => {
    expect(classifySeverity(service as string, hasAttempt as boolean)).toBe(expected);
  });
});

describe('buildSentryPayload', () => {
  it('bands an api error carrying an attemptId as immediate', () => {
    const payload = buildSentryPayload(entry({ context: { status: 500, attemptId: 'att-1' } }));
    expect(payload.tags.severity_band).toBe('immediate');
    expect(payload.tags.attemptId).toBe('att-1');
  });

  it('bands an api error with no attempt as digest', () => {
    expect(buildSentryPayload(entry()).tags.severity_band).toBe('digest');
  });

  // The load-bearing test. A field added to contextFrom() later for the system-events
  // console must NOT start leaving the infrastructure just because it was added.
  it('forwards only allow-listed context keys, dropping anything unrecognised', () => {
    const payload = buildSentryPayload(
      entry({
        context: {
          status: 500,
          method: 'POST',
          route: '/api/v1/attempts',
          userId: 'u-1',
          attemptId: 'att-1',
          invitationId: 'inv-1',
          // None of the following may ever reach Sentry:
          candidateEmail: 'candidate@example.com',
          candidateName: 'Jane Doe',
          answerText: 'the answer is 42',
          authorization: 'Bearer secret-token',
          cookie: 'session=abc',
          body: { password: 'hunter2' },
          stack: 'TypeError: boom\n    at /app/src/thing.ts:1:1',
        },
      }),
    );

    expect(Object.keys(payload.tags).sort()).toEqual(
      ['attemptId', 'invitationId', 'method', 'organizationId', 'route', 'service', 'severity_band', 'status', 'userId'].sort(),
    );
    const serialised = JSON.stringify(payload);
    for (const leak of ['candidate@example.com', 'Jane Doe', 'the answer is 42', 'secret-token', 'session=abc', 'hunter2']) {
      expect(serialised).not.toContain(leak);
    }
  });

  it('omits the userId tag when absent rather than emitting the string "undefined"', () => {
    const payload = buildSentryPayload(entry({ context: { status: 500 } }));
    expect(payload.tags).not.toHaveProperty('userId');
    expect(Object.values(payload.tags)).not.toContain('undefined');
  });
});

describe('createRateLimiter', () => {
  it('allows up to the cap then blocks within the same window', () => {
    let t = 1000;
    const allow = createRateLimiter(3, 60_000, () => t);
    expect([allow(), allow(), allow()]).toEqual([true, true, true]);
    expect(allow()).toBe(false);
  });

  it('resets once the window elapses', () => {
    let t = 1000;
    const allow = createRateLimiter(1, 60_000, () => t);
    expect(allow()).toBe(true);
    expect(allow()).toBe(false);
    t += 60_000;
    expect(allow()).toBe(true);
  });
});
