import { useState } from 'react';
import { Plus } from 'lucide-react';
import { Button } from '../../../components/button';
import { Badge } from '../../../components/display';
import { EmptyState } from '../../../components/feedback';
import { FormField } from '../../../components/field';
import { Text } from '../../../components/foundations';
import { NumberField, TextField } from '../../../components/inputs';
import { ConfirmDialog } from '../../../components/overlay';
import { Segment } from '../../../components/segment';
import { Select } from '../../../components/select';
import { Card } from '../../../components/shell';
import { DataTable, type TableColumn } from '../../../components/table';
import { useRun } from '../../org/org-kit';
import { LivePage } from '../../time/live/kit';
import type { Choice, LoadState, ScorecardTemplateInput, ScorecardTemplateView } from './types';

// Recruitment batch AT5, wired: the scorecard templates (a Settings 6.1 stand-in until that page is wired). The
// interviewer's list and the scorecard itself are the designed HIR-06 / HIR-07 screens in hiring-pipeline.tsx.

export interface ScorecardTemplatesScreenProps {
  state: LoadState;
  onRetry?: () => void;
  templates: ScorecardTemplateView[];
  competencies: Choice[];
  canManage: boolean;
  onSave: (id: string | null, input: ScorecardTemplateInput) => Promise<unknown>;
  onArchive: (id: string) => Promise<unknown>;
}

export function ScorecardTemplatesScreen(p: ScorecardTemplatesScreenProps) {
  const [editing, setEditing] = useState<ScorecardTemplateView | 'new' | null>(null);
  const [archiving, setArchiving] = useState<ScorecardTemplateView | null>(null);
  const cols: TableColumn<ScorecardTemplateView>[] = [
    { key: 'n', header: 'Scorecard', value: (t) => t.name, hideable: false },
    { key: 'i', header: 'Items', type: 'number', value: (t) => t.items.length },
    { key: 'b', header: 'Pass bar', value: (t) => t.passBar, render: (t) => <span>{t.passBar} of {t.scaleMax}</span> },
    { key: 'u', header: 'In use', value: (t) => (t.inUse ? 'yes' : 'no'), render: (t) => (t.inUse ? <Badge tone="info">Used</Badge> : <Badge tone="neutral">Not used yet</Badge>) },
  ];
  return (
    <LivePage title="Interview scorecards" description="What a panel rates, with weights and the bar a candidate must reach." state={p.state} onRetry={p.onRetry} what="scorecards" grantedBy="your admin" actions={p.canManage && <Button variant="primary" icon={Plus} onClick={() => setEditing('new')}>New scorecard</Button>}>
      <DataTable label="Interview scorecards" columns={cols} rows={p.templates} getRowId={(t) => t.id} rowNoun={['scorecard', 'scorecards']} empty={<EmptyState compact title="No scorecards yet." />} rowButtons={(t) => p.canManage ? (
        <>
          <Button size="sm" onClick={() => setEditing(t)}>{t.inUse ? `Copy ${t.name}` : `Edit ${t.name}`}</Button>
          <Button size="sm" variant="danger" onClick={() => setArchiving(t)}>Archive</Button>
        </>
      ) : null} />
      {editing && <TemplateDialog {...p} template={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
      {archiving && <ConfirmDialog open destructive onOpenChange={(o) => !o && setArchiving(null)} title={`Archive ${archiving.name}?`} consequence="It is no longer offered for new interviews. Scorecards already filled keep it." confirmLabel="Archive scorecard" onConfirm={async () => { await p.onArchive(archiving.id); setArchiving(null); }} />}
    </LivePage>
  );
}

function TemplateDialog(p: ScorecardTemplatesScreenProps & { template: ScorecardTemplateView | null; onClose: () => void }) {
  const copy = Boolean(p.template?.inUse);
  const [name, setName] = useState(p.template ? (copy ? `${p.template.name} (copy)` : p.template.name) : '');
  const [scale, setScale] = useState<number | null>(p.template?.scaleMax ?? 4);
  const [bar, setBar] = useState<number | null>(p.template?.passBar ?? 2.5);
  const [items, setItems] = useState(p.template?.items.map((i) => ({ label: i.label, guidance: i.guidance ?? '', weight: i.weight, competencyId: i.competencyId })) ?? [{ label: '', guidance: '', weight: 1, competencyId: null as string | null }]);
  const [fromLib, setFromLib] = useState<string | null>(null);
  const barBad = bar == null || scale == null || bar < 1 || bar > scale;
  const ok = name.trim() && !barBad && items.length > 0 && items.every((i) => i.label.trim() && i.weight >= 1 && i.weight <= 10);
  const [tried, setTried] = useState(false);
  const set = (k: number, patch: Partial<(typeof items)[number]>) => setItems((x) => x.map((y, i) => (i === k ? { ...y, ...patch } : y)));
  return (
    <ConfirmDialog open size="md" onOpenChange={(o) => !o && p.onClose()} title={p.template ? (copy ? `Copy ${p.template.name}` : `Edit ${p.template.name}`) : 'New scorecard'} confirmLabel="Save scorecard" onConfirm={async () => {
      setTried(true);
      if (!ok) return false;
      await p.onSave(copy ? null : (p.template?.id ?? null), { name: name.trim(), scaleMax: scale!, passBar: bar!, items: items.map((i) => ({ label: i.label.trim(), guidance: i.guidance.trim() || null, weight: i.weight, competencyId: i.competencyId })) });
      p.onClose();
    }}>
      {copy && <Text as="p" tone="secondary">This scorecard has been used, so changes are saved as a new copy.</Text>}
      <FormField id="st-name" label="Name" required error={tried && !name.trim() ? 'Enter the name.' : null}>
        <TextField value={name} onChange={setName} maxLength={120} />
      </FormField>
      <div className="yx-tim-row">
        <FormField id="st-scale" label="Rating scale (1 to …)" required error={tried && scale == null ? 'Enter the top of the scale.' : null}>
          <NumberField value={scale} onChange={setScale} min={3} max={10} />
        </FormField>
        <FormField id="st-bar" label="Pass bar" required error={barBad ? 'Between 1 and the top of the scale.' : undefined} helper="The weighted average a candidate must reach.">
          <NumberField value={bar} onChange={setBar} min={1} max={10} decimals />
        </FormField>
      </div>
      {items.map((it, k) => (
        <div key={k} className="yx-tim-row">
          <FormField id={`st-l${k}`} label={`Item ${k + 1}`} required error={tried && !it.label.trim() ? 'Enter what the panel rates.' : null}>
            <TextField value={it.label} onChange={(v) => set(k, { label: v })} maxLength={200} />
          </FormField>
          <FormField id={`st-w${k}`} label={`Weight ${k + 1}`} error={tried && !(it.weight >= 1 && it.weight <= 10) ? 'Enter a weight from 1 to 10.' : null}>
            <NumberField value={it.weight} onChange={(v) => set(k, { weight: v ?? 1 })} min={1} max={10} />
          </FormField>
          <FormField id={`st-g${k}`} label={`What good looks like ${k + 1}`} optional>
            <TextField value={it.guidance} onChange={(v) => set(k, { guidance: v })} maxLength={1000} />
          </FormField>
          {items.length > 1 && <Button size="sm" variant="danger" onClick={() => setItems((x) => x.filter((_, i) => i !== k))}>Remove item {k + 1}</Button>}
        </div>
      ))}
      <div className="yx-tim-row">
        <Button size="sm" icon={Plus} disabled={items.length >= 30} onClick={() => setItems((x) => [...x, { label: '', guidance: '', weight: 1, competencyId: null }])}>Add an item</Button>
        {p.competencies.length > 0 && (
          <>
            <FormField id="st-lib" label="From the competency library" hideLabel>
              <Select aria-label="From the competency library" placeholder="From the competency library" value={fromLib} onChange={setFromLib} options={p.competencies} searchable />
            </FormField>
            <Button size="sm" disabled={!fromLib} onClick={() => { const c = p.competencies.find((x) => x.value === fromLib)!; setItems((x) => [...x.filter((i) => i.label.trim()), { label: c.label, guidance: '', weight: 1, competencyId: c.value }]); setFromLib(null); }}>Add competency</Button>
          </>
        )}
      </div>
    </ConfirmDialog>
  );
}
