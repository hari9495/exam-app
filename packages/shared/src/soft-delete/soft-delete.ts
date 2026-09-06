// Single source of truth for which Prisma models get the recycle-bin soft-delete read filter
// (packages/shared/src/soft-delete/soft-delete.extension.ts) and, later, the soft-delete write
// paths / recycle-bin endpoints (Tasks 4-6). Questions are excluded: they have no hard-delete,
// only an `archived` status.
export const SOFT_DELETE_MODELS = ['Candidate', 'Job', 'Pipeline', 'WalkInGroup'] as const;

export function isSoftDeleteModel(model: string | undefined): boolean {
  return model != null && (SOFT_DELETE_MODELS as readonly string[]).includes(model);
}
