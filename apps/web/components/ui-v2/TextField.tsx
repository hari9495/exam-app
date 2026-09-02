import type { ReactNode } from 'react';

export function TextField({
  id, label, type = 'text', value, onChange, required = false, autoComplete, placeholder, trailing,
}: {
  id: string; label: string; type?: string; value: string;
  onChange: (v: string) => void; required?: boolean; autoComplete?: string; placeholder?: string; trailing?: ReactNode;
}) {
  return (
    <div>
      <label htmlFor={id} className="v2-label">{label}</label>
      <div style={{ position: 'relative' }}>
        <input
          id={id}
          type={type}
          value={value}
          required={required}
          autoComplete={autoComplete}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
          className="v2-field"
          style={trailing ? { paddingRight: 28 } : undefined}
        />
        {trailing && (
          <span style={{ position: 'absolute', right: 0, bottom: 8 }}>{trailing}</span>
        )}
      </div>
    </div>
  );
}
