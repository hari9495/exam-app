import { useState } from 'react';
import { Plus } from 'lucide-react';
import { Button } from '../../../components/button';
import { Checkbox } from '../../../components/choice';
import { InlineAlert } from '../../../components/feedback';
import { FormField } from '../../../components/field';
import { NumberField, TextField } from '../../../components/inputs';
import { MultiSelect, Select } from '../../../components/select';
import { Card } from '../../../components/shell';
import { Text } from '../../../components/foundations';
import { useRun } from '../../org/org-kit';
import { LivePage } from '../../time/live/kit';
import type { ApprovalRoute, ApproverType, Choice, LoadState, RouteStep } from './types';

// Recruitment batch AT2, wired (M10-BUILD-DESIGN §5, founder D3): who approves a requisition and an offer. Replaces the
// older Settings › Approvals page. A requisition now runs on YukthiX Approvals (the headcount plan may add a step for
// finance); offers move with AT6.

const APPROVER: { value: ApproverType; label: string }[] = [
  { value: 'users', label: 'Named people' },
  { value: 'reporting_manager', label: 'The submitter’s manager' },
  { value: 'hiring_manager', label: 'The job’s hiring manager' },
  { value: 'group', label: 'A group' },
];

export interface ApprovalRoutesScreenProps {
  state: LoadState;
  onRetry?: () => void;
  requisition: ApprovalRoute | null;
  offer: ApprovalRoute | null;
  people: Choice[];
  groups: Choice[];
  onSave: (gate: 'requisition' | 'offer', route: ApprovalRoute) => Promise<unknown>;
}

export function ApprovalRoutesScreen(p: ApprovalRoutesScreenProps) {
  return (
    <LivePage title="Hiring approvals" description="Who signs off before a requisition opens or an offer goes out." state={p.state} onRetry={p.onRetry} what="approval routes" grantedBy="your admin">
      {p.requisition && (
        <RouteCard key={`r-${JSON.stringify(p.requisition)}`} gate="requisition" title="Requisition approval" note="Runs in Approvals before a new job opens. When a hire is outside the headcount plan or over its line, a finance step is added." initial={p.requisition} {...p} />
      )}
      {p.offer && <RouteCard key={`o-${JSON.stringify(p.offer)}`} gate="offer" title="Offer approval" note="Runs before an offer can be sent to a candidate." initial={p.offer} {...p} />}
    </LivePage>
  );
}

function RouteCard(p: ApprovalRoutesScreenProps & { gate: 'requisition' | 'offer'; title: string; note: string; initial: ApprovalRoute }) {
  const { busy, error, run } = useRun();
  const [enabled, setEnabled] = useState(p.initial.enabled);
  const [steps, setSteps] = useState<RouteStep[]>(p.initial.steps);
  const [saved, setSaved] = useState(false);
  const set = (i: number, patch: Partial<RouteStep>) => setSteps((s) => s.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const incomplete = steps.some((s) => !s.name.trim() || (s.approverType === 'users' && enabled && !s.approverUserIds.length) || (s.approverType === 'group' && !s.groupId));
  return (
    <Card title={p.title}>
      <Text as="p" tone="secondary">{p.note}</Text>
      {error && (
        <InlineAlert tone="danger" title="Not saved">
          {error}
        </InlineAlert>
      )}
      {saved && !error && <Text as="p" tone="secondary">Saved.</Text>}
      <Checkbox label="Ask for approval" checked={enabled} onChange={(v) => { setEnabled(v); setSaved(false); }} />
      {steps.map((s, i) => (
        <div key={i} className="yx-tim-stack">
          <FormField id={`${p.gate}-n${i}`} label={`Step ${i + 1}`} required>
            <TextField value={s.name} onChange={(v) => set(i, { name: v })} maxLength={200} />
          </FormField>
          <FormField id={`${p.gate}-t${i}`} label={`Who approves step ${i + 1}`}>
            <Select aria-label={`Who approves step ${i + 1}`} value={s.approverType} onChange={(v) => v && set(i, { approverType: v, approverUserIds: [], groupId: null, managerLevel: v === 'reporting_manager' ? 1 : null })} options={APPROVER} />
          </FormField>
          {s.approverType === 'users' && (
            <FormField id={`${p.gate}-u${i}`} label={`People for step ${i + 1}`} required={enabled}>
              <MultiSelect aria-label={`People for step ${i + 1}`} value={s.approverUserIds} onChange={(v) => set(i, { approverUserIds: v })} options={p.people} searchable />
            </FormField>
          )}
          {s.approverType === 'reporting_manager' && (
            <FormField id={`${p.gate}-l${i}`} label="Levels up" helper="1 is the direct manager.">
              <NumberField value={s.managerLevel} onChange={(v) => set(i, { managerLevel: v })} min={1} max={5} />
            </FormField>
          )}
          {s.approverType === 'group' && (
            <FormField id={`${p.gate}-g${i}`} label={`Group for step ${i + 1}`} required>
              <Select aria-label={`Group for step ${i + 1}`} value={s.groupId} onChange={(v) => set(i, { groupId: v })} options={p.groups} searchable />
            </FormField>
          )}
          <Button size="sm" variant="danger" onClick={() => setSteps((x) => x.filter((_, j) => j !== i))}>
            Remove step {i + 1}
          </Button>
        </div>
      ))}
      <Button size="sm" icon={Plus} onClick={() => setSteps((x) => [...x, { name: '', approverType: 'users', approverUserIds: [], managerLevel: null, groupId: null }])}>
        Add a step
      </Button>
      <div>
        <Button variant="primary" loading={busy === 'save'} disabled={incomplete} onClick={() => void run('save', async () => { await p.onSave(p.gate, { enabled, steps }); setSaved(true); })}>
          Save {p.title.toLowerCase()}
        </Button>
      </div>
    </Card>
  );
}
