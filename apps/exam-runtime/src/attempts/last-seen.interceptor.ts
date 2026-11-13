import { CallHandler, ExecutionContext, Injectable, Logger, NestInterceptor } from '@nestjs/common';
import { Observable, tap } from 'rxjs';
import { TenantPrismaService } from '@exam-platform/shared';
import { CandidateSession } from '../candidate-auth/current-candidate.decorator';

@Injectable()
export class LastSeenInterceptor implements NestInterceptor {
  private readonly logger = new Logger(LastSeenInterceptor.name);

  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest();
    const candidate = request.user as CandidateSession | undefined;

    return next.handle().pipe(
      tap(() => {
        if (!candidate?.invitationId) {
          return;
        }
        // A system write keyed by the signed-in candidate's own invitation (AS-0: attempts are under forced RLS).
        this.tenantPrisma.forTenant({ organizationId: null, isSuperAdmin: true }, (tx) =>
          tx.attempt.updateMany({
            where: { invitationId: candidate.invitationId },
            data: { lastSeenAt: new Date() },
          }),
        ).catch((error) => this.logger.error('Failed to update Attempt.lastSeenAt', error as Error));
      }),
    );
  }
}
