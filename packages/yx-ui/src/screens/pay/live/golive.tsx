import { useRef, useState } from 'react';
import { Button } from '../../../components/button';
import { Badge } from '../../../components/display';
import { EmptyState, InlineAlert, Skeleton } from '../../../components/feedback';
import { Select } from '../../../components/select';
import { FormField } from '../../../components/field';
import { Card } from '../../../components/shell';
import { useRun } from '../../org/org-kit';
import { LivePage, dateText } from '../../time/live/kit';
import { monthText } from './periods';
import { ReasonDrawer, rupees, runName } from './runs';
import { EntityPicker } from './setup';
import type { LoadState } from './types';
import type { SetupEntity } from './types-5b';
import type { PayRun } from './types-5j';

// Go-live (PAY-10.07): what a legal entity still needs before its first live month, and the parallel run: the old
// payroll's register uploaded on a YukthiX run and compared person by person; someone else signs it off or waives it.

export interface ReadinessItem {
  key: string;
  label: string;
  ok: boolean;
  info?: boolean;
  detail: string;
}

export interface GoLiveReadiness {
  entityId: string;
  people: number;
  ready: boolean;
  items: ReadinessItem[];
}

export interface ParallelRunView {
  id: string;
  runId: string;
  status: 'compared' | 'signed_off' | 'waived' | 'superseded';
  people: number;
  matched: number;
  differences: number;
  rows: { employeeCode: string; name: string | null; field: string; ours: string | null; theirs: string | null; difference: string | null }[];
  reason: string | null;
  createdBy: string;
  createdAt: string;
}

export interface GoLiveScreenProps {
  state: LoadState;
  onRetry?: () => void;
  entities: SetupEntity[];
  entityId: string | null;
  onEntity: (id: string | null) => void;
  readiness: GoLiveReadiness | null;
  runs: PayRun[];
  parallel: ParallelRunView[] | null;
  me: string | null;
  can: { upload: boolean; decide: boolean };
  onUpload: (runId: string, file: File) => Promise<unknown>;
  onDecide: (id: string, decision: 'signed_off' | 'waived', reason?: string) => Promise<unknown>;
}

const FIELD: Record<string, string> = { gross: 'Gross', deductions: 'Deductions', net: 'Net pay', missing_in_yukthix: 'Not in YukthiX', missing_in_register: 'Not in the old register' };

export function GoLiveScreen(p: GoLiveScreenProps) {
  const [runId, setRunId] = useState<string | null>(null);
  const [deciding, setDeciding] = useState<{ id: string; decision: 'signed_off' | 'waived' } | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const { busy, error, run } = useRun();
  const eligible = p.runs.filter((r) => r.legalEntityId === p.entityId && r.runType === 'regular' && ['calculated', 'in_review', 'submitted', 'approved', 'paid'].includes(r.status));
  return (
    <LivePage title="Go-live readiness" description="What a legal entity still needs before its first live month, and the parallel run against the old payroll." state={p.state} onRetry={p.onRetry} what="go-live readiness" grantedBy="your payroll admin">
      <EntityPicker entities={p.entities} value={p.entityId} onChange={p.onEntity} />
      {error && (
        <InlineAlert tone="danger" title="This didn't go through">
          {error}
        </InlineAlert>
      )}
      {p.entityId && !p.readiness && <Skeleton height={200} />}
      {p.readiness && (
        <Card title={p.readiness.ready ? 'Ready for the first live month' : 'Not ready yet'}>
          <ul className="yx-tim-list" aria-label="Readiness checks">
            {p.readiness.items.map((i) => (
              <li key={i.key}>
                <Badge tone={i.info ? 'info' : i.ok ? 'success' : 'warning'}>{i.info ? 'Note' : i.ok ? 'Done' : 'To do'}</Badge> <strong>{i.label}</strong> · <span className="yx-tim-note">{i.detail}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}
      {p.entityId && (
        <Card title="Parallel run">
          <p className="yx-tim-note">Pay a month in the old payroll as usual, calculate the same month here, then upload the old register as CSV with the columns employee_code, gross, deductions and net. Amounts more than a rupee apart are listed.</p>
          {p.can.upload &&
            (eligible.length ? (
              <div className="yx-tim-row">
                <FormField id="pr-run" label="Run to compare">
                  <Select value={runId} onChange={setRunId} options={eligible.map((r) => ({ value: r.id, label: runName(r) }))} placeholder="Choose a calculated run" />
                </FormField>
                <Button variant="primary" disabled={!runId} loading={busy === 'upload'} onClick={() => input.current?.click()}>
                  Upload old register
                </Button>
                <input
                  ref={input}
                  type="file"
                  accept=".csv,text/csv"
                  hidden
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file && runId) void run('upload', () => p.onUpload(runId, file));
                    e.target.value = '';
                  }}
                />
              </div>
            ) : (
              <InlineAlert tone="info" title="Calculate a monthly run first" />
            ))}
          {!p.parallel ? (
            <Skeleton height={80} />
          ) : !p.parallel.length ? (
            <EmptyState compact title="No comparison yet" />
          ) : (
            p.parallel
              .filter((x) => x.status !== 'superseded')
              .map((x) => {
                const r = p.runs.find((y) => y.id === x.runId);
                return (
                  <section key={x.id} aria-label={`Comparison of ${r ? monthText(r.month) : 'a run'}`} className="yx-tim-stack">
                    <h3 className="yx-pay-section-title">
                      {r ? runName(r) : 'Run'} · uploaded {dateText(x.createdAt.slice(0, 10))} · {x.matched} of {x.people} match{' '}
                      <Badge tone={x.status === 'signed_off' ? 'success' : x.status === 'waived' ? 'neutral' : x.differences ? 'warning' : 'info'}>{x.status === 'signed_off' ? 'Signed off' : x.status === 'waived' ? 'Waived' : x.differences ? `${x.differences} differences` : 'No differences'}</Badge>
                    </h3>
                    {x.rows.length > 0 && (
                      <table className="yx-tim-table" aria-label="Differences">
                        <thead>
                          <tr>
                            <th scope="col">Person</th>
                            <th scope="col">What</th>
                            <th scope="col">YukthiX</th>
                            <th scope="col">Old payroll</th>
                            <th scope="col">Difference</th>
                          </tr>
                        </thead>
                        <tbody>
                          {x.rows.map((d, i) => (
                            <tr key={i}>
                              <th scope="row">
                                {d.name ?? ''} {d.employeeCode}
                              </th>
                              <td>{FIELD[d.field] ?? d.field}</td>
                              <td>{d.ours ? rupees(d.ours) : ''}</td>
                              <td>{d.theirs ? rupees(d.theirs) : ''}</td>
                              <td>{d.difference ? rupees(d.difference) : ''}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                    {x.reason && <p className="yx-tim-note">{x.reason}</p>}
                    {x.status === 'compared' && p.can.decide && (
                      <div className="yx-tim-row">
                        {x.createdBy === p.me ? (
                          <p className="yx-tim-note">You uploaded this register, so someone else signs it off.</p>
                        ) : (
                          <>
                            <Button variant="approve" loading={busy === `so-${x.id}`} onClick={() => (x.differences ? setDeciding({ id: x.id, decision: 'signed_off' }) : void run(`so-${x.id}`, () => p.onDecide(x.id, 'signed_off')))}>
                              Sign off
                            </Button>
                            <Button onClick={() => setDeciding({ id: x.id, decision: 'waived' })}>Waive</Button>
                          </>
                        )}
                      </div>
                    )}
                  </section>
                );
              })
          )}
        </Card>
      )}
      {deciding && (
        <ReasonDrawer
          title={deciding.decision === 'waived' ? 'Waive the parallel run?' : 'Sign off with differences?'}
          label={deciding.decision === 'waived' ? 'Why' : 'Why the differences are accepted'}
          confirm={deciding.decision === 'waived' ? 'Waive' : 'Sign off'}
          onClose={() => setDeciding(null)}
          onSave={(reason) => p.onDecide(deciding.id, deciding.decision, reason)}
        />
      )}
    </LivePage>
  );
}
