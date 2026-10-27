import { useState } from 'react';
import { Plus } from 'lucide-react';
import { Button } from '../../../components/button';
import { Badge } from '../../../components/display';
import { FormField } from '../../../components/field';
import { Text } from '../../../components/foundations';
import { NumberField, PasswordField, TextField } from '../../../components/inputs';
import { ConfirmDialog } from '../../../components/overlay';
import { Segment } from '../../../components/segment';
import { Select } from '../../../components/select';
import { Card } from '../../../components/shell';
import { DataTable, type TableColumn } from '../../../components/table';
import { LivePage } from '../../time/live/kit';
import type { BoardProvider, BoardSettings, Choice, CostInput, JobBoardRow, LoadState, RecruitingCostRow } from './types';

// Recruitment batch AT3, wired (M10-BUILD-DESIGN §6, founder D12): the job-board seam. Each board posts through one
// provider: the free feed (the board pulls a link) or a push provider with the company's own account. Posting costs
// are recorded against a board and, optionally, a job. Replaces the older Settings › Job boards page.

const PROVIDERS = [
  { value: 'xml_feed', label: 'Feed link' },
  { value: 'linkedin', label: 'LinkedIn' },
  { value: 'indeed', label: 'Indeed' },
  { value: 'http', label: 'Other (HTTP)' },
];
const providerLabel = (id: string) => PROVIDERS.find((x) => x.value === id)?.label ?? id;

export interface JobBoardsScreenProps {
  state: LoadState;
  onRetry?: () => void;
  boards: JobBoardRow[];
  providers: BoardProvider[];
  onCreate: (name: string) => Promise<unknown>;
  onSave: (board: JobBoardRow, s: BoardSettings) => Promise<unknown>;
  onDelete: (boardId: string) => Promise<unknown>;
  onCopy: (text: string) => Promise<unknown>;
  costs: RecruitingCostRow[];
  jobs: Choice[];
  onAddCost: (c: CostInput) => Promise<unknown>;
}

export function JobBoardsScreen(p: JobBoardsScreenProps) {
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [editing, setEditing] = useState<JobBoardRow | null>(null);
  const [deleting, setDeleting] = useState<JobBoardRow | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [addingCost, setAddingCost] = useState(false);
  const [tried, setTried] = useState(false);
  const cols: TableColumn<JobBoardRow>[] = [
    { key: 'name', header: 'Board', value: (b) => b.name },
    { key: 'provider', header: 'Posts through', value: (b) => providerLabel(b.provider) },
    {
      key: 'status',
      header: 'Status',
      value: (b) => (b.provider === 'xml_feed' ? 'feed' : b.configured ? 'ready' : 'setup'),
      render: (b) => (b.provider === 'xml_feed' ? <Badge tone="neutral">Board pulls the feed</Badge> : b.configured ? <Badge tone="success">Account connected</Badge> : <Badge tone="warning">Needs the account details</Badge>),
    },
    { key: 'jobs', header: 'Jobs posted', type: 'number', value: (b) => b.publishedJobCount },
    {
      key: 'actions',
      header: 'Actions',
      value: () => '',
      render: (b) => (
        <div className="yx-tim-row">
          <Button size="sm" onClick={() => setEditing(b)}>Set up {b.name}</Button>
          {b.provider === 'xml_feed' && (
            <Button size="sm" onClick={() => void p.onCopy(b.feedUrl).then(() => setCopied(b.id))}>{copied === b.id ? 'Link copied' : 'Copy feed link'}</Button>
          )}
          <Button size="sm" variant="danger" onClick={() => setDeleting(b)}>Delete</Button>
        </div>
      ),
    },
  ];
  const costCols: TableColumn<RecruitingCostRow>[] = [
    { key: 'source', header: 'Board', value: (c) => c.source },
    { key: 'job', header: 'Job', value: (c) => c.jobTitle ?? '' },
    { key: 'amount', header: 'Amount', type: 'number', value: (c) => c.amount, render: (c) => <Text>{`${c.currency} ${c.amount.toLocaleString('en-IN')}`}</Text> },
    { key: 'createdAt', header: 'Recorded', type: 'date', value: (c) => c.createdAt },
  ];
  return (
    <LivePage
      title="Job boards"
      description="Where your jobs are posted. A job picks its boards when it is edited; closing the job takes it down."
      state={p.state}
      onRetry={p.onRetry}
      what="job boards"
      grantedBy="your admin"
      actions={<Button variant="primary" icon={Plus} onClick={() => { setTried(false); setCreating(true); }}>Add a board</Button>}
    >
      <DataTable label="Job boards" columns={cols} rows={p.boards} getRowId={(b) => b.id} empty={<Text tone="secondary">No boards yet. Add one, then choose it on a job.</Text>} />
      <Card title="Posting costs">
        <Text as="p" tone="secondary">What each posting cost, for the cost-per-hire report.</Text>
        <div>
          <Button size="sm" icon={Plus} disabled={!p.boards.length} onClick={() => setAddingCost(true)}>Record a posting cost</Button>
        </div>
        <DataTable label="Posting costs" columns={costCols} rows={p.costs} getRowId={(c) => c.id} empty={<Text tone="secondary">No costs recorded yet.</Text>} />
      </Card>
      {creating && (
        <ConfirmDialog open onOpenChange={(o) => { if (!o) { setCreating(false); setName(''); } }} title="Add a job board" confirmLabel="Add board" onConfirm={async () => { setTried(true); if (!name.trim()) return false; await p.onCreate(name.trim()); setCreating(false); setName(''); }}>
          <FormField id="jb-name" label="Board name" required helper="For example Naukri or your college placement cell." error={tried && !name.trim() ? 'Enter the board name.' : null}>
            <TextField value={name} onChange={setName} maxLength={100} />
          </FormField>
        </ConfirmDialog>
      )}
      {editing && <BoardDialog board={editing} {...p} onClose={() => setEditing(null)} />}
      {deleting && (
        <ConfirmDialog open destructive onOpenChange={(o) => !o && setDeleting(null)} title={`Delete job board ${deleting.name}?`} consequence="Jobs stop posting to it. Posting costs already recorded stay." confirmLabel="Delete board" onConfirm={async () => { await p.onDelete(deleting.id); setDeleting(null); }} />
      )}
      {addingCost && <CostDialog {...p} onClose={() => setAddingCost(false)} />}
    </LivePage>
  );
}

function BoardDialog(p: JobBoardsScreenProps & { board: JobBoardRow; onClose: () => void }) {
  const [name, setName] = useState(p.board.name);
  const [provider, setProvider] = useState(p.board.provider);
  const [values, setValues] = useState<Record<string, string>>({});
  const fields = provider === 'xml_feed' ? [] : (p.providers.find((x) => x.id === provider)?.configFields ?? []);
  const keepSecrets = p.board.provider === provider && p.board.configured;
  const needs = (f: (typeof fields)[number]) => f.required && !values[f.key]?.trim() && !(f.secret && keepSecrets);
  const missing = fields.some(needs);
  const [tried, setTried] = useState(false);
  return (
    <ConfirmDialog open size="md" onOpenChange={(o) => !o && p.onClose()} title={`Set up ${p.board.name}`} confirmLabel="Save board" onConfirm={async () => {
      setTried(true);
      if (!name.trim() || missing) return false;
      const config = provider === 'xml_feed' ? undefined : Object.fromEntries(Object.entries(values).filter(([, v]) => v.trim() !== ''));
      await p.onSave(p.board, { name: name.trim(), provider, config });
      p.onClose();
    }}>
      <FormField id="jb-edit-name" label="Board name" required error={tried && !name.trim() ? 'Enter the board name.' : null}>
        <TextField value={name} onChange={setName} maxLength={100} />
      </FormField>
      <FormField id="jb-provider" label="Posts through">
        <Segment label="Posts through" value={provider} onChange={(v) => { setProvider(v); setValues({}); }} options={PROVIDERS} />
      </FormField>
      <Text as="p" tone="secondary">
        {provider === 'xml_feed' ? 'The board reads your jobs from a feed link. Give the board the link from this page.' : 'Jobs are sent to the board with your company’s own account when they open, and taken down when they close.'}
      </Text>
      {fields.map((f) => (
        <FormField key={f.key} id={`jb-f-${f.key}`} label={f.label} required={f.required && !(f.secret && keepSecrets)} optional={!f.required} helper={f.secret && keepSecrets ? 'Leave blank to keep the saved value.' : undefined} error={tried && needs(f) ? `Enter the ${f.label}.` : null}>
          {f.secret ? (
            <PasswordField value={values[f.key] ?? ''} onChange={(v) => setValues((x) => ({ ...x, [f.key]: v }))} autoComplete="off" />
          ) : (
            <TextField value={values[f.key] ?? ''} onChange={(v) => setValues((x) => ({ ...x, [f.key]: v }))} placeholder={f.placeholder} autoComplete="off" />
          )}
        </FormField>
      ))}
    </ConfirmDialog>
  );
}

function CostDialog(p: JobBoardsScreenProps & { onClose: () => void }) {
  const [board, setBoard] = useState<string | null>(p.boards[0]?.id ?? null);
  const [job, setJob] = useState<string | null>(null);
  const [amount, setAmount] = useState<number | null>(null);
  const [currency, setCurrency] = useState('INR');
  const [note, setNote] = useState('');
  const curBad = !/^[A-Z]{3}$/.test(currency);
  const [tried, setTried] = useState(false);
  return (
    <ConfirmDialog open size="md" onOpenChange={(o) => !o && p.onClose()} title="Record a posting cost" confirmLabel="Record cost" onConfirm={async () => {
      setTried(true);
      if (!board || amount == null || amount < 0 || curBad) return false;
      await p.onAddCost({ jobBoardId: board, jobId: job, amount, currency, note: note.trim() || null });
      p.onClose();
    }}>
      <FormField id="rc-board" label="Board" required error={tried && !board ? 'Choose the board.' : null}>
        <Select aria-label="Board" value={board} onChange={setBoard} options={p.boards.map((b) => ({ value: b.id, label: b.name }))} />
      </FormField>
      <FormField id="rc-job" label="Job" optional>
        <Select aria-label="Job" value={job} onChange={setJob} options={p.jobs} searchable clearable />
      </FormField>
      <FormField id="rc-amount" label="Amount" required error={tried && (amount == null || amount < 0) ? 'Enter an amount of 0 or more.' : null}>
        <NumberField value={amount} onChange={setAmount} min={0} />
      </FormField>
      <FormField id="rc-cur" label="Currency" required error={curBad ? 'Three capital letters, for example INR.' : undefined}>
        <TextField value={currency} onChange={(v) => setCurrency(v.toUpperCase())} maxLength={3} />
      </FormField>
      <FormField id="rc-note" label="Note" optional>
        <TextField value={note} onChange={setNote} maxLength={500} />
      </FormField>
    </ConfirmDialog>
  );
}
