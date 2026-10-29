// PAY-04 / 05 / 06 · Payroll inputs, PAY-20 · Payslip queries and PAY-19 · Court orders and recoveries, live: the
// designed screens of payroll-inputs.tsx with the API's rows. Same tables, drawers, texts and confirms as the stories;
// what the API cannot give yet is left out and listed as a gap in docs/yukthix/pay-design-map.md.
import { useEffect, useState, type ReactNode } from 'react';
import { Plus, Upload } from 'lucide-react';
import { Button } from '../../components/button';
import { Badge, type BadgeTone } from '../../components/display';
import { Drawer } from '../../components/drawer';
import { EmptyState, ErrorState, InlineAlert, NoAccessState, Skeleton } from '../../components/feedback';
import { ErrorSummary, FieldRow, FormField, useSaveErrors } from '../../components/field';
import { CurrencyField, TextArea, TextField } from '../../components/inputs';
import { Checkbox } from '../../components/choice';
import { Select } from '../../components/select';
import { Segment } from '../../components/segment';
import { PageHeader, Tabs, TabsContent, TabsList, TabsTrigger, DescriptionList } from '../../components/shell';
import { DataTable, type TableColumn } from '../../components/table';
import { FilterBar } from '../../components/filters';
import { BarChart } from '../../components/charts';
import { CommentThread } from '../../components/timeline';
import { ConfirmDialog } from '../../components/overlay';
import { DatePicker } from '../../components/date';
import { useToast } from '../../components/notify';
import { formatDate, formatINR } from '../../lib/format';
import { matchesFilter, type FilterValue } from '../../lib/table';
import { useRun } from '../org/org-kit';
import { SectionTitle } from './pay-kit';
import { BulkUploadDrawer, recurringPlan, type UploadRowResult } from './payroll-inputs';
import { PersonPicker, type HoldRow, type LopRow, type PersonHit } from './live/inputs';
import { parseCsv } from './live/setup';
import type { LoadState } from './live/types';
import type { OneTimeItem, Recovery as OverpaymentPlan } from './live/types-5j';
import type { PayslipQueryView } from './live/types-ops';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
/** "2026-09" → "September 2026" */
export const monthName = (m: string) => `${MONTHS[Number(m.slice(5, 7)) - 1] ?? ''} ${m.slice(0, 4)}`;
const daysInMonth = (m: string) => new Date(Number(m.slice(0, 4)), Number(m.slice(5, 7)), 0).getDate();
const day = (iso: string) => new Date(`${iso.slice(0, 10)}T00:00:00`);
const isoOf = (x: Date) => `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
const money = (s: string | null | undefined) => (s == null ? '—' : formatINR(Number(s)));
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const DAYS = /^\d{1,2}(\.\d{1,2})?$/;
const AMOUNT = /^\d{1,9}(\.\d{1,2})?$/;

/** Done = a 5-second toast; 'default' says why nothing happened. */
function useSay() {
  const { toast } = useToast();
  return (title: string, tone: 'success' | 'default' | 'error' = 'success') => void toast({ tone, title });
}
const failText = (e: unknown) => (e instanceof Error && e.message ? e.message : 'That did not work. Nothing has changed.');

/** Loading, error and no-access for a panel inside a page that already has its header. */
export function PanelStates({ state, onRetry, what, grantedBy = 'your payroll admin', children }: { state: LoadState; onRetry?: () => void; what: string; grantedBy?: string; children: ReactNode }) {
  if (state === 'loading')
    return (
      <div className="yx-pay-stack" role="status" aria-busy="true" aria-label={`Loading ${what}`}>
        <Skeleton height={240} />
      </div>
    );
  if (state === 'error') return <ErrorState title={`We couldn't load ${what}.`} description="Nothing has changed. Try again in a moment." onRetry={onRetry} />;
  if (state === 'no-access') return <NoAccessState grantedBy={grantedBy} what={what} />;
  return <>{children}</>;
}

/** Reads a CSV the person picked; each row checked, people found by their employee ID. */
async function readRows<T>(file: File, check: (r: Record<string, string>, line: number) => Promise<{ result: UploadRowResult; ok?: T }>) {
  const rows = parseCsv(await file.text());
  if (!rows.length) throw new Error('The file has no rows under its header. Use the template.');
  if (rows.length > 2000) throw new Error('The file has more than 2,000 rows. Split it into smaller files.');
  return Promise.all(rows.map((r, i) => check(r, i + 2)));
}
/** One person by employee ID (exact, any case). */
async function byCode(onSearch: (q: string) => Promise<PersonHit[]>, code: string) {
  if (!code) return null;
  return (await onSearch(code)).find((h) => (h.employeeCode ?? '').toLowerCase() === code.toLowerCase()) ?? null;
}

/* ================================================================== PAY-04 · 05 · 06 Payroll inputs */

export interface LiveInputs {
  state: LoadState;
  onRetry?: () => void;
  /** "2026-09" */
  month: string;
  onMonth: (month: string) => void;
  /** Today in India, "2026-09-29" (hold ages). */
  today: string;
  nameOf: (employeeId: string) => string;
  onSearch: (q: string) => Promise<PersonHit[]>;
  tab?: 'lop' | 'onetime' | 'holds';
  lop: { state: LoadState; rows: LopRow[] | null; onSave: (rows: { employeeId: string; lopDays: string; reason: string }[], source: 'manual' | 'upload') => Promise<unknown> };
  oneTime: { rows: OneTimeItem[] | null; onAdd: (row: { employeeId: string; componentCode: string; amount: string; month: string; reason: string; endOn?: string }) => Promise<{ status: string }>; onCancel: (id: string) => Promise<unknown> };
  holds: { state: LoadState; rows: HoldRow[] | null; onAdd: (row: { employeeId: string; reasonCode: string; note: string }) => Promise<unknown>; onRelease: (id: string, body: { reason: string; route: HoldRoute }) => Promise<unknown> };
}

/** The inputs page: loss of pay (PAY-04), one-time pay (PAY-05) and salary holds (PAY-06) as tabs, for one month. */
export function LiveInputsScreen({ live, lopPanel, holdsPanel }: { live: LiveInputs; lopPanel: ReactNode; holdsPanel: ReactNode }) {
  const ready = live.state === 'ready';
  const items = live.oneTime.rows ?? [];
  const openHolds = (live.holds.rows ?? []).filter((h) => !h.released).length;
  return (
    <div className="yx-auth__page">
      <PageHeader
        title="Payroll inputs"
        description="Loss of pay, one-time pay and salary holds. A locked month takes no inputs: corrections are paid next month."
        facts={ready ? `${monthName(live.month)} · ${plural(items.length, 'one-time item')} · ${plural(openHolds, 'open hold')}` : monthName(live.month)}
        actions={
          <FormField id="in-month" label="Month" hideLabel>
            <TextField type="month" value={live.month} onChange={(m) => /^\d{4}-\d{2}$/.test(m) && live.onMonth(m)} aria-label="Month" />
          </FormField>
        }
      />
      <PanelStates state={live.state} onRetry={live.onRetry} what="payroll inputs">
        <Tabs defaultValue={live.tab ?? 'onetime'}>
          <TabsList aria-label="Loss of pay, one-time pay and holds">
            <TabsTrigger value="lop" count={live.lop.rows?.length}>
              Loss of pay
            </TabsTrigger>
            <TabsTrigger value="onetime" count={items.length}>
              One-time pay
            </TabsTrigger>
            <TabsTrigger value="holds" count={live.holds.rows ? openHolds : undefined}>
              Salary holds
            </TabsTrigger>
          </TabsList>
          <TabsContent value="lop">{lopPanel}</TabsContent>
          <TabsContent value="onetime">
            <LiveOneTimePanel key={live.month} live={live} />
          </TabsContent>
          <TabsContent value="holds">{holdsPanel}</TabsContent>
        </Tabs>
      </PanelStates>
    </div>
  );
}

/* ------------------------------------------------------------------ PAY-04 loss of pay */

type LopLine = LopRow & { error?: string };

/** PAY-04 in live: saved LOP days for the month, edited in the table, added for a person, or uploaded as a CSV. */
export function LiveLopPanel({ live }: { live: LiveInputs }) {
  const say = useSay();
  const days = daysInMonth(live.month);
  const label = monthName(live.month);
  const [edits, setEdits] = useState<Record<string, { lopDays: string; reason: string }>>({});
  const [tried, setTried] = useState(false);
  const [adding, setAdding] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [results, setResults] = useState<{ rows: UploadRowResult[]; ok: { employeeId: string; lopDays: string; reason: string }[] } | null>(null);
  const { busy, error, run } = useRun();
  const check = (lopDays: string, reason: string) =>
    !DAYS.test(lopDays) ? 'Enter the unpaid days, e.g. 2 or 1.5.' : Number(lopDays) > days ? `More than the ${days} days in ${label}. Enter ${days} or fewer.` : reason.trim().length < 3 ? 'Add a reason for the LOP.' : undefined;
  const rows: LopLine[] = (live.lop.rows ?? []).map((r) => {
    const e = edits[r.employeeId];
    const lopDays = e?.lopDays ?? Number(r.lopDays).toString();
    const reason = e?.reason ?? r.reason;
    return { ...r, lopDays, reason, error: e ? check(lopDays, reason) : undefined };
  });
  const changed = rows.filter((r) => edits[r.employeeId]);
  const wrong = changed.filter((r) => r.error);
  const cols: TableColumn<LopLine>[] = [
    { key: 'employee', header: 'Employee', type: 'person', value: (r) => live.nameOf(r.employeeId), person: (r) => ({ name: live.nameOf(r.employeeId) }), width: 240 },
    { key: 'lop', header: 'LOP days', type: 'number', value: (r) => Number(r.lopDays) || 0, editable: 'number', total: 'sum', width: 110 },
    { key: 'reason', header: 'Reason', value: (r) => r.reason, editable: 'text', width: 260 },
    { key: 'source', header: 'Source', value: (r) => (r.source === 'upload' ? 'Upload' : 'Manual'), width: 90, optional: true },
    { key: 'err', header: 'Check', value: (r) => r.error ?? '', render: (r) => (r.error ? <span className="yx-pay-note">{r.error}</span> : edits[r.employeeId] ? <Badge tone="info">Not saved yet</Badge> : <Badge tone="success">Saved</Badge>), width: 300 },
  ];
  const save = () => {
    if (!changed.length) return say('Nothing to save. Change a row, or add a person.', 'default');
    if (wrong.length) return setTried(true);
    void run('save', async () => {
      await live.lop.onSave(changed.map((r) => ({ employeeId: r.employeeId, lopDays: r.lopDays, reason: r.reason.trim() })), 'manual');
      setEdits({});
      setTried(false);
      say(`LOP saved for ${plural(changed.length, 'person', 'people')}`);
    });
  };
  return (
    <PanelStates state={live.lop.state} onRetry={live.onRetry} what="loss-of-pay days">
      <div className="yx-pay-stack">
        <SectionTitle
          actions={
            <>
              <Button icon={Upload} onClick={() => (setResults(null), setUploading(true))}>
                Bulk upload
              </Button>
              <Button icon={Plus} onClick={() => setAdding(true)}>
                Add loss of pay
              </Button>
              <Button variant="primary" loading={busy === 'save'} onClick={save}>
                {changed.length ? `Save LOP for ${plural(changed.length, 'person', 'people')}` : 'Save LOP'}
              </Button>
            </>
          }
        >
          Loss of pay · {label}
        </SectionTitle>
        <p className="yx-pay-muted">For groups paid as present (Assumed present): enter unpaid days per person, each with a reason. Others come from attendance.</p>
        {error && (
          <InlineAlert tone="danger" title="Not saved">
            {error}
          </InlineAlert>
        )}
        {tried && wrong.length > 0 && (
          <InlineAlert tone="danger" title={`${plural(wrong.length, 'row needs', 'rows need')} a change before you can save`}>
            {live.nameOf(wrong[0].employeeId)}: {wrong[0].error}
          </InlineAlert>
        )}
        <DataTable
          label="LOP input"
          columns={cols}
          rows={rows}
          getRowId={(r) => r.employeeId}
          state={live.lop.rows ? 'ready' : 'loading'}
          onCellEdit={(row, key, value) => {
            const cur = edits[row.employeeId] ?? { lopDays: row.lopDays, reason: row.reason };
            setEdits({ ...edits, [row.employeeId]: key === 'lop' ? { ...cur, lopDays: String(value ?? '') } : { ...cur, reason: String(value ?? '') } });
          }}
          empty={<EmptyState title={`No loss-of-pay days in ${label}.`} description="Add days for people in groups paid as present; everyone else's come from attendance." action={<Button icon={Plus} onClick={() => setAdding(true)}>Add loss of pay</Button>} />}
        />
        {adding && <LopDrawer live={live} days={days} onClose={() => setAdding(false)} onSaved={(t) => say(t)} />}
        <BulkUploadDrawer
          open={uploading}
          onOpenChange={setUploading}
          title={`Upload LOP for ${label}`}
          template="LOP input"
          columns={['Employee ID', 'Employee name', 'LOP days', 'Reason']}
          results={results?.rows}
          onFile={async (file) => {
            const out = await readRows(file, async (r, line) => {
              const code = (r['Employee ID'] ?? '').trim();
              const lopDays = (r['LOP days'] ?? '').trim();
              const reason = (r.Reason ?? '').trim();
              const who = await byCode(live.onSearch, code);
              const err = !who ? `No employee with ID ${code || '(empty)'} you can enter inputs for. Check the ID.` : check(lopDays, reason);
              return { result: { row: line, employee: who ? `${code} · ${who.name}` : code || '—', value: `LOP ${lopDays || '—'}${reason ? ` · ${reason}` : ''}`, error: err }, ok: err ? undefined : { employeeId: who!.id, lopDays, reason } };
            });
            setResults({ rows: out.map((x) => x.result), ok: out.flatMap((x) => (x.ok ? [x.ok] : [])) });
          }}
          onImport={async () => {
            if (!results?.ok.length) return;
            try {
              await live.lop.onSave(results.ok, 'upload');
              setUploading(false);
              say(`${plural(results.ok.length, 'LOP row')} imported · ${plural(results.rows.length - results.ok.length, 'row')} skipped with errors`);
            } catch (e) {
              say(failText(e), 'error');
            }
          }}
        />
      </div>
    </PanelStates>
  );
}

function LopDrawer({ live, days, onClose, onSaved }: { live: LiveInputs; days: number; onClose: () => void; onSaved: (text: string) => void }) {
  const [who, setWho] = useState<PersonHit | null>(null);
  const [lopDays, setLopDays] = useState('');
  const [reason, setReason] = useState('');
  const { busy, error, run } = useRun();
  const errors = [
    ...(!who ? [{ fieldId: 'lop-who', message: 'Choose the person.' }] : []),
    ...(!DAYS.test(lopDays) ? [{ fieldId: 'lop-days', message: 'Enter the unpaid days, e.g. 2 or 1.5.' }] : Number(lopDays) > days ? [{ fieldId: 'lop-days', message: `Enter ${days} days or fewer.` }] : []),
    ...(reason.trim().length < 3 ? [{ fieldId: 'lop-why', message: 'Say why, in a few words.' }] : []),
  ];
  const shown = useSaveErrors(errors);
  return (
    <Drawer
      open
      onOpenChange={(o) => !o && onClose()}
      title="Add loss of pay"
      subtitle={`${monthName(live.month)}. Saving again for the same person replaces their days.`}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            loading={busy === 'add'}
            onClick={() => {
              if (errors.length) {
                shown.reveal();
                document.getElementById(errors[0].fieldId)?.focus();
                return;
              }
              void run('add', async () => {
                await live.lop.onSave([{ employeeId: who!.id, lopDays, reason: reason.trim() }], 'manual');
                onSaved(`Saved ${lopDays} unpaid ${Number(lopDays) === 1 ? 'day' : 'days'} for ${who!.name}`);
                onClose();
              });
            }}
          >
            Save
          </Button>
        </>
      }
    >
      <div className="yx-pay-stack">
        <ErrorSummary errors={shown.shownErrors} />
        {error && (
          <InlineAlert tone="danger" title="Not saved">
            {error}
          </InlineAlert>
        )}
        <PersonPicker id="lop-who" label="Employee" value={who} onChange={setWho} onSearch={live.onSearch} error={shown.errorOf('lop-who')} />
        <FormField id="lop-days" label="Unpaid days" required error={shown.errorOf('lop-days')} helper={`Up to ${days} days in ${monthName(live.month)}.`}>
          <TextField value={lopDays} onChange={setLopDays} inputMode="decimal" />
        </FormField>
        <FormField id="lop-why" label="Reason" required error={shown.errorOf('lop-why')}>
          <TextArea value={reason} onChange={setReason} rows={2} maxLength={300} />
        </FormField>
      </div>
    </Drawer>
  );
}

/* ------------------------------------------------------------------ PAY-05 one-time pay */

const OT_STATUS: Record<string, { label: string; tone: BadgeTone }> = {
  approved: { label: 'Approved', tone: 'info' },
  pending: { label: 'Awaiting approval', tone: 'warning' },
  paid: { label: 'Paid', tone: 'success' },
  cancelled: { label: 'Cancelled', tone: 'neutral' },
  rejected: { label: 'Rejected', tone: 'danger' },
};
const otStatus = (s: string) => OT_STATUS[s] ?? { label: s, tone: 'neutral' as BadgeTone };
const COMPONENT: Record<string, string> = { bonus: 'Bonus', arrears: 'Arrears' };
const componentText = (c: string) => COMPONENT[c] ?? c.replace(/_/g, ' ').replace(/^\w/, (x) => x.toUpperCase());
const CODE = /^[a-z][a-z0-9_]{0,29}$/;

function LiveOneTimePanel({ live }: { live: LiveInputs }) {
  const say = useSay();
  const [adding, setAdding] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [cancelling, setCancelling] = useState<OneTimeItem | null>(null);
  const [results, setResults] = useState<{ rows: UploadRowResult[]; ok: { employeeId: string; componentCode: string; amount: string; month: string; reason: string }[] } | null>(null);
  const [q, setQ] = useState('');
  const [filters, setFilters] = useState<FilterValue[]>([
    { key: 'status', type: 'multi', values: [] },
    { key: 'source', type: 'multi', values: [] },
  ]);
  const rows = live.oneTime.rows ?? [];
  const shown = rows.filter((r) => filters.every((f) => matchesFilter(f.key === 'status' ? otStatus(r.status).label : r.source === 'manual' ? 'Manual' : componentText(r.source), f)) && (!q || live.nameOf(r.employeeId).toLowerCase().includes(q.toLowerCase())));
  const cols: TableColumn<OneTimeItem>[] = [
    { key: 'employee', header: 'Employee', type: 'person', value: (r) => live.nameOf(r.employeeId), person: (r) => ({ name: live.nameOf(r.employeeId) }), width: 220 },
    { key: 'type', header: 'Type', value: (r) => componentText(r.componentCode), width: 160, groupable: true },
    { key: 'amount', header: 'Amount', type: 'money', value: (r) => Number(r.amount), total: 'sum', width: 120 },
    { key: 'period', header: 'Pay in', value: (r) => monthName(r.month), width: 140 },
    { key: 'recurring', header: 'Recurring', value: (r) => (r.endOn ? `Until ${formatDate(day(r.endOn))}` : 'One time'), width: 160, optional: true },
    { key: 'reason', header: 'Reason', value: (r) => r.reason, width: 220, optional: true },
    { key: 'source', header: 'Source', value: (r) => (r.source === 'manual' ? 'Manual' : componentText(r.source)), width: 110, optional: true },
    { key: 'status', header: 'Status', type: 'status', value: (r) => otStatus(r.status).label, statusTone: (v) => Object.values(OT_STATUS).find((s) => s.label === v)?.tone ?? 'neutral', width: 170 },
  ];
  const opts = (xs: string[]) => xs.map((v) => ({ value: v, label: v }));
  return (
    <div className="yx-pay-stack">
      <SectionTitle
        actions={
          <>
            <Button icon={Upload} onClick={() => (setResults(null), setUploading(true))}>
              Bulk upload
            </Button>
            <Button variant="primary" icon={Plus} onClick={() => setAdding(true)}>
              Add one-time pay
            </Button>
          </>
        }
      >
        One-time pay · {monthName(live.month)}
      </SectionTitle>
      <DataTable
        label="One-time pay items"
        columns={cols}
        rows={shown}
        getRowId={(r) => r.id}
        state={live.oneTime.rows ? 'ready' : 'loading'}
        filtered={shown.length !== rows.length}
        onClearFilters={() => {
          setFilters((fs) => fs.map((f) => ({ ...f, values: [] }) as FilterValue));
          setQ('');
        }}
        toolbar={
          <FilterBar
            fields={[
              { key: 'status', label: 'Status', type: 'multi', options: opts(['Approved', 'Awaiting approval', 'Paid', 'Cancelled', 'Rejected']) },
              { key: 'source', label: 'Source', type: 'multi', options: opts([...new Set(rows.map((r) => (r.source === 'manual' ? 'Manual' : componentText(r.source))))]) },
            ]}
            value={filters}
            onChange={setFilters}
            search={q}
            onSearchChange={setQ}
            searchPlaceholder="Search employee"
          />
        }
        rowButtons={(r) =>
          (r.status === 'approved' || r.status === 'pending') && r.source === 'manual' ? (
            <Button size="sm" onClick={() => setCancelling(r)}>
              Cancel
            </Button>
          ) : null
        }
        empty={<EmptyState title={`No one-time pay in ${monthName(live.month)}.`} description="Items from expenses, hiring, performance and cases appear here once approved." action={<Button variant="primary" icon={Plus} onClick={() => setAdding(true)}>Add one-time pay</Button>} />}
      />
      {adding && <OneTimeDrawer live={live} onClose={() => setAdding(false)} onSaved={(t) => say(t)} />}
      <ConfirmDialog
        open={!!cancelling}
        onOpenChange={(o) => !o && setCancelling(null)}
        title={cancelling ? `Cancel ${componentText(cancelling.componentCode).toLowerCase()} of ${money(cancelling.amount)} for ${live.nameOf(cancelling.employeeId)}?` : ''}
        consequence="It is not paid in any run. This can't be undone: add it again if you need it."
        confirmLabel="Cancel the item"
        cancelLabel="Keep it"
        destructive
        onConfirm={async () => {
          const c = cancelling!;
          await live.oneTime.onCancel(c.id);
          setCancelling(null);
          say(`${componentText(c.componentCode)} for ${live.nameOf(c.employeeId)} cancelled`);
        }}
      />
      <BulkUploadDrawer
        open={uploading}
        onOpenChange={setUploading}
        title="Upload one-time pay"
        template="One-time pay"
        columns={['Employee ID', 'Employee name', 'Component', 'Amount', 'Pay in', 'Reason']}
        results={results?.rows}
        onFile={async (file) => {
          const out = await readRows(file, async (r, line) => {
            const code = (r['Employee ID'] ?? '').trim();
            const comp = (r.Component ?? '').trim().toLowerCase();
            const amount = (r.Amount ?? '').trim().replace(/,/g, '');
            const month = (r['Pay in'] ?? '').trim() || live.month;
            const reason = (r.Reason ?? '').trim();
            const who = await byCode(live.onSearch, code);
            const err = !who
              ? `No employee with ID ${code || '(empty)'} you can enter inputs for. Check the ID.`
              : !CODE.test(comp)
                ? 'Component is empty or not a code. Use the component code, e.g. bonus.'
                : !AMOUNT.test(amount) || Number(amount) <= 0
                  ? 'Amount is not a number above zero. Enter rupees, e.g. 15000.'
                  : !/^\d{4}-\d{2}$/.test(month)
                    ? 'Pay in is not a month. Enter it as 2026-10.'
                    : reason.length < 3
                      ? 'Reason is empty. Say what it is for.'
                      : undefined;
            return { result: { row: line, employee: who ? `${code} · ${who.name}` : code || '—', value: `${componentText(comp || '—')} ${AMOUNT.test(amount) ? formatINR(Number(amount)) : amount} · ${month}`, error: err }, ok: err ? undefined : { employeeId: who!.id, componentCode: comp, amount, month, reason } };
          });
          setResults({ rows: out.map((x) => x.result), ok: out.flatMap((x) => (x.ok ? [x.ok] : [])) });
        }}
        onImport={async () => {
          if (!results?.ok.length) return;
          let added = 0;
          const refused: string[] = [];
          for (const row of results.ok) {
            try {
              await live.oneTime.onAdd(row);
              added++;
            } catch (e) {
              refused.push(`${live.nameOf(row.employeeId)}: ${failText(e)}`);
            }
          }
          setUploading(false);
          say(`${plural(added, 'one-time pay row')} added · ${plural(results.rows.length - results.ok.length + refused.length, 'row')} skipped${refused.length ? `. ${refused[0]}` : ' with errors'}`, refused.length ? 'default' : 'success');
        }}
      />
    </div>
  );
}

function OneTimeDrawer({ live, onClose, onSaved }: { live: LiveInputs; onClose: () => void; onSaved: (text: string) => void }) {
  const [who, setWho] = useState<PersonHit | null>(null);
  const [kind, setKind] = useState<'bonus' | 'arrears' | 'other'>('bonus');
  const [code, setCode] = useState('');
  const [amount, setAmount] = useState<number | null>(null);
  const [month, setMonth] = useState(live.month);
  const [recurring, setRecurring] = useState(false);
  const [end, setEnd] = useState<Date | null>(null);
  const [reason, setReason] = useState('');
  const { busy, error, run } = useRun();
  const component = kind === 'other' ? code.trim() : kind;
  const start = day(`${month}-01`);
  const plan = recurring && end && amount ? recurringPlan(amount, start, end) : null;
  const errors = [
    ...(!who ? [{ fieldId: 'ot-who', message: 'Choose the employee.' }] : []),
    ...(!CODE.test(component) ? [{ fieldId: 'ot-code', message: 'Enter the component code, e.g. incentive.' }] : []),
    ...(!amount || amount <= 0 || !AMOUNT.test(String(amount)) ? [{ fieldId: 'ot-amount', message: 'Enter an amount in rupees.' }] : []),
    ...(!/^\d{4}-\d{2}$/.test(month) ? [{ fieldId: 'ot-month', message: 'Choose the month to pay in.' }] : []),
    ...(recurring && !plan ? [{ fieldId: 'ot-end', message: 'Choose an end date at least a month after the start.' }] : []),
    ...(reason.trim().length < 3 ? [{ fieldId: 'ot-why', message: 'Say what it is for.' }] : []),
  ];
  const shown = useSaveErrors(errors);
  return (
    <Drawer
      open
      onOpenChange={(o) => !o && onClose()}
      title={recurring ? 'Add recurring item' : 'Add one-time pay'}
      subtitle="Above the company's limit, an item waits for approval by someone else. A locked month takes no new items."
      size="lg"
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            loading={busy === 'add'}
            onClick={() => {
              if (errors.length) {
                shown.reveal();
                document.getElementById(errors[0].fieldId)?.focus();
                return;
              }
              void run('add', async () => {
                const r = await live.oneTime.onAdd({ employeeId: who!.id, componentCode: component, amount: String(amount), month, reason: reason.trim(), ...(recurring && end ? { endOn: isoOf(end) } : {}) });
                onSaved(r.status === 'pending' ? `${componentText(component)} of ${formatINR(amount!)} for ${who!.name} added; above the company's limit, so it waits for approval` : `${componentText(component)} of ${formatINR(amount!)}${recurring ? ' a month' : ''} for ${who!.name} added`);
                onClose();
              });
            }}
          >
            Add one-time pay
          </Button>
        </>
      }
    >
      <div className="yx-pay-split">
        <div className="yx-pay-stack">
          <ErrorSummary errors={shown.shownErrors} />
          {error && (
            <InlineAlert tone="danger" title="Not added">
              {error}
            </InlineAlert>
          )}
          <PersonPicker id="ot-who" label="Employee" value={who} onChange={setWho} onSearch={live.onSearch} error={shown.errorOf('ot-who')} />
          <Segment
            label="Type"
            value={kind}
            onChange={setKind}
            options={[
              { value: 'bonus', label: 'Bonus' },
              { value: 'arrears', label: 'Arrears' },
              { value: 'other', label: 'Other component' },
            ]}
          />
          {kind === 'other' && (
            <FormField id="ot-code" label="Component code" required error={shown.errorOf('ot-code')} helper="An earning, deduction or reimbursement in the component library, e.g. incentive.">
              <TextField value={code} onChange={setCode} />
            </FormField>
          )}
          <FieldRow>
            <FormField id="ot-amount" label={recurring ? 'Amount each month' : 'Amount'} required error={shown.errorOf('ot-amount')}>
              <CurrencyField value={amount} onChange={setAmount} />
            </FormField>
            <FormField id="ot-month" label={recurring ? 'Start month' : 'Pay in'} required error={shown.errorOf('ot-month')}>
              <TextField type="month" value={month} onChange={setMonth} />
            </FormField>
          </FieldRow>
          <Checkbox label="Recurring (has a start and end)" checked={recurring} onChange={setRecurring} description="The last month is paid prorated." />
          {recurring && (
            <FormField id="ot-end" label="End date" required error={shown.errorOf('ot-end')}>
              <DatePicker value={end} onChange={setEnd} min={start} />
            </FormField>
          )}
          <FormField id="ot-why" label="Reason" required error={shown.errorOf('ot-why')}>
            <TextArea value={reason} onChange={setReason} rows={2} maxLength={300} />
          </FormField>
        </div>
        <aside className="yx-pay-panel" aria-label="Effect">
          <SectionTitle>Effect</SectionTitle>
          <DescriptionList
            items={[
              ...(recurring
                ? [
                    { label: 'Each month', value: formatINR(amount ?? 0) },
                    ...(plan ? plan.lines.map((l) => ({ label: l.label, value: formatINR(l.value) })) : []),
                    { label: plan ? `Total over ${plan.months} months` : 'Total', value: plan ? formatINR(plan.total) : 'Choose the end date' },
                  ]
                : [{ label: 'Pay in', value: /^\d{4}-\d{2}$/.test(month) ? monthName(month) : '—' }]),
              { label: 'Approval', value: <>Above the company's limit it waits for someone with payroll approval.<br /><span className="yx-pay-note">You can't approve your own item</span></> },
            ]}
          />
        </aside>
      </div>
    </Drawer>
  );
}

/* ------------------------------------------------------------------ PAY-06 salary holds */

const HOLD_REASON: Record<string, string> = { absconding: 'Absconding', exit_pending: 'Exit pending', investigation: 'Investigation', employee_request: 'Employee asked', other: 'Other' };
const holdReason = (c: string) => HOLD_REASON[c] ?? c;

/** Where released held pay goes (PAY-06 "Pay through"). */
export type HoldRoute = 'next_bank_file' | 'offcycle';
const ROUTE_TEXT: Record<HoldRoute, string> = { next_bank_file: 'released into the next bank file of its run', offcycle: 'released for an off-cycle payment now' };

/** PAY-06 in live: open and released holds, the ageing chart from each hold's age, hold and release. */
export function LiveHoldsPanel({ live }: { live: LiveInputs }) {
  const say = useSay();
  const [adding, setAdding] = useState(false);
  const [release, setRelease] = useState<HoldRow | null>(null);
  const [confirmRelease, setConfirmRelease] = useState(false);
  const [route, setRoute] = useState<HoldRoute>('next_bank_file');
  const [why, setWhy] = useState('');
  const releaseErrors = why.trim().length < 5 ? [{ fieldId: 'hr-why', message: 'Say why the hold ends, in a few words.' }] : [];
  const releaseShown = useSaveErrors(releaseErrors);
  const openRelease = (h: HoldRow) => {
    setRelease(h);
    setRoute('next_bank_file');
    setWhy('');
  };
  const holds = live.holds.rows ?? [];
  const open = holds.filter((h) => !h.released);
  const age = (h: HoldRow) => h.ageDays ?? 0;
  const buckets = [
    ['0–30 days', open.filter((h) => age(h) <= 30)],
    ['31–60 days', open.filter((h) => age(h) > 30 && age(h) <= 60)],
    ['61–90 days', open.filter((h) => age(h) > 60 && age(h) <= 90)],
    ['Over 90 days', open.filter((h) => age(h) > 90)],
  ] as const;
  const since = (h: HoldRow) => (h.ageDays == null ? null : new Date(day(live.today).getTime() - h.ageDays * 86_400_000));
  const cols: TableColumn<HoldRow>[] = [
    { key: 'employee', header: 'Employee', type: 'person', value: (r) => live.nameOf(r.employeeId), person: (r) => ({ name: live.nameOf(r.employeeId) }), width: 220 },
    { key: 'reason', header: 'Reason code', value: (r) => holdReason(r.reasonCode), width: 160, hideable: false, groupable: true },
    { key: 'since', header: 'Held since', type: 'date', value: (r) => since(r), width: 130, optional: true },
    { key: 'age', header: 'Age', type: 'number', value: (r) => r.ageDays ?? 0, render: (r) => (r.released ? '—' : plural(age(r), 'day')), width: 110, optional: true },
    { key: 'amount', header: 'Net held', type: 'money', value: (r) => (r.released ? 0 : Number(r.amount ?? 0)), render: (r) => (r.amount == null ? <span className="yx-pay-note">From the next run</span> : money(r.amount)), total: 'sum', width: 150 },
    { key: 'note', header: 'Note', value: (r) => r.note, width: 260, optional: true },
    { key: 'status', header: 'Status', type: 'status', value: (r) => (r.released ? 'Released' : 'On hold'), statusTone: (v) => (v === 'Released' ? 'success' : 'warning'), width: 160 },
  ];
  return (
    <PanelStates state={live.holds.state} onRetry={live.onRetry} what="salary holds">
      <div className="yx-pay-stack">
        <InlineAlert tone="info">While a salary is held, PF, ESI and TDS are still computed and deposited on the accrued pay. Only the net is held.</InlineAlert>
        <SectionTitle>Holds by reason and age</SectionTitle>
        <div className="yx-pay-grid">
          <div data-span="12">
            <DataTable
              label="Salary holds"
              columns={cols}
              rows={holds}
              getRowId={(r) => r.id}
              state={live.holds.rows ? 'ready' : 'loading'}
              onRowClick={(r) => !r.released && openRelease(r)}
              rowButtons={(r) => (!r.released ? <Button size="sm" onClick={() => openRelease(r)}>Release</Button> : null)}
              toolbar={<Button size="sm" icon={Plus} onClick={() => setAdding(true)}>Hold a salary</Button>}
              empty={<EmptyState title="No salaries on hold." description="Holds are raised automatically for absconding, returned payments and pending exit clearance, or manually with a reason." action={<Button icon={Plus} onClick={() => setAdding(true)}>Hold a salary</Button>} />}
            />
          </div>
          {open.length > 0 && (
            <div data-span="6">
              <BarChart title="Hold ageing" description="Open holds by age" categories={buckets.map((b) => b[0])} series={[{ name: 'Holds', values: buckets.map((b) => b[1].length) }]} xLabel="Age" height={180} />
            </div>
          )}
        </div>
        <Drawer
          open={!!release}
          onOpenChange={(o) => !o && setRelease(null)}
          title={`Release salary for ${release ? live.nameOf(release.employeeId) : ''}`}
          subtitle={release ? `${holdReason(release.reasonCode)} · held since ${formatDate(since(release))} · ${plural(age(release), 'day')}` : undefined}
          footer={
            <>
              <Button onClick={() => setRelease(null)}>Cancel</Button>
              <Button
                variant="primary"
                onClick={() => {
                  if (releaseErrors.length) {
                    releaseShown.reveal();
                    document.getElementById('hr-why')?.focus();
                    return;
                  }
                  setConfirmRelease(true);
                }}
              >
                Release {release?.amount ? money(release.amount) : 'salary'}
              </Button>
            </>
          }
        >
          {release && (
            <div className="yx-pay-stack">
              <DescriptionList
                items={[
                  { label: 'Net held', value: money(release.amount) },
                  { label: 'Note', value: release.note },
                ]}
              />
              <Segment
                label="Pay through"
                value={route}
                onChange={(v) => setRoute(v as HoldRoute)}
                options={[
                  { value: 'next_bank_file', label: 'Next bank file' },
                  { value: 'offcycle', label: 'Off-cycle payment now' },
                ]}
              />
              <p className="yx-pay-note">
                {route === 'next_bank_file'
                  ? 'Pays every held payslip in the next bank file made for its run. Releasing twice has no effect.'
                  : 'Pays the held payslips now: make an off-cycle bank file from the run’s Payments page.'}
              </p>
              <FormField id="hr-why" label="Reason for release" required error={releaseShown.errorOf('hr-why')} helper="Saved in the audit trail.">
                <TextArea value={why} onChange={setWhy} rows={2} maxLength={300} />
              </FormField>
              <p className="yx-pay-muted">Someone else releases a hold on your own pay.</p>
            </div>
          )}
        </Drawer>
        <ConfirmDialog
          open={confirmRelease}
          onOpenChange={setConfirmRelease}
          title={release ? `Release ${release.amount ? `${money(release.amount)} to ` : 'the salary of '}${live.nameOf(release.employeeId)}?` : ''}
          consequence={`${route === 'next_bank_file' ? 'Paid in the next bank file made for its run.' : 'Paid now by an off-cycle bank file from its run.'} The reason is saved in the audit trail.`}
          confirmLabel="Release"
          onConfirm={async () => {
            const r = release!;
            try {
              await live.holds.onRelease(r.id, { reason: why.trim(), route });
            } catch (e) {
              say(e instanceof Error && e.message ? e.message : 'The salary was not released. Nothing has changed.', 'error');
              throw e;
            }
            setRelease(null);
            say(`Salary for ${live.nameOf(r.employeeId)} ${ROUTE_TEXT[route]}`);
          }}
        />
        {adding && <HoldDrawer live={live} onClose={() => setAdding(false)} onSaved={(t, tone) => say(t, tone)} />}
      </div>
    </PanelStates>
  );
}

function HoldDrawer({ live, onClose, onSaved }: { live: LiveInputs; onClose: () => void; onSaved: (text: string, tone?: 'default') => void }) {
  const [who, setWho] = useState<PersonHit | null>(null);
  const [reason, setReason] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [confirm, setConfirm] = useState(false);
  const errors = [
    ...(!who ? [{ fieldId: 'ho-who', message: 'Choose the employee.' }] : []),
    ...(!reason ? [{ fieldId: 'ho-reason', message: 'Choose a reason code.' }] : []),
    ...(note.trim().length < 5 ? [{ fieldId: 'ho-note', message: 'Add a note, in a few words.' }] : []),
  ];
  const shown = useSaveErrors(errors);
  return (
    <>
      <Drawer
        open
        onOpenChange={(o) => !o && onClose()}
        title="Hold a salary"
        subtitle="The net pay is held from the next run until someone releases it."
        footer={
          <>
            <Button onClick={onClose}>Cancel</Button>
            <Button
              variant="primary"
              onClick={() => {
                if (errors.length) {
                  shown.reveal();
                  document.getElementById(errors[0].fieldId)?.focus();
                  return;
                }
                setConfirm(true);
              }}
            >
              Hold salary
            </Button>
          </>
        }
      >
        <div className="yx-pay-stack">
          <ErrorSummary errors={shown.shownErrors} />
          <PersonPicker id="ho-who" label="Employee" value={who} onChange={setWho} onSearch={live.onSearch} error={shown.errorOf('ho-who')} />
          <FormField id="ho-reason" label="Reason code" required error={shown.errorOf('ho-reason')}>
            <Select value={reason} onChange={setReason} options={Object.entries(HOLD_REASON).map(([value, label]) => ({ value, label }))} />
          </FormField>
          <FormField id="ho-note" label="Note" required error={shown.errorOf('ho-note')} helper="Visible to payroll and HR, not to the employee.">
            <TextArea value={note} onChange={setNote} rows={2} maxLength={300} />
          </FormField>
        </div>
      </Drawer>
      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title={who ? `Hold ${who.name}'s salary?` : ''}
        consequence="The net pay is held from the next run until someone releases it. PF, ESI and TDS are still computed and deposited."
        confirmLabel="Hold salary"
        onConfirm={async () => {
          const r = (await live.holds.onAdd({ employeeId: who!.id, reasonCode: reason!, note: note.trim() })) as { created?: boolean } | undefined;
          onSaved(r && r.created === false ? `${who!.name} already has an open hold; nothing changed.` : `Salary for ${who!.name} is held from the next run`, r && r.created === false ? 'default' : undefined);
          onClose();
        }}
      />
    </>
  );
}

/* ================================================================== PAY-20 Payslip queries */

type QStatus = 'New' | 'In progress' | 'Waiting for employee' | 'Resolved';
const Q_TONE: Record<QStatus, BadgeTone> = { New: 'info', 'In progress': 'warning', 'Waiting for employee': 'neutral', Resolved: 'success' };

export interface LiveQueries {
  state: LoadState;
  onRetry?: () => void;
  queries: PayslipQueryView[] | null;
  nameOf: (employeeId: string) => string;
  /** The signed-in user (assign to me). */
  me: { id: string; name: string };
  today: string;
  status: 'open' | 'answered' | 'closed';
  onStatus: (s: 'open' | 'answered' | 'closed') => void;
  onReply: (q: PayslipQueryView, text: string) => Promise<unknown>;
  onClose: (q: PayslipQueryView) => Promise<unknown>;
  onAssign: (q: PayslipQueryView, userId: string) => Promise<unknown>;
  /** People the query can be assigned to (they handle payslip queries for its legal entity; never the asker). */
  onHandlers?: (q: PayslipQueryView) => Promise<QueryHandler[]>;
}
export interface QueryHandler {
  userId: string;
  name: string;
  me: boolean;
}
/** The API adds the line the query is about: its name, amount and the saved explanation. */
type QueryRow = PayslipQueryView & { line?: { name: string; amount: string; explanation: string | null } | null };

/** Reply target: 2 working days (Mon–Fri) after the query came in; days from today. */
export function replyDueIn(raised: string, today: string) {
  const due = day(raised);
  for (let n = 0; n < 2; ) {
    due.setDate(due.getDate() + 1);
    if (due.getDay() !== 0 && due.getDay() !== 6) n++;
  }
  return Math.round((due.getTime() - day(today).getTime()) / 86_400_000);
}

/** PAY-20 in live: the queue (never one's own queries), the drawer with the conversation, reply, assign to me, resolve. */
export function LiveQueryQueue({ live }: { live: LiveQueries }) {
  const say = useSay();
  const [openId, setOpenId] = useState<string | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [thread, setThread] = useState(0);
  const rows = (live.queries ?? []).filter((q) => !q.mine);
  const open = rows.find((q) => q.id === openId) ?? null;
  const statusOf = (q: PayslipQueryView): QStatus => (q.status === 'closed' ? 'Resolved' : q.status === 'answered' ? 'Waiting for employee' : q.assigneeUserId ? 'In progress' : 'New');
  const assignee = (q: PayslipQueryView) => (!q.assigneeUserId ? 'Unassigned' : q.assigneeUserId === live.me.id ? `You (${live.me.name})` : 'Someone else in payroll');
  const replied = (q: PayslipQueryView) => (q.replies ?? []).some((r) => r.side === 'payroll');
  const due = (q: PayslipQueryView) => {
    if (q.status === 'closed') return { text: '—', tone: 'neutral' as BadgeTone };
    if (q.status === 'answered') return { text: `Paused since ${formatDate(day(q.updatedAt))}`, tone: 'neutral' as BadgeTone };
    const n = replyDueIn(q.createdAt, live.today);
    return { text: n < 0 ? `Overdue ${plural(-n, 'day')}` : n === 0 ? 'Today' : `In ${plural(n, 'day')}`, tone: (n < 0 ? 'danger' : n <= 1 ? 'warning' : 'neutral') as BadgeTone };
  };
  const cols: TableColumn<PayslipQueryView>[] = [
    { key: 'employee', header: 'Employee', type: 'person', value: (r) => live.nameOf(r.employeeId), person: (r) => ({ name: live.nameOf(r.employeeId) }), width: 210 },
    {
      key: 'text',
      header: 'Question',
      value: (r) => `${r.lineCode ?? 'Whole payslip'}: ${r.text}`,
      render: (r) => (
        <span>
          <span className="yx-pay-note">{r.lineCode ?? 'Whole payslip'}</span>
          <br />
          {r.text}
        </span>
      ),
      width: 360,
      hideable: false,
    },
    { key: 'raised', header: 'Raised', type: 'date', value: (r) => day(r.createdAt), width: 110, optional: true },
    { key: 'due', header: 'Reply due', value: (r) => due(r).text, render: (r) => (due(r).text === '—' ? '—' : <Badge tone={due(r).tone}>{due(r).text}</Badge>), width: 170, hideable: false },
    { key: 'assignee', header: 'Assignee', value: (r) => assignee(r), width: 150 },
    { key: 'status', header: 'Status', type: 'status', value: (r) => statusOf(r), statusTone: (v) => Q_TONE[v as QStatus], width: 170 },
  ];
  const openCount = live.status === 'closed' ? null : rows.length;
  return (
    <div className="yx-auth__page">
      <PageHeader title="Payslip queries" description="Questions employees raised on a payslip or a line. Replies stay in the app." facts={live.state === 'ready' && openCount !== null ? `${openCount} ${live.status === 'open' ? 'waiting for payroll' : 'waiting for the employee'} · reply target 2 working days` : undefined} />
      <PanelStates state={live.state} onRetry={live.onRetry} what="payslip queries">
        <div className="yx-pay-stack">
          <DataTable
            label="Payslip queries"
            columns={cols}
            rows={rows}
            getRowId={(r) => r.id}
            state={live.queries ? 'ready' : 'loading'}
            onRowClick={(r) => setOpenId(r.id)}
            activeRowId={open?.id}
            toolbar={
              <Segment
                label="Show"
                value={live.status}
                onChange={(s) => (setSelected([]), live.onStatus(s))}
                options={[
                  { value: 'open', label: 'Waiting for payroll' },
                  { value: 'answered', label: 'Waiting for employee' },
                  { value: 'closed', label: 'Resolved' },
                ]}
              />
            }
            empty={<EmptyState title={live.status === 'open' ? 'No payslip queries waiting.' : live.status === 'answered' ? 'No queries waiting for the employee.' : 'No resolved queries.'} description="When an employee asks about a payslip, the question lands here with the payslip line." />}
            cardSummary
            selectable={live.status !== 'closed'}
            selectedIds={selected}
            onSelectedChange={setSelected}
            bulkActions={(ids) => (
              <Button
                size="sm"
                onClick={async () => {
                  const picked = rows.filter((q) => ids.includes(q.id));
                  try {
                    for (const q of picked) await live.onAssign(q, live.me.id);
                    setSelected([]);
                    say(`${plural(picked.length, 'query', 'queries')} assigned to you (${live.me.name})`);
                  } catch (e) {
                    say(failText(e), 'error');
                  }
                }}
              >
                Assign {ids.length} to me
              </Button>
            )}
          />
        </div>
      </PanelStates>
      <QueryDrawer
        key={`${open?.id}-${open?.replies?.length ?? 0}-${thread}`}
        q={open}
        live={live}
        status={open ? statusOf(open) : 'New'}
        assignee={open ? assignee(open) : ''}
        replied={open ? replied(open) : false}
        onClose={() => setOpenId(null)}
        onFailed={(e) => (say(failText(e), 'error'), setThread((n) => n + 1))}
        say={say}
      />
    </div>
  );
}

function QueryDrawer({ q, live, status, assignee: assigneeText, replied, onClose, onFailed, say }: { q: QueryRow | null; live: LiveQueries; status: QStatus; assignee: string; replied: boolean; onClose: () => void; onFailed: (e: unknown) => void; say: ReturnType<typeof useSay> }) {
  const { busy, error, run } = useRun();
  const [sent, setSent] = useState(false);
  const [handlers, setHandlers] = useState<QueryHandler[]>([]);
  const [assignTo, setAssignTo] = useState<string | null>(null);
  const [assignError, setAssignError] = useState<string | undefined>();
  const qid = q?.id;
  useEffect(() => {
    if (!q || q.status === 'closed' || !live.onHandlers) return;
    live.onHandlers(q).then(setHandlers, () => setHandlers([]));
  }, [qid]); // eslint-disable-line react-hooks/exhaustive-deps
  const who = q ? live.nameOf(q.employeeId) : '';
  const assignee = q?.assigneeUserId && q.assigneeUserId !== live.me.id ? (handlers.find((h) => h.userId === q.assigneeUserId)?.name ?? assigneeText) : assigneeText;
  const verb = q?.assigneeUserId ? 'Reassign' : 'Assign';
  const choices = handlers.filter((h) => h.userId !== q?.assigneeUserId);
  // Never disabled: pressed with nobody chosen, the field says so and takes focus.
  const assign = () => {
    if (!q) return;
    if (!assignTo) {
      setAssignError(`Choose who to ${verb.toLowerCase()} the query to.`);
      document.getElementById('pq-assign')?.focus();
      return;
    }
    const name = handlers.find((h) => h.userId === assignTo)?.name ?? 'them';
    void run('reassign', async () => {
      await live.onAssign(q, assignTo);
      setAssignTo(null);
      say(`Query from ${who} ${verb === 'Assign' ? 'assigned' : 'reassigned'} to ${name}`);
    });
  };
  return (
    <Drawer
      open={!!q}
      onOpenChange={(o) => !o && onClose()}
      title={q ? `${who}: ${q.lineCode ?? 'Whole payslip'}` : ''}
      subtitle={q ? `Raised ${formatDate(day(q.createdAt))}` : undefined}
      meta={q && <Badge tone={Q_TONE[status]}>{status}</Badge>}
      size="lg"
      footer={
        <>
          <Button onClick={onClose}>Close</Button>
          {q && q.status !== 'closed' && live.onHandlers && (
            <Button loading={busy === 'reassign'} onClick={assign}>
              {verb}
            </Button>
          )}
          {q && q.status !== 'closed' && q.assigneeUserId !== live.me.id && (
            <Button loading={busy === 'assign'} onClick={() => void run('assign', async () => (await live.onAssign(q, live.me.id), say(`Query from ${who} assigned to you`)))}>
              Assign to me
            </Button>
          )}
          {q && q.status !== 'closed' && (
            <Button
              variant="primary"
              loading={busy === 'close'}
              onClick={() => {
                if (!replied && !sent) return say('Reply to the employee first, then mark it resolved.', 'default');
                void run('close', async () => {
                  await live.onClose(q);
                  say(`Query from ${who} on "${q.lineCode ?? 'the whole payslip'}" marked resolved`);
                  onClose();
                });
              }}
            >
              Mark resolved
            </Button>
          )}
        </>
      }
    >
      {q && (
        <div className="yx-pay-stack">
          {error && (
            <InlineAlert tone="danger" title="This didn't go through">
              {error}
            </InlineAlert>
          )}
          <DescriptionList
            columns={2}
            items={[
              { label: 'Line', value: q.line?.name ?? q.lineCode ?? 'Whole payslip' },
              { label: 'Amount on payslip', value: q.line ? formatINR(Number(q.line.amount)) : '—' },
              { label: 'Explanation', value: q.line?.explanation || '—' },
              { label: 'Assignee', value: assignee },
            ]}
          />
          {q.status !== 'closed' && live.onHandlers && (
            <FormField id="pq-assign" label={verb === 'Assign' ? 'Assign to' : 'Reassign to'} error={assignError} helper={choices.length ? undefined : 'Nobody else handles payslip queries for this entity.'}>
              <Select value={assignTo} onChange={(v) => (setAssignTo(v), setAssignError(undefined))} options={choices.map((h) => ({ value: h.userId, label: h.me ? `${h.name} (you)` : h.name }))} />
            </FormField>
          )}
          <CommentThread
            currentUser={{ id: live.me.id, name: live.me.name }}
            people={[]}
            resolvable={false}
            now={new Date()}
            onAdd={(c) => {
              if (q.status === 'closed') return;
              void live.onReply(q, c.body).then(
                () => (setSent(true), say(`Reply sent to ${who}`)),
                (e) => onFailed(e),
              );
            }}
            defaultComments={[
              { id: 'q', author: { id: q.employeeId, name: who }, body: q.text, at: new Date(q.createdAt) },
              ...(q.replies ?? []).map((r, i) => ({ id: `r${i}`, author: { id: r.side === 'payroll' ? r.by : q.employeeId, name: r.byName || (r.side === 'payroll' ? 'Payroll' : who) }, body: r.text, at: new Date(r.at) })),
            ]}
          />
        </div>
      )}
    </Drawer>
  );
}

/* ================================================================== PAY-19 Court orders and recoveries */

export interface LiveCourtOrder {
  id: string;
  employeeId: string;
  orderRef: string;
  amount: string | null;
  percent: string | null;
  priorityDate: string;
  capTotal: string | null;
  remittedTotal: string;
  status: string;
}
export interface CourtOrderInput {
  employeeId: string;
  orderRef: string;
  amount?: string;
  percent?: string;
  priorityDate: string;
  payee: string;
  capTotal?: string;
  endOn?: string;
}
export interface LiveRecoveriesData {
  /** Court orders (GET payroll/court-orders, payroll.input.manage). */
  orders: { state: LoadState; rows: LiveCourtOrder[] | null; canAdd: boolean; onAdd: (x: CourtOrderInput) => Promise<unknown> };
  /** Overpayment recovery plans (GET payroll/overpayments). */
  overpayments: { state: LoadState; rows: OverpaymentPlan[] | null; canWriteOff: boolean; onWriteOff: (r: OverpaymentPlan, reason: string) => Promise<unknown> };
  nameOf: (employeeId: string) => string;
  onSearch: (q: string) => Promise<PersonHit[]>;
  onRetry?: () => void;
  today: string;
  tab?: 'court' | 'over';
}

const OVER_STATUS: Record<string, { label: string; tone: BadgeTone }> = {
  proposed: { label: 'Needs consent', tone: 'warning' },
  active: { label: 'Recovering', tone: 'info' },
  declined: { label: 'Declined', tone: 'warning' },
  recovered: { label: 'Closed', tone: 'success' },
  written_off: { label: 'Written off', tone: 'neutral' },
};
const overStatus = (s: string) => OVER_STATUS[s] ?? { label: s, tone: 'neutral' as BadgeTone };

/** PAY-19 in live, as tabs for the Arrears and recoveries page: court orders (list, record, add) and overpayment plans (write off). */
export function LiveRecoveries({ live }: { live: LiveRecoveriesData }) {
  const say = useSay();
  const [openId, setOpenId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [writeOff, setWriteOff] = useState<OverpaymentPlan | null>(null);
  const [why, setWhy] = useState('');
  const [triedWhy, setTriedWhy] = useState(false);
  const orders = live.orders.rows ?? [];
  // Priority follows the order date: earlier orders are deducted first.
  const priority = (o: LiveCourtOrder) => orders.filter((x) => x.priorityDate < o.priorityDate).length + 1;
  const open = orders.find((o) => o.id === openId) ?? null;
  const overs = live.overpayments.rows ?? [];
  const amountText = (o: LiveCourtOrder) => (o.amount ? `${money(o.amount)} a month` : `${Number(o.percent)}% of net`);
  const orderCols: TableColumn<LiveCourtOrder>[] = [
    { key: 'employee', header: 'Employee', type: 'person', value: (c) => live.nameOf(c.employeeId), person: (c) => ({ name: live.nameOf(c.employeeId) }), width: 220 },
    { key: 'ref', header: 'Order', value: (c) => c.orderRef, width: 200 },
    { key: 'amount', header: 'Amount', value: (c) => amountText(c), width: 170 },
    { key: 'priority', header: 'Priority', type: 'number', value: (c) => priority(c), width: 110, optional: true },
    { key: 'remitted', header: 'Remitted / cap', type: 'money', value: (c) => Number(c.remittedTotal), render: (c) => `${money(c.remittedTotal)}${c.capTotal ? ` / ${money(c.capTotal)}` : ''}`, width: 190 },
    { key: 'status', header: 'Status', type: 'status', value: (c) => (c.status === 'active' ? 'Active' : c.status === 'completed' ? 'Completed' : c.status), statusTone: (v) => (v === 'Active' ? 'info' : 'success'), width: 130 },
  ];
  const overCols: TableColumn<OverpaymentPlan>[] = [
    { key: 'employee', header: 'Employee', type: 'person', value: (r) => live.nameOf(r.employeeId), person: (r) => ({ name: live.nameOf(r.employeeId) }), width: 220 },
    {
      key: 'origin',
      header: 'Origin',
      value: (r) => r.reason,
      render: (r) => (
        <>
          {r.reason}
          {r.crossYear && (
            <>
              <br />
              <span className="yx-pay-note">Earlier tax year {r.originTaxYear} (Form 10E)</span>
            </>
          )}
        </>
      ),
      width: 300,
    },
    { key: 'balance', header: 'Balance', type: 'money', value: (r) => Number(r.balance), total: 'sum', width: 110 },
    { key: 'plan', header: 'Plan', value: (r) => `${money(r.instalment)} a month · ${money(r.recovered)} of ${money(r.amount)} recovered`, width: 260 },
    { key: 'status', header: 'Status', type: 'status', value: (r) => overStatus(r.status).label, statusTone: (v) => Object.values(OVER_STATUS).find((s) => s.label === v)?.tone ?? 'neutral', width: 170 },
  ];
  return (
    <>
      <Tabs defaultValue={live.tab ?? 'court'}>
        <TabsList aria-label="Recoveries">
          <TabsTrigger value="court" count={live.orders.rows?.length}>
            Court orders
          </TabsTrigger>
          <TabsTrigger value="over" count={live.overpayments.rows?.length}>
            Overpayments
          </TabsTrigger>
        </TabsList>
        <TabsContent value="court">
          <PanelStates state={live.orders.state} onRetry={live.onRetry} what="court orders">
            <DataTable
              label="Court orders"
              columns={orderCols}
              rows={orders}
              getRowId={(c) => c.id}
              state={live.orders.rows ? 'ready' : 'loading'}
              onRowClick={(c) => setOpenId(c.id)}
              activeRowId={open?.id}
              rowButtons={(c) => (
                <Button size="sm" onClick={() => setOpenId(c.id)}>
                  Open
                </Button>
              )}
              toolbar={live.orders.canAdd ? <Button size="sm" variant="primary" icon={Plus} onClick={() => setAdding(true)}>Add court order</Button> : undefined}
              empty={<EmptyState title="No court orders." description="Add an order when the company receives one; deductions start with the next open run." action={live.orders.canAdd ? <Button icon={Plus} onClick={() => setAdding(true)}>Add court order</Button> : undefined} />}
            />
          </PanelStates>
        </TabsContent>
        <TabsContent value="over">
          <PanelStates state={live.overpayments.state} onRetry={live.onRetry} what="overpayment plans">
            <div className="yx-pay-stack">
              <InlineAlert tone="info">An overpayment is recovered only by a plan the employee acknowledges. A write-off needs approval with a reason.</InlineAlert>
              <DataTable
                label="Overpayment plans"
                columns={overCols}
                rows={overs}
                getRowId={(r) => r.id}
                state={live.overpayments.rows ? 'ready' : 'loading'}
                rowButtons={(r) =>
                  live.overpayments.canWriteOff && ['proposed', 'active', 'declined'].includes(r.status) ? (
                    <Button size="sm" variant="review" onClick={() => (setWhy(''), setTriedWhy(false), setWriteOff(r))}>
                      Write off
                    </Button>
                  ) : null
                }
                empty={<EmptyState title="No overpayments." description="An overpayment recovery plan appears here once payroll proposes it to the employee." />}
              />
            </div>
          </PanelStates>
        </TabsContent>
      </Tabs>
      <Drawer open={!!open} onOpenChange={(o) => !o && setOpenId(null)} title={`Court order ${open?.orderRef ?? ''}`} subtitle={open ? live.nameOf(open.employeeId) : undefined} size="lg" footer={<Button onClick={() => setOpenId(null)}>Close</Button>}>
        {open && (
          <DescriptionList
            columns={2}
            items={[
              { label: 'Amount', value: amountText(open) },
              { label: 'Priority', value: `${priority(open)} (order dated ${formatDate(day(open.priorityDate))})` },
              { label: 'Remitted', value: open.capTotal ? `${money(open.remittedTotal)} of ${money(open.capTotal)}` : money(open.remittedTotal) },
              { label: 'Remaining', value: open.capTotal ? money(String(Number(open.capTotal) - Number(open.remittedTotal))) : 'Until the order ends' },
            ]}
          />
        )}
      </Drawer>
      {adding && <CourtOrderDrawer live={live} count={orders.length} onClose={() => setAdding(false)} onSaved={(t) => say(t)} />}
      <ConfirmDialog
        open={!!writeOff}
        onOpenChange={(o) => !o && setWriteOff(null)}
        title={writeOff ? `Approve write-off of ${money(writeOff.balance)} for ${live.nameOf(writeOff.employeeId)}?` : ''}
        consequence={writeOff ? `${writeOff.reason}. The balance is closed and not recovered. You can't write off your own.` : undefined}
        confirmLabel="Approve write-off"
        confirmVariant="approve"
        onConfirm={async () => {
          setTriedWhy(true);
          if (why.trim().length < 5) return false;
          const r = writeOff!;
          await live.overpayments.onWriteOff(r, why.trim());
          setWriteOff(null);
          say(`Write-off of ${money(r.balance)} for ${live.nameOf(r.employeeId)} approved`);
        }}
      >
        <FormField id="wo-why" label="Reason" required error={triedWhy && why.trim().length < 5 ? 'Say why, in a few words.' : null}>
          <TextArea value={why} onChange={setWhy} rows={2} maxLength={500} />
        </FormField>
      </ConfirmDialog>
    </>
  );
}

function CourtOrderDrawer({ live, count, onClose, onSaved }: { live: LiveRecoveriesData; count: number; onClose: () => void; onSaved: (text: string) => void }) {
  const [who, setWho] = useState<PersonHit | null>(null);
  const [ref, setRef] = useState('');
  const [basis, setBasis] = useState<'amount' | 'percent'>('amount');
  const [monthly, setMonthly] = useState<number | null>(null);
  const [percent, setPercent] = useState('');
  const [orderDate, setOrderDate] = useState<Date | null>(null);
  const [payee, setPayee] = useState('');
  const [cap, setCap] = useState<number | null>(null);
  const [end, setEnd] = useState<Date | null>(null);
  const { busy, error, run } = useRun();
  const today = day(live.today);
  const errors = [
    ...(!who ? [{ fieldId: 'co-who', message: 'Choose the employee.' }] : []),
    ...(ref.trim().length < 3 ? [{ fieldId: 'co-ref', message: 'Enter the order reference.' }] : []),
    ...(!orderDate ? [{ fieldId: 'co-date', message: 'Enter the order date.' }] : orderDate > today ? [{ fieldId: 'co-date', message: 'The order date cannot be after today.' }] : []),
    ...(basis === 'amount' && (!monthly || monthly <= 0) ? [{ fieldId: 'co-amount', message: 'Enter the amount each month.' }] : []),
    ...(basis === 'percent' && (!/^\d{1,2}(\.\d{1,2})?$/.test(percent) || Number(percent) <= 0) ? [{ fieldId: 'co-percent', message: 'Enter a percentage of net pay below 100, e.g. 25.' }] : []),
    ...(payee.trim().length < 5 ? [{ fieldId: 'co-payee', message: 'Enter who receives it: account and bank code.' }] : []),
    ...(end && end < today ? [{ fieldId: 'co-end', message: 'The end date cannot be before today.' }] : []),
  ];
  const shown = useSaveErrors(errors);
  return (
    <Drawer
      open
      onOpenChange={(o) => !o && onClose()}
      title="Add court order"
      subtitle="Deductions start with the next open run. Priority follows the order date."
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            loading={busy === 'add'}
            onClick={() => {
              if (errors.length) {
                shown.reveal();
                document.getElementById(errors[0].fieldId)?.focus();
                return;
              }
              void run('add', async () => {
                await live.orders.onAdd({ employeeId: who!.id, orderRef: ref.trim(), ...(basis === 'amount' ? { amount: String(monthly) } : { percent }), priorityDate: isoOf(orderDate!), payee: payee.trim(), ...(cap ? { capTotal: String(cap) } : {}), ...(end ? { endOn: isoOf(end) } : {}) });
                onSaved(`Court order ${ref.trim()} added for ${who!.name} · deducted from the next open run`);
                onClose();
              });
            }}
          >
            Add court order
          </Button>
        </>
      }
    >
      <div className="yx-pay-stack">
        <ErrorSummary errors={shown.shownErrors} />
        {error && (
          <InlineAlert tone="danger" title="Not added">
            {error}
          </InlineAlert>
        )}
        <PersonPicker id="co-who" label="Employee" value={who} onChange={setWho} onSearch={live.onSearch} error={shown.errorOf('co-who')} />
        <FieldRow>
          <FormField id="co-ref" label="Order reference" required error={shown.errorOf('co-ref')}>
            <TextField value={ref} onChange={setRef} placeholder="MC 301/2026" maxLength={80} />
          </FormField>
          <FormField id="co-date" label="Order date" required error={shown.errorOf('co-date')} helper={`Sets the priority among ${plural(count + 1, 'order')}: earlier orders are deducted first.`}>
            <DatePicker value={orderDate} onChange={setOrderDate} max={today} />
          </FormField>
        </FieldRow>
        <Segment
          label="Deduct"
          value={basis}
          onChange={setBasis}
          options={[
            { value: 'amount', label: 'A fixed amount' },
            { value: 'percent', label: 'A share of net pay' },
          ]}
        />
        {basis === 'amount' ? (
          <FormField id="co-amount" label="Amount each month" required error={shown.errorOf('co-amount')}>
            <CurrencyField value={monthly} onChange={setMonthly} />
          </FormField>
        ) : (
          <FormField id="co-percent" label="Share of net pay (%)" required error={shown.errorOf('co-percent')}>
            <TextField value={percent} onChange={setPercent} inputMode="decimal" />
          </FormField>
        )}
        <FormField id="co-payee" label="Paid to" required error={shown.errorOf('co-payee')} helper="Account number and bank code of the court or decree holder. Stored encrypted.">
          <TextField value={payee} onChange={setPayee} maxLength={200} />
        </FormField>
        <FieldRow>
          <FormField id="co-cap" label="Total to recover" optional helper="Leave empty when the order has no total.">
            <CurrencyField value={cap} onChange={setCap} />
          </FormField>
          <FormField id="co-end" label="End date" optional error={shown.errorOf('co-end')} helper="Last month of deduction.">
            <DatePicker value={end} onChange={setEnd} min={today} />
          </FormField>
        </FieldRow>
      </div>
    </Drawer>
  );
}
