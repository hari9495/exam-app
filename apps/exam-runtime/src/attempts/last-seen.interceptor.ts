import { CallHandler, ExecutionContext, Injectable, Logger, NestInterceptor } from '@nestjs/common';
import { Observable, from, switchMap } from 'rxjs';
import { TenantPrismaService } from '@exam-platform/shared';
import { CandidateSession } from '../candidate-auth/current-candidate.decorator';
import { HEARTBEAT_GRACE_MS, offlineCreditMs, runnerSetting } from './runner-settings';

/**
 * Marks the candidate's attempt as seen now, before the request is handled. AS-4a (PRC-26): when the attempt was
 * running and the candidate was not seen for longer than the 30-second check-in and its grace, the connection was lost:
 * that time is given back (timer moved on), up to asmt.time_credit_cap per attempt. Measured here, before any handler,
 * so it does not matter which request arrives first after the connection returns. Never blocks the request.
 */
@Injectable()
export class LastSeenInterceptor implements NestInterceptor {
  private readonly logger = new Logger(LastSeenInterceptor.name);

  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const candidate = context.switchToHttp().getRequest().user as CandidateSession | undefined;
    if (!candidate?.invitationId) return next.handle();
    return from(this.touch(candidate.invitationId)).pipe(switchMap(() => next.handle()));
  }

  private async touch(invitationId: string): Promise<void> {
    try {
      // Found by the signed-in candidate's own invitation (AS-0: attempts are under forced RLS), then written as its company.
      const a = await this.tenantPrisma.forTenant({ organizationId: null, isSuperAdmin: true }, (tx) =>
        tx.attempt.findFirst({ where: { invitationId }, select: { id: true, organizationId: true, status: true, lastSeenAt: true, offlineCreditMs: true, pausedDurationMs: true } }),
      );
      if (!a?.organizationId) return;
      await this.tenantPrisma.forTenant({ organizationId: a.organizationId, isSuperAdmin: false }, async (tx) => {
        const now = new Date();
        const gap = a.lastSeenAt ? now.getTime() - a.lastSeenAt.getTime() : 0;
        if (a.status === 'in_progress' && gap > HEARTBEAT_GRACE_MS) {
          const credit = offlineCreditMs(gap, await runnerSetting(tx, a.organizationId!, 'asmt.time_credit_cap'), a.offlineCreditMs);
          if (credit > 0) {
            // Guarded on the credit so far: two requests at once give the time back once.
            const res = await tx.attempt.updateMany({
              where: { id: a.id, status: 'in_progress', offlineCreditMs: a.offlineCreditMs },
              data: { lastSeenAt: now, offlineCreditMs: a.offlineCreditMs + credit, pausedDurationMs: a.pausedDurationMs + credit },
            });
            if (res.count) return;
          }
        }
        await tx.attempt.updateMany({ where: { id: a.id }, data: { lastSeenAt: now } });
      });
    } catch (error) {
      this.logger.error('Failed to update Attempt.lastSeenAt', error as Error);
    }
  }
}
