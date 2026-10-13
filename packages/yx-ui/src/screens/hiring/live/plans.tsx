import { useState } from 'react';
import { Plus } from 'lucide-react';
import { Button } from '../../../components/button';
import { Badge, type BadgeTone } from '../../../components/display';
import { EmptyState, InlineAlert } from '../../../components/feedback';
import { FormField } from '../../../components/field';
import { Text } from '../../../components/foundations';
import { NumberField, TextArea } from '../../../components/inputs';
import { ConfirmDialog } from '../../../components/overlay';
import { Select } from '../../../components/select';
import { Card } from '../../../components/shell';
import { DataTable, type TableColumn } from '../../../components/table';
import { useRun } from '../../org/org-kit';
import { LivePage } from '../../time/live/kit';
import type { Choice, HeadcountPlan, LoadState, PlanInput, PlanLine } from './types';

// Recruitment batch AT2, wired (M10-BUILD-DESIGN §5): headcount plans per department and financial year. Approved,
// committed (live requisitions) and filled (hired) per line; committed and filled are counted from the jobs.

const STATUS: Record<HeadcountPlan['status'], { label: string; tone: BadgeTone }> = {
  draft: { label: 'Draft', tone: 'neutral' },
  submitted: { label: 'Waiting for approval', tone: 'warning' },
  approved: { label: 'Approved', tone: 'success' },
  rejected: { label: 'Sent back', tone: 'danger' },
};
const inr = (n: number | null) => (n === null ? '—' : `₹${n.toLocaleString('en-IN')}`);
const fyLabel = (y: number) => `FY ${y}–${String(y + 1).slice(2)}`;

export interface HeadcountPlansScreenProps {
  state: LoadState;
  onRetry?: () => void;
  plans: HeadcountPlan[];
  fy: number;
  years: number[];
  onFy: (y: number) => void;
  departments: Choice[];
  designations: Choice[];
  grades: Choice[];
  locations: Choice[];
  onSave: (id: string | null, input: PlanInput) => Promise<unknown>;
  onSubmit: (id: string, version: number) => Promise<unknown>;
}

export function HeadcountPlansScreen(p: HeadcountPlansScreenProps) {
  const { busy, error, run } = useRun();
  const [editing, setEditing] = useState<HeadcountPlan | 'new' | null>(null);
  const columns: TableColumn<PlanLine>[] = [
    { key: 'd', header: 'Designation', value: (l) => l.designation, width: 200, hideable: false },
    { key: 'g', header: 'Grade', value: (l) => l.grade ?? '—', width: 110 },
    { key: 'l', header: 'Location', value: (l) => l.location ?? '—', width: 140 },
    { key: 'c', header: 'Approved', value: (l) => l.count, width: 100 },
    { key: 'm', header: 'Committed', value: (l) => l.committed, width: 110 },
    { key: 'f', header: 'Filled', value: (l) => l.filled, width: 90 },
    { key: 'b', header: 'Budget', value: (l) => l.budget ?? 0, render: (l) => <span>{inr(l.budget)}</span>, width: 140 },
  ];
  return (
    <LivePage
      title="Headcount plans"
      description="Positions each department may hire this year, and what is already committed or filled."
      state={p.state}
      onRetry={p.onRetry}
      what="headcount plans"
      grantedBy="your admin"
      actions={
        <Button variant="primary" icon={Plus} onClick={() => setEditing('new')}>
          New plan
        </Button>
      }
    >
      <FormField id="hp-fy" label="Financial year">
        <Select aria-label="Financial year" value={String(p.fy)} onChange={(v) => v && p.onFy(Number(v))} options={p.years.map((y) => ({ value: String(y), label: fyLabel(y) }))} />
      </FormField>
      {error && (
        <InlineAlert tone="danger" title="That didn't work">
          {error}
        </InlineAlert>
      )}
      {!p.plans.length && <EmptyState compact title={`No plans for ${fyLabel(p.fy)}.`} />}
      {p.plans.map((plan) => (
        <Card key={plan.id} title={`${plan.department} · ${fyLabel(plan.fyStart)}`} actions={
          <>
            <Badge tone={STATUS[plan.status].tone}>{STATUS[plan.status].label}</Badge>
            {(plan.status === 'draft' || plan.status === 'rejected') && (
              <>
                <Button size="sm" onClick={() => setEditing(plan)}>
                  Edit
                </Button>
                <Button size="sm" variant="primary" loading={busy === plan.id} onClick={() => void run(plan.id, () => p.onSubmit(plan.id, plan.version))}>
                  Send for approval
                </Button>
              </>
            )}
          </>
        }>
          {plan.note && <Text as="p" tone="secondary">{plan.note}</Text>}
          <DataTable label={`Lines of ${plan.department}`} columns={columns} rows={plan.lines} getRowId={(l) => l.id} rowNoun={['line', 'lines']} cardSummary />
        </Card>
      ))}
      {editing && <PlanDialog {...p} plan={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
    </LivePage>
  );
}

type Row = { designationId: string | null; gradeId: string | null; locationId: string | null; count: number | null; budget: number | null };

function PlanDialog(p: HeadcountPlansScreenProps & { plan: HeadcountPlan | null; onClose: () => void }) {
  const [dept, setDept] = useState<string | null>(p.plan?.departmentId ?? null);
  const [fy, setFy] = useState<number>(p.plan?.fyStart ?? p.fy);
  const [note, setNote] = useState(p.plan?.note ?? '');
  const [rows, setRows] = useState<Row[]>(p.plan ? p.plan.lines.map((l) => ({ designationId: l.designationId, gradeId: l.gradeId, locationId: l.locationId, count: l.count, budget: l.budget })) : [{ designationId: null, gradeId: null, locationId: null, count: 1, budget: null }]);
  const set = (i: number, patch: Partial<Row>) => setRows((r) => r.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const ok = dept && rows.length > 0 && rows.every((r) => r.designationId && r.count && r.count > 0);
  return (
    <ConfirmDialog open onOpenChange={(o) => !o && p.onClose()} size="md" title={p.plan ? 'Edit plan' : 'New plan'} confirmLabel="Save" confirmDisabled={!ok} onConfirm={async () => {
      await p.onSave(p.plan?.id ?? null, { departmentId: dept!, legalEntityId: p.plan?.legalEntityId ?? null, fyStart: fy, note: note.trim() || null, lines: rows.map((r) => ({ designationId: r.designationId!, gradeId: r.gradeId, locationId: r.locationId, count: r.count!, budget: r.budget })), version: p.plan?.version });
      p.onClose();
    }}>
      <FormField id="hp-dept" label="Department" required>
        <Select aria-label="Department" value={dept} onChange={setDept} options={p.departments} searchable />
      </FormField>
      <FormField id="hp-year" label="Financial year" required>
        <Select aria-label="Plan year" value={String(fy)} onChange={(v) => v && setFy(Number(v))} options={p.years.map((y) => ({ value: String(y), label: fyLabel(y) }))} />
      </FormField>
      {rows.map((r, i) => (
        <div key={i} className="yx-tim-stack">
          <FormField id={`hp-d${i}`} label={`Line ${i + 1}: designation`} required>
            <Select aria-label={`Line ${i + 1}: designation`} value={r.designationId} onChange={(v) => set(i, { designationId: v })} options={p.designations} searchable />
          </FormField>
          <FormField id={`hp-g${i}`} label={`Line ${i + 1}: grade`} optional>
            <Select aria-label={`Line ${i + 1}: grade`} value={r.gradeId} onChange={(v) => set(i, { gradeId: v })} options={p.grades} clearable />
          </FormField>
          <FormField id={`hp-l${i}`} label={`Line ${i + 1}: location`} optional>
            <Select aria-label={`Line ${i + 1}: location`} value={r.locationId} onChange={(v) => set(i, { locationId: v })} options={p.locations} clearable />
          </FormField>
          <FormField id={`hp-c${i}`} label={`Line ${i + 1}: positions`} required>
            <NumberField value={r.count} onChange={(v) => set(i, { count: v })} min={1} max={10000} />
          </FormField>
          <FormField id={`hp-b${i}`} label={`Line ${i + 1}: budget (₹ a year)`} optional>
            <NumberField value={r.budget} onChange={(v) => set(i, { budget: v })} min={0} />
          </FormField>
          {rows.length > 1 && (
            <Button size="sm" variant="danger" onClick={() => setRows((x) => x.filter((_, j) => j !== i))}>
              Remove line {i + 1}
            </Button>
          )}
        </div>
      ))}
      <Button size="sm" icon={Plus} onClick={() => setRows((x) => [...x, { designationId: null, gradeId: null, locationId: null, count: 1, budget: null }])}>
        Add a line
      </Button>
      <FormField id="hp-note" label="Note" optional>
        <TextArea value={note} onChange={setNote} rows={2} maxLength={1000} />
      </FormField>
    </ConfirmDialog>
  );
}
