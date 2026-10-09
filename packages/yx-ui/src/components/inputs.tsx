import {
  forwardRef,
  useEffect,
  useState,
  type InputHTMLAttributes,
  type ReactNode,
  type TextareaHTMLAttributes,
} from 'react';
import { CheckCircle2, Eye, EyeOff } from 'lucide-react';
import { cx } from '../lib/cx';
import { formatTime, groupIndian, parseTime } from '../lib/format';
import { ID_SPECS, maskAadhaar, type IdKind } from '../lib/validators';
import { Icon } from './foundations';
import { useFieldControl } from './field';

type NativeInput = Omit<InputHTMLAttributes<HTMLInputElement>, 'prefix' | 'size' | 'value' | 'onChange' | 'defaultValue'>;

export interface TextFieldProps extends NativeInput {
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  /** Fixed text or icon before the value, e.g. "₹" or "+91". */
  prefix?: ReactNode;
  suffix?: ReactNode;
  size?: 'sm' | 'md';
}

/** Single-line text input. Put it inside <FormField> for label, help and error (§16). */
export const TextField = forwardRef<HTMLInputElement, TextFieldProps>(function TextField(
  { prefix, suffix, size = 'md', className, onChange, id, required, disabled, 'aria-describedby': ad, type = 'text', ...rest },
  ref,
) {
  const { controlProps } = useFieldControl({ id, required, disabled, 'aria-describedby': ad });
  return (
    <div className={cx('yx-input', className)} data-size={size} data-disabled={controlProps.disabled || undefined} data-invalid={controlProps['aria-invalid']}>
      {prefix && <span className="yx-input__affix">{prefix}</span>}
      <input ref={ref} type={type} className="yx-input__control" {...controlProps} onChange={(e) => onChange?.(e.target.value)} {...rest} />
      {suffix && <span className="yx-input__affix">{suffix}</span>}
    </div>
  );
});

export interface TextAreaProps extends Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'onChange'> {
  onChange?: (value: string) => void;
}

export const TextArea = forwardRef<HTMLTextAreaElement, TextAreaProps>(function TextArea(
  { className, onChange, id, required, disabled, 'aria-describedby': ad, rows = 4, ...rest },
  ref,
) {
  const { controlProps } = useFieldControl({ id, required, disabled, 'aria-describedby': ad });
  return (
    <textarea
      ref={ref}
      rows={rows}
      className={cx('yx-textarea', className)}
      {...controlProps}
      onChange={(e) => onChange?.(e.target.value)}
      {...rest}
    />
  );
});

export const PasswordField = forwardRef<HTMLInputElement, Omit<TextFieldProps, 'type' | 'suffix'>>(function PasswordField(props, ref) {
  const [shown, setShown] = useState(false);
  return (
    <TextField
      ref={ref}
      type={shown ? 'text' : 'password'}
      autoComplete="current-password"
      {...props}
      suffix={
        <button type="button" className="yx-input__toggle" aria-label={shown ? 'Hide password' : 'Show password'} aria-pressed={shown} onClick={() => setShown((s) => !s)}>
          <Icon icon={shown ? EyeOff : Eye} />
        </button>
      }
    />
  );
});

interface NumericBase extends Omit<NativeInput, 'type' | 'min' | 'max'> {
  value: number | null;
  onChange: (value: number | null) => void;
  min?: number;
  max?: number;
  size?: 'sm' | 'md';
  suffix?: ReactNode;
}

function useNumericText(value: number | null, format: (n: number) => string) {
  const [focused, setFocused] = useState(false);
  const [text, setText] = useState(value == null ? '' : format(value));
  useEffect(() => {
    if (!focused) setText(value == null ? '' : format(value));
  }, [value, focused, format]);
  return { focused, setFocused, text, setText };
}

function rangeError(n: number | null, min?: number, max?: number, fmt: (n: number) => string = String): string | null {
  if (n == null) return null;
  if (min != null && max != null && (n < min || n > max)) return `Enter a value between ${fmt(min)} and ${fmt(max)}`;
  if (min != null && n < min) return `Enter ${fmt(min)} or more`;
  if (max != null && n > max) return `Enter ${fmt(max)} or less`;
  return null;
}

/** The range message is set on blur; once the value is back in range by any route (typing, Discard, a reset) it goes. */
function useClearRangeError(setInternalError: ((msg: string | null) => void) | undefined, value: number | null, min?: number, max?: number) {
  const inRange = rangeError(value, min, max) === null;
  useEffect(() => {
    if (inRange) setInternalError?.(null);
  }, [inRange, setInternalError]);
}

export interface NumberFieldProps extends NumericBase {
  /** Allow decimals (default: whole numbers). */
  decimals?: boolean;
}

export const NumberField = forwardRef<HTMLInputElement, NumberFieldProps>(function NumberField(
  { value, onChange, min, max, decimals = false, onBlur, onFocus, ...rest },
  ref,
) {
  const { ctx } = useFieldControl();
  const { setFocused, text, setText } = useNumericText(value, String);
  useClearRangeError(ctx?.setInternalError, value, min, max);
  return (
    <TextField
      ref={ref}
      inputMode={decimals ? 'decimal' : 'numeric'}
      value={text}
      onFocus={(e) => {
        setFocused(true);
        onFocus?.(e);
      }}
      onChange={(t) => {
        // While typing, no range message: it is checked again when the person leaves the field.
        ctx?.setInternalError(null);
        const clean = t.replace(decimals ? /[^\d.-]/g : /[^\d-]/g, '');
        setText(clean);
        const n = clean === '' || clean === '-' ? null : Number(clean);
        onChange(n != null && Number.isFinite(n) ? n : null);
      }}
      onBlur={(e) => {
        setFocused(false);
        ctx?.setInternalError(rangeError(value, min, max));
        onBlur?.(e);
      }}
      {...rest}
    />
  );
});

export interface CurrencyFieldProps extends NumericBase {
  /** Allow paise (two decimals). Default: whole rupees (§16). */
  allowPaise?: boolean;
}

/** ₹ amount with Indian grouping (12,34,567). Shows raw digits while editing, grouped otherwise. */
export const CurrencyField = forwardRef<HTMLInputElement, CurrencyFieldProps>(function CurrencyField(
  { value, onChange, min = 0, max, allowPaise = false, onBlur, onFocus, ...rest },
  ref,
) {
  const { ctx } = useFieldControl();
  const fmt = (n: number) => groupIndian(n, allowPaise && !Number.isInteger(n) ? 2 : undefined);
  const { setFocused, text, setText } = useNumericText(value, fmt);
  useClearRangeError(ctx?.setInternalError, value, min, max);
  return (
    <TextField
      ref={ref}
      prefix="₹"
      inputMode={allowPaise ? 'decimal' : 'numeric'}
      className="yx-input--numeric"
      value={text}
      onFocus={(e) => {
        setFocused(true);
        setText(value == null ? '' : String(value));
        onFocus?.(e);
      }}
      onChange={(t) => {
        // While typing, no range message: it is checked again when the person leaves the field.
        ctx?.setInternalError(null);
        let clean = t.replace(allowPaise ? /[^\d.]/g : /\D/g, '');
        if (allowPaise) {
          const [i, ...f] = clean.split('.');
          clean = f.length ? `${i}.${f.join('').slice(0, 2)}` : i;
        }
        setText(clean);
        onChange(clean === '' || clean === '.' ? null : Number(clean));
      }}
      onBlur={(e) => {
        setFocused(false);
        ctx?.setInternalError(rangeError(value, min, max, (n) => `₹${groupIndian(n)}`));
        onBlur?.(e);
      }}
      {...rest}
    />
  );
});

export interface MaskedFieldProps extends Omit<NativeInput, 'type'> {
  kind: IdKind;
  /** Normalised value: PAN/IFSC upper-case, digits only for UAN / Aadhaar / phone (10 digits, no +91). */
  value: string;
  onChange: (value: string) => void;
  size?: 'sm' | 'md';
}

/**
 * PAN, IFSC, UAN, Aadhaar and Indian mobile with format masks and live checks (§16).
 * Errors show after the first blur and clear as soon as the value becomes valid.
 * Aadhaar is shown masked (XXXX XXXX 1234) when not being edited.
 */
export const MaskedField = forwardRef<HTMLInputElement, MaskedFieldProps>(function MaskedField(
  { kind, value, onChange, onBlur, onFocus, placeholder, ...rest },
  ref,
) {
  const spec = ID_SPECS[kind];
  const { ctx } = useFieldControl();
  const [touched, setTouched] = useState(false);
  const [focused, setFocused] = useState(false);
  const error = value ? spec.validate(value) : null;
  const valid = Boolean(value) && !error;

  useEffect(() => {
    if (touched) ctx?.setInternalError(error);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [touched, error]);

  const shown = kind === 'aadhaar' && !focused && valid ? maskAadhaar(value) : spec.display(value);

  return (
    <TextField
      ref={ref}
      inputMode={spec.inputMode}
      autoCapitalize={kind === 'pan' || kind === 'ifsc' ? 'characters' : undefined}
      autoComplete={kind === 'phone' ? 'tel-national' : 'off'}
      spellCheck={false}
      className="yx-input--mono"
      placeholder={placeholder ?? spec.placeholder}
      prefix={kind === 'phone' ? '+91' : undefined}
      suffix={valid ? <span className="yx-input__ok"><Icon icon={CheckCircle2} label="Valid" /></span> : undefined}
      value={shown}
      onFocus={(e) => {
        setFocused(true);
        onFocus?.(e);
      }}
      onChange={(t) => onChange(spec.normalise(t))}
      onBlur={(e) => {
        setFocused(false);
        setTouched(true);
        onBlur?.(e);
      }}
      {...rest}
    />
  );
});

export interface TimeFieldProps extends Omit<NativeInput, 'type'> {
  /** "HH:mm" 24-hour, or null. */
  value: string | null;
  onChange: (value: string | null) => void;
  /** 12-hour display is the India default (§35). */
  hour12?: boolean;
  size?: 'sm' | 'md';
}

/** Accepts "9", "930", "9:30 pm", "21:30". Shows "9:30 pm" (or "21:30"). */
export const TimeField = forwardRef<HTMLInputElement, TimeFieldProps>(function TimeField(
  { value, onChange, hour12 = true, onBlur, placeholder, ...rest },
  ref,
) {
  const { ctx } = useFieldControl();
  const [text, setText] = useState(formatTime(value, hour12));
  useEffect(() => setText(formatTime(value, hour12)), [value, hour12]);
  return (
    <TextField
      ref={ref}
      placeholder={placeholder ?? (hour12 ? '9:30 am' : '09:30')}
      value={text}
      onChange={setText}
      onBlur={(e) => {
        if (text.trim() === '') {
          ctx?.setInternalError(null);
          onChange(null);
        } else {
          const t = parseTime(text);
          ctx?.setInternalError(t ? null : `Enter a time like ${hour12 ? '9:30 am' : '09:30'}`);
          if (t) {
            onChange(t);
            setText(formatTime(t, hour12));
          }
        }
        onBlur?.(e);
      }}
      {...rest}
    />
  );
});
