'use client';

import { ReactNode, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import clsx from 'clsx';

interface CollapsibleSectionProps {
  title: string;
  children: ReactNode;
  defaultOpen?: boolean;
  /** The header stays clickable even when locked -- only the content's own form
   *  controls (via a `disabled` fieldset) are affected, so a recruiter can still
   *  expand a section to review it while the exam is locked. */
  locked?: boolean;
}

export function CollapsibleSection({ title, children, defaultOpen = true, locked = false }: CollapsibleSectionProps) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="overflow-hidden rounded-lg border border-recruiter-border bg-white shadow-sm">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 bg-recruiter-bg-subtle px-4 py-2.5 text-left"
      >
        <ChevronDown
          size={16}
          className={clsx('shrink-0 text-recruiter-text-secondary transition-transform', !open && '-rotate-90')}
        />
        <h2 className="text-sm font-semibold text-recruiter-text">{title}</h2>
      </button>
      {open && (
        // display:contents keeps the fieldset out of the grid layout below while still
        // propagating `disabled` to every form control inside it.
        <fieldset disabled={locked} className="contents">
          <div className="grid grid-cols-1 gap-x-6 gap-y-4 p-4 sm:grid-cols-2">{children}</div>
        </fieldset>
      )}
    </div>
  );
}
