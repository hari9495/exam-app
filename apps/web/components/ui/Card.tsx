import { ReactNode } from 'react';
import clsx from 'clsx';

// Depth from a crisp hairline, not a blur -- the way a printed sheet sits on a desk.
export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={clsx('rounded-lg border border-rule bg-paper p-4', className)}>{children}</div>
  );
}
