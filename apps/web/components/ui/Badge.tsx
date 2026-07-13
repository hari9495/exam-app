import { ReactNode } from 'react';
import clsx from 'clsx';

type Variant = 'default' | 'success' | 'warning' | 'danger';

const VARIANT_CLASSES: Record<Variant, string> = {
  default: 'bg-gray-100 text-gray-800',
  success: 'bg-green-100 text-green-800',
  warning: 'bg-amber-100 text-amber-800',
  danger: 'bg-red-100 text-red-800',
};

export function Badge({ variant = 'default', children }: { variant?: Variant; children: ReactNode }) {
  return (
    <span className={clsx('inline-block rounded-full px-2 py-0.5 text-xs font-medium', variant, VARIANT_CLASSES[variant])}>
      {children}
    </span>
  );
}
