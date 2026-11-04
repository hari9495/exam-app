// PAY-03 Inputs › Special days (HLP-12 founder answers 92 and 93): the days a run pays as a benefit instead of salary
// (injury, maternity, suspension) per person, with where each came from: filled from approved injury leave in Time, or
// entered by payroll. Payroll edits them while the run can still be calculated (its own value then wins). Injury leave
// approved after an earlier month was locked shows here for payroll to review; the app never adds it by itself.
import { useState } from 'react';
import { Button } from '../../components/button';
import { Badge } from '../../components/display';
import { EmptyState, InlineAlert } from '../../components/feedback';
import { FormField, useTooEarly } from '../../components/field';
import { TextField } from '../../components/inputs';
import { Dialog } from '../../components/overlay';
import { useToast } from '../../components/notify';
import { PlainTable } from '../../components/plain-table';
import { VisuallyHidden } from '../../components/foundations';

export type SpecialKind = 'injury' | 'maternity' | 'suspension';
/** GET /payroll/runs/:id/special-days. */
export interface RunSpecialDays {
  /** Payroll may change them (payroll.input.manage; the run is not locked). */
  editable: boolean;
  rows: { employeeId: string; name: string; kind: SpecialKind; days: string; source: 'leave' | 'payroll'; note: string }[];
  /** Injury leave approved after its month was locked (answer 93): to review, never applied by the app. */
  corrections: { id: string; employeeId: string; name: string; month: string; days: string; note: string }[];
}
export interface SpecialDaysInput {
  employeeId: string;
  kind: SpecialKind;
  days: string;
  note: string;
}

const KIND: Record<SpecialKind, string> = { injury: 'Injury', maternity: 'Maternity', suspension: 'Suspension' };
const monthText = (m: string) => new Date(`${m}-01T00:00:00`).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' });
const daysText = (d: string) => `${Number(d)} ${Number(d) === 1 ? 'day' : 'days'}`;

export function SpecialDaysCard({ data, onSave, start }: { data: RunSpecialDays; onSave?: (input: SpecialDaysInput) => Promise<unknown>; start?: { editing?: SpecialDaysInput & { name: string } } }) {
  const [editing, setEditing] = useState<(SpecialDaysInput & { name: string }) | null>(start?.editing ?? null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();
  const canEdit = data.editable && Boolean(onSave);
  const early = useTooEarly([
    ...(editing && !/^\d{1,2}(\.\d{1,2})?$/.test(editing.days.trim()) ? [{ fieldId: 'sd-days', message: 'Enter the days, like 3 or 2.5.' }] : []),
    ...(editing && Number(editing.days) > 31 ? [{ fieldId: 'sd-days', message: 'A month has at most 31 days.' }] : []),
    ...(editing && editing.note.trim().length < 3 ? [{ fieldId: 'sd-note', message: 'Say why (3 letters or more).' }] : []),
  ]);
  const save = async () => {
    if (!editing || early.stop()) return;
    setBusy(true);
    setError(null);
    try {
      await onSave!({ employeeId: editing.employeeId, kind: editing.kind, days: editing.days.trim(), note: editing.note.trim() });
      toast({ tone: 'success', title: `${editing.name}: ${daysText(editing.days)} saved`, description: 'Payroll’s value is used from now on; calculate the run again.' });
      setEditing(null);
      early.reset();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That didn’t work. Try again.');
    } finally {
      setBusy(false);
    }
  };
  const current = (employeeId: string) => data.rows.find((r) => r.employeeId === employeeId && r.kind === 'injury');
  return (
    <section className="yx-pay-panel" aria-label="Special days">
      <div className="yx-pay-stack">
        {data.corrections.length > 0 && (
          <InlineAlert tone="warning" title="Injury leave approved after its month was locked">
            <div className="yx-pay-stack">
              <span>Review each one: add the days to this month if they should be paid now. Nothing is added by itself.</span>
              <PlainTable
                label="Late injury leave to review"
                rows={data.corrections}
                getRowId={(x) => x.id}
                columns={[
                  { key: 'name', header: 'Person', rowHeader: true, cell: (x) => x.name },
                  { key: 'month', header: 'Month', cell: (x) => monthText(x.month) },
                  { key: 'days', header: 'Days', num: true, cell: (x) => daysText(x.days) },
                  {
                    key: 'act',
                    header: <VisuallyHidden>Action</VisuallyHidden>,
                    cell: (x) =>
                      canEdit ? (
                        <Button size="sm" onClick={() => (setError(null), setEditing({ employeeId: x.employeeId, name: x.name, kind: 'injury', days: String(Number(current(x.employeeId)?.days ?? 0) + Number(x.days)), note: `Injury leave of ${monthText(x.month)} approved after the month was locked` }))}>
                          Add to this month
                        </Button>
                      ) : null,
                  },
                ]}
              />
            </div>
          </InlineAlert>
        )}
        <PlainTable
          label="Special days"
          rows={data.rows}
          getRowId={(r) => `${r.employeeId}:${r.kind}`}
          empty={<EmptyState compact title="No special days this month." description="Injury days fill from approved injury leave in Time; maternity and suspension days are entered by payroll." />}
          columns={[
            { key: 'name', header: 'Person', rowHeader: true, cell: (r) => r.name },
            { key: 'kind', header: 'Kind', cell: (r) => KIND[r.kind] },
            { key: 'days', header: 'Days', num: true, cell: (r) => daysText(r.days) },
            { key: 'source', header: 'From', cell: (r) => <Badge tone={r.source === 'leave' ? 'info' : 'neutral'}>{r.source === 'leave' ? 'Injury leave in Time' : 'Entered by payroll'}</Badge> },
            {
              key: 'act',
              header: <VisuallyHidden>Action</VisuallyHidden>,
              cell: (r) =>
                canEdit ? (
                  <Button size="sm" onClick={() => (setError(null), setEditing({ employeeId: r.employeeId, name: r.name, kind: r.kind, days: String(Number(r.days)), note: r.source === 'payroll' ? r.note : '' }))}>
                    Edit
                  </Button>
                ) : null,
            },
          ]}
        />
        {!data.editable && <p className="yx-pay-muted">Special days can be changed while the run is a draft or in review and its month is not locked.</p>}
      </div>
      <Dialog
        open={Boolean(editing)}
        onOpenChange={(o) => !o && setEditing(null)}
        size="sm"
        title={editing ? `${KIND[editing.kind]} days · ${editing.name}` : 'Special days'}
        footer={
          <>
            <Button onClick={() => setEditing(null)}>Cancel</Button>
            <Button variant="primary" loading={busy} onClick={() => void save()}>
              Save
            </Button>
          </>
        }
      >
        <div className="yx-pay-stack">
          {error && (
            <InlineAlert tone="danger" title="Not saved">
              {error}
            </InlineAlert>
          )}
          <FormField id="sd-days" label="Days this month" required error={early.errorOf('sd-days')} helper="Half days allowed. Your value is used from now on, not the leave in Time.">
            <TextField value={editing?.days ?? ''} onChange={(v) => setEditing((e) => (e ? { ...e, days: v } : e))} inputMode="decimal" />
          </FormField>
          <FormField id="sd-note" label="Why" required error={early.errorOf('sd-note')}>
            <TextField value={editing?.note ?? ''} onChange={(v) => setEditing((e) => (e ? { ...e, note: v } : e))} maxLength={300} />
          </FormField>
        </div>
      </Dialog>
    </section>
  );
}

/** Sample for the design story and tests: one filled from injury leave, one payroll's own, one late leave to review. */
export const SPECIAL_DAYS_SAMPLE: RunSpecialDays = {
  editable: true,
  rows: [
    { employeeId: 'e-sathish', name: 'Sathish Kumar', kind: 'injury', days: '6.00', source: 'leave', note: 'From approved INJURY leave in Time' },
    { employeeId: 'e-lakshmi', name: 'Lakshmi Iyer', kind: 'maternity', days: '30.00', source: 'payroll', note: 'Maternity leave from 2 Oct' },
  ],
  corrections: [{ id: 'pc-1', employeeId: 'e-naveen', name: 'Naveen Hegde', month: '2026-09', days: '3.00', note: '3.00 days of INJURY leave in 2026-09 were approved after the month was locked' }],
};
