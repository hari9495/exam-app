import type { KeyboardEvent, ReactNode } from 'react';
import { cx } from '../lib/cx';

export interface SegmentOption<V extends string | number> {
  value: V;
  label: ReactNode;
}

export interface SegmentProps<V extends string | number> {
  /** Accessible name of the group, e.g. "Sign in with". */
  label: string;
  options: SegmentOption<V>[];
  value: V;
  onChange: (value: V) => void;
  className?: string;
}

/**
 * Joined pick-one control (R11): one choice of 2–4 short options. Independent on/off filters use toggle chips instead.
 * A radio group: arrow keys move and select, one tab stop.
 */
export function Segment<V extends string | number>({ label, options, value, onChange, className }: SegmentProps<V>) {
  const move = (e: KeyboardEvent<HTMLButtonElement>, i: number) => {
    const step = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
    if (!step) return;
    e.preventDefault();
    const next = (i + step + options.length) % options.length;
    onChange(options[next].value);
    (e.currentTarget.parentElement?.children[next] as HTMLElement | undefined)?.focus();
  };
  return (
    <div className={cx('yx-segment', className)} role="radiogroup" aria-label={label}>
      {options.map((o, i) => (
        <button
          key={String(o.value)}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          tabIndex={o.value === value ? 0 : -1}
          onClick={() => onChange(o.value)}
          onKeyDown={(e) => move(e, i)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
