import type { ReactNode } from 'react';
import { AlertCircle } from 'lucide-react';

export function FormAlert({ children }: { children: ReactNode }) {
  return (
    <p role="alert" className="v2-alert">
      <AlertCircle size={16} style={{ flexShrink: 0 }} aria-hidden="true" />
      {children}
    </p>
  );
}
