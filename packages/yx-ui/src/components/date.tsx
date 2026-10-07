import { forwardRef, useEffect, useState, type ReactNode } from 'react';
import { DayPicker, type Matcher } from 'react-day-picker';
import { CalendarDays } from 'lucide-react';
import { formatDate, parseDate } from '../lib/format';
import { Icon } from './foundations';
import { FieldRow, FormField, useFieldControl } from './field';
import { TextField } from './inputs';
import { Popover, PopoverAnchor, PopoverContent, closeOnEscape } from './popover';

export interface DatePickerProps {
  value: Date | null;
  onChange: (value: Date | null) => void;
  /** Earliest allowed date (inclusive). */
  min?: Date;
  /** Latest allowed date (inclusive). */
  max?: Date;
  /** Extra days to block, e.g. holidays. */
  disabledDays?: Matcher | Matcher[];
  placeholder?: string;
  disabled?: boolean;
  required?: boolean;
  id?: string;
  size?: 'sm' | 'md';
  onBlur?: () => void;
  'aria-label'?: string;
  /** Start with the calendar open (docs and screenshot tests). */
  defaultOpen?: boolean;
}

const dayStart = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

/**
 * Date input: type ("28 Sep 2026", "28/09/2026", "28-9-26") or pick from the calendar (§16).
 * Always shows dd MMM yyyy (§35).
 */
export const DatePicker = forwardRef<HTMLInputElement, DatePickerProps>(function DatePicker(
  { value, onChange, min, max, disabledDays, placeholder = 'dd MMM yyyy', disabled, required, id, size, onBlur, 'aria-label': ariaLabel, defaultOpen = false },
  ref,
) {
  const { ctx } = useFieldControl();
  const [open, setOpen] = useState(defaultOpen);
  const [text, setText] = useState(formatDate(value));
  useEffect(() => setText(formatDate(value)), [value]);

  const rangeMsg = (d: Date): string | null => {
    if (min && dayStart(d) < dayStart(min)) return `Choose a date on or after ${formatDate(min)}`;
    if (max && dayStart(d) > dayStart(max)) return `Choose a date on or before ${formatDate(max)}`;
    return null;
  };

  const commitText = () => {
    if (!text.trim()) {
      ctx?.setInternalError(null);
      if (value) onChange(null);
      return;
    }
    const d = parseDate(text);
    if (!d) {
      ctx?.setInternalError('Enter a date like 28 Sep 2026');
      return;
    }
    const msg = rangeMsg(d);
    ctx?.setInternalError(msg);
    if (!msg) {
      onChange(d);
      setText(formatDate(d));
    }
  };

  const blocked: Matcher[] = [
    ...(min ? [{ before: min }] : []),
    ...(max ? [{ after: max }] : []),
    ...(disabledDays ? ([] as Matcher[]).concat(disabledDays) : []),
  ];

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverAnchor asChild>
        <div>
          <TextField
            ref={ref}
            id={id}
            size={size}
            value={text}
            placeholder={placeholder}
            disabled={disabled}
            required={required}
            aria-label={ariaLabel}
            autoComplete="off"
            onChange={setText}
            onBlur={() => {
              commitText();
              onBlur?.();
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitText();
              if (e.key === 'ArrowDown' && e.altKey) setOpen(true);
            }}
            suffix={
              <button type="button" className="yx-input__toggle" aria-label="Open calendar" disabled={disabled} onClick={() => setOpen((o) => !o)}>
                <Icon icon={CalendarDays} />
              </button>
            }
          />
        </div>
      </PopoverAnchor>
      <PopoverContent className="yx-calendar" onOpenAutoFocus={(e) => e.preventDefault()} onKeyDown={closeOnEscape(setOpen)}>
        <DayPicker
          mode="single"
          selected={value ?? undefined}
          defaultMonth={value ?? min ?? undefined}
          onSelect={(d) => {
            ctx?.setInternalError(null);
            onChange(d ?? null);
            setOpen(false);
          }}
          disabled={blocked}
          weekStartsOn={1}
          captionLayout="dropdown"
          startMonth={min ?? new Date(1940, 0)}
          endMonth={max ?? new Date(new Date().getFullYear() + 10, 11)}
          autoFocus
        />
      </PopoverContent>
    </Popover>
  );
});

export interface DateRange {
  from: Date | null;
  to: Date | null;
}

export interface DateRangePickerProps {
  /** Group label, e.g. "Leave dates". */
  label: ReactNode;
  value: DateRange;
  onChange: (value: DateRange) => void;
  min?: Date;
  max?: Date;
  required?: boolean;
  fromLabel?: string;
  toLabel?: string;
  helper?: ReactNode;
}

/** From / To pair on one row (§16). "To" cannot be before "From". */
export function DateRangePicker({ label, value, onChange, min, max, required, fromLabel = 'From', toLabel = 'To', helper }: DateRangePickerProps) {
  const orderError = value.from && value.to && dayStart(value.to) < dayStart(value.from) ? 'End date must be on or after the start date' : null;
  return (
    <fieldset className="yx-fieldset">
      <legend className="yx-field__label">
        <span>{label}</span>
        {required && <span className="yx-field__req">Required</span>}
      </legend>
      <FieldRow>
        {/* "Required" is shown once, on the group label; the inputs still carry aria-required. */}
        <FormField label={fromLabel}>
          <DatePicker value={value.from} onChange={(from) => onChange({ ...value, from })} min={min} max={value.to ?? max} required={required} />
        </FormField>
        <FormField label={toLabel} error={orderError}>
          <DatePicker value={value.to} onChange={(to) => onChange({ ...value, to })} min={value.from ?? min} max={max} required={required} />
        </FormField>
      </FieldRow>
      {helper && <p className="yx-field__helper">{helper}</p>}
    </fieldset>
  );
}
