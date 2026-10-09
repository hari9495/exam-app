// PPL-27 Document verification queue · PPL-28 Issue letter + bulk issue + issued letters register · PPL-29 Letter templates
// PPL-30 My documents & letters · PPL-31 Self-service certificate request (P05 §4.2–4.6, §7, Q7, Q8).
import { useState } from 'react';
import { Camera, Copy, Download, FileUp, Link2, Mail, Plus, Share2, Upload } from 'lucide-react';
import { PhoneFrame } from '../_kit/frames';
import { Button, IconButton } from '../../components/button';
import { Card, ObjectHeader, PageHeader, Tabs, TabsContent, TabsList, TabsTrigger } from '../../components/shell';
import { DataTable, type TableColumn } from '../../components/table';
import { Drawer } from '../../components/drawer';
import { BottomSheet, Dialog, TypeToConfirmDialog } from '../../components/overlay';
import { Badge } from '../../components/display';
import { EmptyState, InlineAlert } from '../../components/feedback';
import { FormField } from '../../components/field';
import { Select } from '../../components/select';
import { TextArea, TextField } from '../../components/inputs';
import { RadioGroup } from '../../components/choice';
import { DocumentViewer } from '../../components/document';
import { RichTextEditor } from '../../components/editor';
import { LetterDocument, type LetterData } from '../../components/print';
import { Stepper } from '../../components/stepper';
import { FileUpload } from '../../components/upload';
import { ApprovalTimeline } from '../../components/timeline';
import { MenuItem } from '../../components/menu';
import { Text } from '../../components/foundations';
import { formatBytes, formatDate } from '../../lib/format';
import type { Persona } from './people-logic';
import { ISSUED_LETTERS, MY_DOCS, TEMPLATES, VERIFY_QUEUE } from './people-data';
import { ClassBadge, MeFrame, PeopleFrame, StatusBadge } from './people-kit';

const SCAN = (title: string) =>
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    `<svg xmlns='http://www.w3.org/2000/svg' width='600' height='380' viewBox='0 0 600 380'><rect x='10' y='10' width='580' height='360' fill='none' stroke='black' stroke-width='2'/><text x='40' y='70' font-family='sans-serif' font-size='28'>${title}</text><text x='40' y='120' font-family='sans-serif' font-size='18'>Sample scan for review</text><rect x='40' y='160' width='140' height='170' fill='none' stroke='black'/><text x='220' y='200' font-family='sans-serif' font-size='18'>Name: K Reddy</text><text x='220' y='240' font-family='sans-serif' font-size='18'>Account: XXXX XXXX 4410</text></svg>`,
  );

const KAVERI = { name: 'Kaveri Foods Pvt Ltd', address: ['4th Floor, Prestige Meridian, MG Road', 'Bengaluru 560001, Karnataka'], registration: 'CIN U15400KA2011PTC058812' };

/* ================================================================== PPL-27 verification queue */

type Verify = (typeof VERIFY_QUEUE)[number];

// PPL-27
export function DocumentVerificationQueue({ rows, defaultOpenId, rejecting = false }: { rows: Verify[]; defaultOpenId?: string; rejecting?: boolean }) {
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

// PPL-28 · register
export function IssuedLettersRegister({ rows }: { rows: Letter[] }) {
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
export function LetterTemplatesList({ rows }: { rows: Tpl[] }) {
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
