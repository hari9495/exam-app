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
import { STAGE } from '../candidate-dialogs';
import type { LoadState, TalentList, TalentListMember } from './types';

// Recruitment batch AT4, wired (M10-BUILD-DESIGN §7.3): talent pools and hotlists (HIR-20 will replace it). Duplicates
// and retention are the designed HIR-05 screens now (hiring-candidates.tsx).

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
