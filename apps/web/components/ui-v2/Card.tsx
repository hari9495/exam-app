import type { CSSProperties, ReactNode } from 'react';

export function Card({
  className = '', style, children,
}: { className?: string; style?: CSSProperties; children: ReactNode }) {
  return (
    <div className={`v2-card ${className}`} style={style}>
      {children}
    </div>
  );
}
