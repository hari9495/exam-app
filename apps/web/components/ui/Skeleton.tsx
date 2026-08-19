import clsx from 'clsx';

/** A single shimmer placeholder block. Size it with className (h-/w-/rounded-). */
export function Skeleton({ className }: { className?: string }) {
  return <div className={clsx('animate-pulse rounded bg-rule/60', className)} aria-hidden="true" />;
}

/**
 * Table-shaped loading placeholder: N rows of shimmer cells matched to a column count, on the same
 * hairline-divided grid as a real Table so the swap to loaded data doesn't jump. First cell narrow
 * (index), second wide (the primary label), the rest medium.
 */
export function TableSkeleton({ rows = 6, cols = 5 }: { rows?: number; cols?: number }) {
  return (
    <div className="divide-y divide-rule/70" aria-busy="true" aria-hidden="true">
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="flex items-center gap-4 px-4 py-3.5">
          {Array.from({ length: cols }).map((_, c) => (
            <Skeleton key={c} className={clsx('h-3.5', c === 0 ? 'w-5' : c === 1 ? 'flex-1' : 'w-14')} />
          ))}
        </div>
      ))}
    </div>
  );
}
