import { useState } from 'react';
import { Plus } from 'lucide-react';
import { Button } from '../../../components/button';
import { DatePicker } from '../../../components/date';
import { Badge, type BadgeTone } from '../../../components/display';
import { Drawer } from '../../../components/drawer';
import { EmptyState, InlineAlert } from '../../../components/feedback';
import { FormField } from '../../../components/field';
import { Text } from '../../../components/foundations';
import { NumberField, TextArea, TextField } from '../../../components/inputs';
import { ConfirmDialog } from '../../../components/overlay';
import { Segment } from '../../../components/segment';
import { Select } from '../../../components/select';
import { Card } from '../../../components/shell';
import { DataTable, type TableColumn } from '../../../components/table';
import { dayKey } from '../../../lib/dates';
import { errorText, useRun } from '../../org/org-kit';
import { LivePage, dateText } from '../../time/live/kit';
import type { Choice, CompCycle, CompMatrix, CompProposal, CompSheet, LoadState, MyPayBand, PayEquity } from './types';

// Performance batch PM7, wired (M06-BUILD-DESIGN §12; PRF-10 comp review, PAY-39 my pay band, YX-PERF-18 pay equity).
// Amounts are rupees per year. A manager sees their team's pay only inside a comp cycle; every look is recorded.

const STATUS: Record<CompCycle['status'], { label: string; tone: BadgeTone }> = {
  draft: { label: 'Draft', tone: 'neutral' },
  open: { label: 'Open for proposals', tone: 'info' },
  approved: { label: 'Approved', tone: 'success' },
  applied: { label: 'Applied', tone: 'success' },
  closed: { label: 'Closed', tone: 'neutral' },
};
const PSTATUS: Record<CompProposal['status'], { label: string; tone: BadgeTone }> = {
  draft: { label: 'Draft', tone: 'neutral' },
  submitted: { label: 'Waiting for approval', tone: 'info' },
  approved: { label: 'Approved', tone: 'success' },
  rejected: { label: 'Sent back', tone: 'warning' },
  applied: { label: 'Applied', tone: 'success' },
};
const inr = (x: number | null) => (x === null ? '—' : `₹${x.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`);

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

export interface CompSheetScreenProps {
  state: LoadState;
  onRetry?: () => void;
  sheet: CompSheet | null;
  departments: Choice[];
  designations: Choice[];
  onBack: () => void;
  onBudgets: (budgets: { departmentId: string; kind: 'merit' | 'bonus'; amount: number }[]) => Promise<unknown>;
  onOpenCycle: () => Promise<unknown>;
  onSave: (id: string, input: { meritPct: number; promotionToDesignationId: string | null; promotionAmount: number; bonusAmount: number; justification: string | null; version: number }) => Promise<unknown>;
  onSubmit: () => Promise<unknown>;
  onApply: () => Promise<unknown>;
  equity?: PayEquity | null;
  onEquity?: (dimension: 'gender' | 'grade' | 'location') => Promise<unknown>;
}

export function CompSheetScreen(p: CompSheetScreenProps) {
  const s = p.sheet;
  const { busy, error, run } = useRun();
  const [editing, setEditing] = useState<CompProposal | null>(null);
  const [budgeting, setBudgeting] = useState(false);
  const [applying, setApplying] = useState(false);
  const [dimension, setDimension] = useState<'gender' | 'grade' | 'location'>('gender');
  const columns: TableColumn<CompProposal>[] = [
    { key: 'e', header: 'Employee', value: (x) => x.employee, width: 200, hideable: false },
    { key: 'b', header: 'Band', value: (x) => x.band ?? '—', width: 140 },
    { key: 'c', header: 'Now', value: (x) => x.currentCtc ?? 0, render: (x) => <Text>{inr(x.currentCtc)}</Text>, width: 140 },
    { key: 'r', header: 'Compa', value: (x) => x.compaRatio ?? '', render: (x) => <Text>{x.compaRatio ?? '—'}</Text>, width: 90 },
    { key: 'm', header: 'Merit', value: (x) => x.meritPct ?? 0, render: (x) => <Text>{`${x.meritPct}% · ${inr(x.meritAmount)}`}</Text>, width: 180 },
    { key: 'n', header: 'New', value: (x) => x.newCtc ?? 0, render: (x) => <Text>{inr(x.newCtc)}</Text>, width: 140 },
    { key: 'bo', header: 'Bonus', value: (x) => x.bonusAmount ?? 0, render: (x) => <Text>{inr(x.bonusAmount)}</Text>, width: 120 },
    { key: 's', header: 'Status', value: (x) => x.status, render: (x) => (
      <>
        <Badge tone={PSTATUS[x.status].tone}>{PSTATUS[x.status].label}</Badge> {x.outOfRange && <Badge tone="warning">Outside the matrix</Badge>}
      </>
    ), width: 230 },
  ];
  return (
    <LivePage
      title={s ? s.cycle.name : 'Comp cycle'}
      description={s ? `${STATUS[s.cycle.status].label} · effective ${dateText(s.cycle.effectiveOn)}${s.role === 'manager' ? ' · your team only; your views are recorded' : ''}` : undefined}
      state={p.state}
      onRetry={p.onRetry}
      what="this comp cycle"
      actions={
        <>
          <Button onClick={p.onBack}>Back</Button>
          {s?.role === 'hr' && s.cycle.status === 'draft' && <Button onClick={() => setBudgeting(true)}>Budgets</Button>}
          {s?.role === 'hr' && s.cycle.status === 'draft' && (
            <Button variant="primary" loading={busy === 'open'} onClick={() => void run('open', p.onOpenCycle)}>
              Open for proposals
            </Button>
          )}
          {s?.can.submit && (
            <Button variant="primary" loading={busy === 'submit'} onClick={() => void run('submit', p.onSubmit)}>
              Send for approval
            </Button>
          )}
          {s?.can.apply && (
            <Button variant="primary" onClick={() => setApplying(true)}>
              Apply
            </Button>
          )}
        </>
      }
    >
      {s && (
        <>
          {error && (
            <InlineAlert tone="danger" title="That didn't work">
              {error}
            </InlineAlert>
          )}
          {s.budgets.length > 0 && (
            <Card title="Budgets">
              <ul className="yx-lif-list">
                {s.budgets.map((b) => (
                  <li key={`${b.departmentId}-${b.kind}`}>
                    <Text>{`${b.department} · ${b.kind === 'merit' ? 'merit and promotions' : 'bonus'}: ${inr(b.used)} of ${inr(b.amount)}`}</Text> {b.over && <Badge tone="warning">{s.overrun === 'block' ? 'Over budget: cannot be sent' : 'Over budget: needs a finance approval'}</Badge>}
                  </li>
                ))}
              </ul>
            </Card>
          )}
          <DataTable label="Proposals" columns={columns} rows={s.proposals} getRowId={(x) => x.id} rowNoun={['proposal', 'proposals']} cardSummary empty={<EmptyState compact title={s.cycle.status === 'draft' ? 'Open the cycle to make the proposals.' : 'No proposals here.'} />} rowButtons={(x) => (s.can.edit && x.status === 'draft' ? <Button size="sm" onClick={() => setEditing(x)}>Change</Button> : null)} />
          {p.onEquity && s.role !== 'manager' && (
            <Card title="Pay equity" actions={
              <>
                <Segment label="Compare by" value={dimension} onChange={setDimension} options={[{ value: 'gender', label: 'Gender' }, { value: 'grade', label: 'Grade' }, { value: 'location', label: 'Location' }]} />{' '}
                <Button loading={busy === 'equity'} onClick={() => void run('equity', () => p.onEquity!(dimension))}>
                  Run
                </Button>
              </>
            }>
              {!p.equity ? (
                <Text as="p" tone="secondary">The gap by group before and after these proposals. Groups smaller than the company minimum are suppressed.</Text>
              ) : (
                <>
                  <ul className="yx-lif-list">
                    {p.equity.after.map((g) => {
                      const b = p.equity!.before.find((x) => x.group === g.group);
                      return (
                        <li key={g.group}>
                          <Text>{g.suppressed ? `${g.group}: suppressed (small group)` : `${g.group} (${g.count}): mean gap ${b && !b.suppressed ? `${b.meanGapPct}% →` : ''} ${g.meanGapPct}%, median ${g.medianGapPct}%, within grade ${g.adjustedGapPct}%`}</Text>
                        </li>
                      );
                    })}
                  </ul>
                  {p.equity.flagged.length > 0 && <InlineAlert tone="warning" title={`Below their grade-and-role median by more than ${p.equity.threshold}%`}>{p.equity.flagged.map((f) => f.employee).join(', ')}. Nothing changes by itself.</InlineAlert>}
                </>
              )}
            </Card>
          )}
        </>
      )}
      {editing && <ProposalDrawer p={editing} designations={p.designations} onClose={() => setEditing(null)} onSave={(input) => p.onSave(editing.id, input)} />}
      {budgeting && s && <BudgetsDialog departments={p.departments} current={s.budgets} onClose={() => setBudgeting(false)} onSave={p.onBudgets} />}
      {applying && (
        <ConfirmDialog open onOpenChange={(o) => !o && setApplying(false)} title="Apply the comp cycle?" confirmLabel="Apply" onConfirm={async () => {
          await run('apply', p.onApply);
          setApplying(false);
        }}>
          <Text as="p">Pay changes go into job history as approved bulk changes from the effective date, bonuses go to payroll, and letters follow. It happens once, all at once.</Text>
        </ConfirmDialog>
      )}
    </LivePage>
  );
}

function ProposalDrawer({ p, designations, onClose, onSave }: { p: CompProposal; designations: Choice[]; onClose: () => void; onSave: (input: { meritPct: number; promotionToDesignationId: string | null; promotionAmount: number; bonusAmount: number; justification: string | null; version: number }) => Promise<unknown> }) {
  const [merit, setMerit] = useState<number | null>(p.meritPct);
  const [promote, setPromote] = useState<'no' | 'yes'>(p.promotionToDesignationId ? 'yes' : 'no');
  const [desig, setDesig] = useState<string | null>(p.promotionToDesignationId);
  const [promoAmount, setPromoAmount] = useState<number | null>(p.promotionAmount);
  const [bonus, setBonus] = useState<number | null>(p.bonusAmount);
  const [why, setWhy] = useState(p.justification ?? '');
  const [failed, setFailed] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const cell = p.cell;
  // Same rule as the API (outOfRange): with no rating there is no cell, so any increase needs a reason.
  const outside = promote === 'yes' || (merit !== null && (cell ? merit < cell.minPct * (p.proration ?? 1) - 0.001 || merit > cell.maxPct * (p.proration ?? 1) + 0.001 : merit > 0));
  const save = async () => {
    setSaving(true);
    setFailed(null);
    try {
      await onSave({ meritPct: merit ?? 0, promotionToDesignationId: promote === 'yes' ? desig : null, promotionAmount: promote === 'yes' ? (promoAmount ?? 0) : 0, bonusAmount: bonus ?? 0, justification: why.trim() || null, version: p.version });
      onClose();
    } catch (e) {
      setFailed(errorText(e));
    } finally {
      setSaving(false);
    }
  };
  return (
    <Drawer open onOpenChange={(o) => !o && onClose()} size="md" title={p.employee} subtitle={`${p.band ?? 'No rating'} · now ${inr(p.currentCtc)}${p.compaRatio ? ` · compa ${p.compaRatio}` : ''}`} footer={
      <>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="primary" loading={saving} disabled={Boolean(outside) && why.trim().length < 3} onClick={() => void save()}>
          Save
        </Button>
      </>
    }>
      {failed && (
        <InlineAlert tone="danger" title="Not saved">
          {failed}
        </InlineAlert>
      )}
      {cell && <Text as="p" tone="secondary">{`The matrix suggests ${cell.minPct}–${cell.maxPct}% (target ${cell.targetPct}%)${p.proration !== null && p.proration < 1 ? `, prorated by ${Math.round(p.proration * 100)}%` : ''}.`}</Text>}
      <FormField id="pd-merit" label="Merit increase (%)">
        <NumberField value={merit} onChange={setMerit} min={0} max={100} decimals />
      </FormField>
      <FormField id="pd-promo" label="Promotion">
        <Segment label="Promotion" value={promote} onChange={setPromote} options={[{ value: 'no', label: 'No' }, { value: 'yes', label: 'Promote' }]} />
      </FormField>
      {promote === 'yes' && (
        <>
          <FormField id="pd-desig" label="New designation" required>
            <Select aria-label="New designation" value={desig} onChange={setDesig} options={designations} searchable />
          </FormField>
          <FormField id="pd-pamount" label="Promotion increase (₹ a year)" required>
            <NumberField value={promoAmount} onChange={setPromoAmount} min={0} decimals />
          </FormField>
        </>
      )}
      <FormField id="pd-bonus" label="Bonus (₹)">
        <NumberField value={bonus} onChange={setBonus} min={0} decimals />
      </FormField>
      <FormField id="pd-why" label="Why" required={Boolean(outside)} optional={!outside} helper={outside ? 'Outside the matrix, or a promotion: an extra finance approval follows.' : undefined}>
        <TextArea value={why} onChange={setWhy} rows={2} maxLength={1000} />
      </FormField>
    </Drawer>
  );
}

function BudgetsDialog({ departments, current, onClose, onSave }: { departments: Choice[]; current: CompSheet['budgets']; onClose: () => void; onSave: CompSheetScreenProps['onBudgets'] }) {
  const [dept, setDept] = useState<string | null>(departments[0]?.value ?? null);
  const [merit, setMerit] = useState<number | null>(null);
  const [bonus, setBonus] = useState<number | null>(null);
  const cur = (k: 'merit' | 'bonus') => current.find((b) => b.departmentId === dept && b.kind === k)?.amount ?? null;
  const [tried, setTried] = useState(false);
  return (
    <ConfirmDialog open onOpenChange={(o) => !o && onClose()} size="md" title="Budgets" confirmLabel="Save" onConfirm={async () => {
      setTried(true);
      if (!dept || (merit === null && bonus === null)) return false;
      await onSave([...(merit !== null ? [{ departmentId: dept!, kind: 'merit' as const, amount: merit }] : []), ...(bonus !== null ? [{ departmentId: dept!, kind: 'bonus' as const, amount: bonus }] : [])]);
      onClose();
    }}>
      <FormField id="bd-dept" label="Department" required error={tried && !dept ? 'Choose the department.' : null}>
        <Select aria-label="Department" value={dept} onChange={setDept} options={departments} searchable />
      </FormField>
      <FormField id="bd-merit" label="Merit and promotions (₹ a year)" error={tried && merit === null && bonus === null ? 'Enter a merit budget or a bonus pool.' : null} helper={cur('merit') !== null ? `Now ${inr(cur('merit'))}` : undefined}>
        <NumberField value={merit} onChange={setMerit} min={0} decimals />
      </FormField>
      <FormField id="bd-bonus" label="Bonus pool (₹)" helper={cur('bonus') !== null ? `Now ${inr(cur('bonus'))}` : undefined}>
        <NumberField value={bonus} onChange={setBonus} min={0} decimals />
      </FormField>
    </ConfirmDialog>
  );
}

// ------------------------------------------------------------------------------------------ my pay band (PAY-39)

export function MyPayBandScreen({ state, onRetry, band }: { state: LoadState; onRetry?: () => void; band: MyPayBand | null }) {
  return (
    <LivePage title="My pay band" description="Your grade's range and where you sit in it. Only you see this." state={state} onRetry={onRetry} what="your pay band">
      {band && !band.visible && <EmptyState compact title="Your company does not show pay bands." />}
      {band?.visible && !band.range && <EmptyState compact title="No range is set for your grade yet." />}
      {band?.visible && band.range && (
        <Card title={`${inr(band.range.min)} to ${inr(band.range.max)}`}>
          <Text as="p">{`Midpoint ${inr(band.range.mid)}.`}</Text>
          <Text as="p">{band.position === 'within' ? `You are within the range, in quarter ${band.quartile} of 4.` : band.position === 'below' ? 'You are below the range.' : 'You are above the range.'}</Text>
        </Card>
      )}
    </LivePage>
  );
}
