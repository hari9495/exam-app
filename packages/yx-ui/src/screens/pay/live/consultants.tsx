import { useState } from 'react';
import { Button } from '../../../components/button';
import { Checkbox } from '../../../components/choice';
import { Badge, type BadgeTone } from '../../../components/display';
import { EmptyState, InlineAlert } from '../../../components/feedback';
import { FormField, type FormErrorItem } from '../../../components/field';
import { TextField } from '../../../components/inputs';
import { Segment } from '../../../components/segment';
import { Select } from '../../../components/select';
import { Card, Tabs, TabsContent, TabsList, TabsTrigger } from '../../../components/shell';
import { useRun } from '../../org/org-kit';
import { LivePage, dateText } from '../../time/live/kit';
import { IrreversibleSheet } from '../pay-kit';
import { FileButton } from './compliance';
import { FormDrawer } from './operations';
import { monthText } from './periods';
import { rupees } from './runs';
import { EntityPicker } from './setup';
import type { Confirmation, LoadState } from './types';
import type { SetupEntity } from './types-5b';
import type { Certificate197Input, ConsultantBatch, ConsultantInput, ConsultantInvoice, ConsultantInvoiceStatus, ConsultantMe, ConsultantRow, ConsultantSection, InvoiceInput, NonSalaryReturn } from './types-5h';

// Batch 5h, wired (PAY-8.01 … 8.04): the consultant register, invoices with their TDS, consultant payments (made by one
// person, released by another after a fresh second step), Form 140 / 26Q and Form 131 / 16A, and the consultant's own
// page. Every action is checked again by the API (keys, entities, maker ≠ checker, step-up, the database pay guard).

const MONTH = /^\d{4}-\d{2}$/;
export const SECTION_TEXT: Record<ConsultantSection, string> = { '194C': 'Contract work (194C)', '194J_A': 'Technical services (194J(a))', '194J_B': 'Professional fees (194J(b))' };
const INVOICE_STATUS: Record<ConsultantInvoiceStatus, { label: string; tone: BadgeTone }> = {
  submitted: { label: 'Waiting for approval', tone: 'warning' },
  approved: { label: 'Approved, to pay', tone: 'info' },
  rejected: { label: 'Turned down', tone: 'danger' },
  queued: { label: 'In a bank file', tone: 'info' },
  sent: { label: 'Sent to the bank', tone: 'info' },
  paid: { label: 'Paid', tone: 'success' },
  failed: { label: 'Payment failed', tone: 'danger' },
};
export const InvoiceStatusBadge = ({ status }: { status: ConsultantInvoiceStatus }) => <Badge tone={INVOICE_STATUS[status].tone}>{INVOICE_STATUS[status].label}</Badge>;

// ------------------------------------------------------------------------------------------ Form 140 and Form 131

export interface ConsultantTaxScreenProps {
  state: LoadState;
  onRetry?: () => void;
  entities: SetupEntity[];
  entityId: string | null;
  onEntity: (id: string | null) => void;
  returns: NonSalaryReturn[] | null;
  can: { challans: boolean; file: boolean; certificates: boolean };
  onPrepareChallans: (month: string) => Promise<{ section: ConsultantSection; tds: string; status: string }[]>;
  onDraft: (taxYear: string, quarter: number) => Promise<unknown>;
  onReconcile: (r: NonSalaryReturn) => Promise<unknown>;
  onMakeFile: (r: NonSalaryReturn) => Promise<unknown>;
  onDownload: (r: NonSalaryReturn) => Promise<unknown>;
  onFiled: (r: NonSalaryReturn, tokenNo: string, c: Confirmation) => Promise<unknown>;
  onImport: (taxYear: string, quarter: number, file: File) => Promise<{ formCode: string; matched: { name: string }[]; unmatched: string[] }>;
}

const QUARTERS = [1, 2, 3, 4].map((q) => ({ value: String(q), label: `Q${q}` }));

export function ConsultantTaxScreen(p: ConsultantTaxScreenProps) {
  const [month, setMonth] = useState('');
  const [taxYear, setTaxYear] = useState('');
  const [quarter, setQuarter] = useState('1');
  const [challans, setChallans] = useState<{ section: ConsultantSection; tds: string; status: string }[] | null>(null);
  const [imported, setImported] = useState<{ formCode: string; matched: { name: string }[]; unmatched: string[] } | null>(null);
  const [filing, setFiling] = useState<NonSalaryReturn | null>(null);
  const [token, setToken] = useState('');
  const { busy, error, run } = useRun();
  const yearOk = /^\d{4}-\d{2}$/.test(taxYear);
  return (
    <LivePage
      title="Consultant TDS returns"
      description="The TDS deducted from consultants: the month's challans per section, the quarterly return (Form 140; 26Q until March 2026) and the certificates from TRACES (Form 131; 16A before)."
      state={p.state}
      onRetry={p.onRetry}
      what="consultant TDS returns"
      grantedBy="your payroll admin"
    >
      <EntityPicker entities={p.entities} value={p.entityId} onChange={p.onEntity} />
      {error && (
        <InlineAlert tone="danger" title="That did not work">
          {error}
        </InlineAlert>
      )}
      {p.entityId && (
        <>
          {p.can.challans && (
            <Card title="Challans for a month">
              <p className="yx-tim-muted">One challan per section from the TDS deducted that month. Record each deposit on Statutory › Challans.</p>
              <div className="yx-tim-row">
                <FormField id="ct-month" label="Month">
                  <TextField type="month" value={month} onChange={setMonth} />
                </FormField>
                <Button disabled={!MONTH.test(month)} loading={busy === 'challans'} onClick={() => void run('challans', async () => setChallans(await p.onPrepareChallans(month)))}>
                  Prepare challans
                </Button>
              </div>
              {challans && !challans.length && <p className="yx-tim-muted">No TDS was deducted from consultants in {monthText(month)}.</p>}
              {challans && challans.length > 0 && (
                <ul>
                  {challans.map((c) => (
                    <li key={c.section}>
                      {SECTION_TEXT[c.section]}: {rupees(c.tds)} {c.status === 'deposited' ? '(deposited)' : '(to deposit)'}
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          )}
          <Card title="Quarterly returns">
            {p.can.file && (
              <div className="yx-tim-row">
                <FormField id="ct-year" label="Tax year" helper="Like 2026-27">
                  <TextField value={taxYear} onChange={setTaxYear} maxLength={7} />
                </FormField>
                <FormField id="ct-quarter" label="Quarter">
                  <Segment label="Quarter" value={quarter} onChange={setQuarter} options={QUARTERS} />
                </FormField>
                <Button disabled={!yearOk} loading={busy === 'draft'} onClick={() => void run('draft', () => p.onDraft(taxYear, Number(quarter)))}>
                  Draft return
                </Button>
              </div>
            )}
            {p.returns && !p.returns.length && <p className="yx-tim-muted">No returns yet.</p>}
            {p.returns && p.returns.length > 0 && (
              <table className="yx-tim-table" aria-label="Consultant TDS returns">
                <thead>
                  <tr>
                    <th scope="col">Return</th>
                    <th scope="col">Deductees</th>
                    <th scope="col">TDS</th>
                    <th scope="col">Status</th>
                    <th scope="col">
                      <span className="yx-sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {p.returns.map((r) => (
                    <tr key={r.id}>
                      <th scope="row">
                        Form {r.formCode} · {r.taxYear} Q{r.quarter}
                      </th>
                      <td>{r.rows}</td>
                      <td>{rupees(r.tds)}</td>
                      <td>
                        <Badge tone={r.status === 'filed' ? 'success' : r.status === 'reconciled' ? 'info' : 'warning'}>{r.status === 'filed' ? `Filed · ${r.tokenNo}` : r.status === 'reconciled' ? 'Matches the challans' : r.reconciliation && !r.reconciliation.ok ? 'Differs from the challans' : 'Draft'}</Badge>
                      </td>
                      <td>
                        {p.can.file && r.status !== 'filed' && (
                          <div className="yx-tim-row">
                            <Button size="sm" loading={busy === `rc-${r.id}`} onClick={() => void run(`rc-${r.id}`, () => p.onReconcile(r))}>
                              Check challans
                            </Button>
                            {r.status === 'reconciled' && !r.fileId && (
                              <Button size="sm" variant="primary" loading={busy === `mf-${r.id}`} onClick={() => void run(`mf-${r.id}`, () => p.onMakeFile(r))}>
                                Make return file
                              </Button>
                            )}
                            {r.fileId && (
                              <>
                                <Button size="sm" loading={busy === `dl-${r.id}`} onClick={() => void run(`dl-${r.id}`, () => p.onDownload(r))}>
                                  Download
                                </Button>
                                <Button size="sm" variant="primary" onClick={() => setFiling(r)}>
                                  Mark filed
                                </Button>
                              </>
                            )}
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>
          {p.can.certificates && (
            <Card title="Certificates from TRACES">
              <p className="yx-tim-muted">Upload the ZIP of the quarter’s certificates. Each is matched to a consultant by the PAN in its file name and shown on their page.</p>
              <div className="yx-tim-row">
                <FormField id="ct-cyear" label="Tax year" helper="Like 2026-27">
                  <TextField value={taxYear} onChange={setTaxYear} maxLength={7} />
                </FormField>
                <FormField id="ct-cquarter" label="Quarter">
                  <Segment label="Certificate quarter" value={quarter} onChange={setQuarter} options={QUARTERS} />
                </FormField>
                {yearOk && <FileButton label="Upload ZIP" accept=".zip,application/zip" ariaLabel="Upload the TRACES ZIP" loading={busy === 'zip'} onFile={(f) => void run('zip', async () => setImported(await p.onImport(taxYear, Number(quarter), f)))} />}
              </div>
              {imported && (
                <InlineAlert tone={imported.unmatched.length ? 'warning' : 'success'} title={`${imported.matched.length} Form ${imported.formCode} certificates issued`}>
                  {imported.unmatched.length ? `Not matched to anyone: ${imported.unmatched.join(', ')}.` : 'Every file matched a consultant.'}
                </InlineAlert>
              )}
            </Card>
          )}
        </>
      )}
      {filing && (
        <IrreversibleSheet
          open
          onOpenChange={(o) => !o && setFiling(null)}
          title={`Mark Form ${filing.formCode} filed`}
          subtitle={`${filing.taxYear} Q${filing.quarter}`}
          impact={[
            { label: 'Deductees', value: String(filing.rows) },
            { label: 'TDS', value: rupees(filing.tds) },
          ]}
          cannotUndo="The return is recorded as filed with its token number and can no longer be drafted again."
          correction="A mistake found later goes in a correction return on the portal."
          phrase={`FILED ${filing.formCode} Q${filing.quarter} ${filing.taxYear}`}
          maker="the portal"
          checker="you"
          confirmLabel="Mark filed"
          confirmVariant="primary"
          blocked={!/^[A-Za-z0-9]{6,30}$/.test(token.trim())}
          blockedReason="Enter the token number from the portal"
          onConfirm={() =>
            void run('filed', async () => {
              await p.onFiled(filing, token.trim(), { phrase: `FILED ${filing.formCode} Q${filing.quarter} ${filing.taxYear}`, impact: [{ label: 'TDS', value: rupees(filing.tds) }] });
              setFiling(null);
            })
          }
        >
          <FormField id="ct-token" label="Token number">
            <TextField value={token} onChange={setToken} maxLength={30} />
          </FormField>
        </IrreversibleSheet>
      )}
    </LivePage>
  );
}
