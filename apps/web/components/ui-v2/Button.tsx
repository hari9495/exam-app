import type { ReactNode } from 'react';
import { Loader2 } from 'lucide-react';

export function Button({
  type = 'button', loading = false, disabled = false, fullWidth = false, children, className = '',
}: { type?: 'button' | 'submit'; loading?: boolean; disabled?: boolean; fullWidth?: boolean; children: ReactNode; className?: string }) {
  return (
    <button type={type} disabled={disabled || loading} className={`v2-cta ${fullWidth ? 'v2-cta--block' : ''} ${className}`}>
      {loading && <Loader2 size={16} className="animate-spin" aria-hidden="true" />}
      {children}
    </button>
  );
}
