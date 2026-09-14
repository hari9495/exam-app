'use client';

// v2 Settings -> Reminders. Single org-wide opt-in for the daily staff-reminder sweep (pending
// grading, stale invitations, expiring offers, upcoming interviews, feedback owed). Each recipient
// still controls their own email delivery per type in notification preferences. Layout mirrors
// settings/record-visibility. Button deep-imported (the ui-v2 barrel pulls DataTable → breaks jest).
import { useEffect, useState } from 'react';
import { useReminderSettings, useUpdateReminderSettings } from '../../../../../lib/hooks/useReminderSettings';
import { Button } from '../../../../../components/ui-v2/Button';

const muted = 'var(--muted)';
const card: React.CSSProperties = { background: 'var(--paper)', border: '1px solid color-mix(in srgb, var(--ink) 12%, var(--hair))', borderRadius: 14, padding: '18px 20px', boxShadow: '0 1px 2px rgba(11,18,32,.04), 0 12px 32px -18px rgba(11,18,32,.22)' };
const desc: React.CSSProperties = { fontSize: 13, color: muted, margin: '4px 0 0' };

type Notice = { type: 'success' | 'error'; text: string } | null;

export default function V2RemindersSettingsPage() {
  const { data, isLoading, isError } = useReminderSettings();
  const update = useUpdateReminderSettings();
  const [enabled, setEnabled] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);
  const notify = (type: 'success' | 'error', text: string) => { setNotice({ type, text }); setTimeout(() => setNotice(null), 4000); };

  useEffect(() => {
    if (!data) return;
    setEnabled(data.remindersEnabled);
  }, [data]);

  function handleSave() {
    update.mutate(enabled, {
      onSuccess: () => notify('success', 'Reminder settings saved.'),
      onError: (err) => notify('error', err instanceof Error ? err.message : 'Failed to save reminder settings.'),
    });
  }

  return (
    <div style={{ maxWidth: 780 }}>
      <div style={{ marginBottom: 16 }}>
        <h1 className="v2-title" style={{ fontSize: 22, margin: 0 }}>Reminders</h1>
        <p style={{ ...desc, marginTop: 6 }}>A once-daily nudge to staff about work that needs attention.</p>
      </div>

      {notice && (
        <div role="status" style={{ marginBottom: 12, fontSize: 13, padding: '9px 13px', borderRadius: 9, border: `1px solid ${notice.type === 'success' ? 'color-mix(in srgb, #15803d 30%, transparent)' : 'color-mix(in srgb, var(--danger) 30%, transparent)'}`, background: notice.type === 'success' ? 'color-mix(in srgb, #15803d 8%, transparent)' : 'color-mix(in srgb, var(--danger) 8%, transparent)', color: notice.type === 'success' ? '#15803d' : 'var(--danger)' }}>
          {notice.text}
        </div>
      )}

      {isLoading && <p style={{ fontSize: 13, color: muted }}>Loading…</p>}
      {isError && <p style={{ fontSize: 13, color: 'var(--danger)' }}>Failed to load reminder settings.</p>}

      <div style={{ ...card, marginBottom: 16 }}>
        <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer' }}>
          <input
            type="checkbox"
            aria-label="Enable reminders"
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
            style={{ width: 15, height: 15, marginTop: 2, accentColor: 'var(--org-primary)' }}
          />
          <span>
            <span style={{ fontFamily: 'var(--font-disp)', fontSize: 15, fontWeight: 600, color: 'var(--ink)' }}>Send daily reminders</span>
            <p style={desc}>
              When on, staff get a daily in-app + email nudge for: attempts awaiting grading, invited candidates who haven&apos;t started,
              offers about to expire, interviews in the next 24 hours, and interview feedback they still owe. Each person can turn off any
              reminder email in their notification preferences.
            </p>
          </span>
        </label>
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <Button onClick={handleSave} loading={update.isPending}>Save</Button>
      </div>
    </div>
  );
}
