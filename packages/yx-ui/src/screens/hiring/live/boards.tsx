import { useState } from 'react';
import { Plus } from 'lucide-react';
import { Button } from '../../../components/button';
import { Badge } from '../../../components/display';
import { FormField } from '../../../components/field';
import { Text } from '../../../components/foundations';
import { Card } from '../../../components/shell';
import { PasswordField, TextField } from '../../../components/inputs';
import { ConfirmDialog } from '../../../components/overlay';
import { Segment } from '../../../components/segment';
import { DataTable, type TableColumn } from '../../../components/table';
import { LivePage } from '../../time/live/kit';
import type { BoardProvider, BoardSettings, JobBoardRow, LoadState } from './types';

// Recruitment batch AT3, wired (M10-BUILD-DESIGN §6, founder D12): the job-board seam. Each board posts through one
// provider: the free feed (the board pulls a link) or a push provider with the company's own account. Replaces the older
// Settings › Job boards page. Posting costs moved to Hiring › Recruiting costs (HIR-11, the designed screen).

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
  /** Answer 2631: applications sent by LinkedIn and Indeed (Easy Apply): the address to give the board and its secret. */
  easyApply?: { providers: { id: string; label: string; configured: boolean; ingestUrl: string }[]; onSet: (provider: string, secret: string) => Promise<unknown>; onTurnOff: (provider: string) => Promise<unknown> };
}

export function JobBoardsScreen(p: JobBoardsScreenProps) {
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [editing, setEditing] = useState<JobBoardRow | null>(null);
  const [deleting, setDeleting] = useState<JobBoardRow | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
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
      {creating && (
        <ConfirmDialog open onOpenChange={(o) => { if (!o) { setCreating(false); setName(''); } }} title="Add a job board" confirmLabel="Add board" onConfirm={async () => { setTried(true); if (!name.trim()) return false; await p.onCreate(name.trim()); setCreating(false); setName(''); }}>
          <FormField id="jb-name" label="Board name" required helper="For example Naukri or your college placement cell." error={tried && !name.trim() ? 'Enter the board name.' : null}>
            <TextField value={name} onChange={setName} maxLength={100} />
          </FormField>
        </ConfirmDialog>
      )}
      {p.easyApply && <EasyApplyCard {...p.easyApply} onCopy={p.onCopy} />}
      {editing && <BoardDialog board={editing} {...p} onClose={() => setEditing(null)} />}
      {deleting && (
        <ConfirmDialog open destructive onOpenChange={(o) => !o && setDeleting(null)} title={`Delete job board ${deleting.name}?`} consequence="Jobs stop posting to it. Recruiting costs already recorded stay." confirmLabel="Delete board" onConfirm={async () => { await p.onDelete(deleting.id); setDeleting(null); }} />
      )}
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

/** Answer 2631 (replaces the older /v2 Settings › Easy Apply): LinkedIn and Indeed send applications to the address shown,
 *  with the shared secret set here; nothing is taken until a secret is set. */
function EasyApplyCard({ providers, onSet, onTurnOff, onCopy }: NonNullable<JobBoardsScreenProps['easyApply']> & { onCopy: (t: string) => Promise<unknown> }) {
  const [setting, setSetting] = useState<{ id: string; label: string } | null>(null);
  const [secret, setSecret] = useState('');
  const [tried, setTried] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  return (
    <Card title="Applications from LinkedIn and Indeed (Easy Apply)">
      <Text as="p" size="sm" tone="secondary">
        Give the board the address and the secret. Applications arrive on the job like any other; nothing is taken until a secret is set.
      </Text>
      <DataTable
        label="Easy Apply"
        rows={providers}
        getRowId={(r) => r.id}
        columns={[
          { key: 'board', header: 'Board', value: (r) => r.label },
          { key: 'status', header: 'Status', value: (r) => (r.configured ? 'on' : 'off'), render: (r) => (r.configured ? <Badge tone="success">Receiving applications</Badge> : <Badge tone="neutral">Off</Badge>) },
          { key: 'url', header: 'Address for the board', value: (r) => r.ingestUrl, render: (r) => <span className="yx-mono">{r.ingestUrl}</span> },
          {
            key: 'actions',
            header: 'Actions',
            value: () => '',
            render: (r) => (
              <div className="yx-tim-row">
                <Button size="sm" onClick={() => void onCopy(r.ingestUrl).then(() => setCopied(r.id))}>{copied === r.id ? 'Address copied' : 'Copy address'}</Button>
                <Button size="sm" onClick={() => { setTried(false); setSecret(''); setSetting(r); }}>{r.configured ? 'Change secret' : 'Set secret'}</Button>
                {r.configured && (
                  <ConfirmDialog trigger={<Button size="sm" variant="danger">Turn off</Button>} title={`Turn off ${r.label} Easy Apply?`} consequence="Applications from the board are refused until a secret is set again." confirmLabel="Turn off" destructive onConfirm={async () => { await onTurnOff(r.id); }} />
                )}
              </div>
            ),
          },
        ]}
      />
      {setting && (
        <ConfirmDialog
          open
          onOpenChange={(o) => !o && setSetting(null)}
          title={`${setting.label} Easy Apply secret`}
          confirmLabel="Save secret"
          onConfirm={async () => {
            setTried(true);
            if (secret.trim().length < 16) return false;
            await onSet(setting.id, secret.trim());
            setSetting(null);
          }}
        >
          <FormField id="ea-secret" label="Shared secret" required helper="At least 16 characters. The board sends it with every application; it is stored encrypted and never shown again." error={tried && secret.trim().length < 16 ? 'Enter at least 16 characters.' : null}>
            <PasswordField value={secret} onChange={setSecret} autoComplete="new-password" />
          </FormField>
        </ConfirmDialog>
      )}
    </Card>
  );
}
