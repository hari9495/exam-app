import { CallHandler, ExecutionContext } from '@nestjs/common';
import { of } from 'rxjs';
import { LastSeenInterceptor } from './last-seen.interceptor';
import { PrismaService } from '@exam-platform/shared';

describe('LastSeenInterceptor', () => {
  let interceptor: LastSeenInterceptor;
  let prisma: { attempt: { updateMany: jest.Mock } };

  beforeEach(() => {
    prisma = { attempt: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) } };
    interceptor = new LastSeenInterceptor(prisma as unknown as PrismaService);
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
