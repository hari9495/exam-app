import type { CSSProperties, ReactNode } from 'react';

// Layout helpers for stories only (not exported from the package).
export function Row({ children, gap = 12, align = 'center' }: { children: ReactNode; gap?: number; align?: CSSProperties['alignItems'] }) {
  return <div style={{ display: 'flex', flexWrap: 'wrap', gap, alignItems: align }}>{children}</div>;
}

export function Stack({ children, gap = 24, width }: { children: ReactNode; gap?: number; width?: number }) {
  return <div style={{ display: 'flex', flexDirection: 'column', gap, maxWidth: width }}>{children}</div>;
}

export function Section({ title, note, children }: { title: string; note?: string; children: ReactNode }) {
  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 32 }}>
      <div>
        <h2 style={{ margin: 0, fontSize: 12, lineHeight: '16px', fontWeight: 500, color: 'var(--yx-color-text-muted)' }}>{title}</h2>
        {note && <p style={{ margin: '2px 0 0', fontSize: 13, color: 'var(--yx-color-text-secondary)' }}>{note}</p>}
      </div>
      {children}
    </section>
  );
}
