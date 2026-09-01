'use client';

// Adapted from 21st.dev "Combobox" (shugar) — its pattern (client-side filter, click-select, check on
// the active option), reduced to one self-contained control with inline Azure styling (its Geist-token
// sub-components didn't fit the retone). For long lists (exams/candidates) with type-to-filter.
import { useEffect, useRef, useState } from 'react';
import { ChevronDown, Check } from 'lucide-react';

export interface ComboOption { value: string; label: string }

export function Combobox({
  options, value, onChange, placeholder = 'Select', width = 190, active = false,
}: { options: ComboOption[]; value: string; onChange: (v: string) => void; placeholder?: string; width?: number; active?: boolean }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  const current = options.find((o) => o.value === value);
  const filtered = q ? options.filter((o) => o.label.toLowerCase().includes(q.toLowerCase())) : options;

  return (
    <div ref={ref} style={{ position: 'relative', width }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, width: '100%',
          fontSize: 12.5, padding: '7px 11px', borderRadius: 8, cursor: 'pointer',
          border: `1px solid ${active ? 'color-mix(in srgb, var(--org-primary) 30%, transparent)' : 'var(--hair)'}`,
          background: active ? 'color-mix(in srgb, var(--org-primary) 10%, transparent)' : 'var(--surface)',
          color: active ? 'var(--org-primary)' : 'var(--ink)', fontWeight: active ? 600 : 400,
        }}
      >
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{current ? current.label : placeholder}</span>
        <ChevronDown size={15} style={{ flexShrink: 0, transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }} />
      </button>
      {open && (
        <div style={{ position: 'absolute', top: 'calc(100% + 6px)', left: 0, minWidth: '100%', width: 'max-content', maxWidth: 320, background: 'var(--paper)', border: '1px solid var(--hair)', borderRadius: 10, boxShadow: '0 12px 32px -12px rgba(11,18,32,.28)', zIndex: 50, overflow: 'hidden' }}>
          <div style={{ padding: 8, borderBottom: '1px solid var(--hair)' }}>
            <input
              autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search…"
              style={{ width: '100%', border: '1px solid var(--hair)', borderRadius: 7, padding: '7px 9px', fontSize: 13, background: 'var(--surface)', color: 'var(--ink)', outline: 'none', boxSizing: 'border-box' }}
            />
          </div>
          <ul style={{ maxHeight: 240, overflowY: 'auto', padding: 6, margin: 0, listStyle: 'none' }}>
            {filtered.length === 0 ? (
              <li style={{ padding: 8, color: 'var(--muted)', fontSize: 13 }}>No results</li>
            ) : filtered.map((o) => (
              <li
                key={o.value} className="wf-opt"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => { onChange(o.value); setOpen(false); setQ(''); }}
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: '8px 9px', borderRadius: 7, fontSize: 13, cursor: 'pointer', color: 'var(--ink)', background: o.value === value ? 'color-mix(in srgb, var(--org-primary) 10%, transparent)' : 'transparent' }}
              >
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{o.label}</span>
                {o.value === value && <Check size={15} style={{ flexShrink: 0, color: 'var(--org-primary)' }} />}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
