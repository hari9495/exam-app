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

export function Input({ label, value, onChange, error, icon, className, id, hideLabel, ...props }: InputProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={inputId} className={clsx('text-sm font-medium text-gray-700', hideLabel && 'sr-only')}>
        {label}
      </label>
      <div className="relative">
        {icon && (
          <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-gray-400">{icon}</span>
        )}
        <input
          id={inputId}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={clsx(
            'w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none',
            icon && 'pl-9',
            error && 'border-red-500',
            className,
          )}
          aria-invalid={Boolean(error)}
          {...props}
        />
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
