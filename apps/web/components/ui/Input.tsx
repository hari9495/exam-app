import { InputHTMLAttributes, ReactNode, useId } from 'react';
import clsx from 'clsx';

interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'value'> {
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  icon?: ReactNode;
  /** Keep the label for screen readers but hide it visually. For toolbar inputs
   *  whose purpose is obvious from context -- passing label="" instead would
   *  ship an empty <label> and leave the input with no accessible name. */
  hideLabel?: boolean;
}

export function Input({ label, value, onChange, error, icon, className, id, hideLabel, required, ...props }: InputProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  return (
    <div className="flex flex-col gap-1">
      <label
        htmlFor={inputId}
        className={clsx(
          'font-body text-sm font-medium text-ink',
          hideLabel && 'sr-only',
          // CSS-generated content, not real text -- deliberately: a real "*" character in the
          // label's textContent would break every getByLabelText('Email')-style exact-text
          // query across the app the moment a field is marked required. The native `required`
          // attribute below still gives screen readers the real "required" announcement.
          required && "after:ml-0.5 after:text-status-danger after:content-['*']",
        )}
      >
        {label}
      </label>
      <div className="relative">
        {icon && (
          <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-muted">{icon}</span>
        )}
        <input
          id={inputId}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          required={required}
          className={clsx(
            'w-full rounded-lg border border-rule bg-paper px-3 py-2.5 font-body text-sm text-ink focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/15',
            icon && 'pl-9',
            error && 'border-status-danger',
            className,
          )}
          aria-invalid={Boolean(error)}
          {...props}
        />
      </div>
      {error && <p className="font-body text-xs text-status-danger">{error}</p>}
    </div>
  );
}
