// PPL-27 Document verification queue · PPL-28 Issue letter + bulk issue + issued letters register · PPL-29 Letter templates
// PPL-30 My documents & letters · PPL-31 Self-service certificate request (P05 §4.2–4.6, §7, Q7, Q8).
import { useEffect, useState, type ReactNode } from 'react';
import { Camera, Copy, Download, FileUp, Link2, Mail, Plus, Share2, Upload } from 'lucide-react';
import { PhoneFrame } from '../_kit/frames';
import { Button, IconButton } from '../../components/button';
import { Breadcrumbs, Card, ObjectHeader, PageHeader, Tabs, TabsContent, TabsList, TabsTrigger } from '../../components/shell';
import { DataTable, type TableColumn } from '../../components/table';
import { Drawer } from '../../components/drawer';
import { BottomSheet, Dialog, TypeToConfirmDialog } from '../../components/overlay';
import { Badge } from '../../components/display';
import { EmptyState, ErrorState, NoAccessState, InlineAlert, Skeleton } from '../../components/feedback';
import { FormField } from '../../components/field';
import { Select } from '../../components/select';
import { TextArea, TextField } from '../../components/inputs';
import { RadioGroup } from '../../components/choice';
import { Segment } from '../../components/segment';
import { DocumentViewer, PdfPages } from '../../components/document';
import { RichTextEditor } from '../../components/editor';
import { LetterDocument, type LetterData } from '../../components/print';
import { Stepper } from '../../components/stepper';
import { FileUpload } from '../../components/upload';
import { ApprovalTimeline } from '../../components/timeline';
import { MenuItem } from '../../components/menu';
import { Text } from '../../components/foundations';
import { formatBytes, formatDate } from '../../lib/format';
import type { FieldClass,  } from './people-logic';
import type { EditorParagraph, Letter as LiveLetter, LetterTemplate, LetterTemplates, QueueDocument } from './live/types';
import { useToast } from '../../components/notify';
import { ISSUED_LETTERS, MY_DOCS, TEMPLATES, VERIFY_QUEUE } from './people-data';
import { ClassBadge, exportCsv, MeFrame, PeopleFrame } from './people-kit';

const SCAN = (title: string) =>
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    `<svg xmlns='http://www.w3.org/2000/svg' width='600' height='380' viewBox='0 0 600 380'><rect x='10' y='10' width='580' height='360' fill='none' stroke='black' stroke-width='2'/><text x='40' y='70' font-family='sans-serif' font-size='28'>${title}</text><text x='40' y='120' font-family='sans-serif' font-size='18'>Sample scan for review</text><rect x='40' y='160' width='140' height='170' fill='none' stroke='black'/><text x='220' y='200' font-family='sans-serif' font-size='18'>Name: K Reddy</text><text x='220' y='240' font-family='sans-serif' font-size='18'>Account: XXXX XXXX 4410</text></svg>`,
  );

const KAVERI = { name: 'Kaveri Foods Pvt Ltd', address: ['4th Floor, Prestige Meridian, MG Road', 'Bengaluru 560001, Karnataka'], registration: 'CIN U15400KA2011PTC058812' };

/* ================================================================== PPL-27 verification queue */

type Verify = (typeof VERIFY_QUEUE)[number];

/** The live app's verification queue (design audit step 3). */
export interface LiveDocQueue {
  state: 'ready' | 'loading' | 'error' | 'no-access';
  onRetry: () => void;
  rows: QueueDocument[];
  /** The file as a local URL for the viewer (the API checks access; it opens only after the virus check). */
  loadFile: (d: QueueDocument) => Promise<{ url: string; name: string; type: string }>;
  onDownload: (d: QueueDocument) => void;
  onDecide: (d: QueueDocument, decision: 'verify' | 'reject', reason?: string) => Promise<void>;
}

const REJECT_REASONS = ['Name does not match the record', 'Image is unclear', 'Wrong document type', 'Expired document'];
const CLS: Record<string, FieldClass> = { public: 'Public', internal: 'Internal', personal: 'Personal', confidential: 'Confidential', special: 'Special' };

function LiveDocumentQueue({ live }: { live: LiveDocQueue }) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [mode, setMode] = useState<'view' | 'reject'>('view');
  const [file, setFile] = useState<{ url: string; name: string; type: string } | 'loading' | 'error' | null>(null);
  const [reason, setReason] = useState<string | null>(REJECT_REASONS[0]);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const open = live.rows.find((r) => r.id === openId) ?? null;
  const first = open?.person?.split(' ')[0] ?? 'the person';
  const status = (r: QueueDocument) => (r.file?.scanStatus === 'clean' ? 'Needs review' : r.file?.scanStatus === 'infected' ? 'Blocked: virus found' : 'Scanning');
  const show = async (r: QueueDocument) => {
    setOpenId(r.id);
    setMode('view');
    setFailed(null);
    setReason(REJECT_REASONS[0]);
    setMessage('');
    if (r.file?.scanStatus !== 'clean') return setFile(null);
    setFile('loading');
    try {
      setFile(await live.loadFile(r));
    } catch {
      setFile('error');
    }
  };
  const close = () => {
    if (file && typeof file === 'object') URL.revokeObjectURL(file.url);
    setFile(null);
    setOpenId(null);
  };
  const decide = async (decision: 'verify' | 'reject') => {
    if (!open) return;
    setBusy(true);
    setFailed(null);
    try {
      await live.onDecide(open, decision, decision === 'reject' ? [reason, message.trim()].filter(Boolean).join('. ') : undefined);
      close();
    } catch (e) {
      setFailed(e instanceof Error ? e.message : 'That did not work. Try again.');
    } finally {
      setBusy(false);
    }
  };
  const cols: TableColumn<QueueDocument>[] = [
    { key: 'name', header: 'Employee', type: 'person', value: (r) => r.person ?? '', person: (r) => ({ name: r.person ?? '' }), width: 200 },
    { key: 'type', header: 'Document', value: (r) => r.typeName, render: (r) => <span className="yx-ppl__row">{r.typeName} <ClassBadge cls={CLS[r.sensitivity] ?? 'Internal'} /></span>, groupable: true, width: 260 },
    { key: 'uploaded', header: 'Uploaded', type: 'date', value: (r) => (r.uploadedAt ? new Date(r.uploadedAt) : null), width: 130 },
    { key: 'status', header: 'Status', type: 'status', value: status, statusTone: (v) => (v === 'Scanning' ? 'info' : String(v).startsWith('Blocked') ? 'danger' : 'warning'), width: 170 },
  ];
  return (
    <PeopleFrame active="Documents & letters">
      <PageHeader title="Document verification" description="PAN, Aadhaar, bank proof, education and experience proofs must be verified before payroll, payouts or filings use them. Open each one, then verify it or send it back with the reason." />
      {live.state === 'no-access' ? (
        <NoAccessState what="the documents to verify" grantedBy="your HR admin" />
      ) : live.state === 'error' ? (
        <ErrorState title="We couldn't load the documents to verify" description="Check your connection and try again." onRetry={live.onRetry} />
      ) : (
        <DataTable
          label="Documents to verify"
          columns={cols}
          rows={live.rows}
          getRowId={(r) => r.id}
          state={live.state === 'loading' ? 'loading' : 'ready'}
          onRowClick={(r) => void show(r)}
          activeRowId={openId}
          rowButtons={(r) => (r.file?.scanStatus === 'clean' ? <Button variant="review" size="sm" onClick={() => void show(r)}>Review</Button> : null)}
          // Ask several people to re-upload at once: not in the live app yet (left out); Reject asks one person.
          empty={<EmptyState title="Nothing to verify" description="New uploads that need a check appear here. Payroll pre-flight lists anyone still unverified." />}
        />
      )}
      <Drawer
        open={!!open}
        onOpenChange={(o) => !o && close()}
        size="lg"
        title={`${open?.typeName ?? ''} · ${open?.person ?? ''}`}
        subtitle={open ? `${open.uploadedAt ? `Uploaded ${formatDate(new Date(open.uploadedAt))} · ` : ''}${open.file?.scanStatus === 'clean' ? 'virus scan passed' : open.file?.scanStatus === 'infected' ? 'a virus was found: the file is blocked' : 'virus scan running'}` : undefined}
        meta={open && <ClassBadge cls={CLS[open.sensitivity] ?? 'Internal'} />}
        footer={
          open?.file?.scanStatus !== 'clean' ? (
            <Button onClick={close}>Close</Button>
          ) : mode === 'reject' ? (
            <>
              <Button onClick={() => setMode('view')}>Back</Button>
              <Button variant="danger" loading={busy} disabled={!reason} onClick={() => void decide('reject')}>
                Reject and ask to re-upload
              </Button>
            </>
          ) : (
            <>
              <Button onClick={() => setMode('reject')}>Reject</Button>
              <Button variant="primary" loading={busy} onClick={() => void decide('verify')}>
                Mark verified
              </Button>
            </>
          )
        }
      >
        {open && (
          <div className="yx-ppl__stack">
            {failed && <InlineAlert tone="danger" title={failed} />}
            {open.sensitivity === 'special' && <Text size="sm" tone="secondary" as="p">Special class: this view is recorded.</Text>}
            {mode === 'reject' ? (
              <div className="yx-ppl__form">
                <FormField label="Reason" required>
                  <Select options={REJECT_REASONS.map((x) => ({ value: x, label: x }))} value={reason} onChange={setReason} />
                </FormField>
                <FormField label={`Message to ${first}`} optional helper="Say what to upload instead.">
                  <TextArea rows={3} value={message} onChange={setMessage} maxLength={400} />
                </FormField>
              </div>
            ) : open.file?.scanStatus !== 'clean' ? (
              <InlineAlert tone={open.file?.scanStatus === 'infected' ? 'danger' : 'info'}>{open.file?.scanStatus === 'infected' ? `Ask ${first} to upload a clean copy.` : 'The file opens once the virus scan finishes.'}</InlineAlert>
            ) : (
              <DocumentViewer
                fileName={file && typeof file === 'object' ? file.name : (open.file?.name ?? open.typeName)}
                {...(file && typeof file === 'object' ? { mimeType: file.type } : {})}
                state={file === 'error' ? 'error' : file === 'loading' || !file ? 'loading' : 'ready'}
                onDownload={() => live.onDownload(open)}
                versions={[{ id: 'current', label: `Version ${open.versions ?? 1}`, url: file && typeof file === 'object' ? file.url : '', uploadedBy: open.uploadedBy ?? open.person ?? '', uploadedAt: open.uploadedAt ? new Date(open.uploadedAt) : new Date(), size: open.file?.size ?? 0 }]}
              />
            )}
          </div>
        )}
      </Drawer>
    </PeopleFrame>
  );
}

// PPL-27
export function DocumentVerificationQueue(props: { rows: Verify[]; defaultOpenId?: string; rejecting?: boolean; live?: LiveDocQueue }) {
  return props.live ? <LiveDocumentQueue live={props.live} /> : <SampleDocumentQueue {...props} />;
}

function SampleDocumentQueue({ rows, defaultOpenId, rejecting = false }: { rows: Verify[]; defaultOpenId?: string; rejecting?: boolean }) {
  const [openId, setOpenId] = useState<string | null>(defaultOpenId ?? null);
  const [mode, setMode] = useState<'view' | 'reject'>(rejecting ? 'reject' : 'view');
  const open = rows.find((r) => r.id === openId);
  const cols: TableColumn<Verify>[] = [
    { key: 'name', header: 'Employee', type: 'person', value: (r) => r.name, person: (r) => ({ name: r.name }), width: 200 },
    { key: 'type', header: 'Document', value: (r) => r.type, render: (r) => <span className="yx-ppl__row">{r.type} <ClassBadge cls={r.cls} /></span>, groupable: true, width: 230 },
    { key: 'uploaded', header: 'Uploaded', type: 'date', value: (r) => r.uploaded, width: 130 },
    { key: 'auto', header: 'Automated check', value: (r) => r.auto, width: 320 },
    { key: 'status', header: 'Status', type: 'status', value: (r) => r.status, statusTone: (v) => (v === 'Auto-verified' ? 'success' : v === 'Scanning' ? 'info' : 'warning'), width: 140 },
  ];
  return (
    <PeopleFrame active="Documents & letters">
      <PageHeader title="Document verification" description="PAN, Aadhaar, bank proof, education and experience proofs must be verified before payroll, payouts or filings use them. Automated checks verify on success; you review the rest." />
      <DataTable
        label="Documents to verify"
        columns={cols}
        rows={rows}
        getRowId={(r) => r.id}
        onRowClick={(r) => {
          setOpenId(r.id);
          setMode('view');
        }}
        activeRowId={openId}
        rowButtons={(r) => (r.status === 'Needs review' ? <Button variant="review" size="sm" onClick={() => setOpenId(r.id)}>Review</Button> : null)}
        selectable
        bulkActions={() => (
          <Button size="sm" icon={Mail}>
            Ask to re-upload
          </Button>
        )}
        empty={<EmptyState title="Nothing to verify" description="New uploads that need a check appear here. Payroll pre-flight lists anyone still unverified." />}
      />
      <Drawer
        open={!!open}
        onOpenChange={(o) => !o && setOpenId(null)}
        size="lg"
        title={`${open?.type ?? ''} · ${open?.name ?? ''}`}
        subtitle={open ? `Uploaded ${formatDate(open.uploaded)} · virus scan passed` : undefined}
        meta={open && <ClassBadge cls={open.cls} />}
        footer={
          mode === 'reject' ? (
            <>
              <Button onClick={() => setMode('view')}>Back</Button>
              <Button variant="danger">Reject and ask to re-upload</Button>
            </>
          ) : (
            <>
              <Button onClick={() => setMode('reject')}>Reject</Button>
              <Button variant="primary">Mark verified</Button>
            </>
          )
        }
      >
        {open && (
          <div className="yx-ppl__stack">
            <InlineAlert tone={open.auto.startsWith('Penny drop failed') ? 'warning' : 'info'} title="Automated check">
              {open.auto}
            </InlineAlert>
            {open.cls === 'Special' && <Text size="sm" tone="secondary" as="p">Special class: this view is recorded. Aadhaar shows only the last 4 digits outside this review.</Text>}
            {mode === 'reject' ? (
              <div className="yx-ppl__form">
                <FormField label="Reason" required>
                  <Select options={['Name does not match the record', 'Image is unclear', 'Wrong document type', 'Expired document'].map((x) => ({ value: x, label: x }))} value="Name does not match the record" onChange={() => {}} />
                </FormField>
                <FormField label="Message to the employee" required helper="Say what to upload instead.">
                  <TextArea rows={3} defaultValue="The bank shows the account holder as K Reddy. Upload a cancelled cheque or passbook page with your full name, Kavya Reddy." />
                </FormField>
              </div>
            ) : (
              <DocumentViewer fileName={`${open.type}.svg`} mimeType="image/svg+xml" versions={[{ id: 'v1', label: 'Version 1', url: SCAN(open.type), uploadedBy: open.name, uploadedAt: open.uploaded, size: 214000 }]} />
            )}
          </div>
        )}
      </Drawer>
    </PeopleFrame>
  );
}

/* ================================================================== PPL-28 letters */

export const PROMOTION_LETTER: LetterData = {
  company: KAVERI,
  date: new Date(2026, 8, 24),
  reference: 'KF/HR/2026/0418',
  recipient: { name: 'Arjun Kulkarni', lines: ['Senior Quality Inspector, Quality', 'Hosur plant'] },
  subject: 'Promotion to Quality Lead',
  body: <><p>Dear Arjun,</p><p>We are pleased to promote you to <strong>Quality Lead</strong> in grade G6 with effect from 1 October 2026. Your annual CTC will be ₹7,80,000 as set out in the annexure.</p><p>Your notice period becomes 90 days. All other terms of your appointment stay the same.</p><p>Congratulations, and thank you for leading the tablet inspection roll-out.</p></>,
  signatory: { name: 'Lakshmi Venkatesan', designation: 'Head of People' },
};

// PPL-28 · issue sheet
export function IssueLetterSheet({ missing = false, pendingApproval = false, today }: { missing?: boolean; pendingApproval?: boolean; today: Date }) {
  const [open, setOpen] = useState(true);
  return (
    <PeopleFrame active="Documents & letters">
      <IssuedLettersBody rows={ISSUED_LETTERS} />
      <Drawer
        open={open}
        onOpenChange={setOpen}
        size="lg"
        title="Issue a letter"
        subtitle="Type, template, preview with real data, approval, issue"
        footer={
          <>
            <Button onClick={() => setOpen(false)}>Cancel</Button>
            <Button variant="primary" disabled={missing}>
              {pendingApproval ? 'Send for approval' : 'Issue letter'}
            </Button>
          </>
        }
      >
        <div className="yx-ppl__stack">
          <div className="yx-ppl__form">
            <FormField label="Employee" required>
              <Select options={[{ value: 'a', label: 'Arjun Kulkarni · KF-0142' }]} value="a" onChange={() => {}} />
            </FormField>
            <FormField label="Letter type" required>
              <Select options={[{ value: 'promo', label: 'Promotion (approval required)' }]} value="promo" onChange={() => {}} />
            </FormField>
            <FormField label="Template" required>
              <Select options={[{ value: 't2', label: 'Promotion with pay change · v2 · English' }]} value="t2" onChange={() => {}} />
            </FormField>
          </div>
          {missing ? (
            <InlineAlert tone="danger" title="We can't generate this letter yet">
              Fill these on Arjun's record first: new grade pay band (compensation), effective date of the change. Letters never go out with blanks.
            </InlineAlert>
          ) : (
            <div className="yx-ppl__letter" tabIndex={0} role="region" aria-label="Letter preview">
              <LetterDocument data={PROMOTION_LETTER} />
            </div>
          )}
          {pendingApproval && (
            <Card title="Approval before issue">
              <ApprovalTimeline now={today} steps={[{ id: '1', label: 'Prepared', status: 'done', approver: 'Fatima Shaikh', at: today }, { id: '2', label: 'HR head', status: 'current', approver: 'Lakshmi Venkatesan' }]} />
            </Card>
          )}
          <Text size="sm" tone="secondary" as="p">Issued letters are final: a reference number, a QR verification code and a sealed PDF. A correction is a new letter that supersedes this one.</Text>
        </div>
      </Drawer>
    </PeopleFrame>
  );
}

type Letter = (typeof ISSUED_LETTERS)[number];

function IssuedLettersBody({ rows }: { rows: Letter[] }) {
  const cols: TableColumn<Letter>[] = [
    { key: 'ref', header: 'Reference', type: 'id', value: (r) => r.ref, width: 170 },
    { key: 'type', header: 'Letter', value: (r) => r.type, groupable: true, width: 170 },
    { key: 'to', header: 'To', type: 'person', value: (r) => r.to, person: (r) => ({ name: r.to }), width: 200 },
    { key: 'issued', header: 'Issued', type: 'date', value: (r) => r.issued, width: 130 },
    { key: 'esign', header: 'Signature', value: (r) => r.esign, width: 200 },
    { key: 'status', header: 'Status', type: 'status', value: (r) => r.status, statusTone: (v) => (v === 'Issued' ? 'success' : v === 'Superseded' ? 'neutral' : 'warning'), width: 150 },
  ];
  return (
    <>
      <PageHeader
        title="Letters"
        description="Issued letters with reference numbers. Numbers are gap-free per entity and letter type."
        actions={
          <>
            <Button icon={FileUp}>Bulk issue</Button>
            <Button variant="primary" icon={Plus}>
              Issue letter
            </Button>
          </>
        }
      />
      <DataTable
        label="Issued letters"
        columns={cols}
        rows={rows}
        getRowId={(r) => r.id}
        rowActions={(r) => (
          <>
            <MenuItem icon={Download}>Download PDF</MenuItem>
            <MenuItem>Copy verification link</MenuItem>
            {r.status === 'Issued' && <MenuItem>Issue a correction</MenuItem>}
          </>
        )}
        defaultSort={{ key: 'ref', dir: 'desc' }}
        empty={<EmptyState title="No letters issued yet" description="Issue a letter from a template, or in bulk after a change." action={<Button variant="primary">Issue letter</Button>} />}
        onExport={() => {}}
      />
    </>
  );
}

/** The live app's letters register (design audit step 3). */
export interface LiveLetters {
  state: 'ready' | 'loading' | 'error' | 'no-access';
  onRetry: () => void;
  rows: LiveLetter[];
  verifyUrl: (code: string) => string;
  onDownload: (l: LiveLetter) => void;
  /** letter.issue with active templates: issue one letter, or many. */
  issue?: {
    /** The active templates: the sheet offers their letter types, then the chosen type's versions for the person's legal entity. */
    templates: LetterTemplate[];
    people: { value: string; label: string; legalEntityId: string | null }[];
    /** Who approves a letter that needs approval: the legal entity's signatory, when one is named. */
    approverFor: (legalEntityId: string | null) => string | null;
    /** The letter filled with the person's real data, as a preview PDF (an object URL). Refused while a field is blank. */
    onPreview: (personId: string, t: LetterTemplate) => Promise<string>;
    onIssue: (personId: string, t: LetterTemplate) => Promise<void>;
    onBulk: () => void;
    /** Opened from one person's record or the directory: the sheet starts with them chosen. */
    person?: string;
  };
  /** letter.template.manage: Settings › Letter templates, from the page header. */
  templatesHref?: string;
  /** Dialogs the page opens (the bulk issue). */
  children?: ReactNode;
}

const LETTER_STATE: Record<LiveLetter['status'], string> = { pending_approval: 'Pending approval', rejected: 'Not approved', rendering: 'Being made', awaiting_signature: 'Waiting for signature', issued: 'Issued', superseded: 'Superseded', withdrawn: 'Withdrawn' };
const LANGUAGE = new Intl.DisplayNames(['en'], { type: 'language' });

type LetterPreview = { url: string } | { missing: Record<string, string> } | { failed: string } | null;

/** The API's LETTER_FIELDS_MISSING refusal in the design's words: "Fill these on Arjun's record first: …". */
function missingText(first: string, missing: Record<string, string>) {
  const keys = Object.keys(missing);
  const onRecord = keys.filter((k) => !k.startsWith('signatory_')).map((k) => missing[k][0].toLowerCase() + missing[k].slice(1));
  return [onRecord.length ? `Fill these on ${first}'s record first: ${onRecord.join(', ')}.` : '', keys.length > onRecord.length ? 'Name who signs for their legal entity in Settings › Letter templates.' : '', 'Letters never go out with blanks.'].filter(Boolean).join(' ');
}

// PPL-28 · issue sheet, live: the designed sheet (IssueLetterSheet) with the API's templates, preview and approval rule.
function LiveIssueLetterSheet({ issue, open, onOpenChange }: { issue: NonNullable<LiveLetters['issue']>; open: boolean; onOpenChange: (open: boolean) => void }) {
  const [who, setWho] = useState<string | null>(issue.person ?? null);
  const [type, setType] = useState<string | null>(null);
  const [templateId, setTemplateId] = useState<string | null>(null);
  const [preview, setPreview] = useState<LetterPreview>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const person = issue.people.find((p) => p.value === who);
  const types = [...new Set(issue.templates.map((t) => t.letterType))].map((value) => {
    const of = issue.templates.filter((t) => t.letterType === value);
    return { value, label: of.some((t) => t.requiresApproval) ? `${of[0].name} (approval required)` : of[0].name };
  });
  // The person's own legal entity first, then company-wide: the template the API would pick by itself.
  const versions = issue.templates.filter((t) => t.letterType === type && (!t.legalEntityId || t.legalEntityId === person?.legalEntityId)).sort((a, b) => Number(!a.legalEntityId) - Number(!b.legalEntityId));
  const chosen = versions.find((t) => t.id === templateId) ?? versions[0] ?? null;
  useEffect(() => {
    setPreview(null);
    if (!who || !chosen) return;
    let gone = false;
    issue.onPreview(who, chosen).then(
      (url) => !gone && setPreview({ url }),
      (e: { code?: string; body?: { errors?: Record<string, string> } }) => {
        if (gone) return;
        const missing = e?.code === 'LETTER_FIELDS_MISSING' ? e.body?.errors : undefined;
        setPreview(missing ? { missing } : { failed: e instanceof Error ? e.message : 'The preview could not be made. Try again.' });
      },
    );
    return () => {
      gone = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- a new preview only when the person or the template changes
  }, [who, chosen?.id]);
  const issueIt = async () => {
    if (!who || !chosen) return;
    setBusy(true);
    setFailed(null);
    try {
      await issue.onIssue(who, chosen);
      onOpenChange(false);
    } catch (e) {
      setFailed(e instanceof Error ? e.message : 'That did not work. Try again.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <Drawer
      open={open}
      onOpenChange={onOpenChange}
      size="lg"
      title="Issue a letter"
      subtitle="Type, template, preview with real data, approval, issue"
      footer={
        <>
          <Button onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button variant="primary" disabled={!who || !chosen || !preview || 'missing' in preview} loading={busy} onClick={() => void issueIt()}>
            {chosen?.requiresApproval ? 'Send for approval' : 'Issue letter'}
          </Button>
        </>
      }
    >
      <div className="yx-ppl__stack">
        {failed && <InlineAlert tone="danger" title={failed} />}
        <div className="yx-ppl__form">
          <FormField label="Employee" required>
            <Select aria-label="Employee" options={issue.people} value={who} onChange={setWho} searchable />
          </FormField>
          <FormField label="Letter type" required>
            <Select
              aria-label="Letter type"
              options={types}
              value={type}
              onChange={(v) => {
                setType(v);
                setTemplateId(null);
              }}
            />
          </FormField>
          <FormField label="Template" required>
            <Select aria-label="Template" options={versions.map((t) => ({ value: t.id, label: `${t.name} · v${t.version} · ${LANGUAGE.of(t.language) ?? t.language}` }))} value={chosen?.id ?? null} onChange={setTemplateId} disabled={!versions.length} />
          </FormField>
        </div>
        {preview && 'missing' in preview ? (
          <InlineAlert tone="danger" title="We can't generate this letter yet">
            {missingText(person?.label.split(' ')[0] ?? 'the person', preview.missing)}
          </InlineAlert>
        ) : preview && 'failed' in preview ? (
          <InlineAlert tone="danger" title="We couldn't make the preview">
            {preview.failed}
          </InlineAlert>
        ) : (
          who &&
          chosen && (
            <div className="yx-ppl__letter" tabIndex={0} role="region" aria-label="Letter preview">
              {preview ? <PdfPages url={preview.url} label={`${chosen.name} for ${person?.label ?? 'the person'}, preview`} /> : <Skeleton height="var(--yx-space-16)" />}
            </div>
          )
        )}
        {chosen?.requiresApproval && !(preview && 'missing' in preview) && (
          <Card title="Approval before issue">
            <ApprovalTimeline steps={[{ id: 'prepared', label: 'Prepared', status: 'done', approver: 'You', at: new Date() }, { id: 'signatory', label: 'Signatory', status: 'current', approver: issue.approverFor(person?.legalEntityId ?? null) ?? 'A company admin' }]} />
          </Card>
        )}
        <Text size="sm" tone="secondary" as="p">Issued letters are final: a reference number, a QR verification code and a sealed PDF. A correction is a new letter that supersedes this one.</Text>
      </div>
    </Drawer>
  );
}

function LiveLettersRegister({ live }: { live: LiveLetters }) {
  const [issuing, setIssuing] = useState(false);
  // A fresh sheet each time it opens: nothing left over from the last letter.
  const [sheet, setSheet] = useState(0);
  const { toast } = useToast();
  const startIssue = () => {
    setSheet((n) => n + 1);
    setIssuing(true);
  };
  const person = live.issue?.person;
  useEffect(() => {
    if (person) startIssue();
  }, [person]);
  const cols: TableColumn<LiveLetter>[] = [
    { key: 'ref', header: 'Reference', type: 'id', value: (r) => r.referenceNo ?? '', width: 250 },
    { key: 'type', header: 'Letter', value: (r) => r.title.split(': ')[0], groupable: true, width: 190 },
    { key: 'to', header: 'To', type: 'person', value: (r) => r.person ?? '', person: (r) => ({ name: r.person ?? '' }), width: 200 },
    { key: 'issued', header: 'Issued', type: 'date', value: (r) => (r.issuedAt ? new Date(r.issuedAt) : null), width: 130 },
    { key: 'esign', header: 'Signature', value: (r) => (!r.personSigns ? 'Not needed' : r.acceptedAt ? `Accepted ${formatDate(new Date(r.acceptedAt))}` : r.signature?.status === 'declined' ? 'Declined' : 'Not yet'), width: 180 },
    { key: 'status', header: 'Status', type: 'status', value: (r) => LETTER_STATE[r.status], statusTone: (v) => (v === 'Issued' ? 'success' : v === 'Superseded' || v === 'Withdrawn' ? 'neutral' : v === 'Not approved' ? 'danger' : 'warning'), width: 170 },
  ];
  return (
    <PeopleFrame active="Documents & letters">
      <PageHeader
        title="Letters"
        description="Issued letters with reference numbers. Numbers are gap-free per entity and letter type."
        actions={
          live.issue || live.templatesHref ? (
            <>
              {live.templatesHref && (
                <Button asChild>
                  <a href={live.templatesHref}>Letter templates</a>
                </Button>
              )}
              {live.issue && (
                <>
                  <Button icon={FileUp} onClick={live.issue.onBulk}>
                    Bulk issue
                  </Button>
                  <Button variant="primary" icon={Plus} onClick={startIssue}>
                    Issue letter
                  </Button>
                </>
              )}
            </>
          ) : undefined
        }
      />
      {live.state === 'no-access' ? (
        <NoAccessState what="the letters" grantedBy="your HR admin" />
      ) : live.state === 'error' ? (
        <ErrorState title="We couldn't load the letters" description="Check your connection and try again." onRetry={live.onRetry} />
      ) : (
        <DataTable
          label="Issued letters"
          columns={cols}
          rows={live.rows}
          getRowId={(r) => r.id}
          onExport={exportCsv('letters', live.rows, cols)}
          state={live.state === 'loading' ? 'loading' : 'ready'}
          rowActions={(r) =>
            r.status === 'issued' || r.status === 'superseded' ? (
              <>
                <MenuItem icon={Download} onSelect={() => live.onDownload(r)}>
                  Download PDF
                </MenuItem>
                {r.verifyCode && (
                  <MenuItem
                    onSelect={() => {
                      void navigator.clipboard?.writeText(live.verifyUrl(r.verifyCode!)).then(() => toast({ tone: 'success', title: `Check link for ${r.referenceNo ?? 'the letter'} copied` }));
                    }}
                  >
                    Copy verification link
                  </MenuItem>
                )}
              </>
            ) : null
          }
          defaultSort={{ key: 'issued', dir: 'desc' }}
          empty={
            <EmptyState
              title="No letters issued yet"
              description="Issue a letter from a template, or in bulk after a change."
              action={
                live.issue ? (
                  <Button icon={Plus} onClick={startIssue}>
                    Issue letter
                  </Button>
                ) : undefined
              }
            />
          }
        />
      )}
      {live.issue && <LiveIssueLetterSheet key={sheet} issue={live.issue} open={issuing} onOpenChange={setIssuing} />}
      {live.children}
    </PeopleFrame>
  );
}

// PPL-28 · register
export function IssuedLettersRegister({ rows, live }: { rows: Letter[]; live?: LiveLetters }) {
  if (live) return <LiveLettersRegister live={live} />;
  return (
    <PeopleFrame active="Documents & letters">
      <IssuedLettersBody rows={rows} />
    </PeopleFrame>
  );
}

// PPL-28 · bulk issue
export function BulkLetterWizard({ current = 'source', confirmOpen = false }: { current?: string; confirmOpen?: boolean }) {
  const [confirm, setConfirm] = useState(confirmOpen);
  const fails = [
    { name: 'Thomas George', why: 'Missing field: new grade (compensation not saved)' },
    { name: 'Aisha Khan', why: 'Letter already issued for this change (KF/HR/2026/0413)' },
  ];
  return (
    <PeopleFrame active="Documents & letters">
      <PageHeader title="Bulk issue letters" description="For example, increment letters for everyone in the October revision. Each person's letter is previewed; failures are listed for retry." />
      <Stepper
        title="Bulk issue"
        defaultCurrent={current}
        finishLabel="Issue 38 letters"
        onFinish={() => setConfirm(true)}
        onSaveAndExit={() => {}}
        steps={[
          {
            id: 'source',
            title: 'Who gets a letter',
            summary: 'Annual increment 2026 · 40 people',
            content: (
              <div className="yx-ppl__form">
                <FormField label="Source" required>
                  <RadioGroup value="change" onChange={() => {}} options={[{ value: 'change', label: 'People in a bulk change: Annual increment 2026 (40)' }, { value: 'list', label: 'A saved list or filter' }, { value: 'golive', label: 'Employees with no appointment letter on file (go-live)' }]} />
                </FormField>
              </div>
            ),
          },
          {
            id: 'template',
            title: 'Template',
            summary: 'Increment letter v3 · English and Tamil',
            content: (
              <div className="yx-ppl__form">
                <FormField label="Template" required>
                  <Select options={[{ value: 'inc', label: 'Increment letter v3' }]} value="inc" onChange={() => {}} />
                </FormField>
                <FormField label="Language">
                  <Select options={[{ value: 'pref', label: "Each person's preferred language" }]} value="pref" onChange={() => {}} />
                </FormField>
              </div>
            ),
          },
          {
            id: 'preview',
            title: 'Preview',
            status: 'error',
            statusNote: '2 letters can’t be generated',
            summary: '38 ready · 2 failed',
            content: (
              <div className="yx-ppl__stack">
                <InlineAlert tone="warning" title="2 letters can't be generated">
                  Fix these and retry, or issue the other 38 now.
                </InlineAlert>
                <ul className="yx-ppl__successors">
                  {fails.map((f) => (
                    <li key={f.name}>
                      <span>{f.name}</span>
                      <Text size="sm" tone="danger">{f.why}</Text>
                    </li>
                  ))}
                </ul>
                <div className="yx-ppl__letter" tabIndex={0} role="region" aria-label="Sample increment letter preview">
                  <LetterDocument data={{ ...PROMOTION_LETTER, subject: 'Revision of your salary', reference: 'KF/HR/2026/0421', body: <><p>Dear Arjun,</p><p>Your annual CTC is revised to ₹7,45,200 from 1 October 2026 after the 2026 review.</p></> }} />
                </div>
              </div>
            ),
          },
          {
            id: 'delivery',
            title: 'Delivery',
            summary: "To each person's documents with a notification · ZIP for HR",
            content: (
              <div className="yx-ppl__form">
                <RadioGroup value="vault" onChange={() => {}} options={[{ value: 'vault', label: "Each person's documents, with a notification" }, { value: 'zip', label: 'Also download a ZIP for HR files' }]} />
              </div>
            ),
          },
        ]}
      />
      <TypeToConfirmDialog open={confirm} onOpenChange={setConfirm} title="Issue 38 increment letters?" consequence="Issued letters can't be edited. Corrections are new letters that supersede these." confirmLabel="Issue letters" objectName="ISSUE 38 LETTERS" onConfirm={() => setConfirm(false)} />
    </PeopleFrame>
  );
}

/* ================================================================== PPL-29 templates */

type Tpl = (typeof TEMPLATES)[number];
const FIELDS = [
  { key: '{{employee_name}}', label: 'Employee name', cls: 'Public' as const },
  { key: '{{designation}}', label: 'Designation', cls: 'Public' as const },
  { key: '{{joining_date}}', label: 'Joining date', cls: 'Internal' as const },
  { key: '{{ctc}}', label: 'Annual CTC', cls: 'Confidential' as const },
  { key: '{{manager_name}}', label: 'Reporting manager', cls: 'Public' as const },
  { key: '{{#each salary_lines}}', label: 'Salary annexure (repeating)', cls: 'Confidential' as const },
  { key: '{{#if probation}}', label: 'Only when on probation', cls: 'Internal' as const },
  { key: '{{pan}}', label: 'PAN', cls: 'Confidential' as const },
];

// PPL-29 · list
export function LetterTemplatesList({ rows, live }: { rows: Tpl[]; live?: LiveLetterTemplates }) {
  if (live) return <LiveTemplatesList live={live} />;
  const cols: TableColumn<Tpl>[] = [
    { key: 'name', header: 'Template', value: (r) => r.name, width: 280 },
    { key: 'type', header: 'Letter type', value: (r) => r.type, groupable: true, width: 180 },
    { key: 'source', header: 'Made with', value: (r) => r.source, width: 160 },
    { key: 'languages', header: 'Languages', value: (r) => r.languages, width: 150 },
    { key: 'version', header: 'Version', type: 'number', value: (r) => r.version, width: 90 },
    { key: 'approval', header: 'Before issue', value: (r) => (r.approval ? 'Approval' : 'Instant'), width: 120 },
    { key: 'status', header: 'Status', type: 'status', value: (r) => r.status, statusTone: (v) => (v === 'Active' ? 'success' : 'neutral'), width: 110 },
  ];
  return (
    <PeopleFrame active="Documents & letters">
      <PageHeader
        title="Letter templates"
        description="Every template is a Word file: upload your own or build it in the editor. Starter templates are yours to edit; updates never overwrite your copy."
        actions={
          <>
            <Button icon={Upload}>Upload Word</Button>
            <Button variant="primary" icon={Plus}>
              New template
            </Button>
          </>
        }
      />
      <DataTable label="Letter templates" columns={cols} rows={rows} getRowId={(r) => r.id} rowActions={() => (<><MenuItem>Open</MenuItem><MenuItem icon={Download}>Download as Word</MenuItem><MenuItem>Duplicate</MenuItem></>)} empty={<EmptyState title="No templates" description="Start from the starter library or upload a Word letter." action={<Button variant="primary">Open starter library</Button>} />} />
    </PeopleFrame>
  );
}

export type TemplateTab = 'upload' | 'editor' | 'fields' | 'test';

// PPL-29 · template workspace
export function LetterTemplateWorkspace({ tab = 'upload', previewViewed = false }: { tab?: TemplateTab; previewViewed?: boolean }) {
  const [t, setT] = useState<TemplateTab>(tab);
  const [viewed, setViewed] = useState(previewViewed);
  return (
    <PeopleFrame active="Documents & letters">
      <ObjectHeader
        name="Relieving and experience"
        icon={FileUp}
        secondary="Relieving letter · uploaded Word · English · version 1"
        status={<Badge tone="neutral">Draft</Badge>}
        actions={
          <>
            <Button icon={Download}>Download as Word</Button>
            <Button variant="primary" disabled={!viewed}>
              Activate
            </Button>
          </>
        }
      />
      {!viewed && <InlineAlert tone="info">View a test render with a sample employee before you activate this template.</InlineAlert>}
      <Tabs value={t} onValueChange={(v) => setT(v as TemplateTab)}>
        <TabsList aria-label="Template">
          <TabsTrigger value="upload">Word upload</TabsTrigger>
          <TabsTrigger value="editor">Editor</TabsTrigger>
          <TabsTrigger value="fields">Field cheat-sheet</TabsTrigger>
          <TabsTrigger value="test">Test render</TabsTrigger>
        </TabsList>
        <TabsContent value="upload">
          <div className="yx-ppl__stack">
            <FileUpload upload={async () => {}} accept={['.docx']} maxSize={5 * 1024 * 1024} />
            <Card title="Validation report · relieving-experience.docx">
              <ul className="yx-ppl__successors">
                <li><span>14 placeholders match the field registry</span><Badge tone="success">OK</Badge></li>
                <li><span>Repeating block <code className="yx-ppl__code">{'{{#each salary_lines}}'}</code></span><Badge tone="success">OK</Badge></li>
                <li><span>Conditional <code className="yx-ppl__code">{'{{#if probation}}'}</code></span><Badge tone="success">OK</Badge></li>
                <li>
                  <span>
                    Unknown placeholder <code className="yx-ppl__code">{'{{emp_nme}}'}</code> on page 1. Did you mean <code className="yx-ppl__code">{'{{employee_name}}'}</code>?
                  </span>
                  <Button size="sm">Use suggestion</Button>
                </li>
                <li>
                  <span>
                    <code className="yx-ppl__code">{'{{pan}}'}</code> is Confidential. Issuers without that class can't generate this letter.
                  </span>
                  <Badge tone="warning">Check</Badge>
                </li>
              </ul>
            </Card>
          </div>
        </TabsContent>
        <TabsContent value="editor">
          <div className="yx-ppl__stack">
            <div className="yx-ppl__row">
              <Select aria-label="Letterhead" size="sm" options={[{ value: 'ka', label: 'Letterhead: Kaveri Foods Pvt Ltd' }, { value: 'tn', label: 'Letterhead: Kaveri Foods Pvt Ltd (Tamil Nadu)' }]} value="ka" onChange={() => {}} />
              <Select aria-label="Language" size="sm" options={[{ value: 'en', label: 'English' }, { value: 'ta', label: 'Tamil' }]} value="en" onChange={() => {}} />
            </div>
            <RichTextEditor
              aria-label="Letter body"
              defaultValue="<p>Dear {{employee_name}},</p><p>This is to certify that {{employee_name}} worked with {{company.name}} as {{designation}} from {{joining_date}} to {{last_working_day}}.</p><p>We wish you the very best.</p>"
              mergeFields={[
                { value: 'employee_name', label: 'Employee name' },
                { value: 'designation', label: 'Designation' },
                { value: 'joining_date', label: 'Joining date' },
                { value: 'last_working_day', label: 'Last working day' },
                { value: 'company.name', label: 'Company name' },
              ]}
            />
          </div>
        </TabsContent>
        <TabsContent value="fields">
          <Card title="Fields you can use">
            <ul className="yx-ppl__cheats">
              {FIELDS.map((f) => (
                <li key={f.key}>
                  <span>
                    <code className="yx-ppl__code">{f.key}</code> {f.label}
                  </span>
                  <span className="yx-ppl__row">
                    <ClassBadge cls={f.cls} />
                    <IconButton icon={Copy} size="sm" label={`Copy ${f.key}`} />
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        </TabsContent>
        <TabsContent value="test">
          <div className="yx-ppl__stack">
            <FormField label="Sample employee">
              <Select options={[{ value: 'm', label: 'Meera Iyer · leaves 19 Oct 2026' }]} value="m" onChange={() => {}} />
            </FormField>
            <div className="yx-ppl__letter" tabIndex={0} role="region" aria-label="Test render preview" onScroll={() => setViewed(true)}>
              <LetterDocument
                data={{
                  company: KAVERI,
                  date: new Date(2026, 9, 19),
                  reference: 'KF/HR/2026/TEST',
                  recipient: { name: 'Meera Iyer', lines: ['Lab Analyst, Quality', 'Hosur plant'] },
                  subject: 'Relieving and experience letter',
                  body: <><p>Dear Meera,</p><p>This is to certify that Meera Iyer worked with Kaveri Foods Pvt Ltd as Lab Analyst from 14 Feb 2021 to 19 Oct 2026.</p><p>We wish you the very best.</p></>,
                  signatory: { name: 'Lakshmi Venkatesan', designation: 'Head of People' },
                }}
              />
            </div>
            <div>
              <Button onClick={() => setViewed(true)}>{viewed ? 'Preview viewed' : 'Mark preview as viewed'}</Button>
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </PeopleFrame>
  );
}

/** A template's settings: a new one (not saved yet) or the next version of one. */
export interface TemplateSpec {
  letterType: string;
  name: string;
  /** The letterhead: one legal entity's, or each person's own (null). */
  legalEntityId: string | null;
  requiresApproval: boolean;
  personSigns: boolean;
}

/** The live app's letter templates (design audit step 3; Settings › Letter templates). */
export interface LiveLetterTemplates {
  state: 'ready' | 'loading' | 'error' | 'no-access';
  onRetry: () => void;
  data: LetterTemplates | null;
  entities: { value: string; label: string }[];
  /** The test render's sample employees: people the user may issue letters to (letter.issue). */
  people: { value: string; label: string }[];
  /** A Word file saved as a template (a new one, or the next version); fixes are "Use suggestion" renames. */
  onUpload: (x: TemplateSpec & { file: File; fixes?: Record<string, string> }) => Promise<LetterTemplate>;
  /** The editor saved as a template (a new one, or the next version). */
  onCompose: (x: TemplateSpec & { paragraphs: EditorParagraph[] }) => Promise<LetterTemplate>;
  onStarter: (letterType: string) => Promise<LetterTemplate>;
  onParagraphs: (t: LetterTemplate) => Promise<EditorParagraph[]>;
  onWord: (t: LetterTemplate) => void;
  /** The template's Word file, to duplicate an uploaded template. */
  wordFile: (t: LetterTemplate) => Promise<File>;
  /** The test render as a PDF URL, sample data or a real person; seeing it allows switching the template on. */
  onTestRender: (t: LetterTemplate, personId: string | null) => Promise<string>;
  onStatus: (t: LetterTemplate, status: 'active' | 'retired') => Promise<void>;
  /** letter.signatory.manage: who signs, in a drawer the page renders (children). */
  onSignatories?: () => void;
  /** The list's address: the workspace's breadcrumb leads back to it. */
  listHref: string;
  children?: ReactNode;
}

const MADE_WITH: Record<LetterTemplate['source'], string> = { upload: 'Uploaded Word', editor: 'In-app editor', starter: 'Starter template' };
const FIELD_CLASS: Record<LetterTemplates['fields'][number]['cls'], FieldClass> = { internal: 'Internal', personal: 'Personal', pay: 'Confidential' };
const typeName = (d: LetterTemplates | null, letterType: string) => d?.starters.find((s) => s.letterType === letterType)?.name ?? letterType[0].toUpperCase() + letterType.slice(1).replace(/_/g, ' ');
const tagOf = (f: { key: string; flag: boolean }) => (f.flag ? `{{#${f.key}}}` : `{{${f.key}}}`);
const specOf = (t: LetterTemplate): TemplateSpec => ({ letterType: t.letterType, name: t.name, legalEntityId: t.legalEntityId, requiresApproval: t.requiresApproval, personSigns: t.personSigns });
const failText = (e: unknown) => (e instanceof Error ? e.message : 'That did not work. Try again.');

// The editor's HTML and a template's paragraphs: a template made in YukthiX keeps text, bold and headings.
const escHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const toHtml = (ps: EditorParagraph[]) => ps.map((p) => (p.heading ? `<h2>${escHtml(p.text)}</h2>` : p.bold && p.text ? `<p><strong>${escHtml(p.text)}</strong></p>` : `<p>${escHtml(p.text)}</p>`)).join('');
function fromHtml(html: string): EditorParagraph[] {
  const blocks = [...new DOMParser().parseFromString(html, 'text/html').body.children].flatMap((el) => (el.tagName === 'UL' || el.tagName === 'OL' ? [...el.children] : [el]));
  return blocks.map((el) => {
    const text = el.textContent ?? '';
    const heading = /^H\d$/.test(el.tagName);
    return { text, heading, bold: heading || (text.trim() !== '' && [...el.querySelectorAll('strong')].map((s) => s.textContent).join('') === text) };
  });
}
// A new letter starts as a proper one: letterhead, reference, date, addressee, subject, body and who signs.
const BLANK_LETTER = toHtml(
  [['{{legal_entity}}', 'h'], [''], ['Ref: {{reference_no}}'], ['Date: {{today}}'], [''], ['{{employee_name}}'], ['{{designation}}'], [''], ['Subject: ', 'b'], [''], ['Dear {{first_name}},'], [''], [''], ['For {{legal_entity}}'], [''], ['{{signatory_name}}', 'b'], ['{{signatory_title}}']].map(([text, k]) => ({ text, heading: k === 'h', bold: k === 'b' })),
);

type Workspace = { t: LetterTemplate | null; spec: TemplateSpec; tab: TemplateTab };

// PPL-29 · list, live: the designed list with the API's templates; a row opens the designed workspace.
function LiveTemplatesList({ live }: { live: LiveLetterTemplates }) {
  const [ws, setWs] = useState<Workspace | null>(null);
  const [starting, setStarting] = useState<'new' | 'upload' | null>(null);
  const { toast } = useToast();
  const d = live.data;
  const open = (t: LetterTemplate, tab: TemplateTab = 'upload') => {
    setStarting(null);
    setWs({ t, spec: specOf(t), tab });
  };
  const act = (title: string, fn: () => Promise<unknown>) =>
    fn().then(
      () => toast({ tone: 'success', title }),
      (e) => toast({ tone: 'error', title: failText(e) }),
    );
  const newStarter = async (letterType: string) => {
    const t = await live.onStarter(letterType);
    toast({ tone: 'success', title: `${t.name} version ${t.version} added as a draft` });
    open(t, 'test');
  };
  if (ws) return <LiveTemplateWorkspace key={ws.t?.id ?? 'new'} live={live} ws={ws} onChange={setWs} />;
  const cols: TableColumn<LetterTemplate>[] = [
    { key: 'name', header: 'Template', value: (r) => r.name, width: 280 },
    { key: 'type', header: 'Letter type', value: (r) => typeName(d, r.letterType), groupable: true, width: 180 },
    { key: 'source', header: 'Made with', value: (r) => MADE_WITH[r.source], width: 160 },
    { key: 'languages', header: 'Languages', value: (r) => LANGUAGE.of(r.language) ?? r.language, width: 150 },
    { key: 'version', header: 'Version', type: 'number', value: (r) => r.version, width: 90 },
    { key: 'approval', header: 'Before issue', value: (r) => (r.requiresApproval ? 'Approval' : 'Instant'), width: 120 },
    { key: 'status', header: 'Status', type: 'status', value: (r) => (r.status === 'active' ? 'Active' : 'Draft'), statusTone: (v) => (v === 'Active' ? 'success' : 'neutral'), width: 110 },
  ];
  return (
    <PeopleFrame active="Documents & letters">
      <PageHeader
        title="Letter templates"
        description="Every template is a Word file: upload your own or build it in the editor. Starter templates are yours to edit; updates never overwrite your copy."
        actions={
          <>
            {live.onSignatories && <Button onClick={live.onSignatories}>Signatories</Button>}
            <Button icon={Upload} onClick={() => setStarting('upload')}>
              Upload Word
            </Button>
            <Button variant="primary" icon={Plus} onClick={() => setStarting('new')}>
              New template
            </Button>
          </>
        }
      />
      {live.state === 'no-access' ? (
        <NoAccessState what="letter templates" grantedBy="your System Admin" />
      ) : live.state === 'error' ? (
        <ErrorState title="We couldn't load the letter templates" description="Check your connection and try again." onRetry={live.onRetry} />
      ) : (
        <DataTable
          label="Letter templates"
          columns={cols}
          rows={d?.templates ?? []}
          getRowId={(r) => r.id}
          state={live.state === 'loading' ? 'loading' : 'ready'}
          onRowClick={(r) => open(r)}
          rowActions={(r) => (
            <>
              <MenuItem onSelect={() => open(r)}>Open</MenuItem>
              <MenuItem icon={Download} onSelect={() => live.onWord(r)}>
                Download as Word
              </MenuItem>
              <MenuItem
                onSelect={() => {
                  const spec = { ...specOf(r), name: `${r.name} (copy)`.slice(0, 100) };
                  void act(`${spec.name} saved as a draft`, async () => (r.source === 'upload' ? live.onUpload({ ...spec, file: await live.wordFile(r) }) : live.onCompose({ ...spec, paragraphs: await live.onParagraphs(r) })));
                }}
              >
                Duplicate
              </MenuItem>
              {r.status === 'active' && <MenuItem onSelect={() => void act(`${r.name} is no longer used`, () => live.onStatus(r, 'retired'))}>Stop using</MenuItem>}
              {r.source === 'starter' && d?.starters.some((s) => s.letterType === r.letterType && s.update) && (
                <MenuItem onSelect={() => void newStarter(r.letterType).catch((e) => toast({ tone: 'error', title: failText(e) }))}>Get the new starter version</MenuItem>
              )}
            </>
          )}
          empty={<EmptyState title="No templates" description="Start from the starter library or upload a Word letter." action={<Button variant="primary" onClick={() => setStarting('new')}>Open starter library</Button>} />}
        />
      )}
      {starting && d && (
        <NewTemplateDrawer
          mode={starting}
          data={d}
          entities={live.entities}
          onClose={() => setStarting(null)}
          onStarter={newStarter}
          onSpec={(spec) => {
            setStarting(null);
            setWs({ t: null, spec, tab: starting === 'upload' ? 'upload' : 'editor' });
          }}
        />
      )}
      {live.children}
    </PeopleFrame>
  );
}

// "Upload Word" and "New template" (the starter library): what the template is called and how it is issued.
function NewTemplateDrawer({ mode, data, entities, onClose, onStarter, onSpec }: { mode: 'new' | 'upload'; data: LetterTemplates; entities: { value: string; label: string }[]; onClose: () => void; onStarter: (letterType: string) => Promise<void>; onSpec: (spec: TemplateSpec) => void }) {
  const [from, setFrom] = useState('blank');
  const [name, setName] = useState('');
  const [type, setType] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [entity, setEntity] = useState('');
  const [approval, setApproval] = useState<'instant' | 'approval'>('instant');
  const [signs, setSigns] = useState<'no' | 'yes'>('no');
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const starter = mode === 'new' && from !== 'blank';
  const known = [...new Set([...data.starters.map((s) => s.letterType), ...data.templates.map((t) => t.letterType), ...(type ? [type] : [])])].map((value) => ({ value, label: typeName(data, value) }));
  // A new letter type from what was typed: "Transfer letter" becomes transfer_letter.
  const slug = query.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^[^a-z]+|_+$/g, '').slice(0, 40);
  const types = [...known.filter((k) => k.label.toLowerCase().includes(query.toLowerCase())), ...(slug.length >= 2 && !known.some((k) => k.value === slug) ? [{ value: slug, label: `New letter type: ${query.trim()}` }] : [])];
  const go = async () => {
    if (!starter) {
      onSpec({ letterType: type!, name: name.trim(), legalEntityId: entity || null, requiresApproval: approval === 'approval', personSigns: signs === 'yes' });
      return;
    }
    setBusy(true);
    setFailed(null);
    try {
      await onStarter(from);
    } catch (e) {
      setFailed(failText(e));
      setBusy(false);
    }
  };
  return (
    <Drawer
      open
      onOpenChange={(o) => !o && onClose()}
      size="md"
      title={mode === 'upload' ? 'Upload a Word template' : 'New template'}
      notice={failed && <InlineAlert tone="danger" title={failed} />}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" disabled={!starter && (name.trim().length < 2 || !type)} loading={busy} onClick={() => void go()}>
            {starter ? 'Add starter' : 'Continue'}
          </Button>
        </>
      }
    >
      <div className="yx-ppl__form">
        {mode === 'new' && (
          <FormField label="Start from" required>
            <Select aria-label="Start from" options={[{ value: 'blank', label: 'A blank letter' }, ...data.starters.map((s) => ({ value: s.letterType, label: s.update ? `${s.name} (new version)` : s.name }))]} value={from} onChange={(v) => setFrom(v ?? 'blank')} />
          </FormField>
        )}
        {!starter && (
          <>
            <FormField label="Name" required>
              <TextField value={name} onChange={setName} maxLength={100} />
            </FormField>
            <FormField label="Letter type" required helper="A letter type can have several templates. Type a new one to add it.">
              <Select aria-label="Letter type" options={types} value={type} onChange={setType} searchable onSearchChange={setQuery} />
            </FormField>
            {entities.length > 1 && (
              <FormField label="Letterhead">
                <Select aria-label="Letterhead" options={[{ value: '', label: "Each person's legal entity" }, ...entities]} value={entity} onChange={(v) => setEntity(v ?? '')} />
              </FormField>
            )}
            <FormField label="Before issue" helper="Approval: the legal entity's signatory approves each letter first.">
              <Segment label="Before issue" value={approval} onChange={setApproval} options={[{ value: 'instant', label: 'Instant' }, { value: 'approval', label: 'Approval' }]} />
            </FormField>
            <FormField label="The person">
              <Segment label="The person" value={signs} onChange={setSigns} options={[{ value: 'no', label: 'Only receives it' }, { value: 'yes', label: 'Accepts it' }]} />
            </FormField>
          </>
        )}
      </div>
    </Drawer>
  );
}

type UploadReport = { file: File; fixes: Record<string, string>; unknown?: Record<string, string>; refused?: string };

// PPL-29 · template workspace, live: the designed workspace for one template (or a new one not saved yet).
function LiveTemplateWorkspace({ live, ws, onChange }: { live: LiveLetterTemplates; ws: Workspace; onChange: (ws: Workspace) => void }) {
  const { t, spec } = ws;
  const d = live.data;
  const { toast } = useToast();
  const [viewed, setViewed] = useState(t?.previewViewed ?? false);
  const [activating, setActivating] = useState(false);
  const [fileName, setFileName] = useState(t ? `${t.letterType}-v${t.version}.docx` : '');
  const [report, setReport] = useState<UploadReport | null>(null);
  // The editor: a template made in YukthiX loads its paragraphs; kept here so switching tabs keeps unsaved text.
  const [html, setHtml] = useState<string | null>(t && t.source !== 'upload' ? null : BLANK_LETTER);
  const [editorError, setEditorError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (!t || t.source === 'upload') return;
    live.onParagraphs(t).then(
      (ps) => setHtml(toHtml(ps)),
      (e) => setEditorError(failText(e)),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per template version (the workspace is keyed by it)
  }, []);
  const saved = (n: LetterTemplate) => {
    toast({ tone: 'success', title: `${n.name} version ${n.version} saved as a draft` });
    onChange({ t: n, spec: specOf(n), tab: ws.tab });
  };
  const send = async (file: File, fixes: Record<string, string>) => {
    setFileName(file.name);
    try {
      saved(await live.onUpload({ ...spec, file, ...(Object.keys(fixes).length ? { fixes } : {}) }));
      return true;
    } catch (e) {
      const err = e as { code?: string; body?: { errors?: Record<string, string> } };
      setReport({ file, fixes, ...(err.code === 'TEMPLATE_FIELDS' ? { unknown: err.body?.errors ?? {} } : { refused: failText(e) }) });
      return false;
    }
  };
  const activate = async () => {
    setActivating(true);
    try {
      await live.onStatus(t!, 'active');
      toast({ tone: 'success', title: `${t!.name} is now in use` });
      onChange({ ...ws, t: { ...t!, status: 'active' } });
    } catch (e) {
      toast({ tone: 'error', title: failText(e) });
    } finally {
      setActivating(false);
    }
  };
  const saveEditor = async () => {
    setSaving(true);
    setEditorError(null);
    try {
      saved(await live.onCompose({ ...spec, paragraphs: fromHtml(html ?? '') }));
    } catch (e) {
      setEditorError(failText(e));
      setSaving(false);
    }
  };
  const used = (d?.fields ?? []).filter((f) => t?.fields.includes(f.key));
  const madeWith = t ? MADE_WITH[t.source][0].toLowerCase() + MADE_WITH[t.source].slice(1) : null;
  const draft = t?.status !== 'active';
  return (
    <PeopleFrame active="Documents & letters">
      <ObjectHeader
        breadcrumbs={<Breadcrumbs items={[{ label: 'Letter templates', href: live.listHref }, { label: spec.name }]} />}
        name={spec.name}
        icon={FileUp}
        secondary={t ? `${typeName(d, spec.letterType)} · ${madeWith} · ${LANGUAGE.of(t.language) ?? t.language} · version ${t.version}` : `${typeName(d, spec.letterType)} · not saved yet`}
        status={<Badge tone={draft ? 'neutral' : 'success'}>{draft ? 'Draft' : 'Active'}</Badge>}
        actions={
          <>
            <Button icon={Download} disabled={!t} onClick={() => t && live.onWord(t)}>
              Download as Word
            </Button>
            {draft && (
              <Button variant="primary" disabled={!t || !viewed} loading={activating} onClick={() => void activate()}>
                Activate
              </Button>
            )}
          </>
        }
      />
      {draft && !viewed && <InlineAlert tone="info">View a test render with a sample employee before you activate this template.</InlineAlert>}
      <Tabs value={ws.tab} onValueChange={(v) => onChange({ ...ws, tab: v as TemplateTab })}>
        <TabsList aria-label="Template">
          <TabsTrigger value="upload">Word upload</TabsTrigger>
          <TabsTrigger value="editor">Editor</TabsTrigger>
          <TabsTrigger value="fields">Field cheat-sheet</TabsTrigger>
          <TabsTrigger value="test">Test render</TabsTrigger>
        </TabsList>
        <TabsContent value="upload">
          <div className="yx-ppl__stack">
            <FileUpload
              upload={async (file) => {
                if (!(await send(file, {}))) throw new Error('Not saved: see the validation report.');
              }}
              accept={['.docx']}
              maxSize={20 * 1024 * 1024}
              multiple={false}
            />
            {(report || t) && (
              <Card title={`Validation report · ${report?.file.name ?? fileName}`}>
                <ul className="yx-ppl__successors">
                  {report?.refused && (
                    <li>
                      <span>{report.refused}</span>
                      <Badge tone="danger">Refused</Badge>
                    </li>
                  )}
                  {report?.unknown &&
                    Object.entries(report.unknown).map(([k, s]) => (
                      <li key={k}>
                        <span>
                          Unknown placeholder <code className="yx-ppl__code">{`{{${k}}}`}</code>.
                          {s && (
                            <>
                              {' '}
                              Did you mean <code className="yx-ppl__code">{`{{${s}}}`}</code>?
                            </>
                          )}
                        </span>
                        {s ? (
                          <Button size="sm" onClick={() => void send(report.file, { ...report.fixes, [k]: s })}>
                            Use suggestion
                          </Button>
                        ) : (
                          <Badge tone="danger">Fix in Word</Badge>
                        )}
                      </li>
                    ))}
                  {!report && t && (
                    <>
                      <li>
                        <span>{`${t.fields.length} ${t.fields.length === 1 ? 'placeholder matches' : 'placeholders match'} the field registry`}</span>
                        <Badge tone="success">OK</Badge>
                      </li>
                      {used
                        .filter((f) => f.flag)
                        .map((f) => (
                          <li key={f.key}>
                            <span>
                              Conditional <code className="yx-ppl__code">{tagOf(f)}</code>
                            </span>
                            <Badge tone="success">OK</Badge>
                          </li>
                        ))}
                      {used
                        .filter((f) => f.cls !== 'internal')
                        .map((f) => (
                          <li key={f.key}>
                            <span>
                              <code className="yx-ppl__code">{tagOf(f)}</code> is {FIELD_CLASS[f.cls]}. Issuers without that class can't generate this letter.
                            </span>
                            <Badge tone="warning">Check</Badge>
                          </li>
                        ))}
                    </>
                  )}
                </ul>
              </Card>
            )}
          </div>
        </TabsContent>
        <TabsContent value="editor">
          {t?.source === 'upload' ? (
            <InlineAlert tone="info" title="This template is a Word file">
              Download it, change it in Word and upload it again: it becomes the next version.
            </InlineAlert>
          ) : (
            <div className="yx-ppl__stack">
              {editorError && <InlineAlert tone="danger" title={editorError} />}
              <div className="yx-ppl__row">
                <Select aria-label="Letterhead" size="sm" options={[{ value: '', label: "Letterhead: each person's legal entity" }, ...live.entities.map((e) => ({ value: e.value, label: `Letterhead: ${e.label}` }))]} value={spec.legalEntityId ?? ''} onChange={(v) => onChange({ ...ws, spec: { ...spec, legalEntityId: v || null } })} />
                <Select aria-label="Language" size="sm" options={[{ value: 'en', label: 'English' }]} value="en" onChange={() => {}} disabled />
              </div>
              {html === null ? (
                <Skeleton height="var(--yx-space-16)" />
              ) : (
                <RichTextEditor
                  aria-label="Letter body"
                  value={html}
                  onChange={setHtml}
                  // A yes / no field goes in as its section: {{#probation}} … {{/probation}}.
                  mergeFields={(d?.fields ?? []).map((f) => ({ value: f.flag ? `#${f.key}}} … {{/${f.key}` : f.key, label: f.label }))}
                />
              )}
              <div>
                <Button variant="primary" disabled={html === null} loading={saving} onClick={() => void saveEditor()}>
                  {t ? 'Save as a new version' : 'Save draft'}
                </Button>
              </div>
            </div>
          )}
        </TabsContent>
        <TabsContent value="fields">
          <Card title="Fields you can use">
            <ul className="yx-ppl__cheats">
              {(d?.fields ?? []).map((f) => (
                <li key={f.key}>
                  <span>
                    <code className="yx-ppl__code">{tagOf(f)}</code> {f.label}
                  </span>
                  <span className="yx-ppl__row">
                    <ClassBadge cls={FIELD_CLASS[f.cls]} />
                    <IconButton
                      icon={Copy}
                      size="sm"
                      label={`Copy ${tagOf(f)}`}
                      onClick={() => void navigator.clipboard?.writeText(f.flag ? `{{#${f.key}}} … {{/${f.key}}}` : tagOf(f)).then(() => toast({ tone: 'success', title: `${tagOf(f)} copied` }))}
                    />
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        </TabsContent>
        <TabsContent value="test">{t ? <TestRender live={live} t={t} viewed={viewed} onViewed={() => setViewed(true)} /> : <InlineAlert tone="info">Upload a Word file or save the editor first. Then make a test render.</InlineAlert>}</TabsContent>
      </Tabs>
    </PeopleFrame>
  );
}

// PPL-29 · test render, live: the server's PDF for sample data or a real person; making it counts as viewing it.
function TestRender({ live, t, viewed, onViewed }: { live: LiveLetterTemplates; t: LetterTemplate; viewed: boolean; onViewed: () => void }) {
  const [who, setWho] = useState('sample');
  const [preview, setPreview] = useState<LetterPreview>(null);
  const [attempt, setAttempt] = useState(0);
  const person = live.people.find((p) => p.value === who);
  useEffect(() => {
    setPreview(null);
    let gone = false;
    live.onTestRender(t, person?.value ?? null).then(
      (url) => {
        if (gone) return;
        setPreview({ url });
        onViewed();
      },
      (e: { code?: string; body?: { errors?: Record<string, string> } }) => {
        if (gone) return;
        const missing = e?.code === 'LETTER_FIELDS_MISSING' ? e.body?.errors : undefined;
        setPreview(missing ? { missing } : { failed: failText(e) });
      },
    );
    return () => {
      gone = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- a new render when the person changes or on retry
  }, [who, attempt]);
  return (
    <div className="yx-ppl__stack">
      <FormField label="Sample employee">
        <Select aria-label="Sample employee" options={[{ value: 'sample', label: 'Sample data (a made-up person)' }, ...live.people]} value={who} onChange={(v) => setWho(v ?? 'sample')} />
      </FormField>
      {preview && 'missing' in preview ? (
        <InlineAlert tone="danger" title="We can't generate this letter yet">
          {missingText(person?.label.split(' ')[0] ?? 'the person', preview.missing)}
        </InlineAlert>
      ) : preview && 'failed' in preview ? (
        <InlineAlert tone="danger" title="We couldn't make the test render">
          {preview.failed}
        </InlineAlert>
      ) : (
        <div className="yx-ppl__letter" tabIndex={0} role="region" aria-label="Test render preview">
          {preview ? <PdfPages url={preview.url} label={`${t.name}, test render`} /> : <Skeleton height="var(--yx-space-16)" />}
        </div>
      )}
      <div>
        <Button disabled={viewed || !preview} onClick={() => setAttempt((n) => n + 1)}>
          {viewed ? 'Preview viewed' : 'Mark preview as viewed'}
        </Button>
      </div>
    </div>
  );
}

/* ================================================================== PPL-30 my documents */

type Doc = (typeof MY_DOCS)[number];
const docTone = (s: string) => (s.startsWith('Verified') || s.startsWith('Accepted') || s.startsWith('Published') || s.startsWith('Acknowledged') || s.startsWith('Valid') ? 'success' : s.startsWith('Expiring') || s.startsWith('Pending') ? 'warning' : 'neutral');

// PPL-30
export function MyDocuments({ rows, shareOpen = false }: { rows: Doc[]; shareOpen?: boolean }) {
  const [share, setShare] = useState(shareOpen);
  const [days, setDays] = useState<string | null>('7');
  const cols: TableColumn<Doc>[] = [
    { key: 'name', header: 'Document', value: (r) => r.name, width: 320 },
    { key: 'kind', header: 'Kind', value: (r) => r.kind, groupable: true, width: 120 },
    { key: 'date', header: 'Date', type: 'date', value: (r) => r.date, width: 130 },
    { key: 'size', header: 'Size', value: (r) => formatBytes(r.size), width: 100 },
    { key: 'status', header: 'Status', type: 'status', value: (r) => r.status, statusTone: (v) => docTone(String(v)), width: 200 },
  ];
  return (
    <MeFrame active="Documents & letters">
      <PageHeader
        title="Documents and letters"
        description="Your uploads, letters, payslips, tax forms, certificates and policies. After you leave, you can still download payslips, Form 16 and letters for 7 years."
        actions={
          <>
            <Button icon={Mail}>Request a certificate</Button>
            <Button variant="primary" icon={Upload}>
              Upload
            </Button>
          </>
        }
      />
      <InlineAlert tone="warning" title="Forklift licence expires on 24 Oct 2026">Upload the renewed licence so your plant access continues.</InlineAlert>
      <DataTable
        label="My documents"
        columns={cols}
        rows={rows}
        getRowId={(r) => r.id}
        rowButtons={() => <IconButton icon={Download} label="Download" size="sm" variant="secondary" />}
        rowActions={() => (
          <>
            <MenuItem icon={Share2} onSelect={() => setShare(true)}>
              Share a link
            </MenuItem>
            <MenuItem icon={Upload}>Upload a new version</MenuItem>
          </>
        )}
        empty={<EmptyState title="No documents yet" description="Upload your PAN, bank proof and certificates. Letters from HR appear here when issued." action={<Button variant="primary">Upload</Button>} />}
      />
      <Dialog
        open={share}
        onOpenChange={setShare}
        title="Share Payslip, August 2026"
        description="For a loan or visa application. The link expires and every download is logged."
        footer={
          <>
            <Button onClick={() => setShare(false)}>Close</Button>
            <Button variant="primary" icon={Link2}>
              Copy link
            </Button>
          </>
        }
      >
        <div className="yx-ppl__stack">
          <FormField label="Link works for">
            <Select options={[{ value: '1', label: '1 day' }, { value: '7', label: '7 days' }, { value: '30', label: '30 days' }]} value={days} onChange={setDays} />
          </FormField>
          <TextField readOnly value="https://docs.kaverifoods.in/s/7Qm2-Xk9p" aria-label="Share link" />
        </div>
      </Dialog>
    </MeFrame>
  );
}

// PPL-30 · phone
export function MyDocumentsPhone({ rows, cameraOpen = false }: { rows: Doc[]; cameraOpen?: boolean }) {
  const [camera, setCamera] = useState(cameraOpen);
  return (
    <PhoneFrame tab="me" title="Documents" actions={<IconButton icon={Camera} label="Upload with camera" onClick={() => setCamera(true)} />}>
      {rows.length ? (
        <ul className="yx-ppl__phone-list" aria-label="My documents">
          {rows.map((r) => (
            <li key={r.id} className="yx-ppl__phone-row">
              <div className="yx-ppl__phone-btn">
                <span>
                  {r.name}
                  <Text size="sm" tone="secondary" as="div">{r.kind} · {formatDate(r.date)}</Text>
                </span>
                <Badge tone={docTone(r.status)}>{r.status}</Badge>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState compact title="No documents yet" description="Take a photo of your PAN or bank proof to upload." action={<Button variant="primary" onClick={() => setCamera(true)}>Upload with camera</Button>} />
      )}
      <BottomSheet
        open={camera}
        onOpenChange={setCamera}
        title="Upload with camera"
        footer={
          <>
            <Button onClick={() => setCamera(false)}>Cancel</Button>
            <Button variant="primary">Take photo</Button>
          </>
        }
      >
        <div className="yx-ppl__stack">
          <FormField label="Document type" required>
            <Select options={[{ value: 'fl', label: 'Forklift licence' }, { value: 'pan', label: 'PAN card' }]} value="fl" onChange={() => {}} />
          </FormField>
          <div className="yx-ppl__camera" role="img" aria-label="Camera preview placeholder">
            <svg viewBox="0 0 80 80" aria-hidden="true">
              <rect x="8" y="16" width="64" height="48" rx="4" />
              <circle cx="40" cy="40" r="12" />
            </svg>
            <span>Hold the card inside the frame</span>
          </div>
        </div>
      </BottomSheet>
    </PhoneFrame>
  );
}

/* ================================================================== PPL-31 certificate request */

export type CertType = 'salary' | 'address' | 'employment' | 'noc';
const CERT_LABEL: Record<CertType, string> = { salary: 'Salary certificate', address: 'Address proof', employment: 'Employment verification', noc: 'No objection certificate (NOC)' };

function CertFields({ type, setType }: { type: CertType; setType: (t: CertType) => void }) {
  return (
    <div className="yx-ppl__form">
      <FormField label="Certificate" required>
        <RadioGroup
          value={type}
          onChange={(v) => setType(v as CertType)}
          options={(Object.keys(CERT_LABEL) as CertType[]).map((k) => ({ value: k, label: CERT_LABEL[k], description: k === 'noc' ? 'Needs HR approval (company setting)' : 'Ready instantly' }))}
        />
      </FormField>
      <FormField label="Purpose" required>
        <Select options={['Home loan', 'Visa application', 'Rental agreement', 'Higher studies'].map((x) => ({ value: x, label: x }))} value="Home loan" onChange={() => {}} />
      </FormField>
      <FormField label="Addressed to" optional>
        <TextField defaultValue="The Branch Manager, Canara Bank, Hosur" />
      </FormField>
    </div>
  );
}

// PPL-31
export function CertificateRequest({ type: initial = 'salary', generated = false, today }: { type?: CertType; generated?: boolean; today: Date }) {
  const [type, setType] = useState<CertType>(initial);
  return (
    <MeFrame active="Documents & letters">
      <PageHeader title="Request a certificate" description="Salary certificate, address proof and employment verification are generated instantly with the company signatory and a QR code anyone can verify." />
      {generated && type !== 'noc' ? (
        <div className="yx-ppl__stack">
          <InlineAlert tone="success" title={`${CERT_LABEL[type]} ready · KF/HR/2026/0422`}>It is in your documents. Verification code 7QM2-XK9P. HR can see that you requested it.</InlineAlert>
          <div className="yx-ppl__letter" tabIndex={0} role="region" aria-label="Certificate preview">
            <LetterDocument
              data={{
                company: KAVERI,
                date: today,
                reference: 'KF/HR/2026/0422',
                recipient: { name: 'The Branch Manager', lines: ['Canara Bank, Hosur'] },
                subject: 'Salary certificate',
                body: <><p>This is to certify that Divya Raghunathan (KF-0001) is employed with Kaveri Foods Pvt Ltd as Senior QA Engineer since 4 July 2019. Her gross monthly salary is ₹1,12,400.</p><p>This certificate is issued at her request for a home loan.</p></>,
                signatory: { name: 'Lakshmi Venkatesan', designation: 'Head of People' },
              }}
            />
          </div>
          <div className="yx-ppl__row">
            <Button icon={Share2}>Share a link</Button>
            <Button variant="primary" icon={Download}>
              Download PDF
            </Button>
          </div>
        </div>
      ) : generated && type === 'noc' ? (
        <Card title="NOC request sent">
          <ApprovalTimeline now={today} steps={[{ id: '1', label: 'Requested', status: 'done', approver: 'You', at: today }, { id: '2', label: 'HR', status: 'current', approver: 'Lakshmi Venkatesan' }]} />
        </Card>
      ) : (
        <>
          <CertFields type={type} setType={setType} />
          <div className="yx-ppl__row">
            <Button>Cancel</Button>
            <Button variant="primary">{type === 'noc' ? 'Send to HR' : 'Generate certificate'}</Button>
          </div>
        </>
      )}
    </MeFrame>
  );
}

// PPL-31 · phone
export function CertificateRequestPhone() {
  const [type, setType] = useState<CertType>('address');
  return (
    <PhoneFrame tab="requests" title="Certificate">
      <CertFields type={type} setType={setType} />
      <Button variant="primary" fullWidth>
        {type === 'noc' ? 'Send to HR' : 'Generate certificate'}
      </Button>
    </PhoneFrame>
  );
}
