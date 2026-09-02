'use client';

// Minimal modal: overlay + centered panel, close on overlay-click or Escape. Reused for confirms
// (and, later, edit/add forms). Rendered in-tree inside the .v2 scope so tokens resolve.
import { useEffect, type ReactNode } from 'react';

export function Dialog({
  open, onClose, title, children, width = 440,
}: { open: boolean; onClose: () => void; title?: string; children: ReactNode; width?: number }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(11,18,32,.45)', display: 'grid', placeItems: 'center', zIndex: 100, padding: 20 }}>
      <div role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()} style={{ width: '100%', maxWidth: width, background: 'color-mix(in srgb, var(--ink) 6%, var(--paper))', border: '1px solid var(--hair)', borderRadius: 16, padding: 22, boxShadow: '0 24px 60px -20px rgba(11,18,32,.5)' }}>
        {title && <h2 style={{ fontFamily: 'var(--font-disp)', fontWeight: 600, fontSize: 18, letterSpacing: '-0.01em', color: 'var(--ink)', margin: '0 0 12px' }}>{title}</h2>}
        {children}
      </div>
    </div>
  );
}
