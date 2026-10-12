import { useEffect, useState } from 'react';
import { Button } from '../../../components/button';
import { Badge } from '../../../components/display';
import { Drawer } from '../../../components/drawer';
import { EmptyState, InlineAlert, Skeleton } from '../../../components/feedback';
import { ErrorSummary, FormField, useSaveErrors } from '../../../components/field';
import { TextArea } from '../../../components/inputs';
import { Segment } from '../../../components/segment';
import { Card } from '../../../components/shell';
import { useRun } from '../../org/org-kit';
import { LivePage } from '../../time/live/kit';
import { monthText } from './periods';
import { PayslipLines, rupees } from './runs';
import type { LoadState } from './types';
import type { MyPayslip, PayslipDetail, PayslipLine } from './types-5j';

// The employee's pay, wired (PAY-10.03 for PAY-20 … PAY-23, PAY-41; PAY-10.05 explainers): published payslips with every
// line explained, "why is this different from last month" worked out only from the two payslips' own lines (no guessing),
// a query on a line, the PDF; the tax regime planner from the same tax function as the TDS. The payslip keeps a section
// for reimbursements (paid with salary, not part of gross) for the expenses module.

export interface PayDiffRow {
  name: string;
  before: number;
  after: number;
  kind: PayslipLine['kind'];
  explanation: string;
}

/** Line by line, what moved between two payslips (earnings, deductions, reimbursements); notes and employer lines left out. */
export function payDiff(prev: PayslipLine[], cur: PayslipLine[]): PayDiffRow[] {
  const sum = (ls: PayslipLine[]) => {
    const m = new Map<string, { name: string; kind: PayslipLine['kind']; amount: number; explanation: string }>();
    for (const l of ls.filter((x) => x.kind === 'earning' || x.kind === 'deduction' || x.kind === 'reimbursement')) {
      const o = m.get(l.code) ?? { name: l.name, kind: l.kind, amount: 0, explanation: '' };
      o.amount += Number(l.amount);
      o.explanation = l.explanation;
      m.set(l.code, o);
    }
    return m;
  };
  const a = sum(prev);
  const b = sum(cur);
  return [...new Set([...a.keys(), ...b.keys()])]
    .map((code) => ({ name: (b.get(code) ?? a.get(code))!.name, kind: (b.get(code) ?? a.get(code))!.kind, before: a.get(code)?.amount ?? 0, after: b.get(code)?.amount ?? 0, explanation: b.get(code)?.explanation ?? 'Not on this payslip.' }))
    .filter((r) => Math.abs(r.after - r.before) >= 0.005)
    .sort((x, y) => Math.abs(y.after - y.before) - Math.abs(x.after - x.before));
}

const money = (n: number) => rupees(n.toFixed(2));

export interface MyPayslipsScreenProps {
  state: LoadState;
  onRetry?: () => void;
  payslips: MyPayslip[] | null;
  onOpen: (id: string) => Promise<PayslipDetail>;
  onPdf: (id: string, month: string) => Promise<unknown>;
  onQuery: (id: string, text: string, lineCode?: string) => Promise<unknown>;
}

export function MyPayslipsScreen(p: MyPayslipsScreenProps) {
  const [open, setOpen] = useState<MyPayslip | null>(null);
  return (
    <LivePage title="My payslips" description="Your published payslips. Open one to see how each line was worked out." state={p.state} onRetry={p.onRetry} what="your payslips">
      {p.payslips && !p.payslips.length && <EmptyState title="No payslips yet" description="Your payslip shows here once payroll publishes it." />}
      {p.payslips && p.payslips.length > 0 && (
        <table className="yx-tim-table" aria-label="My payslips">
          <thead>
            <tr>
              <th scope="col">Month</th>
              <th scope="col">Net pay</th>
              <th scope="col">Gross</th>
              <th scope="col">Deductions</th>
              <th scope="col">
                <span className="yx-visually-hidden">Open</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {p.payslips.map((s) => (
              <tr key={s.id}>
                <th scope="row">
                  {monthText(s.month)}
                  {s.runType === 'offcycle' ? ' · off-cycle' : ''}
                </th>
                <td>{rupees(s.net)}</td>
                <td>{rupees(s.gross)}</td>
                <td>{rupees(s.deductions)}</td>
                <td>
                  <Button size="sm" onClick={() => setOpen(s)} aria-label={`Open payslip for ${monthText(s.month)}`}>
                    Open
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {open && p.payslips && <PayslipView slip={open} previous={p.payslips.find((x) => x.runType === 'regular' && x.month < open.month && open.runType === 'regular') ?? null} {...p} onClose={() => setOpen(null)} />}
    </LivePage>
  );
}

function PayslipView({ slip, previous, onOpen, onPdf, onQuery, onClose }: { slip: MyPayslip; previous: MyPayslip | null; onClose: () => void } & Pick<MyPayslipsScreenProps, 'onOpen' | 'onPdf' | 'onQuery'>) {
  const [d, setD] = useState<PayslipDetail | null>(null);
  const [prev, setPrev] = useState<PayslipDetail | null>(null);
  const [why, setWhy] = useState(false);
  const [asking, setAsking] = useState(false);
  const { busy, error, run } = useRun();
  useEffect(() => {
    void run('load', async () => setD(await onOpen(slip.id)));
  }, [slip.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const diff = d && prev ? payDiff(prev.lines, d.lines) : null;
  const reimbursements = d?.lines.filter((l) => l.kind === 'reimbursement') ?? [];
  return (
    <Drawer
      open
      onOpenChange={(o) => !o && onClose()}
      title={`Payslip · ${monthText(slip.month)}`}
      subtitle={`Net pay ${rupees(slip.net)}`}
      size="lg"
      footer={
        <>
          <Button onClick={onClose}>Close</Button>
          <Button loading={busy === 'pdf'} onClick={() => void run('pdf', () => onPdf(slip.id, slip.month))}>
            Download PDF
          </Button>
          <Button variant="primary" onClick={() => setAsking(true)}>
            Ask payroll a question
          </Button>
        </>
      }
    >
      <div className="yx-tim-stack">
        {error && (
          <InlineAlert tone="danger" title="This didn't go through">
            {error}
          </InlineAlert>
        )}
        {!d && <Skeleton height={240} />}
        {d && (
          <>
            <dl className="yx-pay-impact" aria-label="Summary">
              <div>
                <dt>Gross earnings</dt>
                <dd>{rupees(d.gross)}</dd>
              </div>
              <div>
                <dt>Deductions</dt>
                <dd>−{rupees(d.deductions)}</dd>
              </div>
              {reimbursements.length > 0 && (
                <div>
                  <dt>Reimbursements</dt>
                  <dd>+{rupees(reimbursements.reduce((t, l) => t + Number(l.amount), 0).toFixed(2))}</dd>
                </div>
              )}
              <div>
                <dt>Net pay</dt>
                <dd>{rupees(d.net)}</dd>
              </div>
            </dl>
            {d.held && <InlineAlert tone="warning" title="Your net pay is on hold">Payroll will tell you when it is released.</InlineAlert>}
            <PayslipLines lines={d.lines} />
            {!reimbursements.length && (
              <section aria-label="Reimbursements">
                <h3 className="yx-pay-section-title">Reimbursements</h3>
                <p className="yx-tim-note">None this month. Approved expense claims paid with salary show here; they are part of net pay, not of gross earnings.</p>
              </section>
            )}
            {previous && (
              <Card
                title={`Why is this different from ${monthText(previous.month)}?`}
                actions={
                  !why && (
                    <Button
                      size="sm"
                      loading={busy === 'why'}
                      onClick={() =>
                        void run('why', async () => {
                          setPrev(await onOpen(previous.id));
                          setWhy(true);
                        })
                      }
                    >
                      Show what changed
                    </Button>
                  )
                }
              >
                {why && diff && (
                  <>
                    <p>
                      Net pay {Number(d.net) === Number(previous.net) ? 'is the same' : `${Number(d.net) > Number(previous.net) ? 'went up' : 'went down'} by ${money(Math.abs(Number(d.net) - Number(previous.net)))}`}.
                    </p>
                    {diff.length ? (
                      <table className="yx-tim-table" aria-label="What changed">
                        <thead>
                          <tr>
                            <th scope="col">Line</th>
                            <th scope="col">{monthText(previous.month)}</th>
                            <th scope="col">{monthText(slip.month)}</th>
                            <th scope="col">Why</th>
                          </tr>
                        </thead>
                        <tbody>
                          {diff.map((r) => (
                            <tr key={r.name}>
                              <th scope="row">
                                {r.name} {r.kind === 'deduction' && <Badge tone="neutral">deduction</Badge>}
                              </th>
                              <td>{money(r.before)}</td>
                              <td>{money(r.after)}</td>
                              <td className="yx-tim-note">{r.explanation}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    ) : (
                      <p className="yx-tim-note">No line changed.</p>
                    )}
                  </>
                )}
              </Card>
            )}
          </>
        )}
      </div>
      {asking && <QueryDrawer onClose={() => setAsking(false)} onSend={(text) => onQuery(slip.id, text)} />}
    </Drawer>
  );
}

function QueryDrawer({ onClose, onSend }: { onClose: () => void; onSend: (text: string) => Promise<unknown> }) {
  const [text, setText] = useState('');
  const [sent, setSent] = useState(false);
  const { busy, error, run } = useRun();
  const errors = text.trim().length < 5 ? [{ fieldId: 'q-text', message: 'Write your question (at least 5 letters).' }] : [];
  const save = useSaveErrors(errors);
  return (
    <Drawer
      open
      onOpenChange={(o) => !o && onClose()}
      title="Ask payroll"
      footer={
        sent ? (
          <Button onClick={onClose}>Close</Button>
        ) : (
          <>
            <Button onClick={onClose}>Cancel</Button>
            <Button
              variant="primary"
              loading={busy === 'send'}
              onClick={() => {
                if (errors.length) return save.reveal();
                void run('send', async () => {
                  await onSend(text.trim());
                  setSent(true);
                });
              }}
            >
              Send
            </Button>
          </>
        )
      }
    >
      <div className="yx-tim-form">
        <ErrorSummary errors={save.shownErrors} />
        {error && (
          <InlineAlert tone="danger" title="Not sent">
            {error}
          </InlineAlert>
        )}
        {sent ? (
          <InlineAlert tone="success" title="Sent to payroll">You get the answer in YukthiX.</InlineAlert>
        ) : (
          <FormField id="q-text" label="Your question" required error={save.errorOf('q-text')}>
            <TextArea value={text} onChange={setText} rows={4} maxLength={1000} />
          </FormField>
        )}
      </div>
    </Drawer>
  );
}

// ------------------------------------------------------------------------------------------ my tax (PAY-22, PAY-41)

export interface MyTaxWorkspace {
  taxYear: string;
  regime: 'new' | 'old';
  canChooseRegime?: boolean;
  dates?: { regimeCutoff: string };
  panStatus: string;
}

export interface RegimeComparison {
  taxYear: string;
  current: 'new' | 'old';
  lower: 'new' | 'old';
  regimes: { regime: 'new' | 'old'; taxable: string; annualTax: string; monthTds: string }[];
}

export interface MyTaxScreenProps {
  state: LoadState;
  onRetry?: () => void;
  workspace: MyTaxWorkspace | null;
  onCompare: () => Promise<RegimeComparison>;
  onChooseRegime: (regime: 'new' | 'old') => Promise<unknown>;
}

export function MyTaxScreen(p: MyTaxScreenProps) {
  const w = p.workspace;
  const [cmp, setCmp] = useState<RegimeComparison | null>(null);
  const [choice, setChoice] = useState<'new' | 'old' | null>(null);
  const { busy, error, run } = useRun();
  useEffect(() => {
    if (w) setChoice(w.regime);
  }, [w?.regime]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <LivePage title="My tax" description={w ? `Tax year ${w.taxYear}.` : undefined} state={p.state} onRetry={p.onRetry} what="your tax">
      {w && (
        <>
          {error && (
            <InlineAlert tone="danger" title="This didn't go through">
              {error}
            </InlineAlert>
          )}
          <Card title="Old or new regime?">
            <p className="yx-tim-note">Worked out on your latest payslip with the same rules as your monthly tax. Nothing changes until you save a choice.</p>
            {!cmp ? (
              <Button loading={busy === 'cmp'} onClick={() => void run('cmp', async () => setCmp(await p.onCompare()))}>
                Compare the two regimes
              </Button>
            ) : (
              <table className="yx-tim-table" aria-label="Regimes compared">
                <thead>
                  <tr>
                    <th scope="col">Regime</th>
                    <th scope="col">Taxable income</th>
                    <th scope="col">Tax for the year</th>
                    <th scope="col">Tax this month</th>
                  </tr>
                </thead>
                <tbody>
                  {cmp.regimes.map((r) => (
                    <tr key={r.regime}>
                      <th scope="row">
                        {r.regime === 'new' ? 'New regime' : 'Old regime'} {cmp.lower === r.regime && <Badge tone="success">Lower tax</Badge>}
                      </th>
                      <td>{rupees(r.taxable)}</td>
                      <td>{rupees(r.annualTax)}</td>
                      <td>{rupees(r.monthTds)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {w.canChooseRegime ? (
              <div className="yx-tim-form">
                <Segment
                  label="Your regime"
                  value={choice}
                  onChange={setChoice}
                  options={[
                    { value: 'new', label: 'New regime' },
                    { value: 'old', label: 'Old regime' },
                  ]}
                />
                <div>
                  <Button variant="primary" disabled={!choice || choice === w.regime} loading={busy === 'save'} onClick={() => void run('save', () => p.onChooseRegime(choice!))}>
                    Save my choice
                  </Button>
                </div>
              </div>
            ) : (
              <p className="yx-tim-note">You are on the {w.regime} regime. The choice closed{w.dates ? ` on ${w.dates.regimeCutoff}` : ''}; payroll can change it with a reason.</p>
            )}
          </Card>
        </>
      )}
    </LivePage>
  );
}
