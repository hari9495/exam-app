import { Prisma } from '@prisma/client';
import { isSoftDeleteModel } from './soft-delete';

type QueryHookArgs = { model?: string; operation: string; args: any; query: (args: any) => Promise<any> };

const withNotDeleted = (where: unknown) => ({ ...(where as object), deletedAt: null });

/**
 * Builds the `query.$allModels` hook map for the soft-delete extension. Exported standalone
 * (not only nested inside softDeleteExtension) so every hook can be unit-tested by calling it
 * directly with a fake `query` fn -- no DB, no live $extends machinery needed.
 *
 * Every hook -- including findUnique/findUniqueOrThrow -- does the exact same thing: merge
 * `deletedAt: null` into `where` and forward to the real `query(args)` continuation. No
 * operation redirect, no reaching for "the current client" from inside the hook.
 *
 * That used to not be true: an earlier version assumed Prisma's client-side validation rejects
 * a `where` combining a unique field with a non-unique one on findUnique, and so redirected
 * findUnique to findFirst on a model delegate obtained one of two broken ways -- a client closed
 * over at extension-definition time (escapes `TenantPrismaService.forTenant`'s transaction and
 * its SESSION_CONTEXT, so tenant RLS sees no org and silently returns zero rows), or
 * `Prisma.getExtensionContext(this)` (verified empirically, real DB, in
 * soft-delete-for-tenant.e2e-spec.ts's first failing run: inside a `query.$allModels` hook in
 * 5.22, `this` is some Prisma-internal array-like object, not a client -- `getExtensionContext`
 * is the identity function at runtime, so there was never a client hiding behind it here).
 *
 * The premise was wrong: Prisma has supported combining a unique field with additional
 * non-unique filters in the same findUnique/findUniqueOrThrow `where` since 4.5 ("filter on
 * non-unique fields") -- `findUnique({ where: { id, deletedAt: null } })` just works, calling
 * `query(args)` directly. Same continuation every other hook here already uses, so it's
 * automatically transaction-safe the same way they are: no separate client reference needed at
 * all, so no way to reach for the wrong one.
 */
export function buildSoftDeleteQuery() {
  const filterWhere = async ({ model, args, query }: QueryHookArgs) => {
    if (isSoftDeleteModel(model)) args.where = withNotDeleted(args.where);
    return query(args);
  };

  return {
    findFirst: filterWhere,
    findFirstOrThrow: filterWhere,
    findMany: filterWhere,
    count: filterWhere,
    aggregate: filterWhere,
    groupBy: filterWhere,
    update: filterWhere,
    updateMany: filterWhere,
    findUnique: filterWhere,
    findUniqueOrThrow: filterWhere,
    // create, delete, deleteMany, upsert: intentionally no hook -- they pass through untouched.
  };
}

export const softDeleteExtension = Prisma.defineExtension({
  name: 'soft-delete',
  query: {
    $allModels: buildSoftDeleteQuery(),
  },
});
