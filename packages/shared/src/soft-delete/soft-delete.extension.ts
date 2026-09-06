import { Prisma } from '@prisma/client';
import { isSoftDeleteModel } from './soft-delete';

type QueryHookArgs = { model?: string; operation: string; args: any; query: (args: any) => Promise<any> };

const withNotDeleted = (where: unknown) => ({ ...(where as object), deletedAt: null });

// Prisma model names are PascalCase ('Candidate', 'WalkInGroup'); the client's delegate
// property is the same name with a lowercased first letter ('candidate', 'walkInGroup'). Exact
// match for all four registered models -- no acronym edge cases (e.g. an 'IDCard' model) to
// worry about here.
const delegateKey = (model: string) => model.charAt(0).toLowerCase() + model.slice(1);

/**
 * Builds the `query.$allModels` hook map for the soft-delete extension. Exported standalone
 * (not only nested inside softDeleteExtension) so every hook can be unit-tested by calling it
 * directly with a fake `query` fn / fake client -- no DB, no live $extends machinery needed.
 *
 * `client` is used only by the findUnique/findUniqueOrThrow redirect below: a `where` with
 * `deletedAt: null` merged in is a non-unique filter, which Prisma rejects on findUnique, so a
 * soft-delete model's findUnique is redirected to findFirst on the model's own delegate instead
 * (the standard Prisma extensions soft-delete recipe).
 */
export function buildSoftDeleteQuery(client: Record<string, any>) {
  const filterWhere = async ({ model, args, query }: QueryHookArgs) => {
    if (isSoftDeleteModel(model)) args.where = withNotDeleted(args.where);
    return query(args);
  };

  const redirectUnique = (toOp: 'findFirst' | 'findFirstOrThrow') => async ({ model, args, query }: QueryHookArgs) => {
    if (isSoftDeleteModel(model)) {
      return client[delegateKey(model as string)][toOp]({ ...args, where: withNotDeleted(args.where) });
    }
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
    findUnique: redirectUnique('findFirst'),
    findUniqueOrThrow: redirectUnique('findFirstOrThrow'),
    // create, delete, deleteMany, upsert: intentionally no hook -- they pass through untouched.
  };
}

// Mechanism: Prisma.defineExtension's *callback* overload -- `(client) => client.$extends({...})`
// -- rather than a plain ExtensionArgs object. This is Prisma's own documented pattern for a
// standalone/shareable extension (see "Share extensions" in the Prisma client-extensions docs)
// and is what makes `client[delegateKey].findFirst(...)` reachable inside the findUnique
// redirect above: the callback's `client` param is the concrete client `$extends` is invoked
// on, captured by closure, so the redirect can call a real model delegate instead of needing
// `Prisma.getExtensionContext(this)` (which is for `model`-extension instance methods, not
// query hooks, and isn't `this`-bound inside a `query.$allModels` hook in 5.22).
// `Prisma.defineExtension(callback)` still returns a plain `(client) => client` value, so
// `softDeleteExtension` is applied exactly as any other extension: `client.$extends(softDeleteExtension)`.
export const softDeleteExtension = Prisma.defineExtension((client) =>
  client.$extends({
    name: 'soft-delete',
    query: {
      $allModels: buildSoftDeleteQuery(client),
    },
  }),
);
