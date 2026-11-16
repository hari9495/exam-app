import { CallHandler, ExecutionContext } from '@nestjs/common';
import { of } from 'rxjs';
import { LastSeenInterceptor } from './last-seen.interceptor';
import { TenantPrismaService } from '@exam-platform/shared';

describe('LastSeenInterceptor', () => {
  let interceptor: LastSeenInterceptor;
  let prisma: { attempt: { updateMany: jest.Mock } };
  let forTenant: jest.Mock;

  beforeEach(() => {
    prisma = { attempt: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) } };
    // AS-0: attempts are under forced RLS; the write runs as system work keyed by the candidate's own invitation.
    forTenant = jest.fn((_ctx: unknown, fn: (tx: unknown) => unknown) => Promise.resolve(fn(prisma)));
    interceptor = new LastSeenInterceptor({ forTenant } as unknown as TenantPrismaService);
  });

  function makeContext(user: { invitationId: string } | undefined): ExecutionContext {
    return {
      switchToHttp: () => ({ getRequest: () => ({ user }) }),
    } as unknown as ExecutionContext;
  }

  function makeHandler(): CallHandler {
    return { handle: () => of({ ok: true }) };
  }

  it('bumps lastSeenAt for the caller invitation after a successful request', (done) => {
    const context = makeContext({ invitationId: 'inv-1' });

    interceptor.intercept(context, makeHandler()).subscribe(() => {
      expect(forTenant).toHaveBeenCalledWith({ organizationId: null, isSuperAdmin: true }, expect.any(Function));
      expect(prisma.attempt.updateMany).toHaveBeenCalledWith({
        where: { invitationId: 'inv-1' },
        data: { lastSeenAt: expect.any(Date) },
      });
      done();
    });
  });

  it('does nothing when there is no authenticated candidate on the request', (done) => {
    const context = makeContext(undefined);

    interceptor.intercept(context, makeHandler()).subscribe(() => {
      expect(prisma.attempt.updateMany).not.toHaveBeenCalled();
      done();
    });
  });

  it('still returns the handler response unchanged', (done) => {
    const context = makeContext({ invitationId: 'inv-1' });

    interceptor.intercept(context, makeHandler()).subscribe((result) => {
      expect(result).toEqual({ ok: true });
      done();
    });
  });
});
