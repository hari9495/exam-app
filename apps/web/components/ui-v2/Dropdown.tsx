'use client';

// Lean click-dropdown (trigger + panel, outside-click to close). Used for the row kebab menu and the
// column-visibility menu. children is a render fn receiving `close` so items decide whether to close.
import { useEffect, useRef, useState, type ReactNode } from 'react';

export function Dropdown({
  trigger, children, align = 'start', menuWidth = 180,
}: { trigger: ReactNode; children: (close: () => void) => ReactNode; align?: 'start' | 'end'; menuWidth?: number }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);
  return (
    <div ref={ref} style={{ position: 'relative', display: 'inline-flex' }}>
      <span onClick={() => setOpen((o) => !o)} style={{ display: 'inline-flex' }}>{trigger}</span>
      {open && (
        <div style={{ position: 'absolute', top: 'calc(100% + 6px)', [align === 'end' ? 'right' : 'left']: 0, minWidth: menuWidth, background: 'var(--paper)', border: '1px solid var(--hair)', borderRadius: 10, boxShadow: '0 12px 32px -12px rgba(11,18,32,.28)', zIndex: 60, padding: 6 } as React.CSSProperties}>
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  );
}

// Shared menu-item style + component for Dropdown contents.
export function DropdownItem({
  children, onClick, danger = false,
}: { children: ReactNode; onClick?: () => void; danger?: boolean }) {
  return (
    <button
      type="button" className="wf-opt" onClick={onClick}
      style={{ display: 'flex', alignItems: 'center', gap: 9, width: '100%', textAlign: 'left', padding: '8px 9px', borderRadius: 7, fontSize: 13, cursor: 'pointer', background: 'transparent', border: 'none', color: danger ? 'var(--danger)' : 'var(--ink)' }}
    >
      {children}
    </button>
  );
}
