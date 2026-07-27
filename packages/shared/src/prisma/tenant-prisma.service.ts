import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from './prisma.service';
import { TenantContext } from './tenant-context';

// Candidate-facing retry hint for a P2028 ("transaction unavailable")
// rejection -- covers pool exhaustion, transaction expiry, and "transaction
// not found" alike; the response itself doesn't claim which one it was (see
// the log line in forTenant() for that). Mirrors the { error, message } shape
// attempt.service.ts already uses for a Piston outage -- see forTenant()
// below for why this can't yet be a real `Retry-After` HTTP header.
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
          //
          // This can itself fail -- e.g. a P2028 transaction-expiry means the
          // callback already ran against a now-dead transaction, and these
          // resets fail right along with it. resetSessionContext() swallows
          // that failure internally (see its own comment) precisely so this
          // `finally` never throws: if it did, a throw here would replace
          // fn(tx)'s successful return value, or mask fn(tx)'s own error, with
          // the reset's error instead. Callers must see fn(tx)'s outcome and
          // nothing else.
          await this.resetSessionContext(tx);
        }
      });
    } catch (error) {
      // P2028 is Prisma's generic "Transaction API error" -- it covers pool
      // exhaustion (maxWait timeout), transaction expiry (a slow callback
      // hitting the default 5s `timeout`), and "Transaction not found". These
      // are different failure modes with different fixes, so don't collapse
      // them into one claimed cause; error.message (Prisma-generated, no query
      // values/org id/connection string) is what actually distinguishes them.
      // Everything else (a bad query, a genuine constraint violation, a
      // non-Prisma bug) must propagate unchanged so this catch never masks a
      // real failure.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2028') {
        this.logger.warn(`Prisma P2028 (transaction unavailable): ${error.message}`);
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

  // Best-effort clear of the connection-scoped session context. Must never
  // throw: it runs in forTenant's `finally`, and a throw there would
  // overwrite fn(tx)'s own result/error (see the call site's comment).
  //
  // A failure here means the pooled connection may still carry
  // app_current_org for whoever gets it next -- there is no known way to
  // evict/discard just this connection from the pool (see the investigation
  // in the round's report; Prisma's JS client exposes no per-connection
  // handle or eviction hook without a driver adapter, which this project
  // doesn't use, and $disconnect() would tear down the whole shared pool).
  // So this can only make the failure visible, not fix it: log a distinctly
  // grep-able line -- no connection string, org id, or candidate data -- so
  // it can be counted and alerted on.
  private async resetSessionContext(tx: Prisma.TransactionClient): Promise<void> {
    try {
      await tx.$executeRaw`EXEC sp_set_session_context @key = N'app_current_org', @value = NULL`;
      await tx.$executeRaw`EXEC sp_set_session_context @key = N'app_is_super_admin', @value = 0`;
    } catch (resetError) {
      const message = resetError instanceof Error ? resetError.message : String(resetError);
      this.logger.error(`TENANT_SESSION_CONTEXT_RESET_FAILED: pooled connection may retain tenant context -- ${message}`);
    }
  }
}
