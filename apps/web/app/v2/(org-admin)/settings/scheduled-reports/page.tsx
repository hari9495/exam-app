'use client';

// v2 Settings -> Scheduled reports. Opt-in weekly hiring digest (HTML summary + CSV attachment)
// emailed to chosen staff. Layout mirrors settings/reminders; Button/Cb deep-imported (the ui-v2
// barrel pulls DataTable → breaks jest).
import { useEffect, useState } from 'react';
import { useScheduledReportSettings, useUpdateScheduledReportSettings } from '../../../../../lib/hooks/useScheduledReportSettings';
import { useUsers } from '../../../../../lib/hooks/useUsers';
import { Button } from '../../../../../components/ui-v2/Button';

const muted = 'var(--muted)';
const card: React.CSSProperties = { background: 'var(--paper)', border: '1px solid color-mix(in srgb, var(--ink) 12%, var(--hair))', borderRadius: 14, padding: '18px 20px', boxShadow: '0 1px 2px rgba(11,18,32,.04), 0 12px 32px -18px rgba(11,18,32,.22)' };
const desc: React.CSSProperties = { fontSize: 13, color: muted, margin: '4px 0 0' };

type Notice = { type: 'success' | 'error'; text: string } | null;

export default function V2ScheduledReportsSettingsPage() {
  const { data, isLoading, isError } = useScheduledReportSettings();
  const { data: usersResp } = useUsers({ pageSize: 200 });
  const update = useUpdateScheduledReportSettings();
  const [enabled, setEnabled] = useState(false);
  const [recipients, setRecipients] = useState<string[]>([]);
  const [notice, setNotice] = useState<Notice>(null);
  const notify = (type: 'success' | 'error', text: string) => { setNotice({ type, text }); setTimeout(() => setNotice(null), 4000); };

  useEffect(() => {
    if (!data) return;
    setEnabled(data.enabled);
    setRecipients(data.recipientUserIds);
  }, [data]);

  const users = usersResp?.data ?? [];

  function toggleRecipient(id: string) {
    setRecipients((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }
  function handleSave() {
    update.mutate(
      { enabled, recipientUserIds: recipients },
      {
        onSuccess: () => notify('success', 'Scheduled report saved.'),
        onError: (err) => notify('error', err instanceof Error ? err.message : 'Failed to save.'),
      },
    );
  }

  return (
    <div style={{ maxWidth: 780 }}>
      <div style={{ marginBottom: 16 }}>
        <h1 className="v2-title" style={{ fontSize: 22, margin: 0 }}>Scheduled reports</h1>
        <p style={{ ...desc, marginTop: 6 }}>Email a weekly hiring digest (summary + a per-exam CSV) to chosen staff.</p>
      </div>

      {notice && (
        <div role="status" style={{ marginBottom: 12, fontSize: 13, padding: '9px 13px', borderRadius: 9, border: `1px solid ${notice.type === 'success' ? 'color-mix(in srgb, #15803d 30%, transparent)' : 'color-mix(in srgb, var(--danger) 30%, transparent)'}`, background: notice.type === 'success' ? 'color-mix(in srgb, #15803d 8%, transparent)' : 'color-mix(in srgb, var(--danger) 8%, transparent)', color: notice.type === 'success' ? '#15803d' : 'var(--danger)' }}>
          {notice.text}
        </div>
      )}

      {isLoading && <p style={{ fontSize: 13, color: muted }}>Loading…</p>}
      {isError && <p style={{ fontSize: 13, color: 'var(--danger)' }}>Failed to load scheduled report settings.</p>}

      <div style={{ ...card, marginBottom: 16 }}>
        <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer' }}>
          <input type="checkbox" aria-label="Enable weekly report" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} style={{ width: 15, height: 15, marginTop: 2, accentColor: 'var(--org-primary)' }} />
          <span>
            <span style={{ fontFamily: 'var(--font-disp)', fontSize: 15, fontWeight: 600, color: 'var(--ink)' }}>Send a weekly digest</span>
            <p style={desc}>Once a week, the recipients below get last week&apos;s funnel, scores, integrity flags and needs-attention counts, plus a per-exam CSV.</p>
          </span>
        </label>
      </div>

      <div style={{ ...card, marginBottom: 16 }}>
        <span style={{ fontFamily: 'var(--font-disp)', fontSize: 15, fontWeight: 600, color: 'var(--ink)' }}>Recipients</span>
        <p style={{ ...desc, marginBottom: 10 }}>Staff who receive the weekly email. Each can also unsubscribe from within the email.</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 320, overflowY: 'auto' }}>
          {users.length === 0 && <span style={{ fontSize: 13, color: muted }}>No staff users found.</span>}
          {users.map((u) => (
            <label key={u.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--ink)', cursor: 'pointer' }}>
              <input type="checkbox" checked={recipients.includes(u.id)} onChange={() => toggleRecipient(u.id)} style={{ width: 14, height: 14, accentColor: 'var(--org-primary)' }} />
              {u.name || u.email} <span style={{ color: muted }}>({u.email})</span>
            </label>
          ))}
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <Button onClick={handleSave} loading={update.isPending}>Save</Button>
      </div>
    </div>
  );
}
