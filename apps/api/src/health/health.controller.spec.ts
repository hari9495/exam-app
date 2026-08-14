import { HealthController } from './health.controller';
import { HealthService } from '@exam-platform/shared';

describe('HealthController', () => {
  function res() {
    const r: { code?: number; body?: unknown; status: (c: number) => typeof r; json: (b: unknown) => void } = {
      status(c: number) { r.code = c; return r; },
      json(b: unknown) { r.body = b; },
    } as never;
    return r;
  }

  it('answers 200 with a minimal ok body when healthy', async () => {
    const controller = new HealthController({ check: async () => true } as HealthService);
    const r = res();
    await controller.check(r as never);
    expect(r.code).toBe(200);
    expect(r.body).toEqual({ status: 'ok' });
  });

  it('answers 503 when unhealthy', async () => {
    const controller = new HealthController({ check: async () => false } as HealthService);
    const r = res();
    await controller.check(r as never);
    expect(r.code).toBe(503);
  });

  // A public endpoint reporting "db: down" is free reconnaissance. Which dependency failed
  // belongs in the logs and in Sentry, never in the response body.
  it('never names the failing dependency in the response', async () => {
    const controller = new HealthController({ check: async () => false } as HealthService);
    const r = res();
    await controller.check(r as never);
    const serialised = JSON.stringify(r.body).toLowerCase();
    expect(serialised).not.toContain('db');
    expect(serialised).not.toContain('database');
    expect(serialised).not.toContain('redis');
  });
});
