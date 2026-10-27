import { useState } from 'react';
import { Copy, Mail, Plus, Upload } from 'lucide-react';
import { Button } from '../../../components/button';
import { Badge, type BadgeTone } from '../../../components/display';
import { EmptyState, InlineAlert, Pagination } from '../../../components/feedback';
import { FormField } from '../../../components/field';
import { Text } from '../../../components/foundations';
import { TextArea, TextField } from '../../../components/inputs';
import { MenuItem } from '../../../components/menu';
import { ConfirmDialog } from '../../../components/overlay';
import { Segment } from '../../../components/segment';
import { Select } from '../../../components/select';
import { DataTable, type TableColumn } from '../../../components/table';
import { FileUpload } from '../../../components/upload';
import { LivePage, dateText } from '../../time/live/kit';
import { CustomFieldInputs, missingRequired, type CustomValues } from './fields';
import type { CandidateInput, CandidateRow, Choice, EmailCompose, EmailTemplateChoice, GlobalStage, JobCustomField, LoadState, TalentList, UploadInviteResult } from './types';

// Recruitment batch AT4, wired (M10-BUILD-DESIGN §7): the candidates list that replaces the older /v2/candidates page,
// at parity: search, active / inactive, stage, add and edit (with custom fields), upload and invite, invite to an
// assessment, email, add to a list, re-engage, deactivate, delete (never-invited only), possible duplicates.

export const STAGE: Record<GlobalStage, { label: string; tone: BadgeTone }> = {
  new: { label: 'New', tone: 'neutral' },
  in_review: { label: 'In review', tone: 'info' },
  engaged: { label: 'Engaged', tone: 'info' },
  available: { label: 'Available', tone: 'success' },
  offered: { label: 'Offered', tone: 'warning' },
  hired: { label: 'Hired', tone: 'success' },
  rejected: { label: 'Rejected', tone: 'danger' },
};

export type CandidateStatusFilter = 'active' | 'inactive' | 'all';

export interface HiringCandidatesScreenProps {
  state: LoadState;
  onRetry?: () => void;
  rows: CandidateRow[];
  total: number;
  page: number;
  pageSize: number;
  onPage: (page: number) => void;
  search: string;
  onSearch: (q: string) => void;
  status: CandidateStatusFilter;
  onStatus: (s: CandidateStatusFilter) => void;
  stage: GlobalStage | null;
  onStage: (s: GlobalStage | null) => void;
  canManage: boolean;
  customFields: JobCustomField[];
  exams: Choice[];
  openJobs: Choice[];
  lists: TalentList[];
  templates: EmailTemplateChoice[];
  senders: Choice[];
  duplicatesCount?: number;
  onOpen: (id: string) => void;
  onDuplicates: () => void;
  onCreate: (c: CandidateInput) => Promise<unknown>;
  onUpdate: (id: string, c: Partial<CandidateInput> & { status?: 'active' | 'inactive' }) => Promise<unknown>;
  onDelete: (ids: string[]) => Promise<{ deleted: number; skipped: number }>;
  onInvite: (examId: string, ids: string[]) => Promise<{ invited: number; skipped: number }>;
  onUploadInvite: (examId: string, file: File) => Promise<UploadInviteResult>;
  onDownloadTemplate: () => Promise<unknown>;
  onEmail: (ids: string[], c: EmailCompose) => Promise<{ total: number }>;
  onAddToList: (listId: string, ids: string[]) => Promise<{ added: number; refused: string[] }>;
  onReengage: (jobId: string, candidateId: string) => Promise<unknown>;
}

export function HiringCandidatesScreen(p: HiringCandidatesScreenProps) {
  const [selected, setSelected] = useState<string[]>([]);
  const [notice, setNotice] = useState<{ tone: 'success' | 'danger'; text: string } | null>(null);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<CandidateRow | null>(null);
  const [uploading, setUploading] = useState(false);
  const [inviting, setInviting] = useState<string[] | null>(null);
  const [emailing, setEmailing] = useState<string[] | null>(null);
  const [listing, setListing] = useState<string[] | null>(null);
  const [deleting, setDeleting] = useState<string[] | null>(null);
  const [reengaging, setReengaging] = useState<CandidateRow | null>(null);
  const done = (text: string, tone: 'success' | 'danger' = 'success') => { setNotice({ tone, text }); setSelected([]); };

  const columns: TableColumn<CandidateRow>[] = [
    { key: 'n', header: 'Name', value: (x) => x.name, width: 220, hideable: false },
    { key: 'e', header: 'Email', value: (x) => x.email, width: 260 },
    { key: 'p', header: 'Phone', value: (x) => x.phone ?? '', width: 160 },
    { key: 'g', header: 'Stage', value: (x) => x.globalStage, render: (x) => <Badge tone={STAGE[x.globalStage].tone}>{STAGE[x.globalStage].label}</Badge>, width: 140 },
    { key: 's', header: 'Status', value: (x) => x.status, render: (x) => <Badge tone={x.status === 'active' ? 'success' : 'neutral'}>{x.status === 'active' ? 'Active' : 'Inactive'}</Badge>, width: 120 },
    { key: 'c', header: 'Added', value: (x) => x.createdAt, render: (x) => <span>{dateText(x.createdAt.slice(0, 10))}</span>, width: 140 },
  ];

  return (
    <LivePage
      title="Candidates"
      description="Everyone who applied or was added, across all jobs."
      state={p.state}
      onRetry={p.onRetry}
      what="candidates"
      grantedBy="your admin"
      actions={
        p.canManage && (
          <>
            <Button icon={Copy} onClick={p.onDuplicates}>
              {p.duplicatesCount ? `Possible duplicates (${p.duplicatesCount})` : 'Possible duplicates'}
            </Button>
            <Button icon={Upload} onClick={() => setUploading(true)}>
              Upload and invite
            </Button>
            <Button variant="primary" icon={Plus} onClick={() => setAdding(true)}>
              Add candidate
            </Button>
          </>
        )
      }
    >
      {notice && (
        <InlineAlert tone={notice.tone} title={notice.tone === 'success' ? 'Done' : 'Not done'}>
          {notice.text}
        </InlineAlert>
      )}
      <Segment label="Show" value={p.status} onChange={p.onStatus} options={[{ value: 'active', label: 'Active' }, { value: 'inactive', label: 'Inactive' }, { value: 'all', label: 'All' }]} />
      <div className="yx-tim-row">
        <FormField id="hc-search" label="Search candidates" hideLabel>
          <TextField value={p.search} onChange={p.onSearch} placeholder="Search by name or email" maxLength={200} />
        </FormField>
        <FormField id="hc-stage" label="Stage" hideLabel>
          <Select aria-label="Stage" placeholder="All stages" value={p.stage} onChange={(v) => p.onStage(v as GlobalStage | null)} options={(Object.keys(STAGE) as GlobalStage[]).map((s) => ({ value: s, label: STAGE[s].label }))} clearable />
        </FormField>
      </div>
      <DataTable
        label="Candidates"
        columns={columns}
        rows={p.rows}
        getRowId={(x) => x.id}
        rowNoun={['candidate', 'candidates']}
        cardSummary
        filtered={Boolean(p.search || p.stage || p.status !== 'active')}
        empty={<EmptyState compact title={p.search || p.stage ? 'No matches.' : 'No candidates yet.'} />}
        selectable={p.canManage}
        selectedIds={selected}
        onSelectedChange={setSelected}
        bulkActions={(ids) => (
          <>
            <Button size="sm" onClick={() => setInviting(ids)}>Invite to an assessment</Button>
            <Button size="sm" icon={Mail} onClick={() => setEmailing(ids)}>Email selected</Button>
            <Button size="sm" onClick={() => setListing(ids)}>Add to a list</Button>
            <Button size="sm" variant="danger" onClick={() => setDeleting(ids)}>Delete</Button>
          </>
        )}
        rowButtons={(x) => (
          <Button size="sm" onClick={() => p.onOpen(x.id)}>
            Open
          </Button>
        )}
        rowActions={(x) =>
          p.canManage ? (
            <>
              <MenuItem onSelect={() => setEditing(x)}>Edit</MenuItem>
              {x.globalStage === 'available' && <MenuItem onSelect={() => setReengaging(x)}>Re-engage for a job</MenuItem>}
              <MenuItem onSelect={() => void p.onUpdate(x.id, { status: x.status === 'active' ? 'inactive' : 'active' }).then(() => done(x.status === 'active' ? `${x.name} deactivated.` : `${x.name} reactivated.`))}>{x.status === 'active' ? 'Deactivate' : 'Reactivate'}</MenuItem>
              {x.neverInvited && <MenuItem destructive onSelect={() => setDeleting([x.id])}>Delete</MenuItem>}
            </>
          ) : null
        }
      />
      <Pagination page={p.page} pageSize={p.pageSize} total={p.total} onPageChange={p.onPage} />

      {(adding || editing) && <CandidateDialog {...p} candidate={editing} onClose={() => { setAdding(false); setEditing(null); }} onSaved={(t) => done(t)} />}
      {uploading && <UploadInviteDialog {...p} onClose={() => setUploading(false)} />}
      {inviting && (
        <PickDialog title={`Invite ${inviting.length} to an assessment`} label="Assessment" options={p.exams} confirm="Send invitations" onClose={() => setInviting(null)} onConfirm={async (examId) => {
          const r = await p.onInvite(examId, inviting);
          done(`Invited ${r.invited}.${r.skipped ? ` ${r.skipped} skipped (already invited).` : ''}`);
        }} />
      )}
      {listing && (
        <PickDialog title={`Add ${listing.length} to a list`} label="List" options={p.lists.map((l) => ({ value: l.id, label: `${l.name} (${l.kind === 'pool' ? 'talent pool' : 'hotlist'})` }))} confirm="Add to list" note="A talent pool takes only candidates who agreed to be kept for other roles." onClose={() => setListing(null)} onConfirm={async (listId) => {
          const r = await p.onAddToList(listId, listing);
          done(`Added ${r.added}.${r.refused.length ? ` ${r.refused.length} not added: they did not agree to be kept for other roles.` : ''}`);
        }} />
      )}
      {reengaging && (
        <PickDialog title={`Re-engage ${reengaging.name}`} label="Job" options={p.openJobs} confirm="Add to job" onClose={() => setReengaging(null)} onConfirm={async (jobId) => {
          await p.onReengage(jobId, reengaging.id);
          done(`${reengaging.name} added to the job.`);
        }} />
      )}
      {emailing && <EmailDialog count={emailing.length} templates={p.templates} senders={p.senders} onClose={() => setEmailing(null)} onSend={async (c) => {
        const r = await p.onEmail(emailing, c);
        done(`Sending ${r.total} email${r.total === 1 ? '' : 's'}. Candidates who opted out are skipped.`);
      }} />}
      {deleting && (
        <ConfirmDialog open destructive onOpenChange={(o) => !o && setDeleting(null)} title={`Delete ${deleting.length === 1 ? 'this candidate' : `${deleting.length} candidates`}?`} consequence="Only candidates never invited to an assessment are deleted; the others are skipped (erase them instead)." confirmLabel="Delete" onConfirm={async () => {
          const r = await p.onDelete(deleting);
          setDeleting(null);
          done(`Deleted ${r.deleted}.${r.skipped ? ` ${r.skipped} skipped.` : ''}`);
        }} />
      )}
    </LivePage>
  );
}

function CandidateDialog(p: HiringCandidatesScreenProps & { candidate: CandidateRow | null; onClose: () => void; onSaved: (text: string) => void }) {
  const c = p.candidate;
  const [name, setName] = useState(c?.name ?? '');
  const [email, setEmail] = useState(c?.email ?? '');
  const [phone, setPhone] = useState(c?.phone ?? '');
  const [custom, setCustom] = useState<CustomValues>(c?.customFields ?? {});
  const emailBad = email !== '' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  const ok = name.trim() && email.trim() && !emailBad && !missingRequired(p.customFields, custom).length;
  const [tried, setTried] = useState(false);
  return (
    <ConfirmDialog open size="md" onOpenChange={(o) => !o && p.onClose()} title={c ? `Edit ${c.name}` : 'Add candidate'} confirmLabel={c ? 'Save' : 'Add candidate'} onConfirm={async () => {
      setTried(true);
      if (!ok) return false;
      const input = { name: name.trim(), email: email.trim(), phone: phone.trim() || undefined, customFields: Object.keys(custom).length ? custom : undefined };
      if (c) await p.onUpdate(c.id, input);
      else await p.onCreate(input);
      p.onClose();
      p.onSaved(c ? `${input.name} saved.` : `${input.name} added.`);
    }}>
      <FormField id="hc-name" label="Name" required error={tried && !name.trim() ? 'Enter the name.' : null}>
        <TextField value={name} onChange={setName} maxLength={200} />
      </FormField>
      <FormField id="hc-email" label="Email" required error={emailBad ? 'Enter a valid email address.' : tried && !email.trim() ? 'Enter the email address.' : undefined}>
        <TextField type="email" value={email} onChange={setEmail} maxLength={254} />
      </FormField>
      <FormField id="hc-phone" label="Phone" optional>
        <TextField type="tel" value={phone} onChange={setPhone} maxLength={30} />
      </FormField>
      <CustomFieldInputs fields={p.customFields} values={custom} onChange={setCustom} idPrefix="hc" tried={tried} />
    </ConfirmDialog>
  );
}

function UploadInviteDialog(p: HiringCandidatesScreenProps & { onClose: () => void }) {
  const [exam, setExam] = useState<string | null>(null);
  const [result, setResult] = useState<UploadInviteResult | null>(null);
  return (
    <ConfirmDialog open size="md" onOpenChange={(o) => !o && p.onClose()} title="Upload and invite" confirmLabel="Close" onConfirm={() => p.onClose()}>
      <Text as="p" tone="secondary">Add candidates from a spreadsheet and invite them to an assessment in one go. New emails become candidates; known ones are invited.</Text>
      <div>
        <Button size="sm" onClick={() => void p.onDownloadTemplate()}>Download the template</Button>
      </div>
      <FormField id="hc-up-exam" label="Assessment" required>
        <Select aria-label="Assessment" value={exam} onChange={setExam} options={p.exams} searchable />
      </FormField>
      <FormField id="hc-up-file" label="Candidate file" required helper="Excel (.xlsx) or CSV, up to 5 MB.">
        <FileUpload id="hc-up-file" accept={['.xlsx', '.csv']} maxSize={5 * 1024 * 1024} multiple={false} disabled={!exam} upload={async (file) => { setResult(await p.onUploadInvite(exam!, file)); }} />
      </FormField>
      {result && (
        <InlineAlert tone={result.errors.length ? 'warning' : 'success'} title={`Invited ${result.invited}${result.skipped ? `, skipped ${result.skipped}` : ''}`}>
          {result.errors.length ? result.errors.slice(0, 10).map((e) => `Row ${e.row}: ${e.message}`).join(' · ') : 'Every row was read.'}
        </InlineAlert>
      )}
    </ConfirmDialog>
  );
}

function PickDialog(p: { title: string; label: string; options: Choice[]; confirm: string; note?: string; onClose: () => void; onConfirm: (value: string) => Promise<void> }) {
  const [value, setValue] = useState<string | null>(null);
  const [tried, setTried] = useState(false);
  return (
    <ConfirmDialog open onOpenChange={(o) => !o && p.onClose()} title={p.title} confirmLabel={p.confirm} onConfirm={async () => {
      setTried(true);
      if (!value) return false;
      await p.onConfirm(value);
      p.onClose();
    }}>
      {p.note && <Text as="p" tone="secondary">{p.note}</Text>}
      <FormField id="hc-pick" label={p.label} required error={tried && !value ? `Choose the ${p.label.toLowerCase()}.` : null}>
        <Select aria-label={p.label} value={value} onChange={setValue} options={p.options} searchable />
      </FormField>
    </ConfirmDialog>
  );
}

/** Email one or many candidates from a template (they get their own name and links); used by the list and the profile. */
export function EmailDialog(p: { count: number; templates: EmailTemplateChoice[]; senders: Choice[]; onClose: () => void; onSend: (c: EmailCompose) => Promise<void> }) {
  const [template, setTemplate] = useState<string | null>(null);
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [sender, setSender] = useState<string | null>(null);
  const [tried, setTried] = useState(false);
  const pick = (v: string | null) => {
    setTemplate(v);
    const t = p.templates.find((x) => x.value === v);
    if (t) { setSubject(t.subject); setBody(t.body); }
  };
  return (
    <ConfirmDialog open size="md" onOpenChange={(o) => !o && p.onClose()} title={p.count === 1 ? 'Email the candidate' : `Email ${p.count} candidates`} confirmLabel="Send" onConfirm={async () => {
      setTried(true);
      if (!subject.trim() || !body.trim()) return false;
      const t = p.templates.find((x) => x.value === template);
      await p.onSend({ templateId: t && !t.value.startsWith('default-') ? t.value : null, subject: subject.trim(), body, ...(sender ? { senderAddressId: sender } : {}) });
      p.onClose();
    }}>
      <FormField id="hc-tpl" label="Template" optional>
        <Select aria-label="Template" value={template} onChange={pick} options={p.templates.map((t) => ({ value: t.value, label: t.label }))} clearable />
      </FormField>
      {p.senders.length > 0 && (
        <FormField id="hc-from" label="From" optional>
          <Select aria-label="From" value={sender} onChange={setSender} options={p.senders} clearable />
        </FormField>
      )}
      <FormField id="hc-subj" label="Subject" required error={tried && !subject.trim() ? 'Enter a subject.' : null}>
        <TextField value={subject} onChange={setSubject} maxLength={300} />
      </FormField>
      <FormField id="hc-body" label="Message" required helper="{{candidateName}}, {{jobTitle}}, {{orgName}} and {{statusLink}} are filled in for each candidate." error={tried && !body.trim() ? 'Enter a message.' : null}>
        <TextArea value={body} onChange={setBody} rows={8} maxLength={20000} />
      </FormField>
    </ConfirmDialog>
  );
}
