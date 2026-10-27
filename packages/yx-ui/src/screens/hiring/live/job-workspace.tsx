import { useState } from 'react';
import { Plus, Sparkles } from 'lucide-react';
import { Button } from '../../../components/button';
import { Checkbox } from '../../../components/choice';
import { Badge } from '../../../components/display';
import { EmptyState, InlineAlert } from '../../../components/feedback';
import { FormField } from '../../../components/field';
import { Text } from '../../../components/foundations';
import { NumberField, TextArea, TextField } from '../../../components/inputs';
import { KanbanBoard, type KanbanColumn } from '../../../components/kanban';
import { MenuItem } from '../../../components/menu';
import { ConfirmDialog } from '../../../components/overlay';
import { Segment } from '../../../components/segment';
import { MultiSelect, Select } from '../../../components/select';
import { Card, DescriptionList, Tabs, TabsContent, TabsList, TabsTrigger } from '../../../components/shell';
import { DataTable, type TableColumn } from '../../../components/table';
import { useRun } from '../../org/org-kit';
import { LivePage } from '../../time/live/kit';
import { EmailDialog } from './candidates';
import type { BoardRowView, BoardStageView, Choice, EmailCompose, EmailTemplateChoice, JobSettingsView, JobView, LoadState, RejectInput } from './types';

// Recruitment batch AT5, wired (M10-BUILD-DESIGN §8.1, §9): one job — its pipeline as a board or a list, and its
// settings (tests and the stage that sends each, the interview scorecard, public applying, job boards, fit criteria).
// Replaces the older /v2/jobs/:id page. Moving a card to Rejected asks for a reason and the message; the message waits
// 24 hours by default so the rejection can be undone.

const STATUS_LABEL: Record<JobView['status'], string> = { draft: 'Draft requisition', pending_approval: 'Waiting for approval', open: 'Open', closed: 'Closed' };
const when = (iso: string) => new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });

export function scorecardText(s: BoardRowView['scorecards']): string | null {
  if (!s) return null;
  if (!s.complete) return `Scorecards ${s.submitted} of ${s.expected}`;
  return s.passes ? `Passes the bar (${s.score})` : `Below the bar (${s.score})`;
}

export interface JobWorkspaceScreenProps {
  state: LoadState;
  onRetry?: () => void;
  job: JobView | null;
  canManage: boolean;
  stages: BoardStageView[];
  rows: BoardRowView[];
  settings: JobSettingsView | null;
  exams: Choice[];
  scorecardTemplates: Choice[];
  jobBoards: Choice[];
  candidateChoices: Choice[];
  onCandidateSearch?: (q: string) => void;
  templates: EmailTemplateChoice[];
  senders: Choice[];
  onBack: () => void;
  onOpenEntry: (entryId: string) => void;
  onMove: (entryId: string, statusId: string) => Promise<unknown>;
  onReject: (entryIds: string[], input: RejectInput) => Promise<unknown>;
  onUndo: (entryId: string) => Promise<unknown>;
  onBulkMove: (entryIds: string[], statusId: string) => Promise<{ succeeded: number; skipped: unknown[] }>;
  onBulkTest: (entryIds: string[], examId: string) => Promise<{ succeeded: number; skipped: unknown[] }>;
  onBulkEmail: (entryIds: string[], c: EmailCompose) => Promise<unknown>;
  onAdd: (input: { candidateId: string } | { newCandidate: { name: string; email: string; phone?: string } }) => Promise<unknown>;
  onExport: () => Promise<unknown>;
  onLinkExam: (examId: string) => Promise<unknown>;
  onUnlinkExam: (examId: string) => Promise<unknown>;
  onSendOn: (examId: string, stageId: string | null) => Promise<unknown>;
  onScorecard: (templateId: string | null) => Promise<unknown>;
  onUpdateJob: (patch: Partial<{ publicApplyEnabled: boolean; listOnCareers: boolean; jobBoardIds: string[]; fitCriteria: string | null; fitRubric: { label: string; weight: number }[] | null; status: 'open' | 'closed' }>) => Promise<unknown>;
  onScreenAll?: () => Promise<{ queued: number }>;
  onCopy: (text: string) => Promise<unknown>;
}

export function JobWorkspaceScreen(p: JobWorkspaceScreenProps) {
  const j = p.job;
  return (
    <LivePage
      title={j?.title ?? 'Job'}
      description={j?.summary}
      state={p.state}
      onRetry={p.onRetry}
      what="this job"
      grantedBy="your admin"
      actions={<Button onClick={p.onBack}>All jobs</Button>}
    >
      {j && (
        <>
          <div className="yx-tim-row">
            <Badge tone={j.status === 'open' ? 'success' : j.status === 'closed' ? 'neutral' : 'warning'}>{STATUS_LABEL[j.status]}</Badge>
            {j.publicApplyEnabled && <Badge tone="info">Taking applications</Badge>}
          </div>
          <Tabs defaultValue="pipeline">
            <TabsList aria-label="Job sections">
              <TabsTrigger value="pipeline" count={p.rows.length}>Candidates</TabsTrigger>
              <TabsTrigger value="settings">Job settings</TabsTrigger>
            </TabsList>
            <TabsContent value="pipeline">
              <PipelineView {...p} />
            </TabsContent>
            <TabsContent value="settings">
              <Settings {...p} job={j} />
            </TabsContent>
          </Tabs>
        </>
      )}
    </LivePage>
  );
}

function PipelineView(p: JobWorkspaceScreenProps) {
  const [view, setView] = useState<'board' | 'list'>('board');
  const [selected, setSelected] = useState<string[]>([]);
  const [rejecting, setRejecting] = useState<string[] | null>(null);
  const [moving, setMoving] = useState<string[] | null>(null);
  const [testing, setTesting] = useState<string[] | null>(null);
  const [emailing, setEmailing] = useState<string[] | null>(null);
  const [adding, setAdding] = useState(false);
  const [notice, setNotice] = useState<{ tone: 'success' | 'danger'; text: string } | null>(null);
  const { error, run } = useRun();
  const done = (text: string) => { setNotice({ tone: 'success', text }); setSelected([]); };
  const firstStatus = (stageId: string) => p.stages.find((s) => s.id === stageId)?.statuses[0]?.id;
  const statusChoices = p.stages.flatMap((s) => s.statuses.map((st) => ({ value: st.id, label: s.statuses.length > 1 ? `${s.name} · ${st.name}` : s.name })));
  const pending = p.rows.filter((r) => r.rejectionPendingUntil);

  const columns: KanbanColumn[] = p.stages
    .filter((s) => s.category !== 'archived')
    .map((s) => ({
      id: s.id,
      title: s.name,
      emptyText: 'Nobody here yet',
      cards: p.rows
        .filter((r) => r.stageId === s.id)
        .map((r) => ({
          id: r.entryId,
          name: r.name,
          facts: [r.testSummary ?? r.statusName, scorecardText(r.scorecards) ?? (r.fitScore != null ? `Fit ${r.fitScore}` : undefined)],
          daysInStage: r.daysInStage,
          next: r.rejectionPendingUntil ? { text: `Rejection message at ${when(r.rejectionPendingUntil)}` } : r.nextInterviewAt ? { text: `Interview ${when(r.nextInterviewAt)}` } : r.scorecards && !r.scorecards.complete ? { text: 'Waiting for scorecards', overdue: true } : undefined,
        })),
    }));

  const listCols: TableColumn<BoardRowView>[] = [
    { key: 'n', header: 'Candidate', value: (r) => r.name, width: 200, hideable: false },
    { key: 's', header: 'Stage', value: (r) => r.statusName },
    { key: 'd', header: 'Days in stage', type: 'number', value: (r) => r.daysInStage },
    { key: 't', header: 'Test', value: (r) => r.testSummary ?? '' },
    { key: 'c', header: 'Scorecards', value: (r) => scorecardText(r.scorecards) ?? '' },
    { key: 'a', header: 'Owner', value: (r) => r.assignee ?? '' },
  ];

  return (
    <div className="yx-tim-stack">
      {(notice || error) && (
        <InlineAlert tone={error ? 'danger' : notice!.tone} title={error ? 'Not done' : 'Done'}>
          {error ?? notice!.text}
        </InlineAlert>
      )}
      {pending.map((r) => (
        <InlineAlert key={r.entryId} tone="info" title={`${r.name} was rejected`}>
          The message goes at {when(r.rejectionPendingUntil!)}.{' '}
          {p.canManage && <Button size="sm" onClick={() => void run('undo', async () => { await p.onUndo(r.entryId); setNotice({ tone: 'success', text: `${r.name} is back where they were.` }); })}>Undo rejection of {r.name}</Button>}
        </InlineAlert>
      ))}
      <div className="yx-tim-row">
        <Segment label="Show as" value={view} onChange={setView} options={[{ value: 'board', label: 'Board' }, { value: 'list', label: 'List' }]} />
        {p.canManage && <Button icon={Plus} onClick={() => setAdding(true)}>Add candidate</Button>}
        <Button onClick={() => void run('export', p.onExport)}>Export CSV</Button>
      </div>
      {view === 'board' ? (
        <KanbanBoard
          aria-label="Hiring pipeline"
          noun="candidate"
          columns={columns}
          onOpenCard={p.onOpenEntry}
          onMove={(cardId, _from, to) => {
            const stage = p.stages.find((s) => s.id === to);
            if (!p.canManage || !stage) return;
            if (stage.category === 'rejected') setRejecting([cardId]);
            else void run('move', () => p.onMove(cardId, firstStatus(to)!));
          }}
        />
      ) : (
        <DataTable
          label="Candidates in this job"
          columns={listCols}
          rows={p.rows}
          getRowId={(r) => r.entryId}
          rowNoun={['candidate', 'candidates']}
          empty={<EmptyState compact title="No candidates yet." />}
          selectable={p.canManage}
          selectedIds={selected}
          onSelectedChange={setSelected}
          onRowClick={(r) => p.onOpenEntry(r.entryId)}
          rowButtons={(r) => <Button size="sm" onClick={() => p.onOpenEntry(r.entryId)}>Open {r.name}</Button>}
          rowActions={(r) => (p.canManage ? <MenuItem destructive onSelect={() => setRejecting([r.entryId])}>Reject</MenuItem> : null)}
          bulkActions={(ids) => (
            <>
              <Button size="sm" onClick={() => setMoving(ids)}>Move</Button>
              <Button size="sm" onClick={() => setTesting(ids)}>Send a test</Button>
              <Button size="sm" onClick={() => setEmailing(ids)}>Email selected</Button>
              <Button size="sm" variant="danger" onClick={() => setRejecting(ids)}>Reject</Button>
            </>
          )}
        />
      )}
      {rejecting && <RejectDialog count={rejecting.length} templates={p.templates} onClose={() => setRejecting(null)} onReject={async (input) => { await p.onReject(rejecting, input); done(input.delayHours ? 'Rejected. You can undo until the message goes.' : 'Rejected.'); }} />}
      {moving && <PickDialog title={`Move ${moving.length}`} label="Move to" options={statusChoices} confirm="Move" onClose={() => setMoving(null)} onConfirm={async (v) => { const r = await p.onBulkMove(moving, v); done(`Moved ${r.succeeded}.${r.skipped.length ? ` ${r.skipped.length} not moved.` : ''}`); }} />}
      {testing && <PickDialog title={`Send a test to ${testing.length}`} label="Test" options={p.exams} confirm="Send test" onClose={() => setTesting(null)} onConfirm={async (v) => { const r = await p.onBulkTest(testing, v); done(`Sent to ${r.succeeded}.${r.skipped.length ? ` ${r.skipped.length} already had it.` : ''}`); }} />}
      {emailing && <EmailDialog count={emailing.length} templates={p.templates} senders={p.senders} onClose={() => setEmailing(null)} onSend={async (c) => { await p.onBulkEmail(emailing, c); done('Emails are on their way.'); }} />}
      {adding && <AddDialog {...p} onClose={() => setAdding(false)} onAdded={(n) => done(`${n} added.`)} />}
    </div>
  );
}

export function RejectDialog(p: { count: number; templates: EmailTemplateChoice[]; onClose: () => void; onReject: (input: RejectInput) => Promise<void> }) {
  const [reason, setReason] = useState('');
  const [tell, setTell] = useState(true);
  const [template, setTemplate] = useState<string | null>(null);
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [delay, setDelay] = useState<'24' | '0'>('24');
  const pick = (v: string | null) => {
    setTemplate(v);
    const t = p.templates.find((x) => x.value === v);
    if (t) { setSubject(t.subject); setBody(t.body); }
  };
  const ok = reason.trim().length > 0 && (!tell || (subject.trim() && body.trim()));
  const [tried, setTried] = useState(false);
  return (
    <ConfirmDialog open destructive size="md" onOpenChange={(o) => !o && p.onClose()} title={p.count === 1 ? 'Reject this candidate?' : `Reject ${p.count} candidates?`} consequence={tell && delay === '24' ? 'The message waits 24 hours, so you can undo the rejection until then.' : 'They are rejected now.'} confirmLabel="Reject" onConfirm={async () => {
      setTried(true);
      if (!ok) return false;
      const t = p.templates.find((x) => x.value === template);
      await p.onReject({ reason: reason.trim(), delayHours: delay === '24' ? 24 : 0, message: tell ? { templateId: t && !t.value.startsWith('default-') ? t.value : null, subject: subject.trim(), body } : null });
      p.onClose();
    }}>
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

function PickDialog(p: { title: string; label: string; options: Choice[]; confirm: string; onClose: () => void; onConfirm: (v: string) => Promise<void> }) {
  const [v, setV] = useState<string | null>(null);
  const [tried, setTried] = useState(false);
  return (
    <ConfirmDialog open onOpenChange={(o) => !o && p.onClose()} title={p.title} confirmLabel={p.confirm} onConfirm={async () => { setTried(true); if (!v) return false; await p.onConfirm(v); p.onClose(); }}>
      <FormField id="jw-pick" label={p.label} required error={tried && !v ? 'Choose one from the list.' : null}>
        <Select aria-label={p.label} value={v} onChange={setV} options={p.options} searchable />
      </FormField>
    </ConfirmDialog>
  );
}

function AddDialog(p: JobWorkspaceScreenProps & { onClose: () => void; onAdded: (name: string) => void }) {
  const [mode, setMode] = useState<'existing' | 'new'>('existing');
  const [existing, setExisting] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const emailBad = email !== '' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  const ok = mode === 'existing' ? Boolean(existing) : name.trim() && email.trim() && !emailBad;
  const [tried, setTried] = useState(false);
  return (
    <ConfirmDialog open size="md" onOpenChange={(o) => !o && p.onClose()} title="Add a candidate to this job" confirmLabel="Add" onConfirm={async () => {
      setTried(true);
      if (!ok) return false;
      await p.onAdd(mode === 'existing' ? { candidateId: existing! } : { newCandidate: { name: name.trim(), email: email.trim(), ...(phone.trim() ? { phone: phone.trim() } : {}) } });
      p.onAdded(mode === 'existing' ? (p.candidateChoices.find((c) => c.value === existing)?.label ?? 'The candidate') : name.trim());
      p.onClose();
    }}>
      <Segment label="Who" value={mode} onChange={setMode} options={[{ value: 'existing', label: 'Existing candidate' }, { value: 'new', label: 'New candidate' }]} />
      {mode === 'existing' ? (
        <FormField id="ad-existing" label="Candidate" required error={tried && !existing ? 'Choose the candidate.' : null}>
          <Select aria-label="Candidate" value={existing} onChange={setExisting} options={p.candidateChoices} searchable onSearchChange={p.onCandidateSearch} />
        </FormField>
      ) : (
        <>
          <FormField id="ad-name" label="Name" required error={tried && !name.trim() ? 'Enter the name.' : null}>
            <TextField value={name} onChange={setName} maxLength={200} />
          </FormField>
          <FormField id="ad-email" label="Email" required error={emailBad ? 'Enter a valid email address.' : tried && !email.trim() ? 'Enter the email address.' : undefined}>
            <TextField type="email" value={email} onChange={setEmail} maxLength={254} />
          </FormField>
          <FormField id="ad-phone" label="Phone" optional>
            <TextField type="tel" value={phone} onChange={setPhone} maxLength={50} />
          </FormField>
        </>
      )}
    </ConfirmDialog>
  );
}

function Settings(p: JobWorkspaceScreenProps & { job: JobView }) {
  const { busy, error, run } = useRun();
  const [linking, setLinking] = useState<string | null>(null);
  const [boards, setBoards] = useState<string[]>(p.job.boardIds);
  const [criteria, setCriteria] = useState(p.job.fitCriteria ?? '');
  const [rubric, setRubric] = useState(p.job.fitRubric);
  const [copied, setCopied] = useState(false);
  const stageChoices = p.stages.filter((s) => s.category === 'active' || s.category === 'offer').map((s) => ({ value: s.id, label: s.name }));
  const linked = new Set(p.settings?.exams.map((e) => e.examId));
  const disabled = !p.canManage;
  const rubricOk = rubric.every((r) => r.label.trim() && r.weight > 0);
  return (
    <div className="yx-tim-stack">
      {error && <InlineAlert tone="danger" title="Not saved">{error}</InlineAlert>}
      <Card title="Role">
        <DescriptionList columns={2} items={[{ label: 'Status', value: STATUS_LABEL[p.job.status] }, { label: 'Details', value: p.job.summary || '—' }, ...p.job.customFields.map((f) => ({ label: f.label, value: f.value }))]} />
        {p.job.description && <Text as="p">{p.job.description}</Text>}
        {p.canManage && (p.job.status === 'open' || p.job.status === 'closed') && (
          <div><Button size="sm" onClick={() => void run('status', () => p.onUpdateJob({ status: p.job.status === 'open' ? 'closed' : 'open' }))}>{p.job.status === 'open' ? 'Close the job' : 'Reopen the job'}</Button></div>
        )}
      </Card>

      <Card title="Tests">
        <Text as="p" tone="secondary">Tests candidates take for this role. A test can be sent automatically when a candidate enters a stage.</Text>
        <DataTable
          label="Linked tests"
          rows={p.settings?.exams ?? []}
          getRowId={(e) => e.examId}
          empty={<EmptyState compact title="No tests linked." />}
          columns={[
            { key: 't', header: 'Test', value: (e) => e.title },
            { key: 's', header: 'Sent when entering', value: (e) => e.sendOnStageId ?? '', render: (e) => (
              <Select aria-label={`Send ${e.title} when entering`} value={e.sendOnStageId} disabled={disabled} placeholder="Only when sent by hand" onChange={(v) => void run('sendon', () => p.onSendOn(e.examId, v))} options={stageChoices} clearable />
            ) },
          ] as TableColumn<JobSettingsView['exams'][number]>[]}
          rowButtons={(e) => (p.canManage ? <Button size="sm" variant="danger" onClick={() => void run('unlink', () => p.onUnlinkExam(e.examId))}>Unlink {e.title}</Button> : null)}
        />
        {p.canManage && (
          <div className="yx-tim-row">
            <FormField id="jw-link" label="Link a test" hideLabel>
              <Select aria-label="Link a test" placeholder="Link a test" value={linking} onChange={setLinking} options={p.exams.filter((x) => !linked.has(x.value))} searchable />
            </FormField>
            <Button size="sm" disabled={!linking} loading={busy === 'link'} onClick={() => void run('link', async () => { await p.onLinkExam(linking!); setLinking(null); })}>Link test</Button>
          </div>
        )}
      </Card>

      <Card title="Interview scorecard">
        <FormField id="jw-scorecard" label="Scorecard for new interviews" helper="The panel rates each item; the result shows against the pass bar.">
          <Select aria-label="Scorecard for new interviews" value={p.settings?.scorecardTemplateId ?? null} disabled={disabled} placeholder="No scorecard" onChange={(v) => void run('scorecard', () => p.onScorecard(v))} options={p.scorecardTemplates} clearable />
        </FormField>
      </Card>

      <Card title="Applications">
        <Checkbox label="Take applications through a public link" checked={p.job.publicApplyEnabled} disabled={disabled || p.job.status !== 'open'} onChange={(v) => void run('apply', () => p.onUpdateJob({ publicApplyEnabled: v }))} />
        <Checkbox label="Show on the careers site" checked={p.job.listOnCareers} disabled={disabled} onChange={(v) => void run('careers', () => p.onUpdateJob({ listOnCareers: v }))} />
        {p.job.applyUrl && (
          <div className="yx-tim-row">
            <Text mono>{p.job.applyUrl}</Text>
            <Button size="sm" onClick={() => void p.onCopy(p.job.applyUrl!).then(() => setCopied(true))}>{copied ? 'Link copied' : 'Copy apply link'}</Button>
          </div>
        )}
        <FormField id="jw-boards" label="Job boards" helper="The job is posted to these boards while it is open.">
          <MultiSelect aria-label="Job boards" value={boards} disabled={disabled} onChange={setBoards} options={p.jobBoards} />
        </FormField>
        {p.canManage && <div><Button size="sm" loading={busy === 'boards'} onClick={() => void run('boards', () => p.onUpdateJob({ jobBoardIds: boards }))}>Save job boards</Button></div>}
      </Card>

      <Card title="Fit criteria">
        <Text as="p" tone="secondary">Describe the ideal candidate; résumés are scored against it (the score is advice, a person decides).</Text>
        <FormField id="jw-fit" label="Ideal candidate" optional>
          <TextArea value={criteria} onChange={setCriteria} rows={4} maxLength={5000} disabled={disabled} />
        </FormField>
        {rubric.map((r, i) => (
          <div key={i} className="yx-tim-row">
            <FormField id={`jw-r${i}`} label={`Rubric ${i + 1}`}>
              <TextField value={r.label} onChange={(v) => setRubric((x) => x.map((y, k) => (k === i ? { ...y, label: v } : y)))} maxLength={100} disabled={disabled} />
            </FormField>
            <FormField id={`jw-w${i}`} label={`Weight ${i + 1}`}>
              <NumberField value={r.weight} onChange={(v) => setRubric((x) => x.map((y, k) => (k === i ? { ...y, weight: v ?? 0 } : y)))} min={1} max={10} disabled={disabled} />
            </FormField>
            {p.canManage && <Button size="sm" variant="danger" onClick={() => setRubric((x) => x.filter((_, k) => k !== i))}>Remove rubric {i + 1}</Button>}
          </div>
        ))}
        {p.canManage && (
          <div className="yx-tim-row">
            <Button size="sm" icon={Plus} disabled={rubric.length >= 8} onClick={() => setRubric((x) => [...x, { label: '', weight: 1 }])}>Add a rubric line</Button>
            <Button size="sm" variant="primary" disabled={!rubricOk} loading={busy === 'fit'} onClick={() => void run('fit', () => p.onUpdateJob({ fitCriteria: criteria.trim() || null, fitRubric: rubric.length ? rubric : null }))}>Save fit criteria</Button>
            {p.onScreenAll && <Button size="sm" icon={Sparkles} loading={busy === 'screen'} onClick={() => void run('screen', async () => { await p.onScreenAll!(); })}>Score every résumé</Button>}
          </div>
        )}
      </Card>
    </div>
  );
}

