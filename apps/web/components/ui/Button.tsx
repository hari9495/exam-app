import { ButtonHTMLAttributes } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import clsx from 'clsx';

type Variant = 'primary' | 'secondary' | 'danger';
type Size = 'md' | 'sm';

interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'ref'> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
}

const VARIANT_CLASSES: Record<Variant, string> = {
  // Colour is rationed to the primary action, in the org's own primary.
  primary: 'bg-primary text-on-primary hover:opacity-90',
  // Secondary is a quiet rule outline on paper, not a filled grey block.
  secondary: 'bg-paper text-ink border border-rule hover:bg-ground',
  danger: 'bg-status-danger text-white hover:opacity-90',
};

const SIZE_CLASSES: Record<Size, string> = {
  md: 'px-4 py-2 text-sm',
  // whitespace-nowrap: a two-word label in a dense table actions column must not wrap.
  sm: 'whitespace-nowrap px-2.5 py-1 text-xs',
};

export function Button({ variant = 'primary', size = 'md', className, disabled, loading, children, ...props }: ButtonProps) {
  // The press dips the control on a tight spring -- a considered micro-interaction, disabled for
  // users who prefer reduced motion.
  const reduce = useReducedMotion();
  return (
    <motion.button
      whileTap={reduce ? undefined : { scale: 0.97 }}
      transition={{ type: 'spring', stiffness: 500, damping: 30 }}
      className={clsx(
        'rounded-lg font-body font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50',
        SIZE_CLASSES[size],
        (loading || undefined) && 'inline-flex items-center justify-center gap-2',
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
    </motion.button>
  );
}
