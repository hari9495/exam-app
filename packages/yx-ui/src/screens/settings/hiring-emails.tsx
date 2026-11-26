// Settings 5.4 Notifications › Hiring emails (answer 2429, retiring /v2): the addresses recruiters send from, and the
// wording of the interview and approval emails. Each list is changed in its own sheet, saved straight away through its
// own API; the page fills the designed lists with the company's rows (hiringEmailsPage).
import { useState } from 'react';
import { Trash2 } from 'lucide-react';
import { Button } from '../../components/button';
import { Checkbox } from '../../components/choice';
import { Drawer } from '../../components/drawer';
import { InlineAlert } from '../../components/feedback';
import { FormField } from '../../components/field';
import { Text } from '../../components/foundations';
import { TextArea, TextField } from '../../components/inputs';
import { useToastIfAny } from '../../components/notify';
import { ConfirmDialog } from '../../components/overlay';
import type { SettingDef, SettingsPageDef } from './settings-types';
import './settings.css';

/** GET /org-sender-addresses. */
export interface SenderAddressView {
  id: string;
  label: string;
  address: string;
  isDefault: boolean;
}
export interface SenderAddressInput {
  label: string;
  address: string;
  isDefault: boolean;
}
/** GET /interview-email-templates or /approval-email-templates: one slot per email. */
export interface EventEmailView {
  eventType: string;
  subject: string | null;
  body: string | null;
  enabled: boolean;
  /** Interview emails: the standard wording (approval emails have a standard layout instead). */
  defaultSubject?: string;
  defaultBody?: string;
}
export interface EventEmailInput {
  subject: string;
  body: string;
  enabled: boolean;
}

export const INTERVIEW_EMAILS: Record<string, string> = {
  invite: 'Invitation to the candidate',
  panelist_invite: 'Panel assignment',
  confirmation_candidate: 'Confirmed: to the candidate',
  confirmation_panelist: 'Confirmed: to the panel',
  confirmation_recruiter: 'Confirmed: to the recruiter',
  candidate_declined: 'Candidate declined: to the recruiter',
  candidate_reschedule: 'Candidate asks to reschedule: to the recruiter',
  cancellation: 'Interview cancelled',
};
export const APPROVAL_EMAILS: Record<string, string> = {
  'approval.requested': 'Approval requested',
  'approval.approved': 'Approved',
  'approval.rejected': 'Not approved',
  'approval.cancelled': 'Request withdrawn',
};
const INTERVIEW_FIELDS = ['{{candidateName}}', '{{jobTitle}}', '{{orgName}}', '{{interviewTime}}', '{{interviewTimes}}', '{{interviewLocation}}', '{{panelNames}}', '{{confirmLink}}', '{{recruiterName}}'];
const APPROVAL_FIELDS = ['{{actorName}}', '{{subjectLabel}}', '{{contextText}}', '{{link}}'];
const EMAIL_RE = /^[^@\s<>"]+@[^@\s<>"]+\.[^@\s<>"]+$/;
const focus = (id: string) => setTimeout(() => document.getElementById(id)?.focus(), 0);
const wording = (e: EventEmailView) => (e.subject == null ? 'Standard' : e.enabled ? 'Yours' : 'Yours, turned off');

export interface HiringEmailsData {
  senders?: SenderAddressView[];
  interview?: EventEmailView[];
  approval?: EventEmailView[];
}

/** The designed 5.4 page with the company's hiring email rows; a list the viewer may not read is left out. */
export function hiringEmailsPage(page: SettingsPageDef, design: SettingsPageDef, data: HiringEmailsData): SettingsPageDef {
  const section = design.sections.find((s) => s.title === 'Hiring emails');
  if (!section) return page;
  const fill = (d: SettingDef): SettingDef | null => {
    const base = { ...d, readOnlyList: true, starter: false, scope: 'Company' };
    if (d.key === 'ntf.sender_addresses' && data.senders) return { ...base, fixedRows: false, rows: data.senders.map((s) => [s.label, s.address, s.isDefault ? 'Yes' : '']) };
    if (d.key === 'ntf.interview_emails' && data.interview) return { ...base, rows: data.interview.map((e) => [INTERVIEW_EMAILS[e.eventType] ?? e.eventType, e.subject ?? e.defaultSubject ?? 'Standard email', wording(e)]) };
    if (d.key === 'ntf.approval_emails' && data.approval) return { ...base, rows: data.approval.map((e) => [APPROVAL_EMAILS[e.eventType] ?? e.eventType, e.subject ?? 'Standard email', wording(e)]) };
    return null;
  };
  const settings = section.settings.map(fill).filter((x): x is SettingDef => x !== null);
  if (!settings.length) return page;
  const others = page.sections.filter((s) => s.title !== 'Hiring emails');
  const at = others.findIndex((s) => s.title === 'Digests and quiet hours');
  const next = { ...section, settings };
  return { ...page, sections: at < 0 ? [...others, next] : [...others.slice(0, at), next, ...others.slice(at)] };
}

/* ---------------- sender address ---------------- */

export interface SenderAddressSheetProps {
  /** null: a new address. */
  sender: SenderAddressView | null;
  canEdit: boolean;
  onSave?: (id: string | null, input: SenderAddressInput) => Promise<unknown>;
  onDelete?: (id: string) => Promise<unknown>;
  onClose: () => void;
}

export function SenderAddressSheet({ sender, canEdit, onSave, onDelete, onClose }: SenderAddressSheetProps) {
  const toast = useToastIfAny();
  const [label, setLabel] = useState(sender?.label ?? '');
  const [address, setAddress] = useState(sender?.address ?? '');
  const [isDefault, setDefault] = useState(sender?.isDefault ?? false);
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const badAddress = !EMAIL_RE.test(address.trim());
  const save = async () => {
    setTried(true);
    setFailed(null);
    if (!label.trim()) return focus('sa-label');
    if (badAddress) return focus('sa-address');
    setBusy(true);
    try {
      await onSave?.(sender?.id ?? null, { label: label.trim(), address: address.trim(), isDefault });
      toast?.toast({ tone: 'success', title: 'Sender address saved' });
      onClose();
    } catch (e) {
      setFailed(e instanceof Error && e.message ? e.message : 'That did not save. Try again.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <Drawer
        open
        onOpenChange={(o) => !o && onClose()}
        title={sender ? (canEdit ? `Edit ${sender.label}` : sender.label) : 'Add address'}
        subtitle="Addresses recruiters send from"
        dirty={canEdit}
        notice={failed ? <InlineAlert tone="danger" title={failed} /> : undefined}
        footer={
          canEdit ? (
            <>
              {sender && onDelete && (
                <Button variant="danger" icon={Trash2} onClick={() => setDeleting(true)}>
                  Delete address
                </Button>
              )}
              <Button onClick={onClose}>Cancel</Button>
              <Button variant="primary" loading={busy} onClick={() => void save()}>
                Save address
              </Button>
            </>
          ) : (
            <Button onClick={onClose}>Close</Button>
          )
        }
      >
        <div className="yx-set-stack">
          <Text as="p" size="sm" tone="secondary">
            Candidates see the name and reply to the address. Your email provider must be set up to send from it.
          </Text>
          <FormField id="sa-label" label="Name" required error={tried && !label.trim() ? 'Enter the name candidates see.' : null}>
            <TextField value={label} onChange={setLabel} maxLength={200} disabled={!canEdit} />
          </FormField>
          <FormField id="sa-address" label="Address" required error={tried && badAddress ? 'Enter an email address, like careers@yourcompany.in.' : null}>
            <TextField type="email" value={address} onChange={setAddress} maxLength={320} disabled={!canEdit} />
          </FormField>
          <Checkbox checked={isDefault} onChange={setDefault} disabled={!canEdit} label="Use when the recruiter does not choose" />
        </div>
      </Drawer>
      {sender && deleting && (
        <ConfirmDialog
          open
          destructive
          onOpenChange={(o) => !o && setDeleting(false)}
          title={`Delete ${sender.address}?`}
          consequence="Recruiters can no longer send from it. Emails already sent are kept."
          confirmLabel="Delete address"
          onConfirm={async () => {
            try {
              await onDelete?.(sender.id);
              toast?.toast({ tone: 'success', title: 'Sender address deleted' });
              setDeleting(false);
              onClose();
            } catch (e) {
              setDeleting(false);
              setFailed(e instanceof Error && e.message ? e.message : 'That did not delete. Try again.');
            }
          }}
        />
      )}
    </>
  );
}

/* ---------------- interview or approval email ---------------- */

export interface EventEmailSheetProps {
  kind: 'interview' | 'approval';
  email: EventEmailView;
  canEdit: boolean;
  onSave?: (eventType: string, input: EventEmailInput) => Promise<unknown>;
  onClose: () => void;
}

export function EventEmailSheet({ kind, email, canEdit, onSave, onClose }: EventEmailSheetProps) {
  const toast = useToastIfAny();
  const name = (kind === 'interview' ? INTERVIEW_EMAILS : APPROVAL_EMAILS)[email.eventType] ?? email.eventType;
  const [subject, setSubject] = useState(email.subject ?? email.defaultSubject ?? '');
  const [body, setBody] = useState(email.body ?? email.defaultBody ?? '');
  const [enabled, setEnabled] = useState(email.enabled);
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const subjectBad = !subject.trim() || subject.length > 300;
  const bodyBad = !body.trim() || body.length > 10000;
  const save = async () => {
    setTried(true);
    setFailed(null);
    if (subjectBad) return focus('ee-subject');
    if (bodyBad) return focus('ee-body');
    setBusy(true);
    try {
      await onSave?.(email.eventType, { subject: subject.trim(), body: body.trim(), enabled });
      toast?.toast({ tone: 'success', title: 'Email wording saved', description: 'Emails sent from now on use it.' });
      onClose();
    } catch (e) {
      setFailed(e instanceof Error && e.message ? e.message : 'That did not save. Try again.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <Drawer
      open
      onOpenChange={(o) => !o && onClose()}
      title={name}
      subtitle={kind === 'interview' ? 'Interview emails' : 'Hiring approval emails'}
      dirty={canEdit}
      notice={failed ? <InlineAlert tone="danger" title={failed} /> : undefined}
      footer={
        canEdit ? (
          <>
            <Button onClick={onClose}>Cancel</Button>
            <Button variant="primary" loading={busy} onClick={() => void save()}>
              Save wording
            </Button>
          </>
        ) : (
          <Button onClick={onClose}>Close</Button>
        )
      }
    >
      <div className="yx-set-stack">
        {email.subject == null && canEdit && (
          <InlineAlert tone="info" title={kind === 'interview' ? 'This is the standard wording. Saving keeps your own copy.' : 'The standard email is sent until you write your own.'} />
        )}
        <FormField id="ee-subject" label="Subject" required error={tried && subjectBad ? (subject.trim() ? 'Keep it to 300 characters.' : 'Enter the subject.') : null}>
          <TextField value={subject} onChange={setSubject} maxLength={300} disabled={!canEdit} />
        </FormField>
        <FormField
          id="ee-body"
          label="Message"
          required
          helper={`You can use ${(kind === 'interview' ? INTERVIEW_FIELDS : APPROVAL_FIELDS).join(', ')}.`}
          error={tried && bodyBad ? (body.trim() ? 'Keep it to 10,000 characters.' : 'Enter the message.') : null}
        >
          <TextArea value={body} onChange={setBody} rows={8} disabled={!canEdit} />
        </FormField>
        <Checkbox checked={enabled} onChange={setEnabled} disabled={!canEdit} label="Use this wording" description="Off: the standard email is sent." />
      </div>
    </Drawer>
  );
}
