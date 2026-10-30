import { Check } from 'lucide-react';
import type { ReactNode } from 'react';
import { cx } from '../lib/cx';
import { Icon } from './foundations';

export interface FilterToggleProps {
  /** On: the list shows only the matching rows. */
  pressed: boolean;
  onPressedChange: (pressed: boolean) => void;
  /** What it keeps, with the count, e.g. "Only overdue (3)". */
  children: ReactNode;
  className?: string;
}

/**
 * An on/off filter above a list ("Only overdue (3)"): a pill that shows a tick when on and is read out as a toggle
 * (aria-pressed). For one choice out of several, use Segment instead.
 */
export function FilterToggle({ pressed, onPressedChange, children, className }: FilterToggleProps) {
  return (
    <button type="button" className={cx('yx-filter-toggle', className)} aria-pressed={pressed} onClick={() => onPressedChange(!pressed)}>
      {pressed && <Icon icon={Check} size="sm" />}
      {children}
    </button>
  );
}
