'use client';

import { useEffect, useMemo, useState } from 'react';
import { Settings2, Check } from 'lucide-react';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent } from './DropdownMenu';
import type { Column } from './Table';

function readHiddenColumns(storageKey: string, fallback: string[]): string[] {
  const raw = window.localStorage.getItem(`listview:${storageKey}:hidden`);
  if (raw === null) return fallback;
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((value): value is string => typeof value === 'string') : fallback;
  } catch {
    // A hand-edited or half-written value must not blank the whole table.
    return fallback;
  }
}

/**
 * Persisted show/hide-column state plus the trigger UI for it -- the same
 * "sliders" icon and checklist dropdown ListView renders, factored out so a
 * table with its own custom toolbar (search box, filter selects, action
 * buttons) can offer the same column chooser without adopting ListView's
 * whole title/search/actions layout. Shares ListView's `listview:` storage
 * key prefix deliberately -- same persistence scheme, same key shape.
 */
export function useColumnVisibility<T>(storageKey: string, columns: Column<T>[], defaultHidden: string[] = []) {
  const [hidden, setHidden] = useState<string[]>(defaultHidden);

  // Read on mount rather than in useState's initializer: this can render on the
  // server too, where localStorage does not exist, and seeding from it directly
  // would make the first client render disagree with the server's.
  useEffect(() => {
    setHidden(readHiddenColumns(storageKey, defaultHidden));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- defaultHidden is a literal at every call site; depending on it would re-read on every render
  }, [storageKey]);

  function toggleColumn(key: string) {
    setHidden((current) => {
      const next = current.includes(key) ? current.filter((k) => k !== key) : [...current, key];
      window.localStorage.setItem(`listview:${storageKey}:hidden`, JSON.stringify(next));
      return next;
    });
  }

  const visibleColumns = useMemo(() => columns.filter((column) => !hidden.includes(column.key)), [columns, hidden]);

  const chooser = (
    <DropdownMenu>
      <DropdownMenuTrigger aria-label="Choose Columns" className="rounded-lg border border-rule bg-paper p-2 text-ink">
        <Settings2 size={16} />
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        {columns
          // A column with no header is a layout slot (a checkbox or row-action
          // cell); offering "show/hide ''" in the chooser would be meaningless.
          .filter((column) => column.header !== '')
          .map((column) => {
            const visible = !hidden.includes(column.key);
            // A non-text header (a filter-dropdown trigger, a select-all checkbox)
            // has no string to read as the checkbox's accessible name -- fall back
            // the same way Table's own sort announcement does.
            const label = column.sortLabel ?? (typeof column.header === 'string' ? column.header : column.key);
            return (
              <button
                key={column.key}
                type="button"
                role="menuitemcheckbox"
                aria-checked={visible}
                aria-label={label}
                onClick={() => toggleColumn(column.key)}
                className="flex w-full cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-left text-sm text-ink hover:bg-ground"
              >
                <Check size={14} className={visible ? 'opacity-100' : 'opacity-0'} aria-hidden="true" />
                {column.header}
              </button>
            );
          })}
      </DropdownMenuContent>
    </DropdownMenu>
  );

  return { visibleColumns, chooser };
}
