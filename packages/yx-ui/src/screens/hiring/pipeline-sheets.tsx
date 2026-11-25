// HIR-04 Bulk actions and Add candidate sheets (founder answer 261, 10 Nov 2026), drawn from kit parts. They replace the
// old candidates list of the job (/pipeline/list) and keep all of it: select several to move, send a test, email or
// reject with a reason (and an optional message that waits 24 hours, so it can be undone); Export CSV; undo a waiting
// rejection; add an existing or a new candidate. Pressed too early, every confirm shows the field error and focuses it.
import { useState } from 'react';
import { Download, Mail, Plus } from 'lucide-react';
import { Button } from '../../components/button';
import { Checkbox } from '../../components/choice';
import { Drawer } from '../../components/drawer';
import { EmptyState, InlineAlert } from '../../components/feedback';
import { FormField } from '../../components/field';
import { Text } from '../../components/foundations';
import { TextArea, TextField } from '../../components/inputs';
import { MenuItem } from '../../components/menu';
import { useToastIfAny } from '../../components/notify';
import { ConfirmDialog } from '../../components/overlay';
import { Segment } from '../../components/segment';
import { Select } from '../../components/select';
import { DataTable, type TableColumn } from '../../components/table';
import { EmailDialog, PickDialog } from './candidate-dialogs';
import type { Choice, EmailCompose, EmailTemplateChoice, RejectInput, ScorecardSummary } from './live/types';
import './hiring.css';

const focus = (id: string) => setTimeout(() => document.getElementById(id)?.focus(), 0);
const when = (iso: string) => new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' });

/** The scorecards of an application in a few words; null when there are none. */
export function scorecardText(s: ScorecardSummary | null): string | null {
  if (!s) return null;
  if (!s.complete) return `Scorecards ${s.submitted} of ${s.expected}`;
  return s.passes ? `Passes the bar (${s.score})` : `Below the bar (${s.score})`;
}

/** One application in the Bulk actions sheet. */
export interface BulkRow {
  entryId: string;
  name: string;
  stage: string;
  daysInStage: number;
  test: string | null;
  scorecards: ScorecardSummary | null;
  owner: string | null;
  /** A rejection whose message is still waiting (it can be undone until then). */
  rejectionPendingUntil: string | null;
}

export interface BulkActionsSheetProps {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  job: string;
  rows: BulkRow[];
  /** Every stage status the cards can move to (not Rejected: that is Reject). */
  statuses: Choice[];
  exams: Choice[];
  templates: EmailTemplateChoice[];
  senders: Choice[];
  onOpen: (entryId: string) => void;
  onMove: (ids: string[], statusId: string) => Promise<{ succeeded: number; skipped: unknown[] }>;
  onTest: (ids: string[], examId: string) => Promise<{ succeeded: number; skipped: unknown[] }>;
  onEmail: (ids: string[], c: EmailCompose) => Promise<unknown>;
  onReject: (ids: string[], input: RejectInput) => Promise<unknown>;
  onUndo: (entryId: string) => Promise<unknown>;
  onExport: () => Promise<unknown>;
  /** Offers answer 402: opens Make bulk offers for the ticked candidates (offer-pay key holders only; left out otherwise). */
  onBulkOffers?: (ids: string[]) => void;
  /** Story: rows already ticked. */
  defaultSelected?: string[];
}

// HIR-04 Bulk actions
export function BulkActionsSheet(p: BulkActionsSheetProps) {
  const toast = useToastIfAny();
  const [selected, setSelected] = useState<string[]>(p.defaultSelected ?? []);
  const [dialog, setDialog] = useState<null | { kind: 'move' | 'test' | 'email' | 'reject'; ids: string[] }>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const done = (title: string, description?: string) => {
    setSelected([]);
    toast?.toast({ tone: 'success', title, description });
  };
  const tryIt = (fn: () => Promise<unknown>) => {
    setFailed(null);
    return fn().catch((e: unknown) => setFailed(e instanceof Error ? e.message : 'That did not work. Try again.'));
  };
  const cols: TableColumn<BulkRow>[] = [
    { key: 'n', header: 'Candidate', value: (r) => r.name, width: 200, hideable: false },
    { key: 's', header: 'Stage', value: (r) => r.stage },
    { key: 'd', header: 'Days in stage', type: 'number', value: (r) => r.daysInStage },
    { key: 't', header: 'Test', value: (r) => r.test ?? '' },
    { key: 'c', header: 'Scorecards', value: (r) => scorecardText(r.scorecards) ?? '' },
    { key: 'o', header: 'Owner', value: (r) => r.owner ?? '' },
  ];
  const pending = p.rows.filter((r) => r.rejectionPendingUntil);
  return (
    <Drawer
      open={p.open}
      onOpenChange={p.onOpenChange}
      size="full"
      title="Bulk actions"
      subtitle={`${p.job} · tick candidates, then choose what to do. Each candidate's move follows the stage rules.`}
      notice={failed ? <InlineAlert tone="danger" title="Not done">{failed}</InlineAlert> : undefined}
      footer={
        <>
          <Button icon={Download} onClick={() => void tryIt(async () => (await p.onExport(), toast?.toast({ tone: 'success', title: 'Candidates downloaded' })))}>
            Export CSV
          </Button>
          <Button onClick={() => p.onOpenChange(false)}>Close</Button>
        </>
      }
    >
      <div className="yx-hire-stack">
        {pending.map((r) => (
          <InlineAlert
            key={r.entryId}
            tone="info"
            title={`${r.name} was rejected`}
            actions={<Button size="sm" onClick={() => void tryIt(async () => (await p.onUndo(r.entryId), done(`${r.name} is back where they were`)))}>Undo rejection of {r.name}</Button>}
          >
            The message goes at {when(r.rejectionPendingUntil!)}.
          </InlineAlert>
        ))}
        <DataTable
          label={`Candidates in ${p.job}`}
          columns={cols}
          rows={p.rows}
          getRowId={(r) => r.entryId}
          rowNoun={['candidate', 'candidates']}
          empty={<EmptyState compact title="No candidates in this job yet." />}
          selectable
          selectedIds={selected}
          onSelectedChange={setSelected}
          onRowClick={(r) => p.onOpen(r.entryId)}
          rowButtons={(r) => <Button size="sm" onClick={() => p.onOpen(r.entryId)}>Open {r.name}</Button>}
          rowActions={(r) => (r.rejectionPendingUntil ? null : <MenuItem destructive onSelect={() => setDialog({ kind: 'reject', ids: [r.entryId] })}>Reject</MenuItem>)}
          bulkActions={(ids) => (
            <>
              <Button size="sm" onClick={() => setDialog({ kind: 'move', ids })}>Move</Button>
              <Button size="sm" onClick={() => setDialog({ kind: 'test', ids })}>Send a test</Button>
              {p.onBulkOffers && <Button size="sm" onClick={() => p.onBulkOffers!(ids)}>Make bulk offers</Button>}
              <Button size="sm" icon={Mail} onClick={() => setDialog({ kind: 'email', ids })}>Email selected</Button>
              <Button size="sm" variant="danger" onClick={() => setDialog({ kind: 'reject', ids })}>Reject</Button>
            </>
          )}
        />
      </div>
      {dialog?.kind === 'move' && (
        <PickDialog title={`Move ${dialog.ids.length}`} label="Move to" options={p.statuses} confirm="Move" onClose={() => setDialog(null)} onConfirm={async (v) => {
          const r = await p.onMove(dialog.ids, v);
          done(`Moved ${r.succeeded}`, r.skipped.length ? `${r.skipped.length} not moved: the stage rules stopped them.` : undefined);
        }} />
      )}
      {dialog?.kind === 'test' && (
        <PickDialog title={`Send a test to ${dialog.ids.length}`} label="Test" options={p.exams} confirm="Send test" onClose={() => setDialog(null)} onConfirm={async (v) => {
          const r = await p.onTest(dialog.ids, v);
          done(`Test sent to ${r.succeeded}`, r.skipped.length ? `${r.skipped.length} already had it.` : undefined);
        }} />
      )}
      {dialog?.kind === 'email' && (
        <EmailDialog count={dialog.ids.length} templates={p.templates} senders={p.senders} onClose={() => setDialog(null)} onSend={async (c) => {
          await p.onEmail(dialog.ids, c);
          done('Emails on their way', 'Candidates who opted out are skipped.');
        }} />
      )}
      {dialog?.kind === 'reject' && (
        <RejectDialog count={dialog.ids.length} templates={p.templates} onClose={() => setDialog(null)} onReject={async (input) => {
          await p.onReject(dialog.ids, input);
          done(dialog.ids.length === 1 ? 'Candidate rejected' : `${dialog.ids.length} candidates rejected`, input.message && input.delayHours ? 'The message waits 24 hours; you can undo until then.' : input.message ? 'The message is sent now.' : 'The candidate is not emailed.');
        }} />
      )}
    </Drawer>
  );
}

/** Reject one or many with a reason; an optional message waits 24 hours (undo until then) or goes now. */
export function RejectDialog(p: { count: number; templates: EmailTemplateChoice[]; onClose: () => void; onReject: (input: RejectInput) => Promise<void> }) {
  const [reason, setReason] = useState('');
  const [tell, setTell] = useState(true);
  const [template, setTemplate] = useState<string | null>(null);
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [delay, setDelay] = useState<'24' | '0'>('24');
  const [tried, setTried] = useState(false);
  const pick = (v: string | null) => {
    setTemplate(v);
    const t = p.templates.find((x) => x.value === v);
    if (t) {
      setSubject(t.subject);
      setBody(t.body);
    }
  };
  return (
    <ConfirmDialog
      open
      destructive
      size="md"
      onOpenChange={(o) => !o && p.onClose()}
      title={p.count === 1 ? 'Reject this candidate?' : `Reject ${p.count} candidates?`}
      consequence={tell && delay === '24' ? 'The message waits 24 hours, so you can undo the rejection until then.' : 'They are rejected now.'}
      confirmLabel="Reject"
      onConfirm={async () => {
        setTried(true);
        if (!reason.trim()) return (focus('rj-reason'), false);
        if (tell && !subject.trim()) return (focus('rj-subj'), false);
        if (tell && !body.trim()) return (focus('rj-body'), false);
        const t = p.templates.find((x) => x.value === template);
        await p.onReject({ reason: reason.trim(), delayHours: delay === '24' ? 24 : 0, message: tell ? { templateId: t && !t.value.startsWith('default-') ? t.value : null, subject: subject.trim(), body } : null });
        p.onClose();
      }}
    >
      <FormField id="rj-reason" label="Reason" required helper="For your team; the candidate does not see it." error={tried && !reason.trim() ? 'Enter a reason.' : null}>
        <TextField value={reason} onChange={setReason} maxLength={500} />
      </FormField>
      <Checkbox label="Email the candidate" checked={tell} onChange={setTell} />
      {tell && (
        <>
          <FormField id="rj-tpl" label="Template" optional>
            <Select aria-label="Template" value={template} onChange={pick} options={p.templates.map((t) => ({ value: t.value, label: t.label }))} clearable />
          </FormField>
          <FormField id="rj-subj" label="Subject" required error={tried && !subject.trim() ? 'Enter a subject.' : null}>
            <TextField value={subject} onChange={setSubject} maxLength={300} />
          </FormField>
          <FormField id="rj-body" label="Message" required error={tried && !body.trim() ? 'Enter a message.' : null}>
            <TextArea value={body} onChange={setBody} rows={6} maxLength={20000} />
          </FormField>
          <FormField id="rj-when" label="Send the message">
            <Segment label="Send the message" value={delay} onChange={setDelay} options={[{ value: '24', label: 'In 24 hours (can undo)' }, { value: '0', label: 'Now' }]} />
          </FormField>
        </>
      )}
    </ConfirmDialog>
  );
}

export type AddCandidateInput = { candidateId: string } | { newCandidate: { name: string; email: string; phone?: string } };

export interface AddCandidateSheetProps {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  job: string;
  candidates: Choice[];
  onSearch?: (q: string) => void;
  onAdd: (input: AddCandidateInput) => Promise<unknown>;
  /** Story: start on New candidate. */
  defaultMode?: 'existing' | 'new';
}

// HIR-04 Add candidate
export function AddCandidateSheet(p: AddCandidateSheetProps) {
  const toast = useToastIfAny();
  const [mode, setMode] = useState<'existing' | 'new'>(p.defaultMode ?? 'existing');
  const [existing, setExisting] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const emailBad = email !== '' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  const add = async () => {
    setTried(true);
    if (mode === 'existing' && !existing) return focus('ad-existing');
    if (mode === 'new' && !name.trim()) return focus('ad-name');
    if (mode === 'new' && (!email.trim() || emailBad)) return focus('ad-email');
    setBusy(true);
    setFailed(null);
    try {
      await p.onAdd(mode === 'existing' ? { candidateId: existing! } : { newCandidate: { name: name.trim(), email: email.trim(), ...(phone.trim() ? { phone: phone.trim() } : {}) } });
      toast?.toast({ tone: 'success', title: `${mode === 'existing' ? (p.candidates.find((c) => c.value === existing)?.label.split(' · ')[0] ?? 'The candidate') : name.trim()} added to ${p.job}` });
      p.onOpenChange(false);
    } catch (e) {
      setFailed(e instanceof Error ? e.message : 'That did not work. Try again.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <Drawer
      open={p.open}
      onOpenChange={p.onOpenChange}
      size="md"
      title="Add candidate"
      subtitle={`To ${p.job}. They start in the first stage.`}
      notice={failed ? <InlineAlert tone="danger" title="Not added">{failed}</InlineAlert> : undefined}
      footer={
        <>
          <Button onClick={() => p.onOpenChange(false)}>Cancel</Button>
          <Button variant="primary" icon={Plus} loading={busy} onClick={() => void add()}>
            Add to job
          </Button>
        </>
      }
    >
      <div className="yx-hire-stack">
        <FormField label="Who">
          <Segment label="Who" value={mode} onChange={setMode} options={[{ value: 'existing', label: 'Existing candidate' }, { value: 'new', label: 'New candidate' }]} />
        </FormField>
        {mode === 'existing' ? (
          <FormField id="ad-existing" label="Candidate" required error={tried && !existing ? 'Choose the candidate.' : null}>
            <Select aria-label="Candidate" value={existing} onChange={setExisting} options={p.candidates} searchable onSearchChange={p.onSearch} />
          </FormField>
        ) : (
          <>
            <FormField id="ad-name" label="Name" required error={tried && !name.trim() ? 'Enter the name.' : null}>
              <TextField value={name} onChange={setName} maxLength={200} />
            </FormField>
            <FormField id="ad-email" label="Email" required error={emailBad ? 'Enter a valid email address.' : tried && !email.trim() ? 'Enter the email address.' : null}>
              <TextField type="email" value={email} onChange={setEmail} maxLength={254} />
            </FormField>
            <FormField id="ad-phone" label="Mobile" optional>
              <TextField type="tel" value={phone} onChange={setPhone} maxLength={50} />
            </FormField>
            <Text as="p" size="sm" tone="secondary">A new email becomes a new candidate; an email already in your candidates adds that person.</Text>
          </>
        )}
      </div>
    </Drawer>
  );
}
