// PPL-06 Bulk changes wizard, live (annual increment): the designed steps with the company's people, ratings and pay.
// Pay shows only to people with the salary grant (R1): the page renders this only for them, and the API checks it again.
import { useEffect, useMemo, useState } from 'react';
import { Button } from '../../components/button';
import { PageHeader } from '../../components/shell';
import { Badge } from '../../components/display';
import { InlineAlert } from '../../components/feedback';
import { FormField } from '../../components/field';
import { MultiSelect, Select } from '../../components/select';
import { DatePicker } from '../../components/date';
import { NumberField, TextArea } from '../../components/inputs';
import { ConfirmDialog, Dialog } from '../../components/overlay';
import { DataTable, type TableColumn } from '../../components/table';
import { Stepper } from '../../components/stepper';
import { formatDate, formatINR } from '../../lib/format';
import { PeopleFrame, Segment, StatusChecklist, type ChecklistRow } from './people-kit';

export interface IncrementInput {
  legalEntityId: string;
  effectiveDate: string;
  joinedBefore?: string;
  departmentIds?: string[];
  reviewCycleId?: string;
  mode: 'rating' | 'percent';
  percent?: string;
  byRating?: { band: string; percent: string }[];
  overrides?: { employeeId: string; percent: string }[];
  reason: string;
}
export interface IncrementPerson {
  employeeId: string;
  name: string;
  code: string;
  department: string | null;
  grade: string | null;
  rating: string | null;
  currentCtc: string;
  percent: string;
  newCtc: string;
}
export interface IncrementResult {
  people: IncrementPerson[];
  leftOut: {
    employeeId: string;
    name: string;
    rating: string | null;
    why: string;
  }[];
  ratingCycles: { id: string; name: string }[];
  ratingCycleId: string | null;
  bands: string[];
  /** The change engine's dry run, row by row (a clash with another change, a rule broken). */
  rows: { employeeId: string | null; ok: boolean; error: string | null }[];
  errors: number;
}
export interface LiveIncrement {
  entities: { value: string; label: string }[];
  departments: { value: string; label: string }[];
  today: Date;
  /** perf.review.view: without it, only the same raise for everyone. */
  canRate: boolean;
  /** Dry run: nothing is kept. */
  onCheck: (input: IncrementInput) => Promise<IncrementResult>;
  /** Stores the batch, waiting for one approval. */
  onSend: (input: IncrementInput, people: number) => Promise<void>;
}

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const pctText = (n: number | null | undefined) => (n == null ? undefined : String(Math.round(n * 100) / 100));
const inr = (s: string) => formatINR(Number(s));

export function LiveIncrementWizard({ live }: { live: LiveIncrement }) {
  const [entity, setEntity] = useState<string | null>(live.entities.length === 1 ? live.entities[0].value : null);
  const [effective, setEffective] = useState<Date | null>(null);
  const [joinedBefore, setJoinedBefore] = useState<Date | null>(null);
  const [depts, setDepts] = useState<string[]>([]);
  const [mode, setMode] = useState<'rating' | 'percent'>(live.canRate ? 'rating' : 'percent');
  const [cycle, setCycle] = useState<string | null>(null);
  const [byRating, setByRating] = useState<Record<string, number | null>>({});
  const [everyone, setEveryone] = useState<number | null>(null);
  const [custom, setCustom] = useState<Record<string, number>>({});
  const [reason, setReason] = useState('Annual increment');
  const [result, setResult] = useState<IncrementResult | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [leftOutOpen, setLeftOutOpen] = useState(false);
  const [step, setStep] = useState('people');

  const input = useMemo((): IncrementInput | null => {
    if (!entity || !effective || reason.trim().length < 3) return null;
    const rated = Object.entries(byRating).flatMap(([band, p]) => (p ? [{ band, percent: pctText(p)! }] : []));
    return {
      legalEntityId: entity,
      effectiveDate: iso(effective),
      ...(joinedBefore ? { joinedBefore: iso(joinedBefore) } : {}),
      ...(depts.length ? { departmentIds: depts } : {}),
      ...(cycle ? { reviewCycleId: cycle } : {}),
      mode,
      ...(mode === 'percent' && everyone ? { percent: pctText(everyone) } : {}),
      ...(mode === 'rating' ? { byRating: rated } : {}),
      ...(Object.keys(custom).length
        ? {
            overrides: Object.entries(custom).map(([employeeId, p]) => ({
              employeeId,
              percent: pctText(p)!,
            })),
          }
        : {}),
      reason: reason.trim(),
    };
  }, [entity, effective, joinedBefore, depts, cycle, mode, everyone, byRating, custom, reason]);
  const ready = input && (mode === 'rating' || everyone);

  // Every change is checked again (a dry run through the change engine) half a second after the last edit.
  useEffect(() => {
    if (!ready || !input) return;
    let gone = false;
    const t = setTimeout(() => {
      setChecking(true);
      live
        .onCheck(input)
        .then((r) => !gone && (setResult(r), setFailed(null), r.ratingCycleId && !cycle && setCycle(r.ratingCycleId)))
        .catch((e) => !gone && setFailed(e instanceof Error ? e.message : 'That did not work. Try again.'))
        .finally(() => !gone && setChecking(false));
    }, 500);
    return () => {
      gone = true;
      clearTimeout(t);
    };
  }, [ready, input, live.onCheck, cycle]); // eslint-disable-line react-hooks/exhaustive-deps

  const people = result?.people ?? [];
  const problem = (id: string) => result?.rows.find((r) => r.employeeId === id && !r.ok)?.error ?? null;
  const ratingRule = mode === 'rating';
  const before = people.reduce((s, p) => s + Number(p.currentCtc), 0);
  const after = people.reduce((s, p) => s + Number(p.newCtc), 0);
  const leftOut = result?.leftOut ?? [];
  const unset = leftOut.filter((l) => l.why.startsWith('No raise set'));
  // People with a rating but no raise for it yet still match; they get one once the rule is set.
  const outside = leftOut.filter((l) => !unset.includes(l));
  const matched = people.length + unset.length;
  const noRating = leftOut.filter((l) => /No released rating|No released ratings/.test(l.why)).length;
  const errors = people.filter((p) => problem(p.employeeId)).length;
  const entityName = live.entities.find((e) => e.value === entity)?.label ?? '';
  const deptText = depts.length
    ? live.departments
        .filter((d) => depts.includes(d.value))
        .map((d) => d.label)
        .join(', ')
    : 'all departments';

  const cols: TableColumn<IncrementPerson>[] = [
    {
      key: 'name',
      header: 'Employee',
      type: 'person',
      value: (r) => r.name,
      person: (r) => ({
        name: r.name,
        secondary: [r.code, r.grade, r.rating].filter(Boolean).join(' · '),
      }),
      width: 200,
    },
    {
      key: 'pct',
      header: 'Raise',
      type: 'number',
      value: (r) => Number(r.percent),
      render: (r) => `${Number(r.percent)}%`,
      editable: 'number',
      width: 90,
    },
    {
      key: 'next',
      header: 'New CTC',
      type: 'money',
      value: (r) => Number(r.newCtc),
      render: (r) => (
        <span className="yx-ppl__type yx-ppl__type--end">
          <strong>{inr(r.newCtc)}</strong>
          <span className="yx-ppl__sub">from {inr(r.currentCtc)}</span>
          {problem(r.employeeId) ? <Badge tone="danger">Can't change</Badge> : custom[r.employeeId] !== undefined ? <Badge tone="info">Changed here</Badge> : null}
        </span>
      ),
      total: 'sum',
      width: 170,
    },
  ];

  return (
    <PeopleFrame active="Bulk changes">
      <PageHeader title="Annual increment" description="One approval for everyone, a preview per person, new pay rounded to whole rupees." />
      <Stepper
        title="Bulk change"
        onCurrentChange={setStep}
        continueBlocked={step === 'people' && (!entity || !effective || reason.trim().length < 3) ? 'Choose the legal entity and the effective date first.' : step === 'rule' && mode === 'percent' && !everyone ? 'Give the raise for everyone first.' : undefined}
        finishLabel={`Send for approval (${people.length} ${people.length === 1 ? 'person' : 'people'})`}
        onFinish={() => setConfirm(true)}
        finishBlocked={!people.length ? 'No one gets a raise yet.' : errors ? `${errors} ${errors === 1 ? 'person' : 'people'} can't be changed: see the preview.` : checking ? 'Checking…' : undefined}
        review={{
          description: 'Check the totals before you send this for one approval.',
        }}
        steps={[
          {
            id: 'people',
            title: 'Choose people',
            summary: [`${people.length} ${people.length === 1 ? 'employee' : 'employees'}`, deptText, entityName, `effective ${effective ? formatDate(effective) : '—'}`].filter(Boolean).join(' · '),
            content: (
              <div className="yx-ppl__form">
                <FormField label="Legal entity" required>
                  <Select options={live.entities} value={entity} onChange={setEntity} />
                </FormField>
                <FormField label="Effective date" required helper="Payroll pays arrears for a date in a month already paid.">
                  <DatePicker value={effective} onChange={setEffective} />
                </FormField>
                <FormField label="Departments" optional helper="Leave empty for everyone.">
                  <MultiSelect options={live.departments} value={depts} onChange={setDepts} />
                </FormField>
                <FormField label="Confirmed employees who joined before" optional>
                  <DatePicker value={joinedBefore} onChange={setJoinedBefore} />
                </FormField>
                <FormField label="Reason" required helper="Kept on each person's job history.">
                  <TextArea rows={2} value={reason} onChange={setReason} maxLength={1000} />
                </FormField>
                {failed && <InlineAlert tone="danger" title={failed} />}
                {result && (
                  <InlineAlert
                    tone="info"
                    actions={
                      outside.length ? (
                        <Button size="sm" onClick={() => setLeftOutOpen(true)}>
                          See who
                        </Button>
                      ) : undefined
                    }
                  >
                    {matched} {matched === 1 ? 'person matches' : 'people match'}.{outside.length ? ` ${outside.length} ${outside.length === 1 ? 'is' : 'are'} left out.` : ''}
                  </InlineAlert>
                )}
              </div>
            ),
          },
          {
            id: 'rule',
            title: 'Set the rule',
            summary: ratingRule ? result?.bands.map((b) => `${b} ${byRating[b] ?? 0}%`).join(' · ') || 'By rating' : `${everyone ?? 0}% for everyone`,
            content: (
              <div className="yx-ppl__form">
                {live.canRate && (
                  <Segment
                    label="Raise by"
                    value={mode}
                    onChange={setMode}
                    options={[
                      { value: 'rating', label: 'By rating' },
                      { value: 'percent', label: 'Same for everyone' },
                    ]}
                  />
                )}
                {ratingRule ? (
                  <>
                    <FormField label="Ratings from" required>
                      <Select
                        options={(result?.ratingCycles ?? []).map((x) => ({
                          value: x.id,
                          label: x.name,
                        }))}
                        value={cycle}
                        onChange={setCycle}
                        placeholder="No released ratings yet"
                      />
                    </FormField>
                    {noRating > 0 && (
                      <InlineAlert tone="warning" title={`${noRating} ${noRating === 1 ? 'person has' : 'people have'} no rating`}>
                        They get no raise by rating. Use &quot;Same for everyone&quot;, or see who under Choose people.
                      </InlineAlert>
                    )}
                    {result && result.bands.length > 0 ? (
                      <div className="yx-scroll-x" tabIndex={0} role="region" aria-label="Increase by rating">
                        <table className="yx-ppl__impact">
                          <thead>
                            <tr>
                              <th scope="col">Rating</th>
                              <th scope="col">People</th>
                              <th scope="col">Increase</th>
                              <th scope="col">Added cost a year</th>
                            </tr>
                          </thead>
                          <tbody>
                            {result.bands.map((k) => {
                              const inRating = people.filter((r) => r.rating === k && custom[r.employeeId] === undefined);
                              const all = inRating.length + unset.filter((r) => r.rating === k).length;
                              return (
                                <tr key={k}>
                                  <th scope="row">{k}</th>
                                  <td>{all}</td>
                                  <td>
                                    <NumberField aria-label={`Increase for ${k}`} value={byRating[k] ?? null} onChange={(v) => setByRating({ ...byRating, [k]: v })} decimals suffix="%" min={0} max={100} />
                                  </td>
                                  <td>{formatINR(inRating.reduce((s, r) => s + Number(r.newCtc) - Number(r.currentCtc), 0))}</td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      result && <InlineAlert tone="info">No one chosen has a released rating you can see.</InlineAlert>
                    )}
                  </>
                ) : (
                  <FormField label="Raise for everyone" required>
                    <NumberField value={everyone} onChange={setEveryone} decimals suffix="%" min={0} max={100} />
                  </FormField>
                )}
              </div>
            ),
          },
          {
            id: 'preview',
            title: 'Preview each person',
            summary: `${formatINR(before)} → ${formatINR(after)} (${formatINR(after - before)} more a year)${unset.length ? ` · ${unset.length} without a raise yet` : ''}`,
            content: (
              <div className="yx-ppl__stack">
                {errors > 0 && (
                  <InlineAlert tone="danger" title={`${errors} ${errors === 1 ? 'person' : 'people'} can't be changed`}>
                    {people
                      .filter((p) => problem(p.employeeId))
                      .slice(0, 3)
                      .map((p) => `${p.name}: ${problem(p.employeeId)}`)
                      .join(' ')}
                  </InlineAlert>
                )}
                <DataTable
                  label="Per-person preview"
                  columns={cols}
                  rows={people}
                  getRowId={(r) => r.employeeId}
                  pageSize={10}
                  state={checking && !result ? 'loading' : 'ready'}
                  onCellEdit={(r, key, v) => key === 'pct' && typeof v === 'number' && v > 0 && v <= 100 && setCustom({ ...custom, [r.employeeId]: v })}
                />
              </div>
            ),
          },
        ]}
      />
      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title={`Send the annual increment for ${people.length} ${people.length === 1 ? 'person' : 'people'} for approval?`}
        consequence={`Annual cost goes from ${formatINR(before)} to ${formatINR(after)} (${formatINR(after - before)} more a year). Someone with approval rights, not you, approves it once for everyone. Once approved it applies on ${effective ? formatDate(effective) : 'the effective date'}; later corrections go through a new change and payroll pays arrears.`}
        confirmLabel="Send for approval"
        onConfirm={async () => {
          if (input) await live.onSend(input, people.length);
        }}
      />
      <Dialog open={leftOutOpen} onOpenChange={setLeftOutOpen} title="Left out of this change" footer={<Button onClick={() => setLeftOutOpen(false)}>Close</Button>}>
        <StatusChecklist
          label="People left out"
          rows={outside.map((p): ChecklistRow => ({
            id: p.employeeId,
            title: p.name,
            status: 'Left out',
            note: p.why,
          }))}
        />
      </Dialog>
    </PeopleFrame>
  );
}
