'use client';

// Roles & Permissions (Salesforce-style role editing). A matrix of permission × editable role;
// toggling a box overrides that role's default for this org, Reset reverts to the seeded default.
// super_admin/org_admin are intentionally not editable (kept fixed so an admin can't lock the org
// out). v2 tokens (Workfox Azure).
import { useEffect, useMemo, useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import { useRolePermissionMatrix, useSetRolePermissions, useResetRolePermissions } from '../../../../../lib/hooks/useRolePermissions';
import { Button } from '../../../../../components/ui-v2/Button';

const ROLE_LABEL: Record<string, string> = { hiring_manager: 'Hiring Manager', recruiter: 'Recruiter', panel: 'Interview Panel' };

const ink = 'var(--ink)';
const muted = 'var(--muted)';
const card: React.CSSProperties = { background: 'var(--paper)', border: '1px solid color-mix(in srgb, var(--ink) 12%, var(--hair))', borderRadius: 14, boxShadow: '0 1px 2px rgba(11,18,32,.04), 0 12px 32px -18px rgba(11,18,32,.22)' };
const desc: React.CSSProperties = { fontSize: 13, color: muted, margin: '4px 0 0' };

function eq(a: Set<string>, b: Set<string>): boolean {
  return a.size === b.size && [...a].every((k) => b.has(k));
}

export default function V2RolesPage() {
  const { data } = useRolePermissionMatrix();
  const setRole = useSetRolePermissions();
  const resetRole = useResetRolePermissions();
  const [draft, setDraft] = useState<Record<string, Set<string>>>({});
  const [error, setError] = useState<string | null>(null);

  // Server truth as sets, re-synced whenever the matrix changes (after a save/reset — no refetch
  // happens mid-edit, so in-progress toggles are never clobbered).
  const serverSets = useMemo(() => {
    const m: Record<string, Set<string>> = {};
    for (const r of data?.roles ?? []) m[r.role] = new Set(r.permissions);
    return m;
  }, [data]);

  useEffect(() => {
    setDraft(Object.fromEntries(Object.entries(serverSets).map(([role, set]) => [role, new Set(set)])));
  }, [serverSets]);

  if (!data) return <p style={{ ...desc, padding: 4 }}>Loading…</p>;

  const roles = data.roles.map((r) => r.role);
  const toggle = (role: string, key: string) =>
    setDraft((d) => {
      const next = new Set(d[role] ?? []);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return { ...d, [role]: next };
    });

  const changedRoles = roles.filter((role) => draft[role] && serverSets[role] && !eq(draft[role], serverSets[role]));
  const dirty = changedRoles.length > 0;

  async function save() {
    setError(null);
    try {
      for (const role of changedRoles) {
        await setRole.mutateAsync({ role, permissions: [...draft[role]] });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save role permissions');
    }
  }

  return (
    <div style={{ maxWidth: 900 }}>
      <div style={{ marginBottom: 16, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <h1 className="v2-title" style={{ fontSize: 22, margin: 0 }}>Roles &amp; Permissions</h1>
          <p style={{ ...desc, marginTop: 6, maxWidth: 620 }}>
            Control what each role can access in your organization. Changes apply to everyone with that role (unless they
            have a specific permission profile). Super Admin and Org Admin are fixed.
          </p>
        </div>
        <Button onClick={save} loading={setRole.isPending} disabled={!dirty}>Save changes</Button>
      </div>

      {error && <p role="alert" style={{ fontSize: 12.5, color: 'var(--danger)', margin: '0 0 12px' }}>{error}</p>}

      <div style={{ ...card, overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr>
              <th style={{ textAlign: 'left', padding: '14px 16px', color: muted, fontWeight: 600, position: 'sticky', left: 0, background: 'var(--paper)' }}>Permission</th>
              {data.roles.map((r) => (
                <th key={r.role} style={{ padding: '14px 12px', minWidth: 130, textAlign: 'center' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontWeight: 600, color: ink }}>
                      <ShieldCheck size={14} style={{ color: 'var(--org-primary)' }} /> {ROLE_LABEL[r.role] ?? r.role}
                    </span>
                    {r.customized ? (
                      <button
                        type="button"
                        className="v2-hoverbtn"
                        onClick={() => resetRole.mutate(r.role)}
                        disabled={resetRole.isPending}
                        style={{ fontSize: 11, color: 'var(--org-primary)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                      >
                        Reset to default
                      </button>
                    ) : (
                      <span style={{ fontSize: 11, color: muted }}>Default</span>
                    )}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.assignablePermissions.map((perm) => (
              <tr key={perm.key} style={{ borderTop: '1px solid color-mix(in srgb, var(--ink) 8%, var(--hair))' }}>
                <td style={{ padding: '10px 16px', position: 'sticky', left: 0, background: 'var(--paper)' }}>
                  <div style={{ color: ink }}>{perm.description}</div>
                  <div style={{ fontSize: 11, color: muted, fontFamily: 'var(--font-mono)' }}>{perm.key}</div>
                </td>
                {data.roles.map((r) => {
                  const on = draft[r.role]?.has(perm.key) ?? false;
                  return (
                    <td key={r.role} style={{ textAlign: 'center', padding: '10px 12px' }}>
                      <input
                        type="checkbox"
                        checked={on}
                        onChange={() => toggle(r.role, perm.key)}
                        aria-label={`${ROLE_LABEL[r.role] ?? r.role}: ${perm.description}`}
                        style={{ width: 16, height: 16, accentColor: 'var(--org-primary)', cursor: 'pointer' }}
                      />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
