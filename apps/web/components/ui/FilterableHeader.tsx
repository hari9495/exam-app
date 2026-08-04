'use client';

import { ChevronDown } from 'lucide-react';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from './DropdownMenu';

// A column header that's a filter trigger instead of plain text: clicking it opens
// a dropdown of values rather than sorting the column, mirroring the toolbar
// Select-based filters used elsewhere but living directly in the header the way a
// Salesforce list view's column filters do. Pass this as a Column's `header` -- a
// column using it should have no `sortValue`, so Table gives its <th> no click
// handler of its own and this dropdown is free to own the click.
export function FilterableHeader({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
}) {
  const active = value !== 'all';
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={`Filter by ${label}`}
        className={`flex items-center gap-1 ${active ? 'text-primary' : ''}`}
      >
        {label}
        <ChevronDown size={12} />
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        {options.map((option) => (
          <DropdownMenuItem key={option.value} onSelect={() => onChange(option.value)} className={value === option.value ? 'font-semibold text-primary' : ''}>
            {option.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
