import { forwardRef, useMemo, useState, type ForwardedRef, type ReactNode, type Ref } from 'react';
import { Command, useCommandState } from 'cmdk';
import { Check, ChevronDown, Search } from 'lucide-react';
import { cx } from '../lib/cx';
import { Icon } from './foundations';
import { useFieldControl } from './field';
import { Popover, PopoverContent, PopoverTrigger } from './popover';
import { PersonLabel } from './display';

const CLEAR = '__yx_clear__';

export interface SelectOption<V extends string = string> {
  value: V;
  label: string;
  /** Second line shown under the label. */
  description?: ReactNode;
  /** Extra words that should match search (email, code…). */
  keywords?: string[];
  disabled?: boolean;
}

interface ListProps<V extends string> {
  options: SelectOption<V>[];
  isSelected: (v: V) => boolean;
  onPick: (v: V) => void;
  searchable: boolean;
  searchPlaceholder: string;
  emptyText: string;
  renderOption?: (o: SelectOption<V>) => ReactNode;
  multi?: boolean;
  /** Item highlighted when the list opens: the current choice (§14, keyboard users start where they are). */
  initial?: V;
}

/** Empty result as a plain status message; the (empty) listbox is hidden so it isn't announced as a list with no options. */
function EmptyNote({ text }: { text: string }) {
  const count = useCommandState((st) => st.filtered.count);
  if (count > 0) return null;
  return (
    <p className="yx-listbox__empty" role="status">
      {text}
    </p>
  );
}

function OptionList<V extends string>({ options, isSelected, onPick, searchable, searchPlaceholder, emptyText, renderOption, multi, initial }: ListProps<V>) {
  return (
    <Command className="yx-listbox" loop defaultValue={initial}>
      <div className="yx-listbox__search" data-hidden={!searchable || undefined}>
        <Icon icon={Search} />
        <Command.Input placeholder={searchPlaceholder} aria-label={searchPlaceholder} />
      </div>
      <EmptyNote text={emptyText} />
      <Command.List aria-multiselectable={multi || undefined}>
        {options.map((o) => (
          <Command.Item
            key={o.value}
            value={o.value}
            keywords={[o.label, ...(o.keywords ?? [])]}
            disabled={o.disabled}
            onSelect={() => onPick(o.value)}
            className="yx-listbox__item"
            aria-checked={isSelected(o.value)}
            data-checked={isSelected(o.value) || undefined}
          >
            <span className="yx-listbox__content">
              {renderOption ? (
                renderOption(o)
              ) : (
                <>
                  <span>{o.label}</span>
                  {o.description && <span className="yx-listbox__desc">{o.description}</span>}
                </>
              )}
            </span>
            <span className="yx-listbox__check" aria-hidden="true">
              {isSelected(o.value) && <Icon icon={Check} />}
            </span>
          </Command.Item>
        ))}
      </Command.List>
    </Command>
  );
}

interface CommonProps<V extends string> {
  options: SelectOption<V>[];
  placeholder?: string;
  /** Search box inside the list. Default: shown when there are more than 7 options (§16). */
  searchable?: boolean;
  searchPlaceholder?: string;
  emptyText?: string;
  renderOption?: (o: SelectOption<V>) => ReactNode;
  /** How the chosen option looks in the closed control. Defaults to its label. */
  renderValue?: (o: SelectOption<V>) => ReactNode;
  disabled?: boolean;
  required?: boolean;
  id?: string;
  size?: 'sm' | 'md';
  className?: string;
  'aria-label'?: string;
  /** Start with the list open (docs and screenshot tests). */
  defaultOpen?: boolean;
}

export interface SelectProps<V extends string = string> extends CommonProps<V> {
  value: V | null;
  onChange: (value: V | null) => void;
  /** Adds a "Clear" item for optional fields. */
  clearable?: boolean;
}

function SelectInner<V extends string>(
  {
    options,
    value,
    onChange,
    placeholder = 'Select',
    searchable,
    searchPlaceholder = 'Search',
    emptyText = 'No matches',
    renderOption,
    renderValue,
    clearable,
    disabled,
    required,
    id,
    size = 'md',
    className,
    'aria-label': ariaLabel,
    defaultOpen = false,
  }: SelectProps<V>,
  ref: ForwardedRef<HTMLButtonElement>,
) {
  const [open, setOpen] = useState(defaultOpen);
  const { controlProps } = useFieldControl({ id, required, disabled });
  const selected = options.find((o) => o.value === value) ?? null;
  const showSearch = searchable ?? options.length > 7;
  const list = useMemo(
    () => (clearable && value != null ? [{ value: CLEAR as V, label: 'Clear selection' }, ...options] : options),
    [clearable, value, options],
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          ref={ref}
          type="button"
          role="combobox"
          aria-expanded={open}
          aria-haspopup="listbox"
          aria-label={ariaLabel}
          className={cx('yx-select', className)}
          data-size={size}
          data-placeholder={selected ? undefined : true}
          data-invalid={controlProps['aria-invalid']}
          {...controlProps}
        >
          <span className="yx-select__value">{selected ? (renderValue ? renderValue(selected) : selected.label) : placeholder}</span>
          <Icon icon={ChevronDown} />
        </button>
      </PopoverTrigger>
      <PopoverContent className="yx-select__popover">
        <OptionList
          options={list}
          isSelected={(v) => v === value}
          onPick={(v) => {
            onChange(v === CLEAR ? null : v);
            setOpen(false);
          }}
          searchable={showSearch}
          searchPlaceholder={searchPlaceholder}
          emptyText={emptyText}
          renderOption={renderOption}
          initial={value ?? undefined}
        />
      </PopoverContent>
    </Popover>
  );
}

/** Single choice from a list. Searchable automatically above 7 options; type to filter either way. */
export const Select = forwardRef(SelectInner) as <V extends string = string>(
  p: SelectProps<V> & { ref?: Ref<HTMLButtonElement> },
) => ReturnType<typeof SelectInner>;

/** Select with search always on, for long or remote lists. */
export function Combobox<V extends string = string>(props: SelectProps<V>) {
  return <Select {...props} searchable />;
}

export interface MultiSelectProps<V extends string = string> extends CommonProps<V> {
  value: V[];
  onChange: (value: V[]) => void;
  /** Chips shown in the closed control before "+N". */
  maxChips?: number;
}

/** Several choices, shown as chips (§16). The list stays open while picking. */
export function MultiSelect<V extends string = string>({
  options,
  value,
  onChange,
  placeholder = 'Select',
  searchable,
  searchPlaceholder = 'Search',
  emptyText = 'No matches',
  renderOption,
  maxChips = 3,
  disabled,
  required,
  id,
  size = 'md',
  className,
  'aria-label': ariaLabel,
  defaultOpen = false,
}: MultiSelectProps<V>) {
  const [open, setOpen] = useState(defaultOpen);
  const { controlProps } = useFieldControl({ id, required, disabled });
  const chosen = options.filter((o) => value.includes(o.value));
  const toggle = (v: V) => onChange(value.includes(v) ? value.filter((x) => x !== v) : [...value, v]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          role="combobox"
          aria-expanded={open}
          aria-haspopup="listbox"
          aria-label={ariaLabel}
          className={cx('yx-select', 'yx-select--multi', className)}
          data-size={size}
          data-placeholder={chosen.length ? undefined : true}
          data-invalid={controlProps['aria-invalid']}
          {...controlProps}
        >
          <span className="yx-select__value">
            {chosen.length === 0
              ? placeholder
              : chosen.slice(0, maxChips).map((o) => (
                  <span key={o.value} className="yx-select__chip">
                    {o.label}
                  </span>
                ))}
            {chosen.length > maxChips && <span className="yx-select__more">+{chosen.length - maxChips}</span>}
          </span>
          <Icon icon={ChevronDown} />
        </button>
      </PopoverTrigger>
      <PopoverContent className="yx-select__popover">
        <OptionList
          options={options}
          isSelected={(v) => value.includes(v)}
          onPick={toggle}
          searchable={searchable ?? options.length > 7}
          searchPlaceholder={searchPlaceholder}
          emptyText={emptyText}
          renderOption={renderOption}
          multi
          initial={value[0]}
        />
        {value.length > 0 && (
          <div className="yx-listbox__footer">
            <span>{value.length} selected</span>
            <button type="button" className="yx-link" onClick={() => onChange([])}>
              Clear
            </button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

export interface PersonOption {
  id: string;
  name: string;
  role?: string;
  department?: string;
  email?: string;
  photoUrl?: string | null;
  /** Shown after role and department, e.g. "Away 1–10 Oct". */
  note?: string;
  /** Can't be chosen here; say why in `note`. */
  disabled?: boolean;
}

export interface PersonPickerProps extends Omit<SelectProps, 'options' | 'renderOption' | 'renderValue' | 'searchable'> {
  people: PersonOption[];
}

/** Choose a person: photo, name, role and department; searches name, email, role and department (§16). */
export function PersonPicker({ people, placeholder = 'Search people', ...rest }: PersonPickerProps) {
  const byId = useMemo(() => new Map(people.map((p) => [p.id, p])), [people]);
  const options: SelectOption[] = people.map((p) => ({
    value: p.id,
    label: p.name,
    keywords: [p.email, p.role, p.department].filter(Boolean) as string[],
    disabled: p.disabled,
  }));
  const secondary = (p: PersonOption) => [p.role, p.department, p.note].filter(Boolean).join(' · ') || undefined;
  return (
    <Select
      {...rest}
      options={options}
      placeholder={placeholder}
      searchable
      searchPlaceholder="Name, email, role or department"
      renderOption={(o) => {
        const p = byId.get(o.value)!;
        return <PersonLabel name={p.name} src={p.photoUrl} secondary={secondary(p)} />;
      }}
      renderValue={(o) => {
        const p = byId.get(o.value)!;
        return <PersonLabel name={p.name} src={p.photoUrl} size={20} />;
      }}
    />
  );
}
