import { useState } from 'react';
import { Plus } from 'lucide-react';
import { Button } from '../../components/button';
import { DatePicker } from '../../components/date';
import { Badge, type BadgeTone } from '../../components/display';
import { EmptyState, InlineAlert } from '../../components/feedback';
import { FormField } from '../../components/field';
import { Text } from '../../components/foundations';
import { NumberField, TextField } from '../../components/inputs';
import { ConfirmDialog } from '../../components/overlay';
import { Segment } from '../../components/segment';
import { Select } from '../../components/select';
import { DataTable, type TableColumn } from '../../components/table';
import { dayKey } from '../../lib/dates';
import { useRun } from '../org/org-kit';
import { LivePage, dateText } from '../time/live/kit';
import type { Choice, CompCycle, CompMatrix, LoadState } from '../performance/live/types';

// PRF-10 comp review cycles list (batch PM7, M06-BUILD-DESIGN §12; re-wired as a designed screen in batch T2-C, as answer
// 2579 did for the feedback tasks. The sheet itself is CompReviewScreen; PRF-10 comp review, PAY-39 my pay band, YX-PERF-18 pay equity).
// Amounts are rupees per year. A manager sees their team's pay only inside a comp cycle; every look is recorded.

const STATUS: Record<CompCycle['status'], { label: string; tone: BadgeTone }> = {
  draft: { label: 'Draft', tone: 'neutral' },
  open: { label: 'Open for proposals', tone: 'info' },
  approved: { label: 'Approved', tone: 'success' },
  applied: { label: 'Applied', tone: 'success' },
  closed: { label: 'Closed', tone: 'neutral' },
};

// ------------------------------------------------------------------------------------------ cycles

export interface CompCyclesScreenProps {
  state: LoadState;
  onRetry?: () => void;
  cycles: CompCycle[];
  canManage: boolean;
  matrices: CompMatrix[];
  entities: Choice[];
  reviewCycles: Choice[];
  onStarterMatrix: () => Promise<unknown>;
  onCreate: (input: { name: string; legalEntityId: string; currency: string; effectiveOn: string; matrixId: string; reviewCycleId: string | null; bonus: { month: string; targetPct: number; multipliers: Record<string, number> } | null }) => Promise<unknown>;
  onOpen: (id: string) => void;
}

export function CompCyclesScreen(p: CompCyclesScreenProps) {
  const { busy, error, run } = useRun();
  const [creating, setCreating] = useState(false);
  const columns: TableColumn<CompCycle>[] = [
    { key: 'n', header: 'Comp cycle', value: (x) => x.name, width: 260, hideable: false },
    { key: 's', header: 'Status', value: (x) => x.status, render: (x) => <Badge tone={STATUS[x.status].tone}>{STATUS[x.status].label}</Badge>, width: 170 },
    { key: 'e', header: 'Effective', value: (x) => x.effectiveOn, render: (x) => <Text>{dateText(x.effectiveOn)}</Text>, width: 140 },
    { key: 'c', header: 'Currency', value: (x) => x.currency, width: 100 },
  ];
  return (
    <LivePage
      title="Comp review"
      description="Merit, promotions and bonuses from the review ratings, approved and handed to payroll."
      state={p.state}
      onRetry={p.onRetry}
      what="comp cycles"
      actions={
        p.canManage && (
          <>
            {p.matrices.length === 0 && (
              <Button loading={busy === 'starter'} onClick={() => void run('starter', p.onStarterMatrix)}>
                Use the starter matrix
              </Button>
            )}
            <Button variant="primary" icon={Plus} disabled={!p.matrices.length} onClick={() => setCreating(true)}>
              New comp cycle
            </Button>
          </>
        )
      }
    >
      {error && (
        <InlineAlert tone="danger" title="That didn't work">
          {error}
        </InlineAlert>
      )}
      <DataTable label="Comp cycles" columns={columns} rows={p.cycles} getRowId={(x) => x.id} rowNoun={['cycle', 'cycles']} cardSummary empty={<EmptyState compact title="No comp cycles." description={p.canManage ? 'Start one after a review cycle is released.' : undefined} />} rowButtons={(x) => <Button size="sm" onClick={() => p.onOpen(x.id)}>Open</Button>} />
      {creating && <CompCycleDialog {...p} onClose={() => setCreating(false)} />}
    </LivePage>
  );
}

function CompCycleDialog(p: CompCyclesScreenProps & { onClose: () => void }) {
  const [name, setName] = useState('');
  const [entity, setEntity] = useState<string | null>(p.entities[0]?.value ?? null);
  const [review, setReview] = useState<string | null>(null);
  const [matrix, setMatrix] = useState<string | null>(p.matrices[0]?.id ?? null);
  const [on, setOn] = useState<Date | null>(null);
  const [withBonus, setWithBonus] = useState<'no' | 'yes'>('no');
  const [month, setMonth] = useState<Date | null>(null);
  const [target, setTarget] = useState<number | null>(10);
  const bands = [...new Set(p.matrices.find((m) => m.id === matrix)?.cells.map((c) => c.band) ?? [])];
  const [mult, setMult] = useState<Record<string, number | null>>({});
  const ok = name.trim().length >= 2 && entity && matrix && on && (withBonus === 'no' || (month && target !== null));
  const [tried, setTried] = useState(false);
  return (
    <ConfirmDialog open onOpenChange={(o) => !o && p.onClose()} size="md" title="New comp cycle" confirmLabel="Create" onConfirm={async () => {
      setTried(true);
      if (!ok) return false;
      await p.onCreate({ name: name.trim(), legalEntityId: entity!, currency: 'INR', effectiveOn: dayKey(on!), matrixId: matrix!, reviewCycleId: review, bonus: withBonus === 'yes' ? { month: dayKey(month!).slice(0, 7), targetPct: target!, multipliers: Object.fromEntries(bands.map((b) => [b, mult[b] ?? 0])) } : null });
      p.onClose();
    }}>
      <FormField id="cc-name" label="Name" required error={tried && name.trim().length < 2 ? 'Enter a name of at least 2 characters.' : null}>
        <TextField value={name} onChange={setName} maxLength={100} />
      </FormField>
      <FormField id="cc-entity" label="Legal entity" required error={tried && !entity ? 'Choose the legal entity.' : null}>
        <Select aria-label="Legal entity" value={entity} onChange={setEntity} options={p.entities} />
      </FormField>
      <FormField id="cc-review" label="Ratings from" optional helper="A released review cycle. Without one, everyone in the entity is listed with no rating.">
        <Select aria-label="Review cycle" value={review} onChange={setReview} options={p.reviewCycles} clearable />
      </FormField>
      <FormField id="cc-matrix" label="Merit matrix" required error={tried && !matrix ? 'Choose the merit matrix.' : null}>
        <Select aria-label="Merit matrix" value={matrix} onChange={setMatrix} options={p.matrices.map((m) => ({ value: m.id, label: m.name }))} />
      </FormField>
      <FormField id="cc-on" label="Effective from" required error={tried && !on ? 'Choose the effective date.' : null} helper="A date in a month payroll has already run is paid as arrears in the next run.">
        <DatePicker value={on} onChange={setOn} aria-label="Effective from" />
      </FormField>
      <FormField id="cc-bonus" label="Performance bonus">
        <Segment label="Performance bonus" value={withBonus} onChange={setWithBonus} options={[{ value: 'no', label: 'No bonus' }, { value: 'yes', label: 'Pay a bonus' }]} />
      </FormField>
      {withBonus === 'yes' && (
        <>
          <FormField id="cc-month" label="Paid in the month of" required error={tried && !month ? 'Choose the bonus pay month.' : null}>
            <DatePicker value={month} onChange={setMonth} aria-label="Bonus pay month" />
          </FormField>
          <FormField id="cc-target" label="Target bonus (% of annual pay)" required error={tried && target === null ? 'Enter the target bonus.' : null}>
            <NumberField value={target} onChange={setTarget} min={0} max={100} decimals />
          </FormField>
          {bands.map((b) => (
            <FormField key={b} id={`cc-m-${b}`} label={`${b}: multiplier`}>
              <NumberField value={mult[b] ?? null} onChange={(x) => setMult((m) => ({ ...m, [b]: x }))} min={0} max={5} decimals />
            </FormField>
          ))}
        </>
      )}
    </ConfirmDialog>
  );
}

// ------------------------------------------------------------------------------------------ the sheet (PRF-10)
