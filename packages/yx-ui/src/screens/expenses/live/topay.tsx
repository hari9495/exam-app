import { useState } from 'react';
import { Button } from '../../../components/button';
import { Badge, type BadgeTone } from '../../../components/display';
import { Drawer } from '../../../components/drawer';
import { EmptyState, InlineAlert } from '../../../components/feedback';
import { ErrorSummary, FormField, useSaveErrors, type FormErrorItem } from '../../../components/field';
import { TextArea, TextField } from '../../../components/inputs';
import { ConfirmDialog } from '../../../components/overlay';
import { Segment } from '../../../components/segment';
import { Select } from '../../../components/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../../components/shell';
import { DataTable, type TableColumn } from '../../../components/table';
import { useRun } from '../../org/org-kit';
import { LivePage, dateText } from '../../time/live/kit';
import { IrreversibleSheet } from '../../pay/pay-kit';
import { PAYMENT, money } from './claims';
import type { ExpenseJournalView, LoadState, PayoutBatchRow, PayoutResultInput, ToPayClaim, ToPayData } from './types';

// Expenses batch E3, wired (M05-BUILD-DESIGN §10, §12; EXP-06, XP-3.08): what finance pays. Approved claims go to the next
// payroll or a bank file; a bank file is released by someone other than its maker (step-up and the typed phrase) and
// settled by the bank's results; the month's expense journal is exported once every code has a ledger account.

const monthText = (m: string) => new Date(`${m}-01T00:00:00Z`).toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const BATCH: Record<PayoutBatchRow['status'], { label: string; tone: BadgeTone }> = {
  draft: { label: 'Waiting for release', tone: 'warning' },
  released: { label: 'Sent to the bank', tone: 'info' },
  confirmed: { label: 'Settled', tone: 'success' },
  cancelled: { label: 'Cancelled', tone: 'neutral' },
};
type Show = 'waiting' | 'payroll' | 'bank' | 'paid';
const SHOW: Record<Show, (c: ToPayClaim) => boolean> = {
  waiting: (c) => c.paymentStatus === 'approved_unpaid' || c.paymentStatus === 'payment_failed',
  payroll: (c) => c.paymentStatus === 'in_payroll',
  bank: (c) => c.paymentStatus === 'payout_queued',
  paid: (c) => c.paymentStatus === 'paid',
};

export interface ToPayLiveScreenProps {
  state: LoadState;
  onRetry?: () => void;
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

export function ToPayLiveScreen(p: ToPayLiveScreenProps) {
  const [show, setShow] = useState<Show>('waiting');
  const [selected, setSelected] = useState<string[]>([]);
  const [confirming, setConfirming] = useState(false);
  const [paying, setPaying] = useState(false);
  const [note, setNote] = useState<{ tone: 'success' | 'warning'; title: string; items: string[] } | null>(null);
  const { error, run } = useRun();
  const d = p.data;
  const nameOf = (id: string) => d?.claims.find((c) => c.id === id)?.employeeName ?? 'A claim';
  const rows = (d?.claims ?? []).filter(SHOW[show]);
  const chosen = (d?.claims ?? []).filter((c) => selected.includes(c.id));
  const total = chosen.reduce((t, c) => t + Number(c.netPayable), 0).toFixed(2);
  const oneEntity = new Set(chosen.map((c) => c.legalEntityId)).size === 1;
  const columns: TableColumn<ToPayClaim>[] = [
    { key: 'who', header: 'Employee', type: 'person', value: (c) => c.employeeName, person: (c) => ({ name: c.employeeName, secondary: c.title }), width: 240 },
    { key: 'net', header: 'Net payable', type: 'money', value: (c) => Number(c.netPayable), render: (c) => money('INR', c.netPayable), total: 'sum' },
    { key: 'adv', header: 'Advance used', type: 'money', value: (c) => Number(c.advanceAdjusted), render: (c) => money('INR', c.advanceAdjusted), optional: true },
    { key: 'route', header: 'Paid through', value: (c) => c.route ?? '', render: (c) => (c.route === 'payroll' ? (c.payMonth ? `${monthText(c.payMonth)} payroll` : 'Payroll') : c.route === 'payout' ? 'Bank transfer' : '—') },
    {
      key: 'status',
      header: 'Payment',
      value: (c) => c.paymentStatus,
      render: (c) => (
        <>
          <Badge tone={PAYMENT[c.paymentStatus]?.tone ?? 'neutral'}>{PAYMENT[c.paymentStatus]?.label ?? c.paymentStatus}</Badge>
          {c.reason && <span className="yx-tim-note"> {c.reason}</span>}
        </>
      ),
      width: 260,
    },
  ];
  const resetAfter = async (fn: () => Promise<unknown>) => {
    await fn();
    setSelected([]);
  };
  return (
    <LivePage title="To pay" description="Approved claims. Net payable is what was approved less any advance used. A claim is paid when the payroll run is paid or the bank confirms the transfer." state={p.state} onRetry={p.onRetry} what="claims to pay" grantedBy="your finance admin">
      {error && (
        <InlineAlert tone="danger" title="This didn't go through">
          {error}
        </InlineAlert>
      )}
      {note && (
        <InlineAlert tone={note.tone} title={note.title}>
          {note.items.length > 0 && (
            <ul className="yx-tim-list">
              {note.items.map((x) => (
                <li key={x}>{x}</li>
              ))}
            </ul>
          )}
        </InlineAlert>
      )}
      <Tabs defaultValue="claims">
        <TabsList aria-label="To pay">
          <TabsTrigger value="claims">Claims</TabsTrigger>
          <TabsTrigger value="files" count={d?.batches.filter((b) => b.status === 'draft' || b.status === 'released').length || undefined}>
            Bank files
          </TabsTrigger>
          <TabsTrigger value="journal">Journal</TabsTrigger>
        </TabsList>
        <TabsContent value="claims">
          <Segment
            label="Show"
            value={show}
            onChange={(s) => {
              setShow(s);
              setSelected([]);
            }}
            options={[
              { value: 'waiting', label: 'Waiting' },
              { value: 'payroll', label: 'In payroll' },
              { value: 'bank', label: 'Bank transfer queued' },
              { value: 'paid', label: 'Paid' },
            ]}
          />
          <DataTable
            label="Claims to pay"
            columns={columns}
            rows={rows}
            getRowId={(c) => c.id}
            empty={<EmptyState title={show === 'paid' ? 'Nothing paid yet' : 'Nothing here'} description="Approved claims appear here." compact />}
            selectable={show === 'waiting'}
            isSelectable={(c) => (c.paymentStatus === 'payment_failed' && c.route === 'payroll' ? 'Payroll pays it again with the salary' : true)}
            selectedIds={selected}
            onSelectedChange={setSelected}
            bulkActions={(sel) => (
              <>
                <Button size="sm" onClick={() => setConfirming(true)}>
                  Add {sel.length} to the next payroll
                </Button>
                <Button size="sm" onClick={() => setPaying(true)} disabled={!oneEntity} title={oneEntity ? undefined : 'A bank file pays the claims of one legal entity'}>
                  Pay by bank file
                </Button>
              </>
            )}
          />
        </TabsContent>
        <TabsContent value="files">
          <BatchesTab {...p} nameOf={nameOf} entityName={(id) => d?.entities.find((e) => e.id === id)?.name ?? ''} />
        </TabsContent>
        <TabsContent value="journal">
          <JournalTab {...p} />
        </TabsContent>
      </Tabs>
      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title={`Add ${chosen.length} ${chosen.length === 1 ? 'claim' : 'claims'} to the next payroll?`}
        consequence={`${money('INR', total)} is paid with the salary in the next open payroll month. The claims are marked paid when that run is paid.`}
        confirmLabel="Add to payroll"
        onConfirm={() =>
          void run('payroll', () =>
            resetAfter(async () => {
              const r = await p.onToPayroll(selected);
              setConfirming(false);
              setNote({ tone: r.refused.length ? 'warning' : 'success', title: `${r.moved} moved to the next payroll`, items: r.refused.map((x) => `${nameOf(x.claimId)}: ${x.reason}`) });
            }),
          )
        }
      />
      {paying && (
        <PayoutDrawer
          count={chosen.length}
          total={total}
          onClose={() => setPaying(false)}
          onSave={(debit) =>
            resetAfter(async () => {
              const r = await p.onPayout(selected, debit);
              setNote({ tone: r.excluded.length ? 'warning' : 'success', title: `Bank file made: ${r.rows} ${r.rows === 1 ? 'payment' : 'payments'}, ${money('INR', r.total)}. Someone else releases it.`, items: r.excluded.map((x) => `${nameOf(x.claimId)}: ${x.reason}`) });
            })
          }
        />
      )}
    </LivePage>
  );
}

function PayoutDrawer({ count, total, onClose, onSave }: { count: number; total: string; onClose: () => void; onSave: (debitAccount: string) => Promise<unknown> }) {
  const [debit, setDebit] = useState('');
  const { busy, error, run } = useRun();
  const errors: FormErrorItem[] = !/^\d{6,20}$/.test(debit.trim()) ? [{ fieldId: 'po-debit', message: 'The account the money comes from: 6 to 20 digits.' }] : [];
  const save = useSaveErrors(errors);
  return (
    <Drawer
      open
      onOpenChange={(o) => !o && onClose()}
      title={`Pay ${count} ${count === 1 ? 'claim' : 'claims'} by bank file`}
      subtitle={money('INR', total)}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            loading={busy === 'save'}
            onClick={() => {
              if (errors.length) return save.reveal();
              void run('save', async () => {
                await onSave(debit.trim());
                onClose();
              });
            }}
          >
            Make bank file
          </Button>
        </>
      }
    >
      <div className="yx-tim-form">
        <ErrorSummary errors={save.shownErrors} />
        {error && (
          <InlineAlert tone="danger" title="This didn't go through">
            {error}
          </InlineAlert>
        )}
        <p className="yx-tim-note">Each claim is paid to the employee's reimbursement account, or their salary account. Someone else releases the file before it goes to the bank.</p>
        <FormField id="po-debit" label="Pay from account" required error={save.errorOf('po-debit')}>
          <TextField value={debit} onChange={setDebit} inputMode="numeric" maxLength={20} />
        </FormField>
      </div>
    </Drawer>
  );
}

function BatchesTab(p: ToPayLiveScreenProps & { nameOf: (id: string) => string; entityName: (id: string) => string }) {
  const [releasing, setReleasing] = useState<PayoutBatchRow | null>(null);
  const [cancelling, setCancelling] = useState<PayoutBatchRow | null>(null);
  const [recording, setRecording] = useState<PayoutBatchRow | null>(null);
  const { busy, error, run } = useRun();
  const batches = p.data?.batches ?? [];
  if (!batches.length) return <EmptyState title="No bank files yet" description="Choose waiting claims and pay them by bank file." compact />;
  return (
    <>
      {error && (
        <InlineAlert tone="danger" title="This didn't go through">
          {error}
        </InlineAlert>
      )}
      <table className="yx-tim-table" aria-label="Bank files">
        <thead>
          <tr>
            <th scope="col">Made</th>
            <th scope="col">Legal entity</th>
            <th scope="col">Payments</th>
            <th scope="col">Total</th>
            <th scope="col">Status</th>
            <th scope="col">
              <span className="yx-visually-hidden">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {batches.map((b) => (
            <tr key={b.id}>
              <th scope="row">{dateText(b.createdAt.slice(0, 10))}</th>
              <td>{p.entityName(b.legalEntityId)}</td>
              <td>{b.rows}</td>
              <td>{money('INR', b.total)}</td>
              <td>
                <Badge tone={BATCH[b.status].tone}>{BATCH[b.status].label}</Badge>
              </td>
              <td>
                <div className="yx-tim-row">
                  <Button size="sm" loading={busy === `d-${b.id}`} onClick={() => void run(`d-${b.id}`, () => p.onDownload(b))} aria-label={`Download the bank file of ${dateText(b.createdAt.slice(0, 10))}`}>
                    Download
                  </Button>
                  {b.status === 'draft' && !b.madeByMe && (
                    <Button size="sm" variant="primary" onClick={() => setReleasing(b)}>
                      Release
                    </Button>
                  )}
                  {b.status === 'draft' && b.madeByMe && <span className="yx-tim-note">Someone else releases it.</span>}
                  {b.status === 'draft' && (
                    <Button size="sm" onClick={() => setCancelling(b)}>
                      Cancel
                    </Button>
                  )}
                  {b.status === 'released' && (
                    <Button size="sm" onClick={() => setRecording(b)}>
                      Record results
                    </Button>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {releasing && (
        <IrreversibleSheet
          open
          onOpenChange={(o) => !o && setReleasing(null)}
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
          error={error}
          onConfirm={() =>
            void run('release', async () => {
              await p.onRelease(releasing, `RELEASE ${releasing.rows}`);
              setReleasing(null);
            })
          }
        />
      )}
      {cancelling && <CancelDrawer onClose={() => setCancelling(null)} onSave={(why) => p.onCancel(cancelling, why)} />}
      {recording && <ResultsDrawer batch={recording} claims={(p.data?.claims ?? []).filter((c) => c.batchId === recording.id && c.paymentStatus === 'payout_queued')} onClose={() => setRecording(null)} onSave={(rows) => p.onResults(recording, rows)} />}
    </>
  );
}

function CancelDrawer({ onClose, onSave }: { onClose: () => void; onSave: (reason: string) => Promise<unknown> }) {
  const [reason, setReason] = useState('');
  const { busy, error, run } = useRun();
  const errors: FormErrorItem[] = reason.trim().length < 5 ? [{ fieldId: 'cb-why', message: 'Why: at least 5 letters.' }] : [];
  const save = useSaveErrors(errors);
  return (
    <Drawer
      open
      onOpenChange={(o) => !o && onClose()}
      title="Cancel this bank file?"
      subtitle="Its claims wait to be paid again."
      footer={
        <>
          <Button onClick={onClose}>Keep it</Button>
          <Button
            variant="primary"
            loading={busy === 'save'}
            onClick={() => {
              if (errors.length) return save.reveal();
              void run('save', async () => {
                await onSave(reason.trim());
                onClose();
              });
            }}
          >
            Cancel file
          </Button>
        </>
      }
    >
      <div className="yx-tim-form">
        <ErrorSummary errors={save.shownErrors} />
        {error && (
          <InlineAlert tone="danger" title="This didn't go through">
            {error}
          </InlineAlert>
        )}
        <FormField id="cb-why" label="Why" required error={save.errorOf('cb-why')}>
          <TextArea value={reason} onChange={setReason} rows={2} maxLength={300} />
        </FormField>
      </div>
    </Drawer>
  );
}

function ResultsDrawer({ batch, claims, onClose, onSave }: { batch: PayoutBatchRow; claims: ToPayClaim[]; onClose: () => void; onSave: (rows: PayoutResultInput[]) => Promise<unknown> }) {
  const [rows, setRows] = useState<Record<string, { status: PayoutResultInput['status']; ref: string; reason: string }>>(() => Object.fromEntries(claims.map((c) => [c.id, { status: 'paid' as const, ref: '', reason: '' }])));
  const { busy, error, run } = useRun();
  const set = (id: string, x: Partial<(typeof rows)[string]>) => setRows((r) => ({ ...r, [id]: { ...r[id], ...x } }));
  const errors: FormErrorItem[] = claims.flatMap((c) => [
    ...(rows[c.id].ref.trim() && !/^[A-Za-z0-9/-]{1,60}$/.test(rows[c.id].ref.trim()) ? [{ fieldId: `rs-ref-${c.id}`, message: `${c.employeeName}: a bank reference is letters, digits, / and -.` }] : []),
    ...(rows[c.id].status !== 'paid' && rows[c.id].reason.trim().length < 3 ? [{ fieldId: `rs-why-${c.id}`, message: `${c.employeeName}: say what the bank gave as the reason.` }] : []),
  ]);
  const save = useSaveErrors(errors);
  return (
    <Drawer
      open
      onOpenChange={(o) => !o && onClose()}
      title="The bank's results"
      subtitle={`${batch.rows} payments, ${money('INR', batch.total)}`}
      size="lg"
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            loading={busy === 'save'}
            onClick={() => {
              if (errors.length) return save.reveal();
              void run('save', async () => {
                await onSave(claims.map((c) => ({ claimId: c.id, status: rows[c.id].status, ...(rows[c.id].ref.trim() ? { ref: rows[c.id].ref.trim() } : {}), ...(rows[c.id].status !== 'paid' ? { reason: rows[c.id].reason.trim() } : {}) })));
                onClose();
              });
            }}
          >
            Record results
          </Button>
        </>
      }
    >
      <div className="yx-tim-form">
        <ErrorSummary errors={save.shownErrors} />
        {error && (
          <InlineAlert tone="danger" title="This didn't go through">
            {error}
          </InlineAlert>
        )}
        {claims.map((c) => (
          <fieldset key={c.id} className="yx-tim-stack">
            <legend>
              {c.employeeName} · {money('INR', c.netPayable)}
            </legend>
            <Segment
              label={`Result for ${c.employeeName}`}
              value={rows[c.id].status}
              onChange={(status) => set(c.id, { status })}
              options={[
                { value: 'paid', label: 'Paid' },
                { value: 'failed', label: 'Failed' },
                { value: 'returned', label: 'Came back' },
              ]}
            />
            <FormField id={`rs-ref-${c.id}`} label="Bank reference" optional error={save.errorOf(`rs-ref-${c.id}`)}>
              <TextField value={rows[c.id].ref} onChange={(ref) => set(c.id, { ref })} maxLength={60} />
            </FormField>
            {rows[c.id].status !== 'paid' && (
              <FormField id={`rs-why-${c.id}`} label="Reason from the bank" required error={save.errorOf(`rs-why-${c.id}`)}>
                <TextField value={rows[c.id].reason} onChange={(reason) => set(c.id, { reason })} maxLength={300} />
              </FormField>
            )}
          </fieldset>
        ))}
      </div>
    </Drawer>
  );
}

function JournalTab(p: ToPayLiveScreenProps) {
  const { busy, error, run } = useRun();
  const j = p.journal;
  return (
    <div className="yx-tim-stack">
      <div className="yx-tim-row">
        <FormField id="jn-entity" label="Legal entity">
          <Select value={p.journalEntity} onChange={(id) => p.onJournal(id, p.journalMonth)} placeholder="Choose a legal entity" options={(p.data?.entities ?? []).map((e) => ({ value: e.id, label: e.name }))} />
        </FormField>
        <FormField id="jn-month" label="Month">
          <TextField type="month" value={p.journalMonth} onChange={(m) => /^\d{4}-\d{2}$/.test(m) && p.onJournal(p.journalEntity, m)} />
        </FormField>
      </div>
      {error && (
        <InlineAlert tone="danger" title="This didn't go through">
          {error}
        </InlineAlert>
      )}
      {!p.journalEntity && <EmptyState title="Choose a legal entity" description="The journal is made for each legal entity and month." compact />}
      {p.journalEntity && j && (
        <>
          {j.unmapped.length > 0 && (
            <InlineAlert tone="warning" title="Map these codes to ledger accounts before exporting">
              <ul className="yx-tim-list">
                {j.unmapped.map((u) => (
                  <li key={u.componentCode}>
                    {u.componentCode} · {money('INR', u.amount)}
                  </li>
                ))}
              </ul>
              Map them on the Ledger mapping page.
            </InlineAlert>
          )}
          {!j.lines.length ? (
            <EmptyState title={`Nothing for ${monthText(j.month)}`} description="Approved claims, bank transfers and advances of the month appear here." compact />
          ) : (
            <table className="yx-tim-table" aria-label="Expense journal">
              <thead>
                <tr>
                  <th scope="col">Account</th>
                  <th scope="col">Debit</th>
                  <th scope="col">Credit</th>
                </tr>
              </thead>
              <tbody>
                {j.lines.map((l) => (
                  <tr key={l.accountCode}>
                    <th scope="row">
                      {l.accountCode} · {l.accountName}
                    </th>
                    <td>{money('INR', l.debit)}</td>
                    <td>{money('INR', l.credit)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <div className="yx-tim-row">
            <Button variant="primary" disabled={!j.lines.length || j.unmapped.length > 0 || !j.balanced} loading={busy === 'export'} onClick={() => void run('export', p.onExportJournal)}>
              Export journal (CSV)
            </Button>
            {j.unmapped.length > 0 && <span className="yx-tim-note">Export opens once every code is mapped.</span>}
          </div>
          {j.exports.length > 0 && (
            <ul className="yx-tim-list" aria-label="Exports">
              {j.exports.map((x) => (
                <li key={x.id}>
                  Exported {dateText(x.createdAt.slice(0, 10))} · {x.status === 'posted' ? <Badge tone="success">Posted</Badge> : <Badge tone="info">Exported</Badge>}{' '}
                  {x.status === 'exported' && (
                    <Button size="sm" loading={busy === `p-${x.id}`} onClick={() => void run(`p-${x.id}`, () => p.onPosted(x.id))}>
                      Mark posted
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
