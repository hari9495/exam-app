// The live app's EXP-06 To-pay queue and EXP-09 Expense reports: the designed screens with real data (expenses round
// 2). The designs' parts are reused (OpsDesk, PageHeader, PageBanner, the claims table with saved views, filters and
// bulk actions, the confirm dialogs, the report tabs and charts); what the real record needs is added in the same
// style (bank files released by a second person, the bank's results, the expense journal, the approver-patterns report).
import { useMemo, useState } from 'react';
import { Download } from 'lucide-react';
import { Button } from '../../components/button';
import { Badge, type BadgeTone } from '../../components/display';
import { EmptyState, ErrorState, InlineAlert, NoAccessState, Skeleton } from '../../components/feedback';
import { Drawer } from '../../components/drawer';
import { FieldRow, FormField, useTooEarly } from '../../components/field';
import { TextArea, TextField } from '../../components/inputs';
import { Select } from '../../components/select';
import { DataTable, type TableColumn } from '../../components/table';
import { FilterBar, SavedViewMenu, type FilterFieldDef } from '../../components/filters';
import { Card, PageHeader, Tabs, TabsContent, TabsList, TabsTrigger } from '../../components/shell';
import { ConfirmDialog } from '../../components/overlay';
import { PageBanner } from '../../components/notify';
import { BarChart, DonutChart } from '../../components/charts';
import { Segment } from '../../components/segment';
import { formatDate } from '../../lib/format';
import type { FilterValue } from '../../lib/table';
import { errorText } from '../org/org-kit';
import { useAct } from '../growth/perf-live';
import { IrreversibleSheet } from '../pay/pay-kit';
import { Actions, CardGrid, OpsDesk } from './ops-kit';
import { PAYMENT, amount, day, money, monthName, sumMoney, type LoadState } from './expenses-live-data';
import type { ExpenseJournalView, ExpenseReport, PayoutBatchRow, PayoutResultInput, ReportKind, ToPayClaim, ToPayData } from '../expenses/live/types';

function NotReady({ state, onRetry, title, active, what, grantedBy }: { state: LoadState; onRetry: () => void; title: string; active: string; what: string; grantedBy: string }) {
  return (
    <OpsDesk area="expenses" active={active}>
      <PageHeader title={title} />
      {state === 'loading' ? (
        <div className="yx-ops-stack" role="status" aria-busy="true" aria-label={`Loading ${what}`}>
          <Skeleton height={64} />
          <Skeleton height={240} />
        </div>
      ) : state === 'no-access' ? (
        <NoAccessState what={what} grantedBy={grantedBy} />
      ) : (
        <ErrorState title={`We couldn't load ${what}.`} description="Nothing has changed. Try again in a moment." onRetry={onRetry} />
      )}
    </OpsDesk>
  );
}

/* ================================================================== EXP-06 · To pay (live) */

export interface LiveToPay {
  state: LoadState;
  onRetry: () => void;
  data: ToPayData | null;
  journal: ExpenseJournalView | null;
  journalEntity: string | null;
  journalMonth: string;
  onJournal: (entityId: string | null, month: string) => void;
  onToPayroll: (claimIds: string[]) => Promise<{ moved: number; refused: { claimId: string; reason: string }[] }>;
  onPayout: (claimIds: string[], debitAccount: string) => Promise<{ rows: number; total: string; phrase: string; excluded: { claimId: string; reason: string }[] }>;
  onDownload: (batch: PayoutBatchRow) => Promise<unknown>;
  onRelease: (batch: PayoutBatchRow, phrase: string) => Promise<unknown>;
  onCancel: (batch: PayoutBatchRow, reason: string) => Promise<unknown>;
  onResults: (batch: PayoutBatchRow, rows: PayoutResultInput[]) => Promise<unknown>;
  onExportJournal: () => Promise<unknown>;
  onPosted: (journalId: string) => Promise<unknown>;
}
export type ToPayTab = 'claims' | 'files' | 'journal';
export type ToPaySheet = 'release' | 'results' | 'cancel' | 'reroute' | null;

const BATCH: Record<PayoutBatchRow['status'], { label: string; tone: BadgeTone }> = {
  draft: { label: 'Waiting for release', tone: 'warning' },
  released: { label: 'Sent to the bank', tone: 'info' },
  confirmed: { label: 'Settled', tone: 'success' },
  cancelled: { label: 'Cancelled', tone: 'neutral' },
};
const PAY_FILTERS: FilterFieldDef[] = [
  { key: 'payment', label: 'Payment status', type: 'multi', options: (['approved_unpaid', 'in_payroll', 'payout_queued', 'payment_failed', 'paid'] as const).map((v) => ({ value: v, label: PAYMENT[v]!.label })) },
  { key: 'route', label: 'Route', type: 'multi', options: [{ value: 'payroll', label: 'Next payroll' }, { value: 'payout', label: 'Direct payout' }] },
];

export function LiveToPayScreen({ live, defaultTab = 'claims', defaultSheet = null }: { live: LiveToPay; defaultTab?: ToPayTab; defaultSheet?: ToPaySheet }) {
  const d = live.data;
  const { toast } = useAct();
  const [tab, setTab] = useState<ToPayTab>(defaultTab);
  const [viewId, setViewId] = useState('unpaid');
  const [filters, setFilters] = useState<FilterValue[]>([]);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [dialog, setDialog] = useState<{ kind: 'payroll' | 'payout'; ids: string[] } | null>(null);
  const [reroute, setReroute] = useState<ToPayClaim | null>(defaultSheet === 'reroute' ? (d?.claims.find((c) => c.paymentStatus === 'payment_failed' && c.route === 'payout') ?? null) : null);
  const [refused, setRefused] = useState<{ title: string; items: string[] } | null>(null);
  const claims = d?.claims ?? [];
  const rows = useMemo(() => {
    let r = claims;
    if (viewId === 'unpaid') r = r.filter((c) => c.paymentStatus !== 'paid');
    if (viewId === 'failed') r = r.filter((c) => c.paymentStatus === 'payment_failed');
    for (const f of filters) if (f.type === 'multi' && f.values.length) r = r.filter((c) => f.values.includes(f.key === 'payment' ? c.paymentStatus : (c.route ?? 'payroll')));
    const q = search.trim().toLowerCase();
    return q ? r.filter((c) => `${c.employeeName} ${c.title}`.toLowerCase().includes(q)) : r;
  }, [claims, viewId, filters, search]);
  if (live.state !== 'ready' || !d) return <NotReady state={live.state} onRetry={live.onRetry} title="To pay" active="To pay" what="claims to pay" grantedBy="your finance admin" />;
  const nameOf = (id: string) => claims.find((c) => c.id === id)?.employeeName ?? 'A claim';
  const failed = claims.filter((c) => c.paymentStatus === 'payment_failed').length;
  const unpaid = claims.filter((c) => c.paymentStatus !== 'paid').length;
  const payMonth = d.payroll ? monthName(d.payroll.month).split(' ')[0] : 'the next';
  const chosen = (ids: string[]) => claims.filter((c) => ids.includes(c.id));
  const open = (kind: 'payroll' | 'payout', ids: string[]) => {
    if (kind === 'payout' && new Set(chosen(ids).map((c) => c.legalEntityId)).size > 1) return void toast({ tone: 'error', title: 'A bank file pays the claims of one legal entity. Choose claims of one entity.' });
    setDialog({ kind, ids });
  };
  const cols: TableColumn<ToPayClaim>[] = [
    { key: 'emp', header: 'Employee', type: 'person', value: (c) => c.employeeName, person: (c) => ({ name: c.employeeName, secondary: c.title }), width: 240 },
    { key: 'net', header: 'Net payable', value: (c) => amount(c.netPayable), render: (c) => money('INR', c.netPayable) },
    { key: 'appr', header: 'Approved', value: (c) => amount(c.approvedTotal), render: (c) => money('INR', c.approvedTotal) },
    { key: 'adv', header: 'Advance adjusted', value: (c) => amount(c.advanceAdjusted), render: (c) => money('INR', c.advanceAdjusted) },
    { key: 'route', header: 'Route', value: (c) => c.route ?? '', render: (c) => (c.route === 'payout' ? 'Direct payout' : c.payMonth ? `${monthName(c.payMonth)} payroll` : 'Next payroll') },
    { key: 'status', header: 'Status', value: (c) => c.paymentStatus, render: (c) => <span className="yx-ops-row"><Badge tone={PAYMENT[c.paymentStatus]?.tone ?? 'neutral'}>{PAYMENT[c.paymentStatus]?.label ?? c.paymentStatus}</Badge>{c.reason && <span className="yx-ops-muted">{c.reason}</span>}</span>, width: 260 },
    { key: 'utr', header: 'Payment reference', type: 'id', value: (c) => c.ref ?? '—' },
  ];
  const total = (ids: string[]) => sumMoney(chosen(ids).map((c) => c.netPayable));
  const after = (title: string, items: string[]) => {
    setSelected([]);
    if (items.length) setRefused({ title, items });
    else toast({ tone: 'success', title });
  };
  return (
    <OpsDesk area="expenses" active="To pay" counts={{ 'To pay': unpaid }}>
      <PageHeader
        title="To pay"
        description="Approved claims. Net payable is approved minus advance adjusted. A claim is marked paid only when the payroll run is paid or the payout is confirmed."
        facts={d.payroll ? `${payMonth} payroll cut-off ${formatDate(day(`${d.payroll.month}-${String(d.payroll.cutoffDay).padStart(2, '0')}`))}` : undefined}
      />
      {failed > 0 && (
        <PageBanner tone="danger" action={<Button size="sm" onClick={() => (setTab('claims'), setViewId('failed'))}>Show failed</Button>}>
          {failed} {failed === 1 ? 'payment' : 'payments'} failed. Re-route to the next payroll or a direct payout.
        </PageBanner>
      )}
      {refused && (
        <InlineAlert tone="warning" title={refused.title}>
          <ul className="yx-ops-plain">
            {refused.items.map((x) => (
              <li key={x}>{x}</li>
            ))}
          </ul>
        </InlineAlert>
      )}
      <Tabs value={tab} onValueChange={(v) => setTab(v as ToPayTab)}>
        <TabsList aria-label="To pay">
          <TabsTrigger value="claims">Claims</TabsTrigger>
          <TabsTrigger value="files" count={d.batches.filter((b) => b.status === 'draft' || b.status === 'released').length || undefined}>
            Bank files
          </TabsTrigger>
          <TabsTrigger value="journal">Journal</TabsTrigger>
        </TabsList>
        <TabsContent value="claims">
          <DataTable
            label="Claims to pay"
            columns={cols}
            rows={rows}
            getRowId={(c) => c.id}
            empty={<EmptyState title="Nothing to pay." description="Approved claims appear here." />}
            filtered={filters.length > 0 || search.trim() !== ''}
            onClearFilters={() => (setFilters([]), setSearch(''))}
            selectable
            isSelectable={(c) => (c.paymentStatus === 'paid' ? 'Already paid' : c.paymentStatus === 'in_payroll' ? 'Already in a payroll' : c.paymentStatus === 'payout_queued' ? 'Already in a bank file' : c.paymentStatus === 'payment_failed' && c.route === 'payroll' ? 'Payroll pays it again with the salary' : true)}
            selectedIds={selected}
            onSelectedChange={setSelected}
            bulkActions={(ids) => (
              <>
                <Button size="sm" onClick={() => open('payroll', ids)}>
                  Add {ids.length} to {payMonth} payroll
                </Button>
                <Button size="sm" onClick={() => open('payout', ids)}>
                  Pay now by bank file
                </Button>
              </>
            )}
            rowButtons={(c) => (c.paymentStatus === 'payment_failed' && c.route === 'payout' ? <Button size="sm" onClick={() => setReroute(c)}>Re-route</Button> : null)}
            toolbar={<FilterBar fields={PAY_FILTERS} value={filters} onChange={setFilters} search={search} onSearchChange={setSearch} searchPlaceholder="Search claim or employee" />}
            views={<SavedViewMenu views={[{ id: 'unpaid', name: 'Unpaid' }, { id: 'failed', name: 'Payment failed', shared: true }, { id: 'all', name: 'All approved' }]} currentId={viewId} onSelect={setViewId} />}
          />
        </TabsContent>
        <TabsContent value="files">
          <BankFiles live={live} entityName={(id) => d.entities.find((e) => e.id === id)?.name ?? ''} nameOf={nameOf} defaultSheet={defaultSheet} />
        </TabsContent>
        <TabsContent value="journal">
          <Journal live={live} />
        </TabsContent>
      </Tabs>
      {dialog && (
        <PayDialog
          kind={dialog.kind}
          count={dialog.ids.length}
          total={total(dialog.ids)}
          month={payMonth}
          onClose={() => setDialog(null)}
          onConfirm={async (debit) => {
            if (dialog.kind === 'payroll') {
              const r = await live.onToPayroll(dialog.ids);
              after(`${r.moved} added to the ${payMonth} payroll`, r.refused.map((x) => `${nameOf(x.claimId)}: ${x.reason}`));
            } else {
              const r = await live.onPayout(dialog.ids, debit);
              after(`Bank file made: ${r.rows} ${r.rows === 1 ? 'payment' : 'payments'}, ${money('INR', r.total)}. Someone else releases it.`, r.excluded.map((x) => `${nameOf(x.claimId)}: ${x.reason}`));
            }
          }}
        />
      )}
      {reroute && (
        <RerouteDialog
          claim={reroute}
          month={payMonth}
          onClose={() => setReroute(null)}
          onPayroll={async () => {
            const r = await live.onToPayroll([reroute.id]);
            after(r.moved ? `${reroute.employeeName}'s claim goes to the ${payMonth} payroll` : 'Not re-routed', r.refused.map((x) => `${nameOf(x.claimId)}: ${x.reason}`));
          }}
          onPayout={() => (setReroute(null), setDialog({ kind: 'payout', ids: [reroute.id] }))}
        />
      )}
    </OpsDesk>
  );
}

/** The design's bulk confirm, with the account a bank file pays from. */
function PayDialog({ kind, count, total, month, onClose, onConfirm }: { kind: 'payroll' | 'payout'; count: number; total: string; month: string; onClose: () => void; onConfirm: (debit: string) => Promise<unknown> }) {
  const [debit, setDebit] = useState('');
  const early = useTooEarly(kind === 'payout' && !/^\d{6,20}$/.test(debit.trim()) ? [{ fieldId: 'po-debit', message: 'The account the money comes from: 6 to 20 digits.' }] : []);
  const n = `${count} ${count === 1 ? 'claim' : 'claims'}`;
  return (
    <ConfirmDialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={kind === 'payroll' ? `Add ${n} to the ${month} payroll?` : `Pay ${n} now by bank file?`}
      consequence={kind === 'payroll' ? `${money('INR', total)} is added as reimbursement lines. They are marked paid when the ${month} run is paid.` : `A bank file for ${money('INR', total)} is created for release by someone else. Claims are marked paid when the bank confirms.`}
      confirmLabel={kind === 'payroll' ? 'Add to payroll' : 'Create bank file'}
      onConfirm={async () => {
        if (early.stop()) return false;
        await onConfirm(debit.trim());
      }}
    >
      {kind === 'payout' && (
        <FormField id="po-debit" label="Pay from account" required error={early.errorOf('po-debit')} helper="Each claim goes to the employee's reimbursement account, or their salary account.">
          <TextField value={debit} onChange={setDebit} inputMode="numeric" maxLength={20} />
        </FormField>
      )}
    </ConfirmDialog>
  );
}

function RerouteDialog({ claim, month, onClose, onPayroll, onPayout }: { claim: ToPayClaim; month: string; onClose: () => void; onPayroll: () => Promise<unknown>; onPayout: () => void }) {
  const [to, setTo] = useState<'payroll' | 'payout'>('payroll');
  return (
    <ConfirmDialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={`Re-route ${claim.employeeName}'s payment?`}
      consequence={`${money('INR', claim.netPayable)} did not go through${claim.reason ? ` (${claim.reason})` : ''}. Pay it with the salary or in a new bank file.`}
      confirmLabel={to === 'payroll' ? `Add to ${month} payroll` : 'Choose the bank file'}
      onConfirm={async () => {
        if (to === 'payout') return onPayout();
        await onPayroll();
      }}
    >
      <FormField label="Pay it through">
        <Segment label="Pay it through" value={to} onChange={setTo} options={[{ value: 'payroll', label: 'Next payroll' }, { value: 'payout', label: 'A new bank file' }]} />
      </FormField>
    </ConfirmDialog>
  );
}

function BankFiles({ live, entityName, nameOf, defaultSheet }: { live: LiveToPay; entityName: (id: string) => string; nameOf: (id: string) => string; defaultSheet: ToPaySheet }) {
  const batches = live.data?.batches ?? [];
  const { busy, act, toast } = useAct();
  const first = (s: PayoutBatchRow['status'], mine?: boolean) => batches.find((b) => b.status === s && (mine === undefined || b.madeByMe === mine)) ?? null;
  const [releasing, setReleasing] = useState<PayoutBatchRow | null>(defaultSheet === 'release' ? first('draft', false) : null);
  const [cancelling, setCancelling] = useState<PayoutBatchRow | null>(defaultSheet === 'cancel' ? first('draft') : null);
  const [recording, setRecording] = useState<PayoutBatchRow | null>(defaultSheet === 'results' ? first('released') : null);
  const [failed, setFailed] = useState<string | null>(null);
  return (
    <div className="yx-ops-stack">
      <p className="yx-ops-muted">A bank file is released by someone other than the person who made it. Claims are marked paid when you record the bank&apos;s results.</p>
      <DataTable
        label="Bank files"
        columns={[
          { key: 'made', header: 'Made', type: 'date', value: (b: PayoutBatchRow) => day(b.createdAt) },
          { key: 'ent', header: 'Legal entity', value: (b) => entityName(b.legalEntityId) },
          { key: 'rows', header: 'Payments', type: 'number', value: (b) => b.rows },
          { key: 'total', header: 'Total', value: (b) => amount(b.total), render: (b) => money('INR', b.total) },
          { key: 'status', header: 'Status', value: (b) => b.status, render: (b) => <span className="yx-ops-row"><Badge tone={BATCH[b.status].tone}>{BATCH[b.status].label}</Badge>{b.status === 'draft' && b.madeByMe && <span className="yx-ops-muted">Someone else releases it.</span>}</span>, width: 280 },
        ]}
        rows={batches}
        getRowId={(b) => b.id}
        rowNoun={['bank file', 'bank files']}
        empty={<EmptyState compact title="No bank files yet." description="Choose waiting claims and pay them by bank file." />}
        rowButtons={(b) => (
          <>
            <Button size="sm" icon={Download} loading={busy === `d-${b.id}`} onClick={() => void act(`d-${b.id}`, () => live.onDownload(b))} aria-label={`Download the bank file of ${formatDate(day(b.createdAt))}`}>
              Download
            </Button>
            {b.status === 'draft' && <Button size="sm" variant="primary" onClick={() => (b.madeByMe ? toast({ tone: 'error', title: 'You made this bank file, so someone else releases it.' }) : setReleasing(b))}>Release</Button>}
            {b.status === 'draft' && <Button size="sm" onClick={() => setCancelling(b)}>Cancel</Button>}
            {b.status === 'released' && <Button size="sm" onClick={() => setRecording(b)}>Record results</Button>}
          </>
        )}
      />
      {releasing && (
        <IrreversibleSheet
          open
          onOpenChange={(o) => !o && (setReleasing(null), setFailed(null))}
          title="Release this bank file"
          impact={[
            { label: 'Payments', value: String(releasing.rows) },
            { label: 'Total', value: money('INR', releasing.total) },
            { label: 'File check', value: releasing.sha256.slice(0, 12) },
          ]}
          cannotUndo="The file goes to the bank; what the bank pays is final."
          correction="A payment that fails is paid again from To pay."
          phrase={`RELEASE ${releasing.rows}`}
          maker="maker"
          checker="you"
          confirmLabel="Release"
          confirmVariant="primary"
          blocked={failed ? <InlineAlert tone="danger" title="Not released">{failed}</InlineAlert> : undefined}
          onConfirm={() =>
            void (async () => {
              try {
                await live.onRelease(releasing, `RELEASE ${releasing.rows}`);
                toast({ tone: 'success', title: 'Bank file released', description: 'Record the bank\'s results when they come back.' });
                setReleasing(null);
              } catch (e) {
                setFailed(errorText(e));
              }
            })()
          }
        />
      )}
      {cancelling && <CancelDrawer onClose={() => setCancelling(null)} onSave={async (why) => (await live.onCancel(cancelling, why), toast({ tone: 'success', title: 'Bank file cancelled', description: 'Its claims wait to be paid again.' }))} />}
      {recording && <ResultsDrawer batch={recording} claims={(live.data?.claims ?? []).filter((c) => c.batchId === recording.id && c.paymentStatus === 'payout_queued')} nameOf={nameOf} onClose={() => setRecording(null)} onSave={async (rows) => (await live.onResults(recording, rows), toast({ tone: 'success', title: 'Bank results recorded' }))} />}
    </div>
  );
}

function CancelDrawer({ onClose, onSave }: { onClose: () => void; onSave: (reason: string) => Promise<unknown> }) {
  const [reason, setReason] = useState('');
  const [failed, setFailed] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const early = useTooEarly(reason.trim().length < 5 ? [{ fieldId: 'cb-why', message: 'Say why, in at least 5 characters.' }] : []);
  return (
    <Drawer
      open
      onOpenChange={(o) => !o && onClose()}
      title="Cancel this bank file?"
      subtitle="Its claims wait to be paid again."
      notice={failed ? <InlineAlert tone="danger" title="Not cancelled">{failed}</InlineAlert> : undefined}
      footer={
        <>
          <Button onClick={onClose}>Keep it</Button>
          <Button variant="danger" loading={saving} onClick={async () => {
            if (early.stop()) return;
            setSaving(true);
            try {
              await onSave(reason.trim());
              onClose();
            } catch (e) {
              setFailed(errorText(e));
            } finally {
              setSaving(false);
            }
          }}>
            Cancel file
          </Button>
        </>
      }
    >
      <FormField id="cb-why" label="Why" required error={early.errorOf('cb-why')}>
        <TextArea value={reason} onChange={setReason} rows={2} maxLength={300} />
      </FormField>
    </Drawer>
  );
}

type ResultRow = { status: PayoutResultInput['status']; ref: string; reason: string };
function ResultsDrawer({ batch, claims, nameOf, onClose, onSave }: { batch: PayoutBatchRow; claims: ToPayClaim[]; nameOf: (id: string) => string; onClose: () => void; onSave: (rows: PayoutResultInput[]) => Promise<unknown> }) {
  const [rows, setRows] = useState<Record<string, ResultRow>>(() => Object.fromEntries(claims.map((c) => [c.id, { status: 'paid' as const, ref: '', reason: '' }])));
  const [failed, setFailed] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const set = (id: string, x: Partial<ResultRow>) => setRows((r) => ({ ...r, [id]: { ...r[id]!, ...x } }));
  const early = useTooEarly(
    claims.flatMap((c) => [
      ...(rows[c.id]!.ref.trim() && !/^[A-Za-z0-9/-]{1,60}$/.test(rows[c.id]!.ref.trim()) ? [{ fieldId: `rs-ref-${c.id}`, message: `${nameOf(c.id)}: a bank reference is letters, digits, / and -.` }] : []),
      ...(rows[c.id]!.status !== 'paid' && rows[c.id]!.reason.trim().length < 3 ? [{ fieldId: `rs-why-${c.id}`, message: `${nameOf(c.id)}: say what the bank gave as the reason.` }] : []),
    ]),
  );
  return (
    <Drawer
      open
      onOpenChange={(o) => !o && onClose()}
      title="The bank's results"
      subtitle={`${batch.rows} ${batch.rows === 1 ? 'payment' : 'payments'}, ${money('INR', batch.total)}`}
      size="lg"
      notice={failed ? <InlineAlert tone="danger" title="Not recorded">{failed}</InlineAlert> : undefined}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" loading={saving} onClick={async () => {
            if (early.stop()) return;
            setSaving(true);
            try {
              await onSave(claims.map((c) => ({ claimId: c.id, status: rows[c.id]!.status, ...(rows[c.id]!.ref.trim() ? { ref: rows[c.id]!.ref.trim() } : {}), ...(rows[c.id]!.status !== 'paid' ? { reason: rows[c.id]!.reason.trim() } : {}) })));
              onClose();
            } catch (e) {
              setFailed(errorText(e));
            } finally {
              setSaving(false);
            }
          }}>
            Record results
          </Button>
        </>
      }
    >
      <div className="yx-ops-stack">
        {claims.length === 0 && <EmptyState compact title="Nothing waiting on this file." />}
        {claims.map((c) => (
          <Card key={c.id} title={`${c.employeeName} · ${money('INR', c.netPayable)}`}>
            <div className="yx-ops-stack" data-gap="sm">
              <Segment label={`Result for ${c.employeeName}`} value={rows[c.id]!.status} onChange={(status) => set(c.id, { status })} options={[{ value: 'paid', label: 'Paid' }, { value: 'failed', label: 'Failed' }, { value: 'returned', label: 'Came back' }]} />
              <FieldRow>
                <FormField id={`rs-ref-${c.id}`} label="Bank reference" optional error={early.errorOf(`rs-ref-${c.id}`)}>
                  <TextField value={rows[c.id]!.ref} onChange={(ref) => set(c.id, { ref })} maxLength={60} />
                </FormField>
                {rows[c.id]!.status !== 'paid' && (
                  <FormField id={`rs-why-${c.id}`} label="Reason from the bank" required error={early.errorOf(`rs-why-${c.id}`)}>
                    <TextField value={rows[c.id]!.reason} onChange={(reason) => set(c.id, { reason })} maxLength={300} />
                  </FormField>
                )}
              </FieldRow>
            </div>
          </Card>
        ))}
      </div>
    </Drawer>
  );
}

function Journal({ live }: { live: LiveToPay }) {
  const { busy, act, toast } = useAct();
  const j = live.journal;
  const ready = Boolean(j && j.lines.length && !j.unmapped.length && j.balanced);
  return (
    <div className="yx-ops-stack">
      <FieldRow>
        <FormField label="Legal entity">
          <Select aria-label="Legal entity" value={live.journalEntity} onChange={(id) => live.onJournal(id, live.journalMonth)} placeholder="Choose a legal entity" options={(live.data?.entities ?? []).map((e) => ({ value: e.id, label: e.name }))} />
        </FormField>
        <FormField label="Month">
          <TextField type="month" value={live.journalMonth} onChange={(m) => /^\d{4}-\d{2}$/.test(m) && live.onJournal(live.journalEntity, m)} />
        </FormField>
      </FieldRow>
      {!live.journalEntity && <EmptyState compact title="Choose a legal entity" description="The journal is made for each legal entity and month." />}
      {live.journalEntity && j && (
        <>
          {j.unmapped.length > 0 && (
            <InlineAlert tone="warning" title="Map these codes to ledger accounts before exporting">
              <ul className="yx-ops-plain">
                {j.unmapped.map((u) => (
                  <li key={u.componentCode}>
                    {u.componentCode} · {money('INR', u.amount)}
                  </li>
                ))}
              </ul>
              Map them on the Ledger mapping page.
            </InlineAlert>
          )}
          <DataTable
            label="Expense journal"
            columns={[
              { key: 'a', header: 'Account', value: (l: ExpenseJournalView['lines'][number]) => `${l.accountCode} · ${l.accountName}`, width: 320 },
              { key: 'd', header: 'Debit', value: (l) => amount(l.debit), render: (l) => money('INR', l.debit) },
              { key: 'c', header: 'Credit', value: (l) => amount(l.credit), render: (l) => money('INR', l.credit) },
            ]}
            rows={j.lines}
            getRowId={(l) => l.accountCode}
            empty={<EmptyState compact title={`Nothing for ${monthName(j.month)}`} description="Approved claims, bank transfers and advances of the month appear here." />}
          />
          {j.lines.length > 0 && <p className="yx-ops-muted">Debits {money('INR', sumMoney(j.lines.map((l) => l.debit)))} · credits {money('INR', sumMoney(j.lines.map((l) => l.credit)))}{j.balanced ? '' : ' · does not balance'}</p>}
          <Actions>
            <Button variant="primary" icon={Download} loading={busy === 'export'} onClick={() => (ready ? void act('export', live.onExportJournal, 'Journal exported') : toast({ tone: 'error', title: !j.lines.length ? 'Nothing to export for this month.' : j.unmapped.length ? 'Map every code to a ledger account first.' : 'The journal does not balance yet.' }))}>
              Export journal (CSV)
            </Button>
          </Actions>
          {j.exports.length > 0 && (
            <DataTable
              label="Exports"
              columns={[
                { key: 'on', header: 'Exported', type: 'date', value: (x: ExpenseJournalView['exports'][number]) => day(x.createdAt) },
                { key: 's', header: 'Status', value: (x) => x.status, render: (x) => <Badge tone={x.status === 'posted' ? 'success' : 'info'}>{x.status === 'posted' ? 'Posted' : 'Exported'}</Badge> },
              ]}
              rows={j.exports}
              getRowId={(x) => x.id}
              rowButtons={(x) => (x.status === 'exported' ? <Button size="sm" loading={busy === `p-${x.id}`} onClick={() => void act(`p-${x.id}`, () => live.onPosted(x.id), 'Marked posted')}>Mark posted</Button> : null)}
            />
          )}
        </>
      )}
    </div>
  );
}

/* ================================================================== EXP-09 · Expense reports (live) */

export interface LiveReports {
  state: LoadState;
  onRetry: () => void;
  kind: ReportKind;
  report: ExpenseReport | null;
  from: string;
  to: string;
  departments: string[];
  /** The scope picker's entity name, or null for all the entities I may see. */
  entityName: string | null;
  onKind: (kind: ReportKind) => void;
  onFilters: (from: string, to: string, departments: string[]) => void;
  onExport: (format: 'csv' | 'xlsx') => Promise<unknown>;
}

const REPORT_TABS: { value: ReportKind; label: string; about: string }[] = [
  { value: 'summary', label: 'Summary', about: 'Approved spend by category, for claims decided in the period.' },
  { value: 'advance-ageing', label: 'Advance ageing', about: 'Advances with money still to settle, by how long they have been open.' },
  { value: 'unpaid', label: 'Unpaid claims', about: 'Approved claims not paid yet.' },
  { value: 'over-limit', label: 'Over limit', about: 'Approved bills that went over a limit, with the reason given.' },
  { value: 'gst-input', label: 'GST input', about: 'Bills with GST details and whether the company can claim the credit, in the GSTR-2B column order.' },
  { value: 'approver-patterns', label: 'Approver patterns', about: 'An approver who approved 3 or more flagged or over-limit claims of the same person in 90 days. For a second look, never a block.' },
];
const MONEY_KEYS = new Set(['claimed', 'approved', 'netPayable', 'open', 'overBy', 'value', 'taxable', 'igst', 'cgst', 'sgst', 'cess']);

export function LiveReportsScreen({ live }: { live: LiveReports }) {
  const { busy, act } = useAct();
  const r = live.report;
  if (live.state === 'no-access' || live.state === 'error') return <NotReady state={live.state} onRetry={live.onRetry} title="Expense reports" active="Expense reports" what="expense reports" grantedBy="your System Admin" />;
  const loading = live.state === 'loading';
  const filters: FilterValue[] = [{ key: 'period', type: 'date', from: live.from, to: live.to }, ...(live.departments.length ? [{ key: 'dept', type: 'multi' as const, values: live.departments }] : [])];
  const fields: FilterFieldDef[] = [
    { key: 'dept', label: 'Department', type: 'multi', options: (r?.departments ?? []).map((x) => ({ value: x.id, label: x.name })) },
    { key: 'period', label: 'Period', type: 'date' },
  ];
  const onFilters = (v: FilterValue[]) => {
    const p = v.find((x) => x.key === 'period');
    const dp = v.find((x) => x.key === 'dept');
    live.onFilters((p?.type === 'date' && p.from) || live.from, (p?.type === 'date' && p.to) || live.to, dp?.type === 'multi' ? dp.values : []);
  };
  const columns: TableColumn<Record<string, string | number | null>>[] = (r?.columns ?? []).map((c) => ({ key: c.key, header: c.label, value: (row) => (MONEY_KEYS.has(c.key) ? amount(row[c.key] === null ? null : String(row[c.key])) : (row[c.key] ?? '')), ...(MONEY_KEYS.has(c.key) ? { render: (row: Record<string, string | number | null>) => (row[c.key] === null ? '—' : money(String(row.currency ?? 'INR'), String(row[c.key]))) } : {}), width: 160 }));
  const table = r && <DataTable label={REPORT_TABS.find((t) => t.value === live.kind)!.label} columns={columns} rows={r.rows} getRowId={(row) => String(r.rows.indexOf(row))} rowNoun={['row', 'rows']} state={loading ? 'loading' : 'ready'} empty={<EmptyState compact title="Nothing to show for this period." />} />;
  const bars = (xs: { label: string; amount: string; count?: number }[] | undefined) => xs ?? [];
  return (
    <OpsDesk area="expenses" active="Expense reports">
      <PageHeader title="Expense reports" description={REPORT_TABS.find((t) => t.value === live.kind)!.about} facts={`${formatDate(day(live.from))} to ${formatDate(day(live.to))} · ${live.entityName ?? 'all entities'}`} actions={<Button icon={Download} loading={busy === 'csv'} onClick={() => void act('csv', () => live.onExport('csv'))}>Export</Button>} />
      <FilterBar fields={fields} value={filters} onChange={onFilters} />
      <Tabs value={live.kind} onValueChange={(v) => live.onKind(v as ReportKind)}>
        <TabsList aria-label="Reports">
          {REPORT_TABS.map((t) => (
            <TabsTrigger key={t.value} value={t.value}>
              {t.label}
            </TabsTrigger>
          ))}
        </TabsList>
        <TabsContent value={live.kind}>
          <div className="yx-ops-stack">
            {live.kind === 'summary' && (
              <CardGrid min="lg">
                <BarChart title="Spend by category" xLabel="Category" money orientation="horizontal" categories={bars(r?.charts?.byCategory).map((b) => b.label)} series={[{ name: 'Approved', values: bars(r?.charts?.byCategory).map((b) => amount(b.amount)) }]} loading={loading} />
                <DonutChart title="Paid through" money slices={bars(r?.charts?.paidThrough).map((b) => ({ label: b.label, value: amount(b.amount) }))} loading={loading} />
              </CardGrid>
            )}
            {live.kind === 'advance-ageing' && (
              <>
                <BarChart title="Open advances by age" xLabel="Age" money categories={bars(r?.charts?.ageing).map((b) => b.label)} series={[{ name: 'Open balance', values: bars(r?.charts?.ageing).map((b) => amount(b.amount)) }]} loading={loading} />
                <DataTable
                  label="Advance ageing"
                  columns={[
                    { key: 'b', header: 'Age', value: (a: { label: string; amount: string; count?: number }) => a.label },
                    { key: 'c', header: 'Advances', type: 'number', value: (a) => a.count ?? 0 },
                    { key: 'a', header: 'Open balance', value: (a) => amount(a.amount), render: (a) => money('INR', a.amount) },
                  ]}
                  rows={bars(r?.charts?.ageing)}
                  getRowId={(a) => a.label}
                  state={loading ? 'loading' : 'ready'}
                />
                {r && <p className="yx-ops-muted">Total open {money('INR', sumMoney(bars(r.charts?.ageing).map((b) => b.amount)))}</p>}
              </>
            )}
            {table}
          </div>
        </TabsContent>
      </Tabs>
      <Actions end>
        <Button icon={Download} loading={busy === 'xlsx'} onClick={() => void act('xlsx', () => live.onExport('xlsx'))}>
          Download as XLSX
        </Button>
      </Actions>
    </OpsDesk>
  );
}
