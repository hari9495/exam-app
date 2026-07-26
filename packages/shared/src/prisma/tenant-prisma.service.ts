import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from './prisma.service';
import { TenantContext } from './tenant-context';

// Candidate-facing retry hint for a P2028 (pool exhaustion) rejection. Mirrors
// the { error, message } shape attempt.service.ts already uses for a Piston
// outage -- see forTenant() below for why this can't yet be a real
// `Retry-After` HTTP header.
export const POOL_EXHAUSTED_RESPONSE = {
  error: 'server_busy',
  message: 'The server is busier than usual right now. Please try again in a few seconds.',
} as const;
export const POOL_EXHAUSTED_RETRY_AFTER_SECONDS = 3;

@Injectable()
export class TenantPrismaService {
  private readonly logger = new Logger(TenantPrismaService.name);

  constructor(private readonly prisma: PrismaService) {}

  async forTenant<T>(
    context: TenantContext,
    fn: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        await tx.$executeRaw`EXEC sp_set_session_context @key = N'app_current_org', @value = ${context.organizationId}`;
        await tx.$executeRaw`EXEC sp_set_session_context @key = N'app_is_super_admin', @value = ${context.isSuperAdmin ? 1 : 0}`;
        try {
          return await fn(tx);
        } finally {
          // sp_set_session_context is scoped to the physical connection, not the
          // transaction, and is not undone by rollback. Prisma returns this
          // connection to its pool once this callback resolves, so without this
          // reset a later query that bypasses forTenant on the same pooled
          // connection would silently inherit this request's tenant context.
          await tx.$executeRaw`EXEC sp_set_session_context @key = N'app_current_org', @value = NULL`;
          await tx.$executeRaw`EXEC sp_set_session_context @key = N'app_is_super_admin', @value = 0`;
        }
      });
    } catch (error) {
      // P2028 = "Unable to start a transaction in the given time": the pool has
      // no connection to hand out. Everything else (a bad query, a genuine
      // constraint violation, a non-Prisma bug) must propagate unchanged so this
      // catch never masks a real failure.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2028') {
        this.logger.warn('Prisma P2028: unable to start a transaction (connection pool exhausted)');
        // ponytail: this only sets the body + status. A real `Retry-After` header
        // needs something with response access (global filter or interceptor) to
        // read POOL_EXHAUSTED_RETRY_AFTER_SECONDS -- out of scope here per the
        // brief ("do not introduce a global exception filter"). Add that filter,
        // keyed on this exception's response.error === 'server_busy', when the
        // header is actually needed on the wire.
        throw new HttpException(POOL_EXHAUSTED_RESPONSE, HttpStatus.SERVICE_UNAVAILABLE);
      }
      throw error;
    }
  }
}
