import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from './prisma.service';
import { TenantContext } from './tenant-context';

// Candidate-facing retry hint for a P2028 ("transaction unavailable") or
// P2024 ("timed out fetching a new connection from the pool") rejection --
// together these cover pool exhaustion (both interactive-transaction and
// plain-query paths), transaction expiry, and "transaction not found" alike;
// the response itself doesn't claim which one it was (see the log line in
// rethrowMappingPoolExhaustion() for that). Mirrors the { error, message }
// shape attempt.service.ts already uses for a Piston outage -- see
// forTenant() below for why this can't yet be a real `Retry-After` HTTP
// header.
export const POOL_EXHAUSTED_RESPONSE = {
  error: 'server_busy',
  message: 'The server is busier than usual right now. Please try again in a few seconds.',
} as const;
export const POOL_EXHAUSTED_RETRY_AFTER_SECONDS = 3;

@Injectable()
export class TenantPrismaService {
  private readonly logger = new Logger(TenantPrismaService.name);

  constructor(private readonly prisma: PrismaService) {}

  // `options` is for the rare caller whose unit of work is legitimately larger than Prisma's
  // 5s default -- a batch write whose inputs were already paid for before the transaction
  // opened, where expiry throws that spend away. Leave it unset everywhere else: a request-path
  // transaction that needs longer than 5s is a bug to fix, not a timeout to raise.
  async forTenant<T>(
    context: TenantContext,
    fn: (tx: Prisma.TransactionClient) => Promise<T>,
    options?: { timeout?: number; maxWait?: number },
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
      }, options);
    } catch (error) {
      this.rethrowMappingPoolExhaustion(error);
    }
  }

  // For call sites whose isolation already comes from an ID chain resolved
  // through the candidate/caller's own session (not from an organizationId
  // predicate or RLS) and that touch no RLS-protected table -- see ADO #6809.
  // Runs the query against the plain client instead of forTenant's interactive
  // transaction, so it only holds a pooled connection per statement rather
  // than for the whole method. Pool exhaustion is still reachable here (same
  // pool) -- but a non-transactional query blocked on the pool rejects with
  // P2024 ("timed out fetching a new connection"), not forTenant's P2028
  // ("transaction unavailable"), since there's no interactive transaction to
  // reject here. rethrowMappingPoolExhaustion() matches both, so this still
  // maps to the same candidate-facing 503 rather than a raw 500.
  //
  // Narrowed to the two delegates this path is actually cleared for (see the
  // RLS analysis in ADO #6809's report): widening this to the full
  // PrismaService would let a future caller reach an RLS-protected table
  // (e.g. `question`) through here and silently get zero rows back instead
  // of a compile error. Widen deliberately, per call site, if a new
  // RLS-free/no-atomicity query needs it.
  async withoutTenantScope<T>(fn: (client: Pick<PrismaService, 'attempt' | 'proctoringEvent'>) => Promise<T>): Promise<T> {
    try {
      return await fn(this.prisma);
    } catch (error) {
      this.rethrowMappingPoolExhaustion(error);
    }
  }

  // P2028 is Prisma's generic interactive-transaction error -- it covers pool
  // exhaustion (maxWait timeout), transaction expiry (a slow callback hitting
  // the default 5s `timeout`), and "Transaction not found" for $transaction
  // callers (forTenant). P2024 is the non-transactional counterpart -- "timed
  // out fetching a new connection from the pool" -- which is what a plain
  // query (withoutTenantScope) gets instead when the pool itself is
  // exhausted, since it never opens an interactive transaction to expire.
  // Both are pool-exhaustion-shaped failures from the caller's perspective,
  // so both map to the same 503; error.message (Prisma-generated, no query
  // values/org id/connection string) and error.code are what actually
  // distinguish which one happened, so log those rather than collapsing them
  // into one claimed cause. Everything else (a bad query, a genuine
  // constraint violation, a non-Prisma bug) must propagate unchanged so this
  // never masks a real failure. Always throws.
  private rethrowMappingPoolExhaustion(error: unknown): never {
    if (error instanceof Prisma.PrismaClientKnownRequestError && (error.code === 'P2028' || error.code === 'P2024')) {
      this.logger.warn(`Prisma ${error.code} (pool exhausted / transaction unavailable): ${error.message}`);
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
      // Order matters: these are sequential awaits in one try, so a failure on
      // the first short-circuits the second, leaving whichever one runs
      // second still set on the pooled connection. RLS ORs "is super admin"
      // with "org matches" -- a stray app_is_super_admin=1 bypasses RLS on
      // every tenant, while a stray app_current_org only scopes to one org.
      // Clear the more dangerous flag first so a partial failure never
      // strands it.
      await tx.$executeRaw`EXEC sp_set_session_context @key = N'app_is_super_admin', @value = 0`;
      await tx.$executeRaw`EXEC sp_set_session_context @key = N'app_current_org', @value = NULL`;
    } catch (resetError) {
      const message = resetError instanceof Error ? resetError.message : String(resetError);
      this.logger.error(`TENANT_SESSION_CONTEXT_RESET_FAILED: pooled connection may retain tenant context -- ${message}`);
    }
  }
}
