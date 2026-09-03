'use client';

// Lean click-dropdown (trigger + panel, outside-click to close). Used for the row kebab menu, column
// header filters, and the column-visibility menu. children is a render fn receiving `close` so items
// decide whether to close. The menu is portaled to <body> and fixed-positioned to the trigger, so it
// is never clipped by a table's overflow:hidden / overflow-x:auto wrapper.
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

export function Dropdown({
  trigger, children, align = 'start', menuWidth = 180,
}: { trigger: ReactNode; children: (close: () => void) => ReactNode; align?: 'start' | 'end'; menuWidth?: number }) {
  const [open, setOpen] = useState(false);
  // accent captures the resolved --org-primary from the trigger's context, since the portaled menu
  // renders in <body> and would otherwise miss the org's branded accent (set on the layout root).
  const [pos, setPos] = useState<{ top: number; left?: number; right?: number; accent: string }>({ top: 0, accent: '' });
  const triggerRef = useRef<HTMLSpanElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Position the portaled menu under the trigger (recomputed on open and on scroll/resize).
  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const el = triggerRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const accent = getComputedStyle(el).getPropertyValue('--org-primary').trim();
      setPos(align === 'end' ? { top: r.bottom + 6, right: window.innerWidth - r.right, accent } : { top: r.bottom + 6, left: r.left, accent });
    };
    place();
    window.addEventListener('scroll', place, true);
    window.addEventListener('resize', place);
    return () => { window.removeEventListener('scroll', place, true); window.removeEventListener('resize', place); };
  }, [open, align]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (triggerRef.current?.contains(t) || menuRef.current?.contains(t)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  return (
    <span ref={triggerRef} style={{ display: 'inline-flex' }}>
      <span onClick={() => setOpen((o) => !o)} style={{ display: 'inline-flex' }}>{trigger}</span>
      {open && typeof document !== 'undefined' && createPortal(
        <div ref={menuRef} style={{ position: 'fixed', top: pos.top, left: pos.left, right: pos.right, minWidth: menuWidth, background: 'var(--paper)', border: '1px solid var(--hair)', borderRadius: 10, boxShadow: '0 12px 32px -12px rgba(11,18,32,.28)', zIndex: 200, padding: 6, ...(pos.accent ? { ['--org-primary' as string]: pos.accent } : {}) }} className="v2">
          {children(() => setOpen(false))}
        </div>,
        document.body,
      )}
    </span>
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
