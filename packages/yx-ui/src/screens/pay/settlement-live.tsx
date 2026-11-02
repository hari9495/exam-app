// PAY-37 wage-settlement arrears, live: the designed SettlementArrearsScreen (offcycle.tsx) with a settlement from the
// API, inside the special pay page (special-pay-live.tsx). A leaf module, so offcycle.tsx can import it without an
// import cycle back through the Pay designs.
import { useEffect, useState, type ReactNode } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Button, IconButton } from '../../components/button';
import { Drawer } from '../../components/drawer';
import { EmptyState, InlineAlert, Skeleton } from '../../components/feedback';
import { ErrorSummary, FieldRow, FormField, FormSection, useTooEarly, type FormErrorItem } from '../../components/field';
import { CurrencyField, TextField } from '../../components/inputs';
import { useToast } from '../../components/notify';
import { Select } from '../../components/select';
import { PlainTable } from '../../components/plain-table';
import { DescriptionList } from '../../components/shell';
import { Stepper } from '../../components/stepper';
import { formatINR } from '../../lib/format';
import { useRun } from '../org/org-kit';
import { dateText } from '../time/live/kit';
import { SectionTitle } from './pay-kit';
import type { LiveSpecialPay, SettlementPreview } from './special-pay-live';
import { WorksheetLinesTable } from './offcycle-live';
import { DataTable } from '../../components/table';
import type { WorksheetLine } from './live/types-5j';

/** "2026-09" → "September 2026". */
export const monthName = (m: string) => new Date(`${m}-01T00:00:00Z`).toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });

/** A tab's head: the design's page title and actions, as a section inside the special pay page. */
export function Head({ title, description, actions }: { title: string; description?: ReactNode; actions?: ReactNode }) {
  return (
    <>
      <SectionTitle actions={actions}>{title}</SectionTitle>
      {description && <p className="yx-pay-muted">{description}</p>}
    </>
  );
}

/* ================================================================== PAY-37 New settlement (drawer) */

/** Worker categories a settlement sets an increase for: the minimum-wage skill classes on the job record. */
export const SETTLEMENT_CATEGORIES = [
  { value: 'unskilled', label: 'Unskilled' },
  { value: 'semi_skilled', label: 'Semi-skilled' },
  { value: 'skilled', label: 'Skilled' },
  { value: 'highly_skilled', label: 'Highly skilled' },
];
export interface NewSettlementInput {
  title: string;
  unionId?: string;
  signedOn: string;
  effectiveFrom: string;
  rates: { category: string; monthlyIncrease: string }[];
}
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const MONEY_RE = /^\d{1,10}(\.\d{1,2})?$/;

/**
 * PAY-37 "New settlement": the terms of a long-term settlement (or a company settlement with no union) and the monthly
 * increase per worker category. Pressed too early, the fields say what is missing and the first takes focus; the
 * server's refusal stays in the drawer. The same component is the design story and the live drawer.
 */
export function NewSettlementDrawer({
  open,
  onOpenChange,
  unions,
  today,
  onSave,
  initial,
  revealErrors = false,
  serverError: serverErrorAtStart = null,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  unions: { id: string; name: string }[];
  /** yyyy-mm-dd in India: the latest "signed on" date. */
  today: string;
  onSave: (x: NewSettlementInput) => Promise<unknown>;
  /** Stories: start filled in. */
  initial?: Partial<NewSettlementInput>;
  /** Stories: start with the too-early errors shown. */
  revealErrors?: boolean;
  /** Stories: start with a refusal from the server. */
  serverError?: string | null;
}) {
  const { toast } = useToast();
  const blank = { title: '', unionId: '', signedOn: '', effectiveFrom: '', rates: [{ category: '', monthlyIncrease: '' }] };
  const [x, setX] = useState({ ...blank, ...initial, unionId: initial?.unionId ?? '', rates: initial?.rates?.length ? initial.rates : blank.rates });
  const [saving, setSaving] = useState(false);
  const [serverError, setServerError] = useState<string | null>(serverErrorAtStart);
  const seen = new Set<string>();
  const errors: FormErrorItem[] = [
    ...(x.title.trim().length < 3 ? [{ fieldId: 'ns-title', message: 'Name the settlement, like "Long-term settlement 2026".' }] : []),
    ...(!DAY_RE.test(x.signedOn) ? [{ fieldId: 'ns-signed', message: 'Enter the date it was signed.' }] : x.signedOn > today ? [{ fieldId: 'ns-signed', message: 'The date it was signed cannot be in the future.' }] : []),
    ...(!DAY_RE.test(x.effectiveFrom) ? [{ fieldId: 'ns-from', message: 'Enter the date the increase starts.' }] : []),
    ...x.rates.flatMap((r, i) => [
      ...(!r.category ? [{ fieldId: `ns-cat-${i}`, message: `Row ${i + 1}: choose the worker category.` }] : seen.has(r.category) ? [{ fieldId: `ns-cat-${i}`, message: `Row ${i + 1}: each category once.` }] : (seen.add(r.category), [])),
      ...(!MONEY_RE.test(r.monthlyIncrease) || Number(r.monthlyIncrease) <= 0 ? [{ fieldId: `ns-inc-${i}`, message: `Row ${i + 1}: the increase a month, above zero.` }] : []),
    ]),
  ];
  const early = useTooEarly(errors);
  useEffect(() => {
    if (revealErrors) early.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- stories only, once
  }, []);
  const setRate = (i: number, r: Partial<NewSettlementInput['rates'][number]>) => setX({ ...x, rates: x.rates.map((o, j) => (j === i ? { ...o, ...r } : o)) });
  const shown = errors.filter((e) => early.errorOf(e.fieldId));
  return (
    <Drawer
      open={open}
      onOpenChange={onOpenChange}
      title="New settlement"
      subtitle="A long-term settlement sets a monthly increase per worker category from a date; arrears are worked out from there."
      footer={
        <>
          <Button onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            variant="primary"
            loading={saving}
            onClick={async () => {
              if (early.stop()) return;
              setServerError(null);
              setSaving(true);
              try {
                await onSave({ title: x.title.trim(), ...(x.unionId ? { unionId: x.unionId } : {}), signedOn: x.signedOn, effectiveFrom: x.effectiveFrom, rates: x.rates.map((r) => ({ category: r.category, monthlyIncrease: r.monthlyIncrease })) });
              } catch (e) {
                setServerError(e instanceof Error ? e.message : 'The settlement was not saved. Try again.');
                return;
              } finally {
                setSaving(false);
              }
              toast({ tone: 'success', title: `${x.title.trim()} saved.` });
              onOpenChange(false);
            }}
          >
            Save settlement
          </Button>
        </>
      }
    >
      <div className="yx-pay-stack">
        {serverError && (
          <InlineAlert tone="danger" title="The settlement was not saved">
            {serverError}
          </InlineAlert>
        )}
        {shown.length > 1 && <ErrorSummary errors={shown} />}
        <FormSection title="Terms">
          <FormField id="ns-title" label="Name" required error={early.errorOf('ns-title')}>
            <TextField value={x.title} onChange={(title) => setX({ ...x, title })} />
          </FormField>
          <FormField id="ns-union" label="Union" optional helper="Leave empty for a company settlement with no union.">
            <Select aria-label="Union" value={x.unionId || null} onChange={(v) => setX({ ...x, unionId: v ?? '' })} options={[{ value: '', label: 'No union (company settlement)' }, ...unions.map((u) => ({ value: u.id, label: u.name }))]} />
          </FormField>
          <FieldRow>
            <FormField id="ns-signed" label="Signed on" required error={early.errorOf('ns-signed')}>
              <TextField type="date" value={x.signedOn} onChange={(signedOn) => setX({ ...x, signedOn })} />
            </FormField>
            <FormField id="ns-from" label="Increase from" required helper="Can be before the signing date; arrears cover the gap." error={early.errorOf('ns-from')}>
              <TextField type="date" value={x.effectiveFrom} onChange={(effectiveFrom) => setX({ ...x, effectiveFrom })} />
            </FormField>
          </FieldRow>
        </FormSection>
        <FormSection title="Increase a month per worker category">
          {x.rates.map((r, i) => (
            <FieldRow key={i}>
              <FormField id={`ns-cat-${i}`} label="Category" required error={early.errorOf(`ns-cat-${i}`)}>
                <Select aria-label={`Category, row ${i + 1}`} value={r.category || null} onChange={(v) => setRate(i, { category: v ?? '' })} options={SETTLEMENT_CATEGORIES} />
              </FormField>
              <FormField id={`ns-inc-${i}`} label="Increase a month" required error={early.errorOf(`ns-inc-${i}`)}>
                <CurrencyField value={r.monthlyIncrease === '' ? null : Number(r.monthlyIncrease)} onChange={(v) => setRate(i, { monthlyIncrease: v == null ? '' : String(v) })} />
              </FormField>
              {x.rates.length > 1 && <IconButton icon={Trash2} label={`Remove row ${i + 1}`} size="sm" onClick={() => setX({ ...x, rates: x.rates.filter((_, j) => j !== i) })} />}
            </FieldRow>
          ))}
          {x.rates.length < SETTLEMENT_CATEGORIES.length && (
            <div>
              <Button size="sm" icon={Plus} onClick={() => setX({ ...x, rates: [...x.rates, { category: '', monthlyIncrease: '' }] })}>
                Add a category
              </Button>
            </div>
          )}
        </FormSection>
      </div>
    </Drawer>
  );
}

/* ================================================================== PAY-37 Wage-settlement arrears */

export function LiveSettlementArrears({ live }: { live: LiveSpecialPay }) {
  const { toast } = useToast();
  const settlements = live.unions?.settlements ?? null;
  const [id, setId] = useState<string | null>(null);
  const s = settlements?.find((x) => x.id === id) ?? settlements?.[0] ?? null;
  const { busy, error, run } = useRun();
  const month = monthName(live.month);
  const unionName = (uid: string | null) => (uid ? live.unions?.unions.find((x) => x.id === uid)?.name ?? 'Union' : 'No union (company settlement)');
  const [adding, setAdding] = useState(false);
  // PAY-37: the workers per category and each worker's arrears for the page's month, worked out by the API.
  const [preview, setPreview] = useState<SettlementPreview | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  useEffect(() => {
    setPreview(null);
    setPreviewError(null);
    if (!s || !live.onSettlementPreview) return;
    let on = true;
    live.onSettlementPreview(s.id).then(
      (x) => on && setPreview(x),
      (e) => on && setPreviewError(e instanceof Error && e.message ? e.message : 'The arrears did not load.'),
    );
    return () => {
      on = false;
    };
  }, [s?.id, live.month]); // eslint-disable-line react-hooks/exhaustive-deps
  const catOf = (category: string) => preview?.categories.find((c) => c.category === category);
  const worksheetLines: WorksheetLine[] = (preview?.employees ?? []).flatMap((e) => e.months.map((m) => ({ id: `${e.employeeId}-${m.month}`, period: m.month, componentCode: 'settlement_arrears', kind: 'earning' as const, asPaid: '0.00', corrected: m.amount, difference: m.amount, base: 'payslip' as const, employeeId: e.employeeId })));
  const newButton = live.onAddSettlement && (
    <Button icon={Plus} onClick={() => setAdding(true)}>
      New settlement
    </Button>
  );
  const drawer = live.onAddSettlement && adding && (
    <NewSettlementDrawer open onOpenChange={setAdding} unions={live.unions?.unions ?? []} today={live.today ?? new Date().toISOString().slice(0, 10)} onSave={live.onAddSettlement} />
  );
  if (!settlements)
    return (
      <div role="status" aria-busy="true" aria-label="Loading wage settlements">
        <Skeleton height={240} />
      </div>
    );
  if (!s)
    return (
      <>
        <EmptyState title="No wage settlements yet" description="A long-term settlement with a union sets a monthly increase per worker category from an effective date; its arrears are worked out here." action={newButton || undefined} />
        {drawer}
      </>
    );
  return (
    <div className="yx-pay-stack">
      <Head
        title={s.title}
        description={`${unionName(s.unionId)} · settlement signed ${dateText(s.signedOn)} · effective ${dateText(s.effectiveFrom)}`}
        actions={
          <>
            {settlements.length > 1 && <Select aria-label="Settlement" value={s.id} onChange={(v) => v && setId(v)} options={settlements.map((x) => ({ value: x.id, label: x.title }))} />}
            {newButton}
          </>
        }
      />
      {drawer}
      {error && (
        <InlineAlert tone="danger" title="The arrears were not sent">
          {error}
        </InlineAlert>
      )}
      <Stepper
        key={s.id}
        title="Settlement arrears"
        defaultCurrent="categories"
        anyOrder
        finishLabel={`Send arrears to ${month}`}
        finishing={busy === 'send'}
        onFinish={() =>
          void run('send', async () => {
            await live.onPost({ kind: 'settlement', id: s.id });
            toast({ tone: 'success', title: `${s.title} arrears sent to payroll for ${month}, for approval.` });
          })
        }
        steps={[
          { id: 'settlement', title: 'Settlement', description: 'Terms and effective date', content: <DescriptionList columns={2} items={[{ label: 'Union', value: unionName(s.unionId) }, { label: 'Signed', value: dateText(s.signedOn) }, { label: 'Effective from', value: dateText(s.effectiveFrom) }]} /> },
          {
            id: 'categories',
            title: 'Categories',
            description: 'Increase per worker category',
            content: (
              <div className="yx-pay-stack">
                {previewError && (
                  <InlineAlert tone="warning" title="Workers and arrears not shown">
                    {previewError}
                  </InlineAlert>
                )}
                <PlainTable
                  label="Increase per worker category"
                  rows={s.rates}
                  getRowId={(r) => r.category}
                  columns={[
                    { key: 'category', header: 'Category', rowHeader: true, cell: (r) => r.category.replace(/_/g, ' ') },
                    { key: 'increase', header: 'Increase a month', num: true, cell: (r) => formatINR(Number(r.monthlyIncrease)) },
                    ...(live.onSettlementPreview
                      ? [
                          { key: 'count', header: 'Workers', num: true, cell: (r: (typeof s.rates)[number]) => (preview ? (catOf(r.category)?.workers ?? 0) : '…') },
                          { key: 'arrears', header: `Arrears to ${month}`, num: true, cell: (r: (typeof s.rates)[number]) => (preview ? formatINR(Number(catOf(r.category)?.arrears ?? 0)) : '…') },
                        ]
                      : []),
                  ]}
                  footer={preview ? [{ id: 'total', label: 'Total', cells: { count: preview.employees.length, arrears: formatINR(Number(preview.total)) } }] : undefined}
                />
              </div>
            ),
          },
          ...(live.onSettlementPreview
            ? [
                {
                  id: 'employees',
                  title: 'Affected employees',
                  description: preview ? `${preview.employees.length} ${preview.employees.length === 1 ? 'worker' : 'workers'}` : 'Matched by category',
                  content: (
                    <div className="yx-pay-stack">
                      <p className="yx-pay-muted">Workers matched by their category today, in this legal entity, who joined before {month} and have not left. A worker who changed category since {dateText(s.effectiveFrom)} is checked by hand.</p>
                      <DataTable
                        label="Affected employees"
                        columns={[
                          { key: 'who', header: 'Employee', type: 'person', value: (e: SettlementPreview['employees'][number]) => live.nameOf(e.employeeId), person: (e) => ({ name: live.nameOf(e.employeeId) }), width: 220 },
                          { key: 'cat', header: 'Category', value: (e) => e.category.replace(/_/g, ' '), width: 160 },
                          { key: 'from', header: 'From', value: (e) => dateText(e.from), width: 130 },
                          { key: 'months', header: 'Months', type: 'number', value: (e) => e.months.length, width: 100 },
                          { key: 'total', header: 'Arrears', type: 'money', value: (e) => Number(e.total), total: 'sum', width: 130 },
                        ]}
                        rows={preview?.employees ?? []}
                        getRowId={(e) => e.employeeId}
                        state={preview ? 'ready' : previewError ? 'error' : 'loading'}
                        empty={<EmptyState compact title="No worker in these categories" description="Set the skill class on the workers' jobs (People), then come back." />}
                      />
                    </div>
                  ),
                },
              ]
            : []),
          {
            id: 'worksheet',
            title: 'Arrears worksheet',
            description: `Paid in ${month}`,
            content: preview ? (
              worksheetLines.length ? (
                <WorksheetLinesTable lines={worksheetLines} who={(l) => live.nameOf((l as WorksheetLine & { employeeId: string }).employeeId)} totalLabel={`Arrears for ${preview.employees.length} ${preview.employees.length === 1 ? 'worker' : 'workers'}`} total={preview.total} />
              ) : (
                <p className="yx-pay-muted">No arrears: no worker matches the categories.</p>
              )
            ) : (
              <p className="yx-pay-muted">Arrears from {dateText(s.effectiveFrom)} are worked out for each worker in a category on the as-paid pay of every month, and go to payroll as one sheet for a payroll approver to approve.</p>
            ),
          },
        ]}
      />
    </div>
  );
}
