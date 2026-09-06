'use client';

// Shared custom-field controls, reused by all four internal (v2 admin) forms AND the public apply
// page -- those two surfaces have unrelated CSS systems (v2's --ink/--hair tokens + .v2-field vs the
// candidate app's Tailwind "candidate-*" classes), so this deliberately uses plain, theme-agnostic
// inline styles rather than either app's design-system primitives. No @exam-platform/shared imports
// -- apps/web can't use its values at runtime (see lib/hooks/useCustomFields.ts's header comment).
import type { CustomFieldRead, CustomFieldInputMap } from '../lib/types';

// A definition-like shape: the full web CustomFieldDefinition (internal forms) satisfies this, as
// does the thinner per-apply-page shape the public job payload carries (PublicJob['customFields'] --
// definitionId, not id; callers map that field to `id` before passing in, see apply-form.tsx).
export interface CustomFieldDefLike {
  id: string;
  label: string;
  fieldType: 'text' | 'number' | 'date' | 'select';
  options: string[] | null;
  required: boolean;
}

const labelStyle: React.CSSProperties = { display: 'block', fontSize: 13, fontWeight: 500, marginBottom: 4 };
const inputStyle: React.CSSProperties = { width: '100%', boxSizing: 'border-box', padding: '8px 10px', fontSize: 13, borderRadius: 6, border: '1px solid #ccc' };

function toInputValue(v: string | number | null | undefined): string {
  return v === null || v === undefined ? '' : String(v);
}

export function CustomFieldsInputs({
  definitions, values, onChange,
}: {
  definitions: CustomFieldDefLike[];
  values: CustomFieldInputMap;
  onChange: (next: CustomFieldInputMap) => void;
}) {
  function set(def: CustomFieldDefLike, raw: string) {
    const next: string | number = raw === '' ? '' : def.fieldType === 'number' ? Number(raw) : raw;
    onChange({ ...values, [def.id]: next });
  }

  return (
    <>
      {definitions.map((def) => {
        const inputId = `custom-field-${def.id}`;
        const labelText = def.required ? `${def.label} *` : def.label;
        const value = toInputValue(values[def.id]);
        return (
          <div key={def.id}>
            <label htmlFor={inputId} style={labelStyle}>{labelText}</label>
            {def.fieldType === 'select' ? (
              <select
                id={inputId}
                value={value}
                required={def.required}
                aria-required={def.required || undefined}
                onChange={(e) => set(def, e.target.value)}
                style={inputStyle}
              >
                <option value="">Select…</option>
                {(def.options ?? []).map((opt) => <option key={opt} value={opt}>{opt}</option>)}
              </select>
            ) : (
              <input
                id={inputId}
                type={def.fieldType === 'number' ? 'number' : def.fieldType === 'date' ? 'date' : 'text'}
                value={value}
                required={def.required}
                aria-required={def.required || undefined}
                onChange={(e) => set(def, e.target.value)}
                style={inputStyle}
              />
            )}
          </div>
        );
      })}
    </>
  );
}

export function CustomFieldsDisplay({ fields }: { fields: CustomFieldRead[] }) {
  const visible = fields.filter((f) => f.value !== null);
  if (visible.length === 0) return null;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {visible.map((f) => (
        <div key={f.definitionId} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 13 }}>
          <span style={{ color: 'var(--muted)' }}>{f.label}</span>
          <span style={{ color: 'var(--ink)', fontWeight: 500 }}>{f.value}</span>
        </div>
      ))}
    </div>
  );
}
