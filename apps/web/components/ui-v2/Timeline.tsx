import type { ReactNode } from 'react';

// Adapted from 21st.dev "Timeline" (nyxbui): dot + connector line + content, laid out on a grid.
// Retoned to Azure tokens (inline), simplified to a status-coloured dot with a hairline connector.
export function Timeline({ children }: { children: ReactNode }) {
  return <div style={{ display: 'flex', flexDirection: 'column' }}>{children}</div>;
}

export function TimelineRow({
  color = 'var(--muted)', filled = true, last = false, children,
}: { color?: string; filled?: boolean; last?: boolean; children: ReactNode }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '12px 1fr', gap: 12 }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <span style={{ width: 12, height: 12, borderRadius: '50%', background: filled ? color : 'var(--surface)', border: `2px solid ${color}`, flexShrink: 0, marginTop: 3, boxSizing: 'border-box' }} />
        {!last && <span style={{ flex: 1, width: 2, background: 'var(--hair)', marginTop: 2 }} />}
      </div>
      <div style={{ paddingBottom: last ? 0 : 14, minWidth: 0 }}>{children}</div>
    </div>
  );
}
