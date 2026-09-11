'use client';

// v2 Settings -> Field permissions. Per-role visibility for a fixed set of governed candidate/job
// fields (redacted server-side by field-permissions.service.ts for recruiter/panel roles). Layout
// mirrors settings/business-hours (org-primary tokens, inline success/error notice); the
// (org-admin) layout already gates entry to org_admin / acting super_admin, so no extra role check
// is needed here (same as settings/sso).
import { useEffect, useState } from 'react';
import { GOVERNABLE_ROLES, GOVERNED_FIELDS, type FieldEntity, type FieldPermissionConfig } from '../../../../../lib/types';
import { useFieldPermissions, useUpdateFieldPermissions } from '../../../../../lib/hooks/useFieldPermissions';
// Imported directly from Button.tsx, not the ui-v2 barrel: the barrel re-exports DataTable,
// which pulls in @tanstack/react-table's ESM build and breaks under this repo's jest transform
// (see the "Cannot use import statement outside a module" failure that surfaces otherwise).
import { Button } from '../../../../../components/ui-v2/Button';

const muted = 'var(--muted)';
const card: React.CSSProperties = { background: 'var(--paper)', border: '1px solid color-mix(in srgb, var(--ink) 12%, var(--hair))', borderRadius: 14, padding: '18px 20px', boxShadow: '0 1px 2px rgba(11,18,32,.04), 0 12px 32px -18px rgba(11,18,32,.22)' };
const desc: React.CSSProperties = { fontSize: 13, color: muted, margin: '4px 0 0' };
const th: React.CSSProperties = { textAlign: 'left', fontSize: 12, fontWeight: 600, color: muted, padding: '6px 10px', borderBottom: '1px solid var(--hair)' };
const td: React.CSSProperties = { padding: '8px 10px', borderBottom: '1px solid var(--hair)', fontSize: 13, color: 'var(--ink)' };

const ENTITIES = Object.keys(GOVERNED_FIELDS) as FieldEntity[];
const ENTITY_LABELS: Record<FieldEntity, string> = { candidate: 'Candidate', job: 'Job' };
type Role = (typeof GOVERNABLE_ROLES)[number];

type HiddenState = Record<FieldEntity, Record<Role, Set<string>>>;

function emptyHiddenState(): HiddenState {
  return ENTITIES.reduce((acc, entity) => {
    acc[entity] = GOVERNABLE_ROLES.reduce((roleAcc, role) => {
      roleAcc[role] = new Set<string>();
      return roleAcc;
    }, {} as Record<Role, Set<string>>);
    return acc;
  }, {} as HiddenState);
}

function hiddenStateFromConfig(config: FieldPermissionConfig): HiddenState {
  const state = emptyHiddenState();
  for (const entity of ENTITIES) {
    for (const role of GOVERNABLE_ROLES) {
      state[entity][role] = new Set(config[entity]?.[role] ?? []);
    }
  }
  return state;
}

function configFromHiddenState(state: HiddenState): FieldPermissionConfig {
  const config: FieldPermissionConfig = {};
  for (const entity of ENTITIES) {
    const byRole: Record<string, string[]> = {};
    for (const role of GOVERNABLE_ROLES) {
      const fields = Array.from(state[entity][role]);
      if (fields.length > 0) byRole[role] = fields;
    }
    if (Object.keys(byRole).length > 0) config[entity] = byRole;
  }
  return config;
}

type Notice = { type: 'success' | 'error'; text: string } | null;

export default function V2FieldPermissionsSettingsPage() {
  const { data, isLoading, isError } = useFieldPermissions();
  const update = useUpdateFieldPermissions();
  const [hidden, setHidden] = useState<HiddenState>(emptyHiddenState);
  const [notice, setNotice] = useState<Notice>(null);
  const notify = (type: 'success' | 'error', text: string) => { setNotice({ type, text }); setTimeout(() => setNotice(null), 4000); };

  useEffect(() => {
    if (!data) return;
    setHidden(hiddenStateFromConfig(data));
  }, [data]);

  function toggle(entity: FieldEntity, role: Role, field: string) {
    setHidden((prev) => {
      const next = new Set(prev[entity][role]);
      if (next.has(field)) next.delete(field);
      else next.add(field);
      return { ...prev, [entity]: { ...prev[entity], [role]: next } };
    });
  }

  function handleSave() {
    update.mutate(configFromHiddenState(hidden), {
      onSuccess: () => notify('success', 'Field permissions saved.'),
      onError: (err) => notify('error', err instanceof Error ? err.message : 'Failed to save field permissions.'),
    });
  }

  return (
    <div style={{ maxWidth: 780 }}>
      <div style={{ marginBottom: 16 }}>
        <h1 className="v2-title" style={{ fontSize: 22, margin: 0 }}>Field permissions</h1>
        <p style={{ ...desc, marginTop: 6 }}>Hide sensitive candidate and job fields from selected roles.</p>
      </div>

      {notice && (
        <div role="status" style={{ marginBottom: 12, fontSize: 13, padding: '9px 13px', borderRadius: 9, border: `1px solid ${notice.type === 'success' ? 'color-mix(in srgb, #15803d 30%, transparent)' : 'color-mix(in srgb, var(--danger) 30%, transparent)'}`, background: notice.type === 'success' ? 'color-mix(in srgb, #15803d 8%, transparent)' : 'color-mix(in srgb, var(--danger) 8%, transparent)', color: notice.type === 'success' ? '#15803d' : 'var(--danger)' }}>
          {notice.text}
        </div>
      )}

      {isLoading && <p style={{ fontSize: 13, color: muted }}>Loading…</p>}
      {isError && <p style={{ fontSize: 13, color: 'var(--danger)' }}>Failed to load field permissions.</p>}

      {ENTITIES.map((entity) => (
        <div key={entity} style={{ ...card, marginBottom: 16 }}>
          <h2 style={{ fontFamily: 'var(--font-disp)', fontSize: 15, fontWeight: 600, color: 'var(--ink)', margin: 0 }}>{ENTITY_LABELS[entity]}</h2>
          <p style={desc}>Check a box to hide that field from that role.</p>
          <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 10 }}>
            <thead>
              <tr>
                <th style={th}>Field</th>
                {GOVERNABLE_ROLES.map((role) => (
                  <th key={role} style={th}>{role}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {GOVERNED_FIELDS[entity].map((field) => (
                <tr key={field}>
                  <td style={td}>{field}</td>
                  {GOVERNABLE_ROLES.map((role) => (
                    <td key={role} style={td}>
                      <input
                        type="checkbox"
                        aria-label={`${entity} ${field} hidden from ${role}`}
                        checked={hidden[entity][role].has(field)}
                        onChange={() => toggle(entity, role, field)}
                        style={{ width: 15, height: 15, accentColor: 'var(--org-primary)' }}
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}

      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <Button onClick={handleSave} loading={update.isPending}>Save</Button>
      </div>
    </div>
  );
}
