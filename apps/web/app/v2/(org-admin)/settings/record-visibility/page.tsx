'use client';

// v2 Settings -> Record visibility. Single org-wide toggle: when on, recruiters are restricted (via
// RLS on pipeline_entries) to candidates assigned to them or their groups, plus unassigned
// candidates. Layout mirrors settings/field-permissions (org-primary tokens, inline success/error
// notice); the (org-admin) layout already gates entry to org_admin / acting super_admin.
import { useEffect, useState } from 'react';
import { useRecordVisibility, useUpdateRecordVisibility } from '../../../../../lib/hooks/useRecordVisibility';
// Imported directly from Button.tsx, not the ui-v2 barrel: the barrel re-exports DataTable, which
// pulls in @tanstack/react-table's ESM build and breaks under this repo's jest transform.
import { Button } from '../../../../../components/ui-v2/Button';

const muted = 'var(--muted)';
const card: React.CSSProperties = { background: 'var(--paper)', border: '1px solid color-mix(in srgb, var(--ink) 12%, var(--hair))', borderRadius: 14, padding: '18px 20px', boxShadow: '0 1px 2px rgba(11,18,32,.04), 0 12px 32px -18px rgba(11,18,32,.22)' };
const desc: React.CSSProperties = { fontSize: 13, color: muted, margin: '4px 0 0' };

type Notice = { type: 'success' | 'error'; text: string } | null;

export default function V2RecordVisibilitySettingsPage() {
  const { data, isLoading, isError } = useRecordVisibility();
  const update = useUpdateRecordVisibility();
  const [enabled, setEnabled] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);
  const notify = (type: 'success' | 'error', text: string) => { setNotice({ type, text }); setTimeout(() => setNotice(null), 4000); };

  useEffect(() => {
    if (!data) return;
    setEnabled(data.enabled);
  }, [data]);

  function handleSave() {
    update.mutate(enabled, {
      onSuccess: () => notify('success', 'Record visibility saved.'),
      onError: (err) => notify('error', err instanceof Error ? err.message : 'Failed to save record visibility.'),
    });
  }

  return (
    <div style={{ maxWidth: 780 }}>
      <div style={{ marginBottom: 16 }}>
        <h1 className="v2-title" style={{ fontSize: 22, margin: 0 }}>Record visibility</h1>
        <p style={{ ...desc, marginTop: 6 }}>Restrict which candidates recruiters can see.</p>
      </div>

      {notice && (
        <div role="status" style={{ marginBottom: 12, fontSize: 13, padding: '9px 13px', borderRadius: 9, border: `1px solid ${notice.type === 'success' ? 'color-mix(in srgb, #15803d 30%, transparent)' : 'color-mix(in srgb, var(--danger) 30%, transparent)'}`, background: notice.type === 'success' ? 'color-mix(in srgb, #15803d 8%, transparent)' : 'color-mix(in srgb, var(--danger) 8%, transparent)', color: notice.type === 'success' ? '#15803d' : 'var(--danger)' }}>
          {notice.text}
        </div>
      )}

      {isLoading && <p style={{ fontSize: 13, color: muted }}>Loading…</p>}
      {isError && <p style={{ fontSize: 13, color: 'var(--danger)' }}>Failed to load record visibility.</p>}

      <div style={{ ...card, marginBottom: 16 }}>
        <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer' }}>
          <input
            type="checkbox"
            aria-label="Record visibility"
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
            style={{ width: 15, height: 15, marginTop: 2, accentColor: 'var(--org-primary)' }}
          />
          <span>
            <span style={{ fontFamily: 'var(--font-disp)', fontSize: 15, fontWeight: 600, color: 'var(--ink)' }}>Restrict candidate visibility by assignment</span>
            <p style={desc}>When on, recruiters see only candidates assigned to them or their groups, plus unassigned candidates.</p>
          </span>
        </label>
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <Button onClick={handleSave} loading={update.isPending}>Save</Button>
      </div>
    </div>
  );
}
