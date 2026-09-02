'use client';

// v2 tab strip — underline-style tabs in Azure tokens. Controlled (value + onChange); the caller
// renders the active panel. Kept minimal (one strip, no context) since detail pages just switch
// panels by the active value.
export function Tabs({
  tabs, value, onChange,
}: {
  tabs: { value: string; label: string; badge?: number }[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div style={{ display: 'flex', gap: 2, borderBottom: '1px solid color-mix(in srgb, var(--ink) 13%, var(--hair))', marginBottom: 20, overflowX: 'auto', overflowY: 'hidden' }}>
      {tabs.map((t) => {
        const active = t.value === value;
        return (
          <button
            key={t.value} type="button" onClick={() => onChange(t.value)}
            style={{
              whiteSpace: 'nowrap', padding: '10px 14px', fontSize: 13, fontWeight: active ? 600 : 500,
              color: active ? 'var(--ink)' : 'var(--muted)', background: 'none', border: 'none', cursor: 'pointer',
              borderBottom: `2px solid ${active ? 'var(--org-primary)' : 'transparent'}`, marginBottom: -1,
            }}
          >
            {t.label}{t.badge ? ` (${t.badge})` : ''}
          </button>
        );
      })}
    </div>
  );
}
