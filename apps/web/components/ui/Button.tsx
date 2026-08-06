import { ButtonHTMLAttributes } from 'react';
import clsx from 'clsx';

type Variant = 'primary' | 'secondary' | 'danger';
type Size = 'md' | 'sm';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
}

const VARIANT_CLASSES: Record<Variant, string> = {
  // border-recruiter-border (a fixed neutral, not org-branded) keeps the button's
  // outline visible even if an org picks a Primary Color close to the page
  // background; text-on-primary is org-configurable (Brand Settings > Font Color)
  // so the label stays readable against whatever Primary Color they choose.
  primary: 'border border-recruiter-border bg-primary text-on-primary hover:opacity-90',
  secondary: 'bg-gray-100 text-gray-900 hover:bg-gray-200',
  danger: 'bg-red-600 text-white hover:bg-red-700',
};

// 'sm' is for actions sitting inside a dense table row. whitespace-nowrap matters there:
// in a narrow actions column a two-word label like "View log" otherwise wraps onto two
// lines and stops reading as a button at all.
const SIZE_CLASSES: Record<Size, string> = {
  md: 'px-4 py-2 text-sm',
  sm: 'whitespace-nowrap px-2.5 py-1 text-xs',
};

export function Button({ variant = 'primary', size = 'md', className, disabled, loading, children, ...props }: ButtonProps) {
  return (
    <button
      className={clsx(
        'rounded-md font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50',
        SIZE_CLASSES[size],
        loading && 'inline-flex items-center justify-center gap-2',
        VARIANT_CLASSES[variant],
        className,
      )}
      disabled={disabled || loading}
      {...props}
    >
      {loading && (
        <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
      )}
      {children}
    </button>
  );
}
