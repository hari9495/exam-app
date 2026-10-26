import { useEffect, useRef, useState } from 'react';
import { Button } from '../../../components/button';
import { Badge, type BadgeTone } from '../../../components/display';
import { Drawer } from '../../../components/drawer';
import { EmptyState, InlineAlert, Skeleton } from '../../../components/feedback';
import { ErrorSummary, FormField, useSaveErrors } from '../../../components/field';
import { TextField } from '../../../components/inputs';
import { Segment } from '../../../components/segment';
import { Card, Tabs, TabsContent, TabsList, TabsTrigger } from '../../../components/shell';
import { useRun } from '../../org/org-kit';
import { LivePage, dateText } from '../../time/live/kit';
import { IrreversibleSheet } from '../pay-kit';
import { monthText } from './periods';
import { ReasonDrawer, rupees } from './runs';
import { EntityPicker } from './setup';
import type { Confirmation, LoadState } from './types';
import type { SetupEntity } from './types-5b';
import type { FilingRow, HubCard, Recovery, StatutoryHub, TdsReturnRow, Worksheet } from './types-5j';

// Compliance and exits, wired (PAY-10.04 for CMP-01 … CMP-08, PPL-22; batch 5f and 5g APIs): the statutory hub for a legal
// entity and month (PF, ESI, PT, LWF and TDS with their due dates), each file made, uploaded and filed (step-up and the
// typed phrase); the quarterly TDS return (reconcile, the official file, the .fvu the filer's FVU made, filed); arrears
// worksheets, rule-change proposals and overpayment recoveries. Full and final settlements are the designed PPL-22
// calculator (people/exits.tsx FnfCalculator).

const FILING: Record<string, { label: string; tone: BadgeTone }> = {
  not_generated: { label: 'Not made yet', tone: 'neutral' },
  generated: { label: 'File made', tone: 'info' },
  uploaded: { label: 'Uploaded', tone: 'warning' },
  filed: { label: 'Filed', tone: 'success' },
  superseded: { label: 'Replaced', tone: 'neutral' },
};
const filingBadge = (s: string) => <Badge tone={FILING[s]?.tone ?? 'neutral'}>{FILING[s]?.label ?? s}</Badge>;

export interface StatutoryHubScreenProps {
  state: LoadState;
  onRetry?: () => void;
  entities: SetupEntity[];
  entityId: string | null;
  onEntity: (id: string | null) => void;
  month: string;
  onMonth: (m: string) => void;
  hub: StatutoryHub | null;
  filings: FilingRow[] | null;
  returns: TdsReturnRow[] | null;
  can: { generate: boolean; markFiled: boolean; challan?: boolean };
  /** The month's TDS challan, once prepared. */
  challan?: { id: string; status: string; tds: string; interest: string } | null;
  onPrepareChallan?: () => Promise<unknown>;
  onDeposit?: (id: string, d: { challanNo: string; bsrCode: string; depositDate: string }) => Promise<unknown>;
  onGenerate: (card: HubCard, reason?: string) => Promise<unknown>;
  onUploaded: (filingId: string, reference: string) => Promise<unknown>;
  onFiled: (filingId: string, confirmation: Confirmation) => Promise<unknown>;
  onDownload: (fileId: string, name: string) => Promise<unknown>;
  onCreateReturn: (taxYear: string, quarter: number) => Promise<unknown>;
  onReconcile: (id: string) => Promise<unknown>;
  onReturnFile: (id: string) => Promise<unknown>;
  onUploadFvu: (id: string, file: File) => Promise<unknown>;
  onReturnFiled: (id: string, tokenNo: string, confirmation: Confirmation) => Promise<unknown>;
}

export function StatutoryHubScreen(p: StatutoryHubScreenProps) {
  return (
    <LivePage
      title="Statutory filings"
      description="PF, ESI, professional tax, labour welfare fund and TDS for a legal entity: what is due, made, uploaded and filed. Filing locks the month."
      state={p.state}
      onRetry={p.onRetry}
      what="statutory filings"
      grantedBy="your compliance owner"
      actions={
        <FormField id="hub-month" label="Month" hideLabel>
          <TextField type="month" value={p.month} onChange={(m) => /^\d{4}-\d{2}$/.test(m) && p.onMonth(m)} aria-label="Month" />
        </FormField>
      }
    >
      <EntityPicker entities={p.entities} value={p.entityId} onChange={p.onEntity} />
      {!p.entityId ? (
        <EmptyState title="Choose a legal entity" />
      ) : (
        <Tabs defaultValue="month">
          <TabsList aria-label="Filings">
            <TabsTrigger value="month">{monthText(p.month)}</TabsTrigger>
            <TabsTrigger value="tds">TDS returns</TabsTrigger>
          </TabsList>
          <TabsContent value="month">
            <MonthTab {...p} />
          </TabsContent>
          <TabsContent value="tds">
            <ReturnsTab {...p} />
          </TabsContent>
        </Tabs>
      )}
    </LivePage>
  );
}

function MonthTab(p: StatutoryHubScreenProps) {
  const [again, setAgain] = useState<HubCard | null>(null);
  const [uploading, setUploading] = useState<FilingRow | null>(null);
  const [filing, setFiling] = useState<FilingRow | null>(null);
  const [depositing, setDepositing] = useState(false);
  const { busy, error, run } = useRun();
  if (!p.hub || !p.filings) return <Skeleton height={240} />;
  const fileOf = (c: HubCard) => p.filings!.find((f) => f.id === c.filingId) ?? null;
  const phrase = (f: FilingRow) => `FILED ${f.statute.slice(3)} ${p.month}`;
  return (
    <div className="yx-tim-stack">
      {error && (
        <InlineAlert tone="danger" title="This didn't go through">
          {error}
        </InlineAlert>
      )}
      <table className="yx-tim-table" aria-label="Statutory dues">
        <thead>
          <tr>
            <th scope="col">Statute</th>
            <th scope="col">Amount</th>
            <th scope="col">Due</th>
            <th scope="col">Status</th>
            <th scope="col">
              <span className="yx-visually-hidden">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {p.hub.cards.map((c) => {
            const f = fileOf(c);
            return (
              <tr key={`${c.statute}${c.state ?? ''}`}>
                <th scope="row">{c.label}</th>
                <td>{rupees(c.amount)}</td>
                <td>
                  {c.dueOn ? dateText(c.dueOn) : 'Check the due date'} {c.late && <Badge tone="danger">Late{c.penaltyEstimate ? ` · about ${rupees(c.penaltyEstimate)} interest` : ''}</Badge>}
                </td>
                <td>{filingBadge(c.status)}</td>
                <td>
                  <div className="yx-tim-row">
                    {c.status === 'not_generated' && Number(c.amount) === 0 && <span className="yx-tim-note">Nothing due</span>}
                    {c.status === 'not_generated' && Number(c.amount) > 0 && p.can.generate && (
                      <Button size="sm" variant="primary" loading={busy === `g-${c.label}`} onClick={() => void run(`g-${c.label}`, () => p.onGenerate(c))}>
                        Make file
                      </Button>
                    )}
                    {c.status === 'generated' && p.can.generate && (
                      <Button size="sm" onClick={() => setAgain(c)}>
                        Make again
                      </Button>
                    )}
                    {f?.fileId && (
                      <Button size="sm" loading={busy === `d-${f.id}`} onClick={() => void run(`d-${f.id}`, () => p.onDownload(f.fileId!, `${c.label}-${p.month}`))}>
                        Download
                      </Button>
                    )}
                    {f && c.status === 'generated' && p.can.markFiled && (
                      <Button size="sm" onClick={() => setUploading(f)}>
                        Mark uploaded
                      </Button>
                    )}
                    {f && c.status === 'uploaded' && p.can.markFiled && (
                      <Button size="sm" variant="primary" onClick={() => setFiling(f)}>
                        Mark filed
                      </Button>
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
          <tr>
            <th scope="row">Income tax deducted (TDS)</th>
            <td>{rupees(p.hub.tds.amount)}</td>
            <td>
              {p.hub.tds.dueOn ? dateText(p.hub.tds.dueOn) : ''} {p.hub.tds.late && <Badge tone="danger">Late</Badge>}
            </td>
            <td>
              <Badge tone={p.hub.tds.challanStatus === 'deposited' ? 'success' : 'neutral'}>{p.hub.tds.challanStatus === 'deposited' ? 'Deposited' : p.hub.tds.challanStatus === 'prepared' ? 'Challan prepared' : 'Not deposited'}</Badge>
            </td>
            <td>
              <div className="yx-tim-row">
                {p.can.challan && p.onPrepareChallan && p.hub.tds.challanStatus === 'not_prepared' && Number(p.hub.tds.amount) > 0 && (
                  <Button size="sm" variant="primary" loading={busy === 'challan'} onClick={() => void run('challan', p.onPrepareChallan!)}>
                    Prepare challan
                  </Button>
                )}
                {p.can.challan && p.challan && p.challan.status !== 'deposited' && (
                  <Button size="sm" onClick={() => setDepositing(true)}>
                    Record deposit
                  </Button>
                )}
              </div>
            </td>
          </tr>
        </tbody>
      </table>
      {again && <ReasonDrawer title={`Make the ${again.label} file again?`} subtitle="The earlier file is kept and marked replaced." label="Why" confirm="Make file" onClose={() => setAgain(null)} onSave={(reason) => p.onGenerate(again, reason)} />}
      {uploading && <ReferenceDrawer onClose={() => setUploading(null)} onSave={(ref) => p.onUploaded(uploading.id, ref)} />}
      {depositing && p.challan && p.onDeposit && <DepositDrawer challan={p.challan} onClose={() => setDepositing(false)} onSave={(d) => p.onDeposit!(p.challan!.id, d)} />}
      {filing && (
        <IrreversibleSheet
          open
          onOpenChange={(o) => !o && setFiling(null)}
          title={`Mark ${filing.statute.slice(3)} for ${monthText(p.month)} as filed`}
          impact={[
            { label: 'Statute', value: filing.statute },
            { label: 'Portal reference', value: filing.reference ?? '' },
          ]}
          cannotUndo="The month locks as filed: its attendance and pay never change again."
          correction="Anything found later goes in a supplementary filing."
          phrase={phrase(filing)}
          maker="preparer"
          checker="you"
          confirmLabel="Mark filed"
          confirmVariant="primary"
          error={error}
          onConfirm={() =>
            void run('filed', async () => {
              await p.onFiled(filing.id, { phrase: phrase(filing), impact: [{ label: 'Statute', value: filing.statute }] });
              setFiling(null);
            })
          }
        />
      )}
    </div>
  );
}

function ReferenceDrawer({ onClose, onSave }: { onClose: () => void; onSave: (ref: string) => Promise<unknown> }) {
  const [ref, setRef] = useState('');
  const { busy, error, run } = useRun();
  const errors = !/^[A-Za-z0-9/-]{4,60}$/.test(ref.trim()) ? [{ fieldId: 'up-ref', message: 'Enter the portal reference (TRRN or challan number).' }] : [];
  const save = useSaveErrors(errors);
  return (
    <Drawer
      open
      onOpenChange={(o) => !o && onClose()}
      title="Uploaded on the portal"
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            loading={busy === 'save'}
            onClick={() => {
              if (errors.length) return save.reveal();
              void run('save', async () => {
                await onSave(ref.trim());
                onClose();
              });
            }}
          >
            Save
          </Button>
        </>
      }
    >
      <div className="yx-tim-form">
        <ErrorSummary errors={save.shownErrors} />
        {error && (
          <InlineAlert tone="danger" title="Not saved">
            {error}
          </InlineAlert>
        )}
        <FormField id="up-ref" label="Portal reference" required error={save.errorOf('up-ref')}>
          <TextField value={ref} onChange={setRef} />
        </FormField>
      </div>
    </Drawer>
  );
}

function DepositDrawer({ challan, onClose, onSave }: { challan: { tds: string; interest: string }; onClose: () => void; onSave: (d: { challanNo: string; bsrCode: string; depositDate: string }) => Promise<unknown> }) {
  const [challanNo, setChallanNo] = useState('');
  const [bsrCode, setBsr] = useState('');
  const [depositDate, setDate] = useState('');
  const { busy, error, run } = useRun();
  const errors = [
    ...(!/^\d{7}$/.test(bsrCode) ? [{ fieldId: 'dp-bsr', message: 'The BSR code is 7 digits.' }] : []),
    ...(!/^\d{5}$/.test(challanNo) ? [{ fieldId: 'dp-no', message: 'The challan serial number is 5 digits.' }] : []),
    ...(!/^\d{4}-\d{2}-\d{2}$/.test(depositDate) ? [{ fieldId: 'dp-date', message: 'Choose the deposit date.' }] : []),
  ];
  const save = useSaveErrors(errors);
  return (
    <Drawer
      open
      onOpenChange={(o) => !o && onClose()}
      title="Record the TDS deposit"
      subtitle={`TDS ${rupees(challan.tds)}${Number(challan.interest) ? ` and interest ${rupees(challan.interest)}` : ''}`}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            loading={busy === 'save'}
            onClick={() => {
              if (errors.length) return save.reveal();
              void run('save', async () => {
                await onSave({ challanNo, bsrCode, depositDate });
                onClose();
              });
            }}
          >
            Save
          </Button>
        </>
      }
    >
      <div className="yx-tim-form">
        <ErrorSummary errors={save.shownErrors} />
        {error && (
          <InlineAlert tone="danger" title="Not saved">
            {error}
          </InlineAlert>
        )}
        <FormField id="dp-bsr" label="BSR code of the bank" required error={save.errorOf('dp-bsr')}>
          <TextField value={bsrCode} onChange={setBsr} inputMode="numeric" />
        </FormField>
        <FormField id="dp-no" label="Challan serial number" required error={save.errorOf('dp-no')}>
          <TextField value={challanNo} onChange={setChallanNo} inputMode="numeric" />
        </FormField>
        <FormField id="dp-date" label="Deposit date" required error={save.errorOf('dp-date')}>
          <TextField type="date" value={depositDate} onChange={setDate} />
        </FormField>
      </div>
    </Drawer>
  );
}

function ReturnsTab(p: StatutoryHubScreenProps) {
  const fy = (() => {
    const y = Number(p.month.slice(0, 4)) - (Number(p.month.slice(5)) < 4 ? 1 : 0);
    return `${y}-${String((y + 1) % 100).padStart(2, '0')}`;
  })();
  const [quarter, setQuarter] = useState<number>(Math.floor(((Number(p.month.slice(5)) + 8) % 12) / 3) + 1);
  const [filing, setFiling] = useState<TdsReturnRow | null>(null);
  const [token, setToken] = useState('');
  const { busy, error, run } = useRun();
  if (!p.returns) return <Skeleton height={200} />;
  const phrase = (r: TdsReturnRow) => `FILED ${r.formCode} Q${r.quarter} ${r.taxYear}`;
  return (
    <div className="yx-tim-stack">
      {error && (
        <InlineAlert tone="danger" title="This didn't go through">
          {error}
        </InlineAlert>
      )}
      {p.can.generate && (
        <Card title={`New quarterly return for ${fy}`}>
          <div className="yx-tim-row">
            <Segment
              label="Quarter"
              value={quarter}
              onChange={setQuarter}
              options={[1, 2, 3, 4].map((q) => ({ value: q, label: `Q${q}` }))}
            />
            <Button loading={busy === 'new'} onClick={() => void run('new', () => p.onCreateReturn(fy, quarter))}>
              Start return
            </Button>
          </div>
        </Card>
      )}
      {p.returns.length ? (
        <table className="yx-tim-table" aria-label="TDS returns">
          <thead>
            <tr>
              <th scope="col">Return</th>
              <th scope="col">TDS</th>
              <th scope="col">Status</th>
              <th scope="col">
                <span className="yx-visually-hidden">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {p.returns.map((r) => (
              <tr key={r.id}>
                <th scope="row">
                  {r.formCode} · Q{r.quarter} {r.taxYear}
                  {r.kind === 'correction' ? ' · correction' : ''}
                </th>
                <td>
                  {rupees(r.tds)} for {r.rows} rows
                </td>
                <td>
                  <Badge tone={r.status === 'filed' ? 'success' : r.status === 'validated' ? 'info' : 'neutral'}>{r.status === 'draft' ? 'Draft' : r.status === 'reconciled' ? 'Reconciled' : r.status === 'validated' ? 'Validated' : 'Filed'}</Badge>
                  {r.validation && !r.validation.ok && r.status === 'reconciled' && <p className="yx-tim-note">{r.validation.errors[0]}</p>}
                  {r.validation?.ok && <p className="yx-tim-note">{r.validation.validator === 'fake' ? 'Checked by the development stand-in, not the FVU' : `FVU ${r.validation.version ?? ''}`}</p>}
                </td>
                <td>
                  <div className="yx-tim-row">
                    {r.status === 'draft' && p.can.generate && (
                      <Button size="sm" loading={busy === `rc-${r.id}`} onClick={() => void run(`rc-${r.id}`, () => p.onReconcile(r.id))}>
                        Reconcile
                      </Button>
                    )}
                    {(r.status === 'reconciled' || r.status === 'validated') && p.can.generate && (
                      <Button size="sm" loading={busy === `f-${r.id}`} onClick={() => void run(`f-${r.id}`, () => p.onReturnFile(r.id))}>
                        Make return file
                      </Button>
                    )}
                    {r.fileId && (
                      <Button size="sm" loading={busy === `d-${r.id}`} onClick={() => void run(`d-${r.id}`, () => p.onDownload(r.fileId!, `${r.formCode}-${r.taxYear}-q${r.quarter}.txt`))}>
                        Download
                      </Button>
                    )}
                    {r.fileId && r.status !== 'filed' && p.can.generate && (
                      <FileButton label="Upload .fvu" accept=".fvu" ariaLabel={`Upload the .fvu for ${r.formCode} Q${r.quarter}`} loading={busy === `u-${r.id}`} onFile={(file) => void run(`u-${r.id}`, () => p.onUploadFvu(r.id, file))} />
                    )}
                    {r.status === 'validated' && p.can.markFiled && (
                      <Button size="sm" variant="primary" onClick={() => setFiling(r)}>
                        Mark filed
                      </Button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <EmptyState compact title="No TDS returns yet" />
      )}
      {filing && (
        <IrreversibleSheet
          open
          onOpenChange={(o) => !o && setFiling(null)}
          title={`Mark ${filing.formCode} Q${filing.quarter} ${filing.taxYear} as filed`}
          impact={[
            { label: 'TDS', value: rupees(filing.tds) },
            { label: 'Rows', value: String(filing.rows) },
          ]}
          cannotUndo="The return is filed; changes go in a correction return."
          correction="A correction return revises the certificates it changes."
          phrase={phrase(filing)}
          maker="preparer"
          checker="you"
          confirmLabel="Mark filed"
          confirmVariant="primary"
          blocked={!/^[A-Za-z0-9]{6,30}$/.test(token) ? 'Enter the token number the portal gave.' : undefined}
          blockedReason="Token number needed"
          error={error}
          onConfirm={() =>
            void run('rfiled', async () => {
              await p.onReturnFiled(filing.id, token, { phrase: phrase(filing), impact: [{ label: 'TDS', value: rupees(filing.tds) }] });
              setFiling(null);
            })
          }
        >
          <FormField id="rt-token" label="Token number from the portal" required>
            <TextField value={token} onChange={setToken} />
          </FormField>
        </IrreversibleSheet>
      )}
    </div>
  );
}

/** A button that opens the file chooser (a real button, so it looks and behaves like one). */
export function FileButton({ label, accept, ariaLabel, loading, onFile }: { label: string; accept: string; ariaLabel: string; loading?: boolean; onFile: (f: File) => void }) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <>
      <Button size="sm" loading={loading} aria-label={ariaLabel} onClick={() => input.current?.click()}>
        {label}
      </Button>
      <input
        ref={input}
        type="file"
        accept={accept}
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onFile(file);
          e.target.value = '';
        }}
      />
    </>
  );
}

// ------------------------------------------------------------------------------------------ arrears and recoveries (PAY-28, PAY-19)

export interface ArrearsScreenProps {
  state: LoadState;
  onRetry?: () => void;
  worksheets: Worksheet[] | null;
  recoveries: Recovery[] | null;
  nameOf: (employeeId: string) => string;
  me: string | null;
  can: { approve: boolean; writeOff: boolean };
  onApprove: (w: Worksheet, runId?: string) => Promise<unknown>;
  onCancel: (w: Worksheet) => Promise<unknown>;
  onConfirmBase: (w: Worksheet, period: string, lines: { componentCode: string; asPaid: string }[], reason: string) => Promise<unknown>;
  onWriteOff: (r: Recovery, reason: string) => Promise<unknown>;
}

export function ArrearsScreen(p: ArrearsScreenProps) {
  const [open, setOpen] = useState<string | null>(null);
  const [writing, setWriting] = useState<Recovery | null>(null);
  const w = p.worksheets?.find((x) => x.id === open) ?? null;
  return (
    <LivePage title="Arrears and recoveries" description="Arrears worksheets (corrected minus as paid, per month and component) and overpayments recovered with the employee's consent." state={p.state} onRetry={p.onRetry} what="arrears" grantedBy="your payroll admin">
      <Tabs defaultValue="arrears">
        <TabsList aria-label="Arrears and recoveries">
          <TabsTrigger value="arrears">Arrears worksheets</TabsTrigger>
          <TabsTrigger value="recoveries">Overpayments</TabsTrigger>
        </TabsList>
        <TabsContent value="arrears">
          {p.worksheets && !p.worksheets.length && <EmptyState compact title="No arrears worksheets" description="A past-dated pay change or rule change makes one." />}
          {p.worksheets && p.worksheets.length > 0 && (
            <table className="yx-tim-table" aria-label="Arrears worksheets">
              <thead>
                <tr>
                  <th scope="col">Person</th>
                  <th scope="col">Months</th>
                  <th scope="col">Owed to the employee</th>
                  <th scope="col">Status</th>
                  <th scope="col">
                    <span className="yx-visually-hidden">Open</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {p.worksheets.map((x) => (
                  <tr key={x.id}>
                    <th scope="row">{p.nameOf(x.employeeId)}</th>
                    <td>{x.from === x.to ? monthText(x.from) : `${monthText(x.from)} to ${monthText(x.to)}`}</td>
                    <td>{rupees(x.total)}</td>
                    <td>
                      <Badge tone={x.status === 'approved' ? 'success' : x.status === 'cancelled' ? 'neutral' : x.missing ? 'warning' : 'info'}>
                        {x.status === 'draft' ? (x.missing ? 'Base needed' : 'Draft') : x.status === 'approved' ? 'Approved' : 'Cancelled'}
                      </Badge>
                    </td>
                    <td>
                      <Button size="sm" onClick={() => setOpen(x.id)}>
                        Open
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </TabsContent>
        <TabsContent value="recoveries">
          {p.recoveries && !p.recoveries.length && <EmptyState compact title="No overpayments" />}
          {p.recoveries && p.recoveries.length > 0 && (
            <table className="yx-tim-table" aria-label="Overpayments">
              <thead>
                <tr>
                  <th scope="col">Person</th>
                  <th scope="col">Amount</th>
                  <th scope="col">Left</th>
                  <th scope="col">Status</th>
                  <th scope="col">
                    <span className="yx-visually-hidden">Write off</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {p.recoveries.map((r) => (
                  <tr key={r.id}>
                    <th scope="row">
                      {p.nameOf(r.employeeId)} {r.crossYear && <Badge tone="info">Earlier tax year {r.originTaxYear}</Badge>}
                    </th>
                    <td>{rupees(r.amount)}</td>
                    <td>{rupees(r.balance)}</td>
                    <td>
                      <Badge tone={r.status === 'active' ? 'info' : r.status === 'proposed' ? 'warning' : 'neutral'}>
                        {r.status === 'proposed' ? 'Waiting for the employee' : r.status === 'active' ? 'Recovering' : r.status === 'declined' ? 'Declined' : r.status === 'recovered' ? 'Recovered' : 'Written off'}
                      </Badge>
                    </td>
                    <td>
                      {p.can.writeOff && ['proposed', 'active', 'declined'].includes(r.status) && (
                        <Button size="sm" onClick={() => setWriting(r)}>
                          Write off
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </TabsContent>
      </Tabs>
      {w && <WorksheetDrawer w={w} {...p} onClose={() => setOpen(null)} />}
      {writing && <ReasonDrawer title="Write off what is left?" subtitle={`${rupees(writing.balance)} of ${rupees(writing.amount)}`} label="Why" confirm="Write off" onClose={() => setWriting(null)} onSave={(why) => p.onWriteOff(writing, why)} />}
    </LivePage>
  );
}

function WorksheetDrawer({ w, onClose, ...p }: ArrearsScreenProps & { w: Worksheet; onClose: () => void }) {
  const { busy, error, run } = useRun();
  const missing = [...new Set(w.lines.filter((l) => l.base === 'missing').map((l) => l.period))];
  const [period] = useState(missing[0] ?? null);
  const [paid, setPaid] = useState<Record<string, string>>({});
  const [reason, setReason] = useState('');
  const [cancelling, setCancelling] = useState(false);
  useEffect(() => setPaid({}), [w.id]);
  const baseLines = w.lines.filter((l) => l.period === period && l.base === 'missing');
  const errors = [...baseLines.filter((l) => !/^\d{1,9}(\.\d{1,2})?$/.test(paid[l.componentCode] ?? '')).map((l) => ({ fieldId: `wb-${l.componentCode}`, message: `${l.componentCode}: enter what was paid.` })), ...(reason.trim().length < 5 ? [{ fieldId: 'wb-why', message: 'Say where the figures come from.' }] : [])];
  const save = useSaveErrors(errors);
  const mine = w.createdBy === p.me;
  return (
    <Drawer open onOpenChange={(o) => !o && onClose()} title={`${p.nameOf(w.employeeId)} · arrears`} subtitle={w.reason} size="lg" footer={<Button onClick={onClose}>Close</Button>}>
      <div className="yx-tim-stack">
        {error && (
          <InlineAlert tone="danger" title="This didn't go through">
            {error}
          </InlineAlert>
        )}
        <table className="yx-tim-table" aria-label="Worksheet lines">
          <thead>
            <tr>
              <th scope="col">Month</th>
              <th scope="col">Component</th>
              <th scope="col">As paid</th>
              <th scope="col">Corrected</th>
              <th scope="col">Difference</th>
            </tr>
          </thead>
          <tbody>
            {w.lines.map((l) => (
              <tr key={l.id}>
                <td>{monthText(l.period)}</td>
                <th scope="row">
                  {l.componentCode} {l.kind !== 'earning' && <Badge tone="neutral">{l.kind === 'deduction' ? 'employee share' : 'company cost'}</Badge>}
                </th>
                <td>{l.asPaid ? rupees(l.asPaid) : <Badge tone="warning">Base needed</Badge>}</td>
                <td>{rupees(l.corrected)}</td>
                <td>{l.difference ? rupees(l.difference) : ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p>
          Owed to the employee: <strong>{rupees(w.total)}</strong> · extra company cost: {rupees(w.employerCost)}
        </p>
        {w.status === 'draft' && period && (
          <Card title={`What was paid for ${monthText(period)}?`}>
            <div className="yx-tim-form">
              <ErrorSummary errors={save.shownErrors} />
              {baseLines.map((l) => (
                <FormField key={l.id} id={`wb-${l.componentCode}`} label={l.componentCode} required error={save.errorOf(`wb-${l.componentCode}`)}>
                  <TextField value={paid[l.componentCode] ?? ''} onChange={(v) => setPaid({ ...paid, [l.componentCode]: v })} prefix="₹" inputMode="decimal" />
                </FormField>
              ))}
              <FormField id="wb-why" label="Where these figures come from" required error={save.errorOf('wb-why')}>
                <TextField value={reason} onChange={setReason} />
              </FormField>
              <div>
                <Button
                  variant="primary"
                  loading={busy === 'base'}
                  onClick={() => {
                    if (errors.length) return save.reveal();
                    void run('base', () =>
                      p.onConfirmBase(
                        w,
                        period,
                        baseLines.map((l) => ({ componentCode: l.componentCode, asPaid: paid[l.componentCode] })),
                        reason.trim(),
                      ),
                    );
                  }}
                >
                  Confirm base
                </Button>
              </div>
            </div>
          </Card>
        )}
        {w.status === 'draft' && !missing.length && p.can.approve && (
          <div className="yx-tim-row">
            {mine ? (
              <p className="yx-tim-note">You made this worksheet, so someone else approves it.</p>
            ) : (
              <Button variant="approve" loading={busy === 'approve'} onClick={() => void run('approve', () => p.onApprove(w))}>
                Approve
              </Button>
            )}
            <Button onClick={() => setCancelling(true)}>Cancel worksheet</Button>
          </div>
        )}
      </div>
      {cancelling && <ReasonDrawer title="Cancel this worksheet?" label="Why" confirm="Cancel worksheet" onClose={() => setCancelling(false)} onSave={() => p.onCancel(w)} />}
    </Drawer>
  );
}
