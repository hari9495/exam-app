// HIR-05 Candidate list and candidate data retention (founder decision 9: drawn from the kit, then wired). The list keeps
// every function of the AT4 stand-in: search, active / inactive, stage, add and edit with custom fields, upload and
// invite, invite to an assessment, email, add to a list, re-engage, deactivate, delete (never invited only) and the
// possible duplicates with the HIR-05 merge. Retention: the company's period, DPDP data requests (find a person by
// email, export, erase), the nightly sweep's preview and run, and its history.
import { useMemo, useState } from 'react';
import { Copy, Download, Mail, Plus, Search, Trash2, Upload } from 'lucide-react';
import { Badge } from '../../components/display';
import { Button } from '../../components/button';
import { EmptyState, ErrorState, InlineAlert, NoAccessState, Pagination, Skeleton } from '../../components/feedback';
import { FormField } from '../../components/field';
import { Text } from '../../components/foundations';
import { TextField } from '../../components/inputs';
import { MenuItem } from '../../components/menu';
import { useToastIfAny } from '../../components/notify';
import { ConfirmDialog } from '../../components/overlay';
import { Segment } from '../../components/segment';
import { Select } from '../../components/select';
import { Card, DescriptionList, PageHeader, Tabs, TabsContent, TabsList, TabsTrigger } from '../../components/shell';
import { DataTable, type TableColumn } from '../../components/table';
import { CandidateDialog, EmailDialog, PickDialog, STAGE, StageBadge, UploadInviteDialog, istDay } from './candidate-dialogs';
import { HireFrame, SummaryTiles } from './hiring-kit';
import { MergeDrawer, type MergeFieldRow } from './hiring-pipeline';
import type { CandidateInput, CandidateRow, Choice, DuplicatePairView, EmailCompose, EmailTemplateChoice, GlobalStage, JobCustomField, MergeChoices, RetentionPreview, RetentionRunRow, TalentList, UploadInviteResult } from './live/types';
import './hiring.css';

type ListState = 'ready' | 'loading' | 'error';
export type CandidateStatusFilter = 'active' | 'inactive' | 'all';
export type CandidateListTab = 'candidates' | 'duplicates';

const REASON: Record<DuplicatePairView['reasons'][number], string> = { phone: 'Same phone', name_phone: 'Same name and number', resume: 'Similar résumé' };

/** The live list: server paging and filters, and the actions (each resolves when done; the screen shows the toast). */
export interface LiveCandidateList {
  state: ListState;
  onRetry: () => void;
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
  tab: CandidateListTab;
  onTab: (t: CandidateListTab) => void;
  onOpen: (id: string) => void;
  onCreate: (c: CandidateInput) => Promise<unknown>;
  onUpdate: (id: string, c: Partial<CandidateInput> & { status?: 'active' | 'inactive' }) => Promise<unknown>;
  onDelete: (ids: string[]) => Promise<{ deleted: number; skipped: number }>;
  onInvite: (examId: string, ids: string[]) => Promise<{ invited: number; skipped: number }>;
  onUploadInvite: (examId: string, file: File) => Promise<UploadInviteResult>;
  onDownloadTemplate: () => Promise<unknown>;
  onEmail: (ids: string[], c: EmailCompose) => Promise<{ total: number }>;
  onAddToList: (listId: string, ids: string[]) => Promise<{ added: number; refused: string[] }>;
  onReengage: (jobId: string, candidateId: string) => Promise<unknown>;
  onMerge: (keptId: string, mergedId: string, choices: MergeChoices) => Promise<unknown>;
}

export interface CandidateListProps {
  rows: CandidateRow[];
  duplicates: DuplicatePairView[];
  /** candidate:manage (add, edit, invite, email, lists, delete). Without it the list is read-only. */
  canManage?: boolean;
  /** candidate:data_rights: merging duplicates. */
  canMerge?: boolean;
  customFields?: JobCustomField[];
  exams?: Choice[];
  openJobs?: Choice[];
  lists?: TalentList[];
  templates?: EmailTemplateChoice[];
  senders?: Choice[];
  state?: ListState;
  tab?: CandidateListTab;
  /** Story: the pair whose merge drawer is open. */
  mergePair?: number;
  live?: LiveCandidateList;
}

// HIR-05 List
export function CandidateListScreen({ rows: given, duplicates, canManage = true, canMerge = true, customFields = [], exams = [], openJobs = [], lists = [], templates = [], senders = [], state = 'ready', tab: initialTab = 'candidates', mergePair, live }: CandidateListProps) {
  const toast = useToastIfAny();
  const done = (title: string, description?: string): void => void toast?.toast({ tone: 'success', title, description });
  // Sample: filters and paging are local; live: the server does them.
  const [own, setOwn] = useState({ search: '', status: 'active' as CandidateStatusFilter, stage: null as GlobalStage | null, tab: initialTab, page: 1 });
  const search = live ? live.search : own.search;
  const status = live ? live.status : own.status;
  const stage = live ? live.stage : own.stage;
  const tab = live ? live.tab : own.tab;
  const rows = live ? given : given.filter((r) => (status === 'all' || r.status === status) && (!stage || r.globalStage === stage) && `${r.name} ${r.email}`.toLowerCase().includes(search.trim().toLowerCase()));
  const set = <K extends keyof typeof own>(k: K) => (v: (typeof own)[K]) => setOwn((o) => ({ ...o, [k]: v, ...(k === 'tab' ? {} : { page: 1 }) }));
  const [selected, setSelected] = useState<string[]>([]);
  const [dialog, setDialog] = useState<null | { kind: 'add' } | { kind: 'edit'; row: CandidateRow } | { kind: 'upload' } | { kind: 'invite' | 'email' | 'list' | 'delete'; ids: string[] } | { kind: 'reengage'; row: CandidateRow }>(null);
  const [merging, setMerging] = useState<{ pair: DuplicatePairView; keep: 'a' | 'b' } | null>(mergePair != null && duplicates[mergePair] ? { pair: duplicates[mergePair]!, keep: 'a' } : null);
  const after = (title: string, description?: string) => {
    setSelected([]);
    done(title, description);
  };
  const filtered = Boolean(search || stage || status !== 'active');
  const cols: TableColumn<CandidateRow>[] = useMemo(
    () => [
      { key: 'n', header: 'Name', value: (x) => x.name, width: 220, hideable: false },
      { key: 'e', header: 'Email', value: (x) => x.email, width: 260 },
      { key: 'p', header: 'Mobile', value: (x) => x.phone ?? '', width: 160 },
      { key: 'g', header: 'Stage', value: (x) => STAGE[x.globalStage].label, render: (x) => <StageBadge stage={x.globalStage} />, width: 130 },
      { key: 's', header: 'Status', value: (x) => x.status, render: (x) => <Badge tone={x.status === 'active' ? 'success' : 'neutral'}>{x.status === 'active' ? 'Active' : 'Inactive'}</Badge>, width: 110 },
      { key: 'c', header: 'Added', value: (x) => x.createdAt, render: (x) => <span>{istDay(x.createdAt)}</span>, width: 130 },
    ],
    [],
  );
  const pairCols: TableColumn<DuplicatePairView>[] = [
    { key: 'a', header: 'Candidate', value: (x) => x.a.name, render: (x) => <span>{x.a.name} · {x.a.email}</span> },
    { key: 'b', header: 'Possible duplicate', value: (x) => x.b.name, render: (x) => <span>{x.b.name} · {x.b.email}</span> },
    { key: 'r', header: 'Why', value: (x) => x.reasons.join(), render: (x) => <span>{x.reasons.map((r) => REASON[r]).join(', ')}{x.score != null ? ` (${Math.round(x.score * 100)}%)` : ''}</span> },
  ];
  const toolbar = (
    <div className="yx-hire-row">
      <Segment label="Show" value={status} onChange={live ? live.onStatus : set('status')} options={[{ value: 'active', label: 'Active' }, { value: 'inactive', label: 'Inactive' }, { value: 'all', label: 'All' }]} />
      <div className="yx-hire-actions">
        <FormField id="cl-search" label="Search candidates" hideLabel>
          <TextField value={search} onChange={live ? live.onSearch : set('search')} placeholder="Search by name or email" maxLength={200} />
        </FormField>
        <FormField id="cl-stage" label="Stage" hideLabel>
          <Select aria-label="Stage" placeholder="All stages" value={stage} onChange={(v) => (live ? live.onStage : set('stage'))(v as GlobalStage | null)} options={(Object.keys(STAGE) as GlobalStage[]).map((s) => ({ value: s, label: STAGE[s].label }))} clearable />
        </FormField>
      </div>
    </div>
  );
  const kept = merging ? merging.pair[merging.keep] : null;
  const other = merging ? merging.pair[merging.keep === 'a' ? 'b' : 'a'] : null;
  const pairFields: MergeFieldRow[] = kept && other ? [
    { key: 'name', label: 'Name', a: kept.name, b: other.name },
    { key: 'phone', label: 'Mobile', a: kept.phone ?? '(none)', b: other.phone ?? '(none)' },
    { key: 'resume', label: 'Résumé', a: `${kept.name}'s résumé (if any)`, b: `${other.name}'s résumé (if any)` },
  ] : [];
  return (
    <HireFrame active="Candidates & talent CRM">
      <PageHeader
        title="Candidates"
        description="Everyone who applied or was added, across all jobs. Candidate details are personal data: only people with a candidate key see them."
        actions={
          canManage ? (
            <>
              <Button icon={Upload} onClick={() => setDialog({ kind: 'upload' })}>
                Upload and invite
              </Button>
              <Button variant="primary" icon={Plus} onClick={() => setDialog({ kind: 'add' })}>
                Add candidate
              </Button>
            </>
          ) : undefined
        }
      />
      <Tabs value={tab} onValueChange={(t) => (live ? live.onTab : set('tab'))(t as CandidateListTab)}>
        <TabsList aria-label="Candidate lists">
          <TabsTrigger value="candidates" count={live ? live.total : rows.length}>
            Candidates
          </TabsTrigger>
          {canManage && (
            <TabsTrigger value="duplicates" count={duplicates.length}>
              Possible duplicates
            </TabsTrigger>
          )}
        </TabsList>
        <TabsContent value="candidates">
          <div className="yx-hire-stack">
            <DataTable
              label="Candidates"
              columns={cols}
              rows={live ? rows : rows.slice((own.page - 1) * 25, own.page * 25)}
              getRowId={(x) => x.id}
              state={live ? live.state : state}
              onRetry={live?.onRetry}
              toolbar={toolbar}
              rowNoun={['candidate', 'candidates']}
              cardSummary
              filtered={filtered}
              empty={<EmptyState compact title={filtered ? 'No candidates match.' : 'No candidates yet.'} description={filtered ? 'Clear the search or the filters.' : canManage ? 'Add one, or upload a spreadsheet.' : 'Candidates your company adds show here.'} />}
              selectable={canManage}
              selectedIds={selected}
              onSelectedChange={setSelected}
              onRowClick={(x) => live?.onOpen(x.id)}
              bulkActions={(ids) => (
                <>
                  <Button size="sm" onClick={() => setDialog({ kind: 'invite', ids })}>Invite to an assessment</Button>
                  <Button size="sm" icon={Mail} onClick={() => setDialog({ kind: 'email', ids })}>Email selected</Button>
                  <Button size="sm" onClick={() => setDialog({ kind: 'list', ids })}>Add to a list</Button>
                  <Button size="sm" variant="danger" icon={Trash2} onClick={() => setDialog({ kind: 'delete', ids })}>Delete</Button>
                </>
              )}
              rowButtons={(x) => <Button size="sm" onClick={() => live?.onOpen(x.id)}>Open</Button>}
              rowActions={(x) =>
                canManage ? (
                  <>
                    <MenuItem onSelect={() => setDialog({ kind: 'edit', row: x })}>Edit</MenuItem>
                    {x.globalStage === 'available' && <MenuItem onSelect={() => setDialog({ kind: 'reengage', row: x })}>Re-engage for a job</MenuItem>}
                    <MenuItem onSelect={() => void (live ? live.onUpdate(x.id, { status: x.status === 'active' ? 'inactive' : 'active' }) : Promise.resolve()).then(() => after(x.status === 'active' ? `${x.name} deactivated` : `${x.name} reactivated`), () => undefined)}>
                      {x.status === 'active' ? 'Deactivate' : 'Reactivate'}
                    </MenuItem>
                    {x.neverInvited && <MenuItem destructive onSelect={() => setDialog({ kind: 'delete', ids: [x.id] })}>Delete</MenuItem>}
                  </>
                ) : null
              }
            />
            <Pagination page={live ? live.page : own.page} pageSize={live ? live.pageSize : 25} total={live ? live.total : rows.length} onPageChange={live ? live.onPage : set('page')} />
          </div>
        </TabsContent>
        {canManage && (
          <TabsContent value="duplicates">
            <div className="yx-hire-stack">
              <Text as="p" tone="secondary">
                Candidates who look like the same person: the same phone, the same name and number, or a similar résumé. A merge keeps one record and moves everything onto it.{canMerge ? '' : ' Merging needs the candidate data-rights key.'}
              </Text>
              <DataTable
                label="Possible duplicates"
                columns={pairCols}
                rows={duplicates}
                getRowId={(x) => `${x.a.id}-${x.b.id}`}
                rowNoun={['pair', 'pairs']}
                empty={<EmptyState compact title="No possible duplicates." />}
                rowButtons={(x) => (
                  <>
                    <Button size="sm" onClick={() => live?.onOpen(x.a.id)}>Open</Button>
                    {canMerge && <Button size="sm" icon={Copy} onClick={() => setMerging({ pair: x, keep: 'a' })}>Compare and merge</Button>}
                  </>
                )}
              />
            </div>
          </TabsContent>
        )}
      </Tabs>

      {(dialog?.kind === 'add' || dialog?.kind === 'edit') && (
        <CandidateDialog
          candidate={dialog.kind === 'edit' ? dialog.row : null}
          customFields={customFields}
          onClose={() => setDialog(null)}
          onSave={async (input) => {
            if (live) await (dialog.kind === 'edit' ? live.onUpdate(dialog.row.id, input) : live.onCreate(input));
            done(dialog.kind === 'edit' ? `${input.name} saved` : `${input.name} added`);
          }}
        />
      )}
      {dialog?.kind === 'upload' && <UploadInviteDialog exams={exams} onClose={() => setDialog(null)} onDownloadTemplate={live?.onDownloadTemplate ?? (async () => undefined)} onUploadInvite={live?.onUploadInvite ?? (async () => ({ invited: 0, skipped: 0, errors: [] }))} />}
      {dialog?.kind === 'invite' && (
        <PickDialog title={`Invite ${dialog.ids.length} to an assessment`} label="Assessment" options={exams} confirm="Send invitations" onClose={() => setDialog(null)} onConfirm={async (examId) => {
          const r = live ? await live.onInvite(examId, dialog.ids) : { invited: dialog.ids.length, skipped: 0 };
          after(`Invited ${r.invited}`, r.skipped ? `${r.skipped} skipped: already invited.` : undefined);
        }} />
      )}
      {dialog?.kind === 'list' && (
        <PickDialog title={`Add ${dialog.ids.length} to a list`} label="List" options={lists.map((l) => ({ value: l.id, label: `${l.name} (${l.kind === 'pool' ? 'talent pool' : 'hotlist'})` }))} confirm="Add to list" note="A talent pool takes only candidates who agreed to be kept for other roles." onClose={() => setDialog(null)} onConfirm={async (listId) => {
          const r = live ? await live.onAddToList(listId, dialog.ids) : { added: dialog.ids.length, refused: [] };
          after(`Added ${r.added}`, r.refused.length ? `${r.refused.length} not added: they did not agree to be kept for other roles.` : undefined);
        }} />
      )}
      {dialog?.kind === 'reengage' && (
        <PickDialog title={`Re-engage ${dialog.row.name}`} label="Job" options={openJobs} confirm="Add to job" onClose={() => setDialog(null)} onConfirm={async (jobId) => {
          if (live) await live.onReengage(jobId, dialog.row.id);
          after(`${dialog.row.name} added to the job`);
        }} />
      )}
      {dialog?.kind === 'email' && (
        <EmailDialog count={dialog.ids.length} templates={templates} senders={senders} onClose={() => setDialog(null)} onSend={async (c) => {
          const r = live ? await live.onEmail(dialog.ids, c) : { total: dialog.ids.length };
          after(`Sending ${r.total} email${r.total === 1 ? '' : 's'}`, 'Candidates who opted out are skipped.');
        }} />
      )}
      {dialog?.kind === 'delete' && (
        <ConfirmDialog open destructive onOpenChange={(o) => !o && setDialog(null)} title={`Delete ${dialog.ids.length === 1 ? 'this candidate' : `${dialog.ids.length} candidates`}?`} consequence="Only candidates never invited to an assessment are deleted; the others are skipped (erase them from their record instead)." confirmLabel="Delete" onConfirm={async () => {
          const r = live ? await live.onDelete(dialog.ids) : { deleted: dialog.ids.length, skipped: 0 };
          setDialog(null);
          after(`Deleted ${r.deleted}`, r.skipped ? `${r.skipped} skipped: invited before, so erase them instead.` : undefined);
        }} />
      )}
      {merging && kept && other && (
        <MergeDrawer
          open
          onOpenChange={(o) => !o && setMerging(null)}
          a={null}
          b={null}
          live={{
            keptName: kept.name,
            otherName: other.name,
            otherEmail: other.email,
            fields: pairFields,
            keep: { value: merging.keep, options: [{ value: 'a', label: merging.pair.a.email }, { value: 'b', label: merging.pair.b.email }], onChange: (k) => setMerging({ ...merging, keep: k }) },
            onMerge: async (choice) => {
              const choices: MergeChoices = { name: choice.name === 'b' ? 'merged' : 'kept', phone: choice.phone === 'b' ? 'merged' : 'kept', resume: choice.resume === 'b' ? 'merged' : 'kept' };
              if (live) await live.onMerge(kept.id, other.id, choices);
              done('Candidates merged', `${other.name} is now part of ${kept.name}. The merge is in the audit log.`);
            },
          }}
        />
      )}
    </HireFrame>
  );
}

/* ================================================================== Candidate data retention */

/** One person found for a data request (GET candidates/lookup, the data-rights key). */
export interface DataRequestMatch {
  id: string;
  name: string;
  email: string;
  stage: GlobalStage | null;
  onHold: boolean;
  erased: boolean;
}

export interface LiveRetention {
  state: ListState | 'denied';
  onRetry: () => void;
  onMonths: (m: string) => Promise<void>;
  onPreview: () => Promise<RetentionPreview>;
  onRun: () => Promise<RetentionPreview>;
  /** Null when nobody has that email. */
  onFind: (email: string) => Promise<DataRequestMatch | null>;
  onOpen: (id: string) => void;
  onExport: (id: string) => Promise<void>;
  onErase: (id: string) => Promise<void>;
}

export interface CandidateRetentionProps {
  /** The company setting `ats.retention_months` (default 12). */
  months: string;
  monthsOptions: string[];
  /** org.settings.manage: change the period. */
  canChange?: boolean;
  runs: RetentionRunRow[];
  preview?: RetentionPreview | null;
  found?: DataRequestMatch | null;
  state?: ListState | 'denied';
  live?: LiveRetention;
}

const summary = (r: RetentionPreview) => `${r.renewalsSent} renewal emails, ${r.anonymised} anonymised; skipped: ${r.skippedHold} on legal hold, ${r.skippedHired} hired, ${r.skippedOpen} in an open process.`;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// HIR-05 Retention
export function CandidateRetentionScreen({ months, monthsOptions, canChange = true, runs, preview: initialPreview = null, found: initialFound, state = 'ready', live }: CandidateRetentionProps) {
  const toast = useToastIfAny();
  const done = (title: string, description?: string): void => void toast?.toast({ tone: 'success', title, description });
  const [preview, setPreview] = useState<RetentionPreview | null>(initialPreview);
  const [busy, setBusy] = useState<string | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [email, setEmail] = useState(initialFound?.email ?? '');
  const [emailError, setEmailError] = useState<string | null>(null);
  const [found, setFound] = useState<DataRequestMatch | null | undefined>(initialFound);
  const [erasing, setErasing] = useState(false);
  const shown = live ? live.state : state;
  const act = async (key: string, fn: () => Promise<void>) => {
    setBusy(key);
    setFailed(null);
    try {
      await fn();
    } catch (e) {
      setFailed(e instanceof Error ? e.message : 'That did not work. Try again.');
    } finally {
      setBusy(null);
    }
  };
  const find = () => {
    if (!EMAIL.test(email.trim())) {
      setEmailError(email.trim() ? 'Enter a valid email address.' : 'Enter the email address the person gave.');
      return void document.getElementById('rt-email')?.focus();
    }
    setEmailError(null);
    void act('find', async () => setFound(live ? await live.onFind(email.trim()) : null));
  };
  const last = runs[0];
  const runCols: TableColumn<RetentionRunRow>[] = [
    { key: 'd', header: 'Run', value: (r) => r.runAt, render: (r) => <span>{istDay(r.runAt)}{r.triggeredBy ? '' : ' (nightly)'}</span> },
    { key: 'm', header: 'Period', type: 'number', value: (r) => r.periodMonths },
    { key: 'r', header: 'Renewal emails', type: 'number', value: (r) => r.renewalsSent },
    { key: 'a', header: 'Anonymised', type: 'number', value: (r) => r.anonymised },
    { key: 'h', header: 'On hold', type: 'number', value: (r) => r.skippedHold },
    { key: 'i', header: 'Hired', type: 'number', value: (r) => r.skippedHired },
    { key: 'o', header: 'In process', type: 'number', value: (r) => r.skippedOpen },
  ];
  if (shown !== 'ready')
    return (
      <HireFrame active="Candidates & talent CRM">
        {shown === 'loading' ? (
          <div className="yx-hire-stack" aria-busy="true" aria-label="Loading retention">
            <Skeleton height={56} />
            <Skeleton height={200} />
          </div>
        ) : shown === 'denied' ? (
          <NoAccessState grantedBy="your admin (the candidate data-rights key)" what="candidate data retention" />
        ) : (
          <ErrorState title="Retention could not be loaded." onRetry={live?.onRetry} />
        )}
      </HireFrame>
    );
  return (
    <HireFrame active="Candidates & talent CRM">
      <PageHeader
        title="Candidate data retention"
        description="Candidates who were not hired are emailed 30 days before the end of the period, then anonymised (DPDP Act). Applications and scores stay without the name. Anyone on legal hold, hired, or with an open application or offer is never touched."
      />
      <SummaryTiles
        label="Retention"
        tiles={[
          { label: 'Keep details for', value: `${months} months`, sub: 'after the last activity' },
          { label: 'Last run', value: last ? istDay(last.runAt) : 'Not run yet', sub: 'It also runs every night' },
          { label: 'Anonymised in the last run', value: last ? String(last.anonymised) : '0' },
          { label: 'Kept: legal hold', value: last ? String(last.skippedHold) : '0' },
        ]}
      />
      {failed && <InlineAlert tone="danger" title="Not done">{failed}</InlineAlert>}
      <Card title="Period">
        {canChange ? (
          <FormField id="rt-months" label="Keep details for (months after the last activity)" helper="A company setting; YukthiX starts at 12 months.">
            <Select aria-label="Keep details for" value={months} onChange={(v) => v && v !== months && void act('months', async () => (await live?.onMonths(v), done(`Details are kept for ${v} months`)))} options={monthsOptions.map((m) => ({ value: m, label: `${m} months` }))} />
          </FormField>
        ) : (
          <DescriptionList items={[{ label: 'Keep details for', value: `${months} months after the last activity (changed by someone with the company settings key)` }]} />
        )}
      </Card>
      <Card title="Data requests">
        <div className="yx-hire-stack">
          <Text as="p" tone="secondary">A person may ask what you hold about them, or ask you to erase it. Find them by the email they applied with. Export and erase are recorded in the audit log.</Text>
          <div className="yx-hire-actions">
            <FormField id="rt-email" label="Email the person applied with" error={emailError}>
              <TextField type="email" value={email} onChange={setEmail} maxLength={254} />
            </FormField>
            <div>
              <Button icon={Search} loading={busy === 'find'} onClick={find}>
                Find
              </Button>
            </div>
          </div>
          {found === null && <Text as="p">Nobody with this email is in your candidates.</Text>}
          {found && (
            <div className="yx-hire-list__item">
              <div className="yx-hire-list__main">
                <Text weight="medium">{found.erased ? 'Erased candidate' : found.name}</Text>
                <Text size="sm" tone="secondary">{found.email}</Text>
              </div>
              <div className="yx-hire-actions">
                {found.stage && <StageBadge stage={found.stage} />}
                {found.onHold && <Badge tone="warning">Legal hold</Badge>}
                {found.erased && <Badge tone="neutral">Erased</Badge>}
                {!found.erased && (
                  <>
                    <Button size="sm" onClick={() => live?.onOpen(found.id)}>Open record</Button>
                    <Button size="sm" icon={Download} loading={busy === 'export'} onClick={() => void act('export', async () => (await live?.onExport(found.id), done('Their data is downloaded')))}>
                      Export their data
                    </Button>
                    {!found.onHold && (
                      <Button size="sm" variant="danger" onClick={() => setErasing(true)}>
                        Erase their data
                      </Button>
                    )}
                  </>
                )}
              </div>
            </div>
          )}
          {found?.onHold && <Text as="p" tone="secondary">On legal hold: nothing is erased until the hold is lifted on their record.</Text>}
        </div>
      </Card>
      <Card title="Retention sweep">
        <div className="yx-hire-stack">
          <div className="yx-hire-actions">
            <Button loading={busy === 'preview'} onClick={() => void act('preview', async () => setPreview(live ? await live.onPreview() : preview))}>
              Preview (changes nothing)
            </Button>
            <Button variant="danger" onClick={() => setRunning(true)}>
              Run now
            </Button>
          </div>
          {preview && <Text as="p">Today it would send {summary(preview)}</Text>}
          <DataTable label="Retention runs" columns={runCols} rows={runs} getRowId={(r) => r.id} empty={<EmptyState compact title="No runs yet. It runs every night." />} />
        </div>
      </Card>
      {running && (
        <ConfirmDialog
          open
          destructive
          onOpenChange={(o) => !o && setRunning(false)}
          title="Run the retention sweep now?"
          consequence="Due candidates are anonymised for good and renewal emails are sent. People on legal hold, hired, or in an open process are skipped. It also runs every night."
          confirmLabel="Run now"
          onConfirm={async () => {
            const r = live ? await live.onRun() : null;
            setRunning(false);
            done('Retention sweep done', r ? summary(r) : undefined);
          }}
        />
      )}
      {erasing && found && (
        <ConfirmDialog
          open
          destructive
          onOpenChange={(o) => !o && setErasing(false)}
          title={`Erase ${found.name}'s personal data?`}
          consequence="Name, contact details, résumé, messages and notes are removed for good. Applications, stages and scores stay without the name. The erase is recorded in the audit log. This cannot be undone."
          confirmLabel="Erase personal data"
          onConfirm={async () => {
            if (live) await live.onErase(found.id);
            setErasing(false);
            setFound({ ...found, erased: true });
            done('Personal data erased');
          }}
        />
      )}
    </HireFrame>
  );
}
