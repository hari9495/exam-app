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
  /** Rendered in the same grid alongside `children`, but outside the `disabled`
   *  fieldset -- a native <fieldset disabled> disables every descendant control
   *  regardless of nesting, so a control that must stay interactive even while
   *  `locked` is true (e.g. a bypass-the-lock toggle) has to sit outside it. */
  alwaysEditable?: ReactNode;
}

export function CollapsibleSection({ title, children, defaultOpen = true, locked = false, alwaysEditable }: CollapsibleSectionProps) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="overflow-hidden rounded-lg border border-rule bg-paper">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 bg-ground px-4 py-2.5 text-left"
      >
        <ChevronDown
          size={16}
          className={clsx('shrink-0 text-muted transition-transform', !open && '-rotate-90')}
        />
        <h2 className="font-body text-sm font-semibold text-ink">{title}</h2>
      </button>
      {open && (
        <div className="grid grid-cols-1 gap-x-6 gap-y-4 p-4 sm:grid-cols-2">
          {/* display:contents keeps the fieldset out of the grid layout while still
              propagating `disabled` to every form control inside it. */}
          <fieldset disabled={locked} className="contents">
            {children}
          </fieldset>
          {alwaysEditable}
        </div>
      )}
    </div>
  );
}
