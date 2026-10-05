import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { softDeleteExtension } from '../soft-delete/soft-delete.extension';
import { PrismaService } from './prisma.service';
import { TenantContext } from './tenant-context';
import { isRecordVisibilityGoverned } from '../record-visibility/record-visibility';

// A client extended with `softDeleteExtension` structurally gains the same model delegates and
// `$executeRaw`/`$transaction` as the base `PrismaService` -- the extension only adds
// `query.$allModels` hooks, it doesn't remove or retype anything -- but TypeScript doesn't know
// that; `ReturnType<PrismaService['$extends']>` is a distinct (unnamed) type from
// `Prisma.TransactionClient`. Only `$executeRaw` is needed to set the session context, so
// that's all the shared helper below asks for -- it's satisfied by both the filtered tx
// (forTenant) and the raw tx (forTenantIncludingDeleted) without needing the boundary cast that
// `fn(tx)` requires (see forTenant).
type SessionContextClient = Pick<Prisma.TransactionClient, '$executeRaw'>;

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

  // Built once (per-request would re-run $extends's setup for no reason): the soft-delete-filtered
  // client `forTenant` runs its transactions through, so every recycle-bin-eligible model
  // (Candidate/Job/Pipeline/WalkInGroup) reads as if deleted rows don't exist, everywhere
  // forTenant is already used today -- no call site changes. `this.prisma` (raw, unfiltered)
  // stays available for `withoutTenantScope` and the new `forTenantIncludingDeleted` bypass.
  //
  // Assigned in the constructor body, not as a field initializer: a field initializer here would
  // run before the `prisma` parameter property is guaranteed assigned (both are "first thing in
  // the constructor" territory) -- doing it explicitly after the parameter-property list avoids
  // relying on that ordering.
  //
  // Typed `any`: `$extends`'s return type is itself generic over the extension passed in, and
  // pinning it down here buys nothing -- every use of `filtered` is `.$transaction(...)`, whose
  // callback's `tx` already gets cast to `Prisma.TransactionClient` at the one boundary that
  // needs it (forTenant, below).
  private readonly filtered: any;

  constructor(private readonly prisma: PrismaService) {
    this.filtered = this.prisma.$extends(softDeleteExtension);
  }

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
      return await this.filtered.$transaction(async (tx: any) => {
        await this.setSessionContext(tx, context);
        // Boundary cast: `tx` here is the soft-delete-extended client's transaction type
        // (`ReturnType<PrismaService['$extends']>`'s own `$transaction` callback param), not
        // nominally `Prisma.TransactionClient`. At runtime it's a strict superset -- the
        // extension only adds `query.$allModels` hooks, every model delegate and method
        // `Prisma.TransactionClient` declares is still there -- so this cast is safe and is
        // what keeps `forTenant`'s public signature (`fn: (tx: Prisma.TransactionClient) =>
        // ...`) unchanged for its ~100 existing callers instead of retyping every call site.
        return fn(tx as unknown as Prisma.TransactionClient);
      }, options);
    } catch (error) {
      this.rethrowMappingPoolExhaustion(error);
    }
  }

  // Recycle-bin bypass: identical to forTenant (same tenant scoping via the same session
  // context, same options, same pool-exhaustion mapping) except it runs against the RAW,
  // unfiltered client -- so a soft-deleted Candidate/Job/Pipeline/WalkInGroup row is visible
  // here instead of being filtered out. For the recycle-bin list/restore/purge endpoints
  // (Tasks 4-6) only -- everything else keeps using forTenant so deleted rows stay hidden.
  async forTenantIncludingDeleted<T>(
    context: TenantContext,
    fn: (tx: Prisma.TransactionClient) => Promise<T>,
    options?: { timeout?: number; maxWait?: number },
  ): Promise<T> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        await this.setSessionContext(tx, context);
        return fn(tx);
      }, options);
    } catch (error) {
      this.rethrowMappingPoolExhaustion(error);
    }
  }

  // Shared by forTenant and forTenantIncludingDeleted, so tenant scoping is identical whichever
  // client filters reads. One parameterised round trip; is_local = true makes every setting
  // transaction-scoped, so it is discarded at COMMIT/ROLLBACK and a pooled connection can never
  // carry one request's tenant into the next (no reset step to forget or fail). RLS policies read
  // these via app_current_org()/app_is_super_admin()/app_current_user_id() (see the tenant_rls
  // migration); an absent value is '' and matches nothing. The governed bit only drives the
  // record-visibility policy (recruiters are governed; admins/system/public fail open).
  private async setSessionContext(tx: SessionContextClient, context: TenantContext): Promise<void> {
    await tx.$executeRaw`SELECT
      set_config('app.current_org', ${context.organizationId ?? ''}, true),
      set_config('app.is_super_admin', ${context.isSuperAdmin ? 'on' : 'off'}, true),
      set_config('app.current_user_id', ${context.userId ?? ''}, true),
      set_config('app.record_visibility_governed', ${isRecordVisibilityGoverned(context.role) ? 'on' : 'off'}, true)`;
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
}
