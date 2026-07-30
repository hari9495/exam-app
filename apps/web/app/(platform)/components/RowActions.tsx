'use client';

import { ChevronDown } from 'lucide-react';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from '../../../components/ui';

export interface RowAction {
  label: string;
  onSelect: () => void;
  danger?: boolean;
}

export function RowActions({ actions, label }: { actions: RowAction[]; label: string }) {
  // Permission gating hands us an empty list for rows the current user cannot act
  // on. Rendering a menu with nothing in it would be a dead control.
  if (actions.length === 0) return null;

  return (
    <DropdownMenu>
      {/* `label` names this row's menu ("Actions for Acme") so one row's menu is
          distinguishable from another's, to screen readers and to tests alike. */}
      <DropdownMenuTrigger aria-label={label} className="rounded border border-recruiter-border p-1.5">
        <ChevronDown size={14} />
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        {actions.map((action) => (
          <DropdownMenuItem
            key={action.label}
            onSelect={action.onSelect}
            className={action.danger ? 'text-status-danger' : undefined}
          >
            {action.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
