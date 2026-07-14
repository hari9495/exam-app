import { ButtonHTMLAttributes } from 'react';
import clsx from 'clsx';

type Variant = 'primary' | 'secondary';

interface CandidateButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
}

const VARIANT_CLASSES: Record<Variant, string> = {
  primary: 'bg-candidate-primary text-white hover:opacity-90',
  secondary: 'bg-white text-candidate-primary border border-candidate-primary hover:bg-candidate-primary-light',
};

export function CandidateButton({ variant = 'primary', className, disabled, ...props }: CandidateButtonProps) {
  return (
    <button
      className={clsx(
        'rounded-lg px-4 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50',
        VARIANT_CLASSES[variant],
        className,
      )}
      disabled={disabled}
      {...props}
    />
  );
}
