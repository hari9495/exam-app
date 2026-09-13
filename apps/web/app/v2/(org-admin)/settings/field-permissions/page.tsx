'use client';

// v2 Settings -> Field permissions. Per-role access level for a fixed set of governed candidate/job
// fields: Editable (default), Read-only (visible but write-blocked), or Hidden (redacted on read).
// Enforced server-side by field-permissions.service.ts for recruiter/panel/hiring_manager. The
// (org-admin) layout already gates entry to org_admin / acting super_admin, so no extra role check
// is needed here (same as settings/sso).
import { useEffect, useState } from 'react';
import { GOVERNABLE_ROLES, GOVERNED_FIELDS, type FieldEntity, type FieldLevel, type FieldPermissionConfig } from '../../../../../lib/types';
import { useFieldPermissions, useUpdateFieldPermissions } from '../../../../../lib/hooks/useFieldPermissions';
// Imported directly from Button.tsx, not the ui-v2 barrel: the barrel re-exports DataTable,
// which pulls in @tanstack/react-table's ESM build and breaks under this repo's jest transform.
import { Button } from '../../../../../components/ui-v2/Button';

const muted = 'var(--muted)';
const card: React.CSSProperties = { background: 'var(--paper)', border: '1px solid color-mix(in srgb, var(--ink) 12%, var(--hair))', borderRadius: 14, padding: '18px 20px', boxShadow: '0 1px 2px rgba(11,18,32,.04), 0 12px 32px -18px rgba(11,18,32,.22)' };
const desc: React.CSSProperties = { fontSize: 13, color: muted, margin: '4px 0 0' };
const th: React.CSSProperties = { textAlign: 'left', fontSize: 12, fontWeight: 600, color: muted, padding: '6px 10px', borderBottom: '1px solid var(--hair)' };
const td: React.CSSProperties = { padding: '8px 10px', borderBottom: '1px solid var(--hair)', fontSize: 13, color: 'var(--ink)' };

const ENTITIES = Object.keys(GOVERNED_FIELDS) as FieldEntity[];
const ENTITY_LABELS: Record<FieldEntity, string> = { candidate: 'Candidate', job: 'Job' };
const ROLE_LABELS: Record<string, string> = { recruiter: 'Recruiter', panel: 'Interview Panel', hiring_manager: 'Hiring Manager' };
const FIELD_LABELS: Record<string, string> = {
  email: 'Email', phone: 'Phone',
  salaryMin: 'Salary (min)', salaryMax: 'Salary (max)', salaryCurrency: 'Salary currency', headcount: 'Headcount',
  department: 'Department', fitCriteria: 'Fit criteria', fitRubric: 'Fit rubric',
};
const roleLabel = (r: string) => ROLE_LABELS[r] ?? r;
const fieldLabel = (f: string) => FIELD_LABELS[f] ?? f;
type Role = (typeof GOVERNABLE_ROLES)[number];

// entity -> role -> field -> level (absent field = editable)
type LevelState = Record<FieldEntity, Record<Role, Record<string, FieldLevel>>>;

function emptyLevels(): LevelState {
  return ENTITIES.reduce((acc, entity) => {
    acc[entity] = GOVERNABLE_ROLES.reduce((roleAcc, role) => {
      roleAcc[role] = {};
      return roleAcc;
    }, {} as Record<Role, Record<string, FieldLevel>>);
    return acc;
  }, {} as LevelState);
}

function levelsFromConfig(config: FieldPermissionConfig): LevelState {
  const state = emptyLevels();
  for (const entity of ENTITIES) {
    for (const role of GOVERNABLE_ROLES) {
      state[entity][role] = { ...(config[entity]?.[role] ?? {}) };
    }
  }
  return state;
}

function configFromLevels(state: LevelState): FieldPermissionConfig {
  const config: FieldPermissionConfig = {};
  for (const entity of ENTITIES) {
    const byRole: Record<string, Record<string, FieldLevel>> = {};
    for (const role of GOVERNABLE_ROLES) {
      const fields = state[entity][role];
      if (Object.keys(fields).length > 0) byRole[role] = fields;
    }
    if (Object.keys(byRole).length > 0) config[entity] = byRole;
  }
  return config;
}

type Notice = { type: 'success' | 'error'; text: string } | null;

export default function V2FieldPermissionsSettingsPage() {
  const { data, isLoading, isError } = useFieldPermissions();
  const update = useUpdateFieldPermissions();
  const [levels, setLevels] = useState<LevelState>(emptyLevels);
  const [notice, setNotice] = useState<Notice>(null);
  const notify = (type: 'success' | 'error', text: string) => { setNotice({ type, text }); setTimeout(() => setNotice(null), 4000); };

  useEffect(() => {
    if (!data) return;
    setLevels(levelsFromConfig(data));
  }, [data]);

  function setLevel(entity: FieldEntity, role: Role, field: string, level: FieldLevel | '') {
    setLevels((prev) => {
      const roleMap = { ...prev[entity][role] };
      if (level === '') delete roleMap[field];
      else roleMap[field] = level;
      return { ...prev, [entity]: { ...prev[entity], [role]: roleMap } };
    });
  }

  function handleSave() {
    update.mutate(configFromLevels(levels), {
      onSuccess: () => notify('success', 'Field permissions saved.'),
      onError: (err) => notify('error', err instanceof Error ? err.message : 'Failed to save field permissions.'),
    });
  }

  return (
    <div style={{ maxWidth: 820 }}>
      <div style={{ marginBottom: 16 }}>
        <h1 className="v2-title" style={{ fontSize: 22, margin: 0 }}>Field permissions</h1>
        <p style={{ ...desc, marginTop: 6 }}>Set each field&apos;s access per role: Editable, Read-only (visible but can&apos;t change), or Hidden (redacted).</p>
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
          <p style={desc}>Choose the access level for each field and role.</p>
          <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 10 }}>
            <thead>
              <tr>
                <th style={th}>Field</th>
                {GOVERNABLE_ROLES.map((role) => (
                  <th key={role} style={th}>{roleLabel(role)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {GOVERNED_FIELDS[entity].map((field) => (
                <tr key={field}>
                  <td style={td}>{fieldLabel(field)}</td>
                  {GOVERNABLE_ROLES.map((role) => (
                    <td key={role} style={td}>
                      <select
                        aria-label={`${entity} ${field} access for ${role}`}
                        value={levels[entity][role][field] ?? ''}
                        onChange={(e) => setLevel(entity, role, field, e.target.value as FieldLevel | '')}
                        style={{ fontSize: 12.5, padding: '4px 6px', borderRadius: 7, border: '1px solid color-mix(in srgb, var(--ink) 15%, var(--hair))', background: 'var(--paper)', color: 'var(--ink)' }}
                      >
                        <option value="">Editable</option>
                        <option value="readonly">Read-only</option>
                        <option value="hidden">Hidden</option>
                      </select>
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
