import { CallHandler, ExecutionContext } from '@nestjs/common';
import { of } from 'rxjs';
import { LastSeenInterceptor } from './last-seen.interceptor';
import { TenantPrismaService } from '@exam-platform/shared';
import { HEARTBEAT_GRACE_MS, offlineCreditMs } from './runner-settings';

describe('LastSeenInterceptor', () => {
  let interceptor: LastSeenInterceptor;
  let attempt: Record<string, unknown> | null;
  let prisma: { attempt: { findFirst: jest.Mock; updateMany: jest.Mock }; setting: { findFirst: jest.Mock }; $executeRaw: jest.Mock };
  let forTenant: jest.Mock;
  const order: string[] = [];

  beforeEach(() => {
    order.length = 0;
    attempt = { id: 'a1', organizationId: 'org-1', status: 'in_progress', lastSeenAt: new Date(), offlineCreditMs: 0, pausedDurationMs: 0 };
    prisma = {
      attempt: { findFirst: jest.fn(async () => attempt), updateMany: jest.fn(async () => (order.push('seen'), { count: 1 })) },
      setting: { findFirst: jest.fn(async () => null) },
      $executeRaw: jest.fn(async () => 1),
    };
    forTenant = jest.fn((_ctx: unknown, fn: (tx: unknown) => unknown) => Promise.resolve(fn(prisma)));
    interceptor = new LastSeenInterceptor({ forTenant } as unknown as TenantPrismaService);
  });

  const context = (user: { invitationId: string } | undefined) => ({ switchToHttp: () => ({ getRequest: () => ({ user }) }) }) as unknown as ExecutionContext;
  const handler = (): CallHandler => ({ handle: () => (order.push('handled'), of({ ok: true })) });

  it('marks the attempt seen before the request is handled, found by the invitation and written as its company', (done) => {
    interceptor.intercept(context({ invitationId: 'inv-1' }), handler()).subscribe((result) => {
      expect(result).toEqual({ ok: true });
      expect(prisma.attempt.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { invitationId: 'inv-1' } }));
      expect(forTenant).toHaveBeenNthCalledWith(1, { organizationId: null, isSuperAdmin: true }, expect.any(Function));
      expect(forTenant).toHaveBeenNthCalledWith(2, { organizationId: 'org-1', isSuperAdmin: false }, expect.any(Function));
      expect(prisma.attempt.updateMany).toHaveBeenCalledWith({ where: { id: 'a1' }, data: { lastSeenAt: expect.any(Date) } });
      expect(order).toEqual(['seen', 'handled']);
      done();
    });
  });

  it('AS-4a: a running attempt not seen for 3 minutes gets the lost time back (minus the check-in grace)', (done) => {
    const seen = new Date(Date.now() - 180_000);
    attempt = { ...attempt, lastSeenAt: seen, pausedDurationMs: 1000 };
    interceptor.intercept(context({ invitationId: 'inv-1' }), handler()).subscribe(() => {
      const data = prisma.attempt.updateMany.mock.calls[0][0].data;
      expect(data.offlineCreditMs).toBeGreaterThanOrEqual(180_000 - HEARTBEAT_GRACE_MS - 50);
      expect(data.pausedDurationMs).toBe(1000 + data.offlineCreditMs);
      // AS-4b: guarded on when it was last seen too, so two requests at once count the gap once.
      expect(prisma.attempt.updateMany.mock.calls[0][0].where).toEqual({ id: 'a1', status: 'in_progress', lastSeenAt: seen, offlineCreditMs: 0 });
      // Within the cap: nothing waits for a person.
      expect(prisma.$executeRaw).not.toHaveBeenCalled();
      done();
    });
  });

  it('negative: no credit for a paused attempt, nor beyond the company cap', (done) => {
    attempt = { ...attempt, status: 'paused', lastSeenAt: new Date(Date.now() - 600_000) };
    interceptor.intercept(context({ invitationId: 'inv-1' }), handler()).subscribe(() => {
      expect(prisma.attempt.updateMany).toHaveBeenCalledWith({ where: { id: 'a1' }, data: { lastSeenAt: expect.any(Date) } });
      expect(offlineCreditMs(3_600_000, 10, 0)).toBe(600_000);
      expect(offlineCreditMs(3_600_000, 10, 600_000)).toBe(0);
      expect(offlineCreditMs(HEARTBEAT_GRACE_MS - 1, 10, 0)).toBe(0);
      done();
    });
  });

  it('AS-4b (answer 2011): time lost above the company cap waits for a person (PRC-10)', (done) => {
    // 20 minutes offline with the default cap of 10 minutes: 10 credited, the rest (minus the grace) waits.
    attempt = { ...attempt, lastSeenAt: new Date(Date.now() - 1_200_000) };
    interceptor.intercept(context({ invitationId: 'inv-1' }), handler()).subscribe(() => {
      expect(prisma.attempt.updateMany.mock.calls[0][0].data.offlineCreditMs).toBe(600_000);
      const [, , ms] = prisma.$executeRaw.mock.calls[0] as [unknown, string, number];
      expect(ms).toBeGreaterThanOrEqual(1_200_000 - HEARTBEAT_GRACE_MS - 600_000 - 50);
      expect(ms).toBeLessThanOrEqual(1_200_000 - HEARTBEAT_GRACE_MS - 600_000 + 50);
      done();
    });
  });

  it('negative: when another request already counted the gap, this one records nothing', (done) => {
    attempt = { ...attempt, lastSeenAt: new Date(Date.now() - 1_200_000) };
    prisma.attempt.updateMany.mockResolvedValueOnce({ count: 0 });
    interceptor.intercept(context({ invitationId: 'inv-1' }), handler()).subscribe(() => {
      expect(prisma.$executeRaw).not.toHaveBeenCalled();
      done();
    });
  });

  it('does nothing without a signed-in candidate, and a failure never blocks the request', (done) => {
    interceptor.intercept(context(undefined), handler()).subscribe(() => {
      expect(prisma.attempt.findFirst).not.toHaveBeenCalled();
      prisma.attempt.findFirst.mockRejectedValueOnce(new Error('db down'));
      interceptor.intercept(context({ invitationId: 'inv-1' }), handler()).subscribe((result) => {
        expect(result).toEqual({ ok: true });
        done();
      });
    });
  });
});
