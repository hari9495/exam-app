import { useState } from 'react';
import { Plus } from 'lucide-react';
import { Button } from '../../../components/button';
import { Badge } from '../../../components/display';
import { EmptyState, InlineAlert } from '../../../components/feedback';
import { FormField } from '../../../components/field';
import { Text } from '../../../components/foundations';
import { TextField } from '../../../components/inputs';
import { ConfirmDialog } from '../../../components/overlay';
import { Segment } from '../../../components/segment';
import { Select } from '../../../components/select';
import { Card } from '../../../components/shell';
import { DataTable, type TableColumn } from '../../../components/table';
import { useRun } from '../../org/org-kit';
import { LivePage, dateText } from '../../time/live/kit';
import { STAGE } from './candidates';
import type { DuplicatePairView, LoadState, MergeChoices, RetentionPreview, RetentionRunRow, TalentList, TalentListMember } from './types';

// Recruitment batch AT4, wired (M10-BUILD-DESIGN §7.2, §7.3, §13): possible duplicates with merge, talent pools and
// hotlists, and the candidate retention sweep (preview, run, history).

const REASON: Record<DuplicatePairView['reasons'][number], string> = { phone: 'Same phone', name_phone: 'Same name and number', resume: 'Similar résumé' };

export interface DuplicatesScreenProps {
  state: LoadState;
  onRetry?: () => void;
  pairs: DuplicatePairView[];
  onOpen: (id: string) => void;
  onMerge: (keptId: string, mergedId: string, choices: MergeChoices) => Promise<unknown>;
}

export function DuplicatesScreen(p: DuplicatesScreenProps) {
  const [merging, setMerging] = useState<DuplicatePairView | null>(null);
  const cols: TableColumn<DuplicatePairView>[] = [
    { key: 'a', header: 'Candidate', value: (x) => x.a.name, render: (x) => <span>{x.a.name} · {x.a.email}</span> },
    { key: 'b', header: 'Possible duplicate', value: (x) => x.b.name, render: (x) => <span>{x.b.name} · {x.b.email}</span> },
    { key: 'r', header: 'Why', value: (x) => x.reasons.join(), render: (x) => <span>{x.reasons.map((r) => REASON[r]).join(', ')}{x.score != null ? ` (${Math.round(x.score * 100)}%)` : ''}</span> },
  ];
  return (
    <LivePage title="Possible duplicates" description="Candidates who look like the same person. Merging keeps one and moves everything onto it." state={p.state} onRetry={p.onRetry} what="duplicates" grantedBy="your admin">
      <DataTable
        label="Possible duplicates"
        columns={cols}
        rows={p.pairs}
        getRowId={(x) => `${x.a.id}-${x.b.id}`}
        rowNoun={['pair', 'pairs']}
        empty={<EmptyState compact title="No possible duplicates." />}
        rowButtons={(x) => <Button size="sm" onClick={() => setMerging(x)}>Compare and merge</Button>}
      />
      {merging && <PairMergeDialog pair={merging} onClose={() => setMerging(null)} onMerge={p.onMerge} />}
    </LivePage>
  );
}

function PairMergeDialog(p: { pair: DuplicatePairView; onClose: () => void; onMerge: DuplicatesScreenProps['onMerge'] }) {
  const [keep, setKeep] = useState<'a' | 'b'>('a');
  const [choices, setChoices] = useState<MergeChoices>({ name: 'kept', phone: 'kept', resume: 'kept' });
  const kept = p.pair[keep];
  const other = p.pair[keep === 'a' ? 'b' : 'a'];
  const field = (f: 'name' | 'phone', label: string) => (
    <FormField id={`pm-${f}`} label={label}>
      <Segment label={label} value={choices[f]} onChange={(v) => setChoices((c) => ({ ...c, [f]: v }))} options={[{ value: 'kept', label: kept[f] || '(none)' }, { value: 'merged', label: other[f] || '(none)' }]} />
    </FormField>
  );
  return (
    <ConfirmDialog open destructive size="md" onOpenChange={(o) => !o && p.onClose()} title="Merge these candidates?" consequence={`${other.name} (${other.email}) is merged into the kept candidate. Applications, messages, assessments, interviews, consents and files move across. A merge cannot be undone.`} confirmLabel="Merge" onConfirm={async () => {
      await p.onMerge(kept.id, other.id, choices);
      p.onClose();
    }}>
      <FormField id="pm-keep" label="Keep">
        <Segment label="Keep" value={keep} onChange={setKeep} options={[{ value: 'a', label: p.pair.a.email }, { value: 'b', label: p.pair.b.email }]} />
      </FormField>
      {field('name', 'Name')}
      {field('phone', 'Phone')}
      <FormField id="pm-resume" label="Résumé">
        <Segment label="Résumé" value={choices.resume} onChange={(v) => setChoices((c) => ({ ...c, resume: v }))} options={[{ value: 'kept', label: 'The kept candidate’s' }, { value: 'merged', label: 'The other one’s' }]} />
      </FormField>
    </ConfirmDialog>
  );
}

export interface TalentPoolsScreenProps {
  state: LoadState;
  onRetry?: () => void;
  lists: TalentList[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  members: TalentListMember[];
  canManage: boolean;
  onCreate: (input: { name: string; kind: 'pool' | 'hotlist'; description: string | null }) => Promise<unknown>;
  onArchive: (id: string) => Promise<unknown>;
  onRemove: (listId: string, candidateId: string) => Promise<unknown>;
  onOpenCandidate: (id: string) => void;
}

export function TalentPoolsScreen(p: TalentPoolsScreenProps) {
  const [creating, setCreating] = useState(false);
  const [archiving, setArchiving] = useState<TalentList | null>(null);
  const selected = p.lists.find((l) => l.id === p.selectedId) ?? null;
  const cols: TableColumn<TalentList>[] = [
    { key: 'n', header: 'Name', value: (l) => l.name },
    { key: 'k', header: 'Kind', value: (l) => l.kind, render: (l) => <Badge tone={l.kind === 'pool' ? 'info' : 'warning'}>{l.kind === 'pool' ? 'Talent pool' : 'Hotlist'}</Badge> },
    { key: 'm', header: 'Candidates', type: 'number', value: (l) => l.members },
  ];
  const memberCols: TableColumn<TalentListMember>[] = [
    { key: 'n', header: 'Candidate', value: (m) => m.candidate?.name ?? '' },
    { key: 'e', header: 'Email', value: (m) => m.candidate?.email ?? '' },
    { key: 's', header: 'Stage', value: (m) => m.candidate?.globalStage ?? '', render: (m) => (m.candidate ? <Badge tone={STAGE[m.candidate.globalStage].tone}>{STAGE[m.candidate.globalStage].label}</Badge> : null) },
    { key: 'a', header: 'Added', value: (m) => m.addedAt, render: (m) => <span>{dateText(m.addedAt.slice(0, 10))}</span> },
  ];
  return (
    <LivePage
      title="Talent pools"
      description="Talent pools hold people who agreed to be kept for other roles. Hotlists are short lists for a current need."
      state={p.state}
      onRetry={p.onRetry}
      what="lists"
      grantedBy="your admin"
      actions={p.canManage && <Button variant="primary" icon={Plus} onClick={() => setCreating(true)}>New list</Button>}
    >
      <DataTable
        label="Lists"
        columns={cols}
        rows={p.lists}
        getRowId={(l) => l.id}
        rowNoun={['list', 'lists']}
        activeRowId={p.selectedId}
        onRowClick={(l) => p.onSelect(l.id)}
        empty={<EmptyState compact title="No lists yet." />}
        rowButtons={(l) => (
          <>
            <Button size="sm" onClick={() => p.onSelect(l.id)}>Show {l.name}</Button>
            {p.canManage && <Button size="sm" variant="danger" onClick={() => setArchiving(l)}>Archive</Button>}
          </>
        )}
      />
      {selected && (
        <Card title={selected.name}>
          {selected.description && <Text as="p" tone="secondary">{selected.description}</Text>}
          <Text as="p" tone="secondary">Add candidates from the candidates list. Leaving a talent pool, or withdrawing consent, never extends how long details are kept.</Text>
          <DataTable
            label={`${selected.name} candidates`}
            columns={memberCols}
            rows={p.members}
            getRowId={(m) => m.candidateId}
            empty={<EmptyState compact title="Nobody in this list yet." />}
            rowButtons={(m) => (
              <>
                <Button size="sm" onClick={() => p.onOpenCandidate(m.candidateId)}>Open</Button>
                {p.canManage && <Button size="sm" onClick={() => void p.onRemove(selected.id, m.candidateId)}>Remove</Button>}
              </>
            )}
          />
        </Card>
      )}
      {creating && <NewListDialog onClose={() => setCreating(false)} onCreate={p.onCreate} />}
      {archiving && (
        <ConfirmDialog open destructive onOpenChange={(o) => !o && setArchiving(null)} title={`Archive ${archiving.name}?`} consequence="The list disappears from Talent pools. Its candidates are not changed." confirmLabel="Archive list" onConfirm={async () => { await p.onArchive(archiving.id); setArchiving(null); }} />
      )}
    </LivePage>
  );
}

function NewListDialog(p: { onClose: () => void; onCreate: TalentPoolsScreenProps['onCreate'] }) {
  const [name, setName] = useState('');
  const [kind, setKind] = useState<'pool' | 'hotlist'>('pool');
  const [description, setDescription] = useState('');
  const [tried, setTried] = useState(false);
  return (
    <ConfirmDialog open onOpenChange={(o) => !o && p.onClose()} title="New list" confirmLabel="Create list" onConfirm={async () => {
      setTried(true);
      if (!name.trim()) return false;
      await p.onCreate({ name: name.trim(), kind, description: description.trim() || null });
      p.onClose();
    }}>
      <FormField id="tl-kind" label="Kind">
        <Segment label="Kind" value={kind} onChange={setKind} options={[{ value: 'pool', label: 'Talent pool' }, { value: 'hotlist', label: 'Hotlist' }]} />
      </FormField>
      <FormField id="tl-name" label="Name" required error={tried && !name.trim() ? 'Enter the list name.' : null}>
        <TextField value={name} onChange={setName} maxLength={120} />
      </FormField>
      <FormField id="tl-desc" label="Description" optional>
        <TextField value={description} onChange={setDescription} maxLength={500} />
      </FormField>
    </ConfirmDialog>
  );
}

export interface CandidateRetentionScreenProps {
  state: LoadState;
  onRetry?: () => void;
  months: string;
  monthsOptions: string[];
  canChange: boolean;
  onMonths: (m: string) => Promise<unknown>;
  runs: RetentionRunRow[];
  onPreview: () => Promise<RetentionPreview>;
  onRun: () => Promise<RetentionPreview>;
}

const summary = (r: RetentionPreview) => `${r.renewalsSent} renewal emails, ${r.anonymised} anonymised; skipped: ${r.skippedHold} on legal hold, ${r.skippedHired} hired, ${r.skippedOpen} in an open process.`;

export function CandidateRetentionScreen(p: CandidateRetentionScreenProps) {
  const { busy, error, run } = useRun();
  const [preview, setPreview] = useState<RetentionPreview | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [last, setLast] = useState<string | null>(null);
  const cols: TableColumn<RetentionRunRow>[] = [
    { key: 'd', header: 'Run', value: (r) => r.runAt, render: (r) => <span>{dateText(r.runAt.slice(0, 10))}{r.triggeredBy ? '' : ' (daily)'}</span> },
    { key: 'r', header: 'Renewal emails', type: 'number', value: (r) => r.renewalsSent },
    { key: 'a', header: 'Anonymised', type: 'number', value: (r) => r.anonymised },
    { key: 'h', header: 'On hold', type: 'number', value: (r) => r.skippedHold },
    { key: 'i', header: 'Hired', type: 'number', value: (r) => r.skippedHired },
    { key: 'o', header: 'In process', type: 'number', value: (r) => r.skippedOpen },
  ];
  return (
    <LivePage title="Candidate data retention" description="Candidates who were not hired are emailed 30 days before the end of the period, then anonymised. Applications and scores stay without the name." state={p.state} onRetry={p.onRetry} what="retention" grantedBy="your admin">
      {error && <InlineAlert tone="danger" title="Not done">{error}</InlineAlert>}
      <Card title="Period">
        <FormField id="rt-months" label="Keep details for (months after the last activity)">
          <Select aria-label="Keep details for" value={p.months} disabled={!p.canChange} onChange={(v) => v && void run('months', () => p.onMonths(v))} options={p.monthsOptions.map((m) => ({ value: m, label: `${m} months` }))} />
        </FormField>
        <Text as="p" tone="secondary">Anyone on legal hold, hired, or with an open application or offer is never touched.</Text>
      </Card>
      <Card title="Run">
        <div className="yx-tim-row">
          <Button loading={busy === 'preview'} onClick={() => void run('preview', async () => setPreview(await p.onPreview()))}>Preview (changes nothing)</Button>
          <Button variant="danger" onClick={() => setConfirming(true)}>Run now</Button>
        </div>
        {preview && <Text as="p">Today it would send {summary(preview)}</Text>}
        {last && <Text as="p">{last}</Text>}
      </Card>
      <DataTable label="Retention runs" columns={cols} rows={p.runs} getRowId={(r) => r.id} empty={<EmptyState compact title="No runs yet. It runs every night." />} />
      {confirming && (
        <ConfirmDialog open destructive onOpenChange={(o) => !o && setConfirming(false)} title="Run the retention sweep now?" consequence="Due candidates are anonymised for good and renewal emails are sent. It also runs every night." confirmLabel="Run now" onConfirm={async () => {
          const r = await p.onRun();
          setLast(`Done: ${summary(r)}`);
          setConfirming(false);
        }} />
      )}
    </LivePage>
  );
}
