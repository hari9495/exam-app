import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ChevronDown, Plus, Search, X } from 'lucide-react';
import { formatDate, groupIndian } from '../lib/format';
import { isFilterActive, type FilterField, type FilterValue } from '../lib/table';
import { Icon } from './foundations';
import { Button } from './button';
import { Menu, MenuContent, MenuItem, MenuLabel, MenuSeparator, MenuTrigger } from './menu';
import { Popover, PopoverAnchor, PopoverContent } from './popover';
import { Checkbox } from './choice';
import { FieldRow, FormField } from './field';
import { NumberField, TextField } from './inputs';
import { DatePicker } from './date';

export interface FilterFieldDef extends FilterField {
  /** Show number filters as rupees. */
  money?: boolean;
}

export interface FilterBarProps {
  fields: FilterFieldDef[];
  value: FilterValue[];
  onChange: (value: FilterValue[]) => void;
  search?: string;
  /** Called 200 ms after typing stops (§30). */
  onSearchChange?: (q: string) => void;
  searchPlaceholder?: string;
  /** Extra controls at the end of the bar, e.g. a saved-views menu. */
  children?: ReactNode;
}

const toISO = (d: Date | null) =>
  d ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` : null;
const fromISO = (s: string | null) => {
  if (!s) return null;
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
};

function emptyFor(f: FilterFieldDef): FilterValue {
  switch (f.type) {
    case 'multi':
      return { key: f.key, type: 'multi', values: [] };
    case 'date':
      return { key: f.key, type: 'date', from: null, to: null };
    case 'number':
      return { key: f.key, type: 'number', min: null, max: null };
    case 'text':
      return { key: f.key, type: 'text', contains: '' };
  }
}

export function summarise(field: FilterFieldDef, v: FilterValue): string {
  if (!isFilterActive(v)) return 'Any';
  const num = (n: number) => (field.money ? `₹${groupIndian(n)}` : groupIndian(n));
  switch (v.type) {
    case 'multi': {
      const labels = v.values.map((x) => field.options?.find((o) => o.value === x)?.label ?? x);
      return labels.length <= 2 ? labels.join(', ') : `${labels.length} selected`;
    }
    case 'date':
      if (v.from && v.to) return `${formatDate(fromISO(v.from))} – ${formatDate(fromISO(v.to))}`;
      return v.from ? `From ${formatDate(fromISO(v.from))}` : `Until ${formatDate(fromISO(v.to))}`;
    case 'number':
      if (v.min != null && v.max != null) return `${num(v.min)} – ${num(v.max)}`;
      return v.min != null ? `${num(v.min)} or more` : `${num(v.max!)} or less`;
    case 'text':
      return `contains "${v.contains.trim()}"`;
  }
}

function Editor({ field, value, onChange }: { field: FilterFieldDef; value: FilterValue; onChange: (v: FilterValue) => void }) {
  if (value.type === 'multi') {
    const opts = field.options ?? [];
    return (
      <div className="yx-filter-editor">
        <div className="yx-filter-editor__list" role="group" aria-label={field.label}>
          {opts.map((o) => (
            <Checkbox
              key={o.value}
              label={o.label}
              checked={value.values.includes(o.value)}
              onChange={(c) => onChange({ ...value, values: c ? [...value.values, o.value] : value.values.filter((x) => x !== o.value) })}
            />
          ))}
        </div>
        <div className="yx-filter-editor__foot">
          <Button size="sm" onClick={() => onChange({ ...value, values: opts.map((o) => o.value) })}>
            Select all
          </Button>
          <Button size="sm" onClick={() => onChange({ ...value, values: [] })}>
            Clear
          </Button>
        </div>
      </div>
    );
  }
  if (value.type === 'date') {
    return (
      <div className="yx-filter-editor">
        <FieldRow>
          <FormField label="From">
            <DatePicker value={fromISO(value.from)} onChange={(d) => onChange({ ...value, from: toISO(d) })} max={fromISO(value.to) ?? undefined} />
          </FormField>
          <FormField label="To">
            <DatePicker value={fromISO(value.to)} onChange={(d) => onChange({ ...value, to: toISO(d) })} min={fromISO(value.from) ?? undefined} />
          </FormField>
        </FieldRow>
      </div>
    );
  }
  if (value.type === 'number') {
    return (
      <div className="yx-filter-editor">
        <FieldRow>
          <FormField label="Minimum">
            <NumberField value={value.min} onChange={(min) => onChange({ ...value, min })} />
          </FormField>
          <FormField label="Maximum">
            <NumberField value={value.max} onChange={(max) => onChange({ ...value, max })} />
          </FormField>
        </FieldRow>
      </div>
    );
  }
  return (
    <div className="yx-filter-editor">
      <FormField label={`${field.label} contains`}>
        <TextField value={value.contains} onChange={(contains) => onChange({ ...value, contains })} autoFocus />
      </FormField>
    </div>
  );
}

function Chip({
  field,
  value,
  open,
  onOpenChange,
  onChange,
  onRemove,
}: {
  field: FilterFieldDef;
  value: FilterValue;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onChange: (v: FilterValue) => void;
  onRemove: () => void;
}) {
  const active = isFilterActive(value);
  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverAnchor asChild>
        <span className="yx-filter-chip" data-active={active || undefined}>
          <button type="button" className="yx-filter-chip__main" aria-expanded={open} aria-haspopup="dialog" onClick={() => onOpenChange(!open)}>
            <span className="yx-filter-chip__label">{field.label}:</span>
            <span className="yx-filter-chip__value">{summarise(field, value)}</span>
            <Icon icon={ChevronDown} />
          </button>
          <button type="button" className="yx-filter-chip__remove" aria-label={`Remove ${field.label} filter`} onClick={onRemove}>
            <Icon icon={X} />
          </button>
        </span>
      </PopoverAnchor>
      <PopoverContent className="yx-filter-popover" aria-label={`${field.label} filter`}>
        <Editor field={field} value={value} onChange={onChange} />
      </PopoverContent>
    </Popover>
  );
}

/**
 * Search + active filters as chips + "Add filter" + "Clear all" (§30).
 * Controlled: store `value` and `search` in the URL with filtersToQuery so views can be shared.
 */
export function FilterBar({ fields, value, onChange, search = '', onSearchChange, searchPlaceholder = 'Search', children }: FilterBarProps) {
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [q, setQ] = useState(search);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => setQ(search), [search]);

  const unused = fields.filter((f) => !value.some((v) => v.key === f.key));
  // "Clear all" only when a filter actually narrows the list ("Status: Any" does not).
  const hasAny = value.some(isFilterActive) || q !== '';

  return (
    <div className="yx-filter-bar" role="search">
      {onSearchChange && (
        <div className="yx-filter-bar__search">
          <TextField
            size="sm"
            aria-label={searchPlaceholder}
            placeholder={searchPlaceholder}
            prefix={<Icon icon={Search} />}
            value={q}
            onChange={(t) => {
              setQ(t);
              clearTimeout(timer.current);
              timer.current = setTimeout(() => onSearchChange(t), 200);
            }}
          />
        </div>
      )}
      {value.map((v) => {
        const field = fields.find((f) => f.key === v.key);
        if (!field) return null;
        return (
          <Chip
            key={v.key}
            field={field}
            value={v}
            open={openKey === v.key}
            onOpenChange={(o) => setOpenKey(o ? v.key : null)}
            onChange={(nv) => onChange(value.map((x) => (x.key === nv.key ? nv : x)))}
            onRemove={() => onChange(value.filter((x) => x.key !== v.key))}
          />
        );
      })}
      {unused.length > 0 && (
        <Menu>
          <MenuTrigger asChild>
            <Button size="sm" icon={Plus}>
              Filter
            </Button>
          </MenuTrigger>
          {/* Don't hand focus back to "Filter": the new chip's editor opens instead. */}
          <MenuContent onCloseAutoFocus={(e) => e.preventDefault()}>
            {unused.map((f) => (
              <MenuItem
                key={f.key}
                onSelect={() => {
                  onChange([...value, emptyFor(f)]);
                  // open its editor once the chip has mounted
                  setTimeout(() => setOpenKey(f.key), 0);
                }}
              >
                {f.label}
              </MenuItem>
            ))}
          </MenuContent>
        </Menu>
      )}
      {hasAny && (
        <Button
          size="sm"
          onClick={() => {
            onChange([]);
            setQ('');
            onSearchChange?.('');
          }}
        >
          Clear all
        </Button>
      )}
      {children && <div className="yx-filter-bar__end">{children}</div>}
    </div>
  );
}

export interface SavedView {
  id: string;
  name: string;
  shared?: boolean;
}

export interface SavedViewMenuProps {
  views: SavedView[];
  currentId: string;
  onSelect: (id: string) => void;
  /** Current filters / columns differ from the saved view. */
  modified?: boolean;
  onSave?: () => void;
  onSaveAs?: (name: string, shared: boolean) => void;
}

/** Personal and shared saved views (§20). */
export function SavedViewMenu({ views, currentId, onSelect, modified, onSave, onSaveAs }: SavedViewMenuProps) {
  const current = views.find((v) => v.id === currentId);
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState('');
  const [shared, setShared] = useState(false);
  const mine = views.filter((v) => !v.shared);
  const team = views.filter((v) => v.shared);
  return (
    <Popover open={naming} onOpenChange={setNaming}>
      <PopoverAnchor asChild>
        <span className="yx-view-menu">
          <Menu>
            <MenuTrigger asChild>
              <Button size="sm">
                View: {current?.name ?? 'Custom'}
                {modified ? ' (edited)' : ''}
                <Icon icon={ChevronDown} />
              </Button>
            </MenuTrigger>
            <MenuContent align="end">
              {mine.length > 0 && <MenuLabel>My views</MenuLabel>}
              {mine.map((v) => (
                <MenuItem key={v.id} onSelect={() => onSelect(v.id)} aria-current={v.id === currentId || undefined}>
                  {v.name}
                </MenuItem>
              ))}
              {team.length > 0 && <MenuLabel>Shared with the team</MenuLabel>}
              {team.map((v) => (
                <MenuItem key={v.id} onSelect={() => onSelect(v.id)} aria-current={v.id === currentId || undefined}>
                  {v.name}
                </MenuItem>
              ))}
              {(onSave || onSaveAs) && <MenuSeparator />}
              {onSave && modified && <MenuItem onSelect={onSave}>Save changes to "{current?.name}"</MenuItem>}
              {onSaveAs && <MenuItem onSelect={() => setTimeout(() => setNaming(true), 0)}>Save as new view…</MenuItem>}
            </MenuContent>
          </Menu>
        </span>
      </PopoverAnchor>
      <PopoverContent align="end" className="yx-filter-popover">
        <form
          className="yx-filter-editor"
          onSubmit={(e) => {
            e.preventDefault();
            if (!name.trim()) return;
            onSaveAs?.(name.trim(), shared);
            setNaming(false);
            setName('');
          }}
        >
          <FormField label="View name" required>
            <TextField value={name} onChange={setName} autoFocus placeholder="e.g. Chennai on probation" />
          </FormField>
          <Checkbox label="Share with the team" checked={shared} onChange={setShared} />
          <div className="yx-filter-editor__foot">
            <Button size="sm" onClick={() => setNaming(false)}>
              Cancel
            </Button>
            <Button size="sm" variant="primary" type="submit">
              Save view
            </Button>
          </div>
        </form>
      </PopoverContent>
    </Popover>
  );
}
