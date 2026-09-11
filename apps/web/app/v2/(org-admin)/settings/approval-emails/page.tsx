'use client';

// v2 Settings -> Approval Emails (Zoho #9 slice 2, Task 6). Org-admin editor for the four
// approval-chain notification emails (requested/approved/rejected/cancelled). Each event is an
// independently-saved slot: subject + body + enabled, PUT one at a time via
// useUpsertApprovalEmailTemplate. Layout/card styling mirrors settings/business-hours; the
// (org-admin) layout already gates entry to org_admin / acting super_admin.
//
// Imported directly from Button.tsx, not the ui-v2 barrel: the barrel re-exports DataTable, which
// pulls in @tanstack/react-table's ESM build and breaks under this repo's jest transform (see
// settings/business-hours for the same pattern).
import { useEffect, useState } from 'react';
import {
  APPROVAL_EMAIL_EVENT_TYPES,
  APPROVAL_EMAIL_EVENT_LABELS,
  useApprovalEmailTemplates,
  useUpsertApprovalEmailTemplate,
  type ApprovalEmailEventType,
  type ApprovalEmailTemplateSlot,
} from '../../../../../lib/hooks/useApprovalEmailTemplates';
import { Button } from '../../../../../components/ui-v2/Button';

const muted = 'var(--muted)';
const card: React.CSSProperties = { background: 'var(--paper)', border: '1px solid color-mix(in srgb, var(--ink) 12%, var(--hair))', borderRadius: 14, padding: '18px 20px', boxShadow: '0 1px 2px rgba(11,18,32,.04), 0 12px 32px -18px rgba(11,18,32,.22)' };
const desc: React.CSSProperties = { fontSize: 13, color: muted, margin: '4px 0 0' };
const input: React.CSSProperties = { boxSizing: 'border-box', width: '100%', padding: '7px 10px', fontSize: 13, borderRadius: 8, border: '1px solid color-mix(in srgb, var(--ink) 15%, var(--hair))', background: 'var(--paper)', color: 'var(--ink)', outline: 'none' };
const textarea: React.CSSProperties = { ...input, resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.5 };

const VARIABLES = ['{{actorName}}', '{{subjectLabel}}', '{{link}}'];

type Notice = { type: 'success' | 'error'; text: string } | null;

function blankSlot(eventType: ApprovalEmailEventType): ApprovalEmailTemplateSlot {
  return { eventType, subject: '', body: '', enabled: true };
}

function EventSection({ slot, onSaved }: { slot: ApprovalEmailTemplateSlot; onSaved: (label: string) => void }) {
  const label = APPROVAL_EMAIL_EVENT_LABELS[slot.eventType];
  const upsert = useUpsertApprovalEmailTemplate();
  const [subject, setSubject] = useState(slot.subject ?? '');
  const [body, setBody] = useState(slot.body ?? '');
  const [enabled, setEnabled] = useState(slot.enabled);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setSubject(slot.subject ?? '');
    setBody(slot.body ?? '');
    setEnabled(slot.enabled);
  }, [slot]);

  function handleSave() {
    setError(null);
    upsert.mutate(
      { eventType: slot.eventType, subject, body, enabled },
      {
        onSuccess: () => onSaved(label),
        onError: (err) => setError(err instanceof Error ? err.message : 'Failed to save template.'),
      },
    );
  }

  return (
    <div style={{ ...card, marginBottom: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <h2 style={{ fontFamily: 'var(--font-disp)', fontSize: 15, fontWeight: 600, color: 'var(--ink)', margin: 0 }}>{label}</h2>
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--ink)' }}>
          <input
            type="checkbox"
            aria-label={`${label} enabled`}
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
            style={{ width: 15, height: 15, accentColor: 'var(--org-primary)' }}
          />
          Enabled
        </label>
      </div>

      <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div>
          <label htmlFor={`${slot.eventType}-subject`} className="v2-label">Subject</label>
          <input
            id={`${slot.eventType}-subject`}
            aria-label={`${label} subject`}
            type="text"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            style={{ ...input, marginTop: 6 }}
          />
        </div>
        <div>
          <label htmlFor={`${slot.eventType}-body`} className="v2-label">Body</label>
          <textarea
            id={`${slot.eventType}-body`}
            aria-label={`${label} body`}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={5}
            style={{ ...textarea, marginTop: 6 }}
          />
        </div>
      </div>

      {error && <p role="alert" style={{ marginTop: 10, fontSize: 12.5, color: 'var(--danger)' }}>{error}</p>}

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 14 }}>
        <Button onClick={handleSave} loading={upsert.isPending}>{`Save ${label}`}</Button>
      </div>
    </div>
  );
}

export default function V2ApprovalEmailsSettingsPage() {
  const { data, isLoading, isError } = useApprovalEmailTemplates();
  const [notice, setNotice] = useState<Notice>(null);
  const notify = (type: 'success' | 'error', text: string) => { setNotice({ type, text }); setTimeout(() => setNotice(null), 4000); };

  const slots: ApprovalEmailTemplateSlot[] = APPROVAL_EMAIL_EVENT_TYPES.map(
    (eventType) => data?.find((s) => s.eventType === eventType) ?? blankSlot(eventType),
  );

  return (
    <div style={{ maxWidth: 780 }}>
      <div style={{ marginBottom: 16 }}>
        <h1 className="v2-title" style={{ fontSize: 22, margin: 0 }}>Approval Emails</h1>
        <p style={{ ...desc, marginTop: 6 }}>Customize the emails sent to approvers and requesters at each step of an approval chain.</p>
        <p style={desc}>
          Available variables: {VARIABLES.map((v) => (
            <code key={v} style={{ marginRight: 6, fontFamily: 'var(--font-mono)', fontSize: 12 }}>{v}</code>
          ))}
        </p>
      </div>

      {notice && (
        <div role="status" style={{ marginBottom: 12, fontSize: 13, padding: '9px 13px', borderRadius: 9, border: `1px solid ${notice.type === 'success' ? 'color-mix(in srgb, #15803d 30%, transparent)' : 'color-mix(in srgb, var(--danger) 30%, transparent)'}`, background: notice.type === 'success' ? 'color-mix(in srgb, #15803d 8%, transparent)' : 'color-mix(in srgb, var(--danger) 8%, transparent)', color: notice.type === 'success' ? '#15803d' : 'var(--danger)' }}>
          {notice.text}
        </div>
      )}

      {isLoading && <p style={{ fontSize: 13, color: muted }}>Loading…</p>}
      {isError && <p style={{ fontSize: 13, color: 'var(--danger)' }}>Failed to load approval email templates.</p>}

      {slots.map((slot) => (
        <EventSection key={slot.eventType} slot={slot} onSaved={(label) => notify('success', `${label} email saved.`)} />
      ))}
    </div>
  );
}
