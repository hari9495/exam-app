import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable, tap } from 'rxjs';
import { PrismaService } from '../prisma/prisma.service';
import { CandidateSession } from '../candidate-auth/current-candidate.decorator';

@Injectable()
export class LastSeenInterceptor implements NestInterceptor {
  constructor(private readonly prisma: PrismaService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest();
    const candidate = request.user as CandidateSession | undefined;

    return next.handle().pipe(
      tap(() => {
        if (!candidate?.invitationId) {
          return;
        }
        void this.prisma.attempt.updateMany({
          where: { invitationId: candidate.invitationId },
          data: { lastSeenAt: new Date() },
        });
      }),
    );
  }
}
