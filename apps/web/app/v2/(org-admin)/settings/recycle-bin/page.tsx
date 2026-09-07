'use client';

// v2 Settings -> Recycle Bin. Org-admin restore/purge for soft-deleted candidates, jobs,
// pipelines, and walk-in groups (Task 5's /recycle-bin endpoints). Layout/card styling mirrors
// settings/business-hours/page.tsx (title+description header, card list, inline success/error
// notice); the (org-admin) layout already gates entry to org_admin / acting super_admin, so no
// extra role check is needed here. Purge uses window.confirm, same as the impersonate-confirm
// pattern in app/v2/(org-admin)/users/page.tsx -- no dedicated confirm dialog component exists
// in ui-v2, and a native confirm is the established lazy pattern for a single irreversible action.
import { useState } from 'react';
import { Trash2, RotateCcw } from 'lucide-react';
import {
  useRecycleBin, useRestoreRecycleBinEntry, usePurgeRecycleBinEntry, type RecycleBinEntry,
} from '../../../../../lib/hooks/useRecycleBin';

const muted = 'var(--muted)';
const card: React.CSSProperties = { background: 'var(--paper)', border: '1px solid color-mix(in srgb, var(--ink) 12%, var(--hair))', borderRadius: 14, padding: '12px 20px', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' };
const desc: React.CSSProperties = { fontSize: 13, color: muted, margin: '4px 0 0' };
const dangerBtn: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12.5, fontWeight: 500, padding: '7px 12px', borderRadius: 8, border: '1px solid color-mix(in srgb, var(--danger) 35%, var(--hair))', background: 'var(--paper)', color: 'var(--danger)', cursor: 'pointer' };
const secondaryBtn: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12.5, fontWeight: 500, padding: '7px 12px', borderRadius: 8, border: '1px solid var(--org-primary)', background: 'var(--paper)', color: 'var(--org-primary)', cursor: 'pointer' };

const ENTITY_TYPE_LABELS: Record<RecycleBinEntry['entityType'], string> = {
  candidate: 'Candidate',
  job: 'Job',
  pipeline: 'Pipeline',
  'walk-in-group': 'Walk-in Group',
};

type Notice = { type: 'success' | 'error'; text: string } | null;

function errorMessage(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message : fallback;
}

function EntryRow({ entry, notify }: { entry: RecycleBinEntry; notify: (type: 'success' | 'error', text: string) => void }) {
  const restore = useRestoreRecycleBinEntry();
  const purge = usePurgeRecycleBinEntry();
  const target = { entityType: entry.entityType, id: entry.id };

  function handleRestore() {
    restore.mutate(target, {
      onSuccess: () => notify('success', `${entry.label} restored.`),
      onError: (err) => notify('error', errorMessage(err, 'Failed to restore.')),
    });
  }

  function handlePurge() {
    if (!window.confirm(`Permanently delete "${entry.label}"? This cannot be undone.`)) return;
    purge.mutate(target, {
      onSuccess: () => notify('success', `${entry.label} permanently deleted.`),
      onError: (err) => notify('error', errorMessage(err, 'Failed to delete.')),
    });
  }

  return (
    <div style={card}>
      <span style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--org-primary)', textTransform: 'uppercase', letterSpacing: '.03em', minWidth: 100 }}>
        {ENTITY_TYPE_LABELS[entry.entityType]}
      </span>
      <div style={{ flex: '1 1 200px' }}>
        <div style={{ fontSize: 14, color: 'var(--ink)', fontWeight: 500 }}>{entry.label}</div>
        <p style={desc}>Deleted {new Date(entry.deletedAt).toLocaleString()}</p>
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button type="button" style={secondaryBtn} onClick={handleRestore} disabled={restore.isPending} aria-label={`Restore ${entry.label}`}>
          <RotateCcw size={13} /> Restore
        </button>
        <button type="button" style={dangerBtn} onClick={handlePurge} disabled={purge.isPending} aria-label={`Delete forever: ${entry.label}`}>
          <Trash2 size={13} /> Delete forever
        </button>
      </div>
    </div>
  );
}

export default function V2RecycleBinSettingsPage() {
  const { data: entries, isLoading, isError } = useRecycleBin();
  const [notice, setNotice] = useState<Notice>(null);
  const notify = (type: 'success' | 'error', text: string) => { setNotice({ type, text }); setTimeout(() => setNotice(null), 4000); };

  return (
    <div style={{ maxWidth: 900 }}>
      <div style={{ marginBottom: 16 }}>
        <h1 className="v2-title" style={{ fontSize: 22, margin: 0 }}>Recycle Bin</h1>
        <p style={{ ...desc, marginTop: 6 }}>Restore or permanently delete soft-deleted candidates, jobs, pipelines, and walk-in groups.</p>
      </div>

      {notice && (
        <div role="status" style={{ marginBottom: 12, fontSize: 13, padding: '9px 13px', borderRadius: 9, border: `1px solid ${notice.type === 'success' ? 'color-mix(in srgb, #15803d 30%, transparent)' : 'color-mix(in srgb, var(--danger) 30%, transparent)'}`, background: notice.type === 'success' ? 'color-mix(in srgb, #15803d 8%, transparent)' : 'color-mix(in srgb, var(--danger) 8%, transparent)', color: notice.type === 'success' ? '#15803d' : 'var(--danger)' }}>
          {notice.text}
        </div>
      )}

      {isLoading && <p style={{ fontSize: 13, color: muted }}>Loading…</p>}
      {isError && <p style={{ fontSize: 13, color: 'var(--danger)' }}>Failed to load the recycle bin.</p>}
      {!isLoading && !isError && (!entries || entries.length === 0) && (
        <p style={{ fontSize: 13, color: muted }}>Recycle bin is empty.</p>
      )}

      {entries && entries.map((entry) => (
        <EntryRow key={`${entry.entityType}-${entry.id}`} entry={entry} notify={notify} />
      ))}
    </div>
  );
}
