import { useEffect, useState } from 'react';
import { Button } from '../../../components/button';
import { Badge } from '../../../components/display';
import { Drawer } from '../../../components/drawer';
import { EmptyState, InlineAlert, Skeleton } from '../../../components/feedback';
import { ErrorSummary, FormField, useSaveErrors } from '../../../components/field';
import { TextArea } from '../../../components/inputs';
import { Select } from '../../../components/select';
import { Card } from '../../../components/shell';
import { useRun } from '../../org/org-kit';
import { LivePage, MODE_TEXT, dateText } from './kit';
import type { LoadState, PayrollFeed, Periods, Preflight, Registers } from './types';

// P08 attendance periods (lock / unlock per legal entity and month, with a fresh second sign-in step and the
// pre-flight), the statutory registers per establishment (P07 formats; the law's columns are always there), and the
// payroll feed, read only (frozen at the lock; a live preview before it).

const monthText = (month: string) => new Date(`${month}-01T00:00:00Z`).toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const shiftMonth = (month: string, n: number) => {
  const d = new Date(`${month}-01T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + n);
  return d.toISOString().slice(0, 7);
};
const hours = (m: number) => `${Math.round((m / 60) * 100) / 100} h`;

// ------------------------------------------------------------------------------------------ periods

export interface PeriodsScreenProps {
  state: LoadState;
  onRetry?: () => void;
  data: Periods | null;
  year: string;
  onYear: (year: string) => void;
  onPreflight: (legalEntityId: string, month: string) => Promise<Preflight>;
  onLock: (legalEntityId: string, month: string) => Promise<unknown>;
  onUnlock: (legalEntityId: string, month: string, reason: string) => Promise<unknown>;
}

export function PeriodsScreen(p: PeriodsScreenProps) {
  const d = p.data;
  const [locking, setLocking] = useState<{ entity: { id: string; name: string }; month: string } | null>(null);
  const [unlocking, setUnlocking] = useState<{ entity: { id: string; name: string }; month: string } | null>(null);
  return (
    <LivePage
      title="Attendance periods"
      description="Lock a month once its attendance and leave are final. Locked months refuse changes; payroll reads their frozen figures."
      state={p.state}
      onRetry={p.onRetry}
      what="attendance periods"
      actions={
        <div className="yx-tim-row">
          <Button size="sm" onClick={() => p.onYear(String(Number(p.year) - 1))}>
            Previous year
          </Button>
          <Button size="sm" disabled={d ? p.year >= d.today.slice(0, 4) : true} onClick={() => p.onYear(String(Number(p.year) + 1))}>
            Next year
          </Button>
        </div>
      }
    >
      {d && (
        <>
          {d.entities.map((e) => (
            <Card key={e.id} title={`${e.name} · ${d.year}`}>
              <table className="yx-tim-table" aria-label={`${e.name} periods`}>
                <thead>
                  <tr>
                    <th>Month</th>
                    <th>Stage</th>
                    <th>Last change</th>
                    <th>
                      <span className="yx-visually-hidden">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {e.months
                    .filter((m) => m.month <= d.today.slice(0, 7))
                    .map((m) => (
                      <tr key={m.month}>
                        <td>{monthText(m.month)}</td>
                        <td>{m.stage === 'open' ? <Badge tone="success">Open</Badge> : <Badge tone="neutral">{m.stage === 'filed' ? 'Filed' : m.stage === 'frozen' ? 'Frozen' : 'Locked'}</Badge>}</td>
                        <td className="yx-tim-note">{m.changedAt ? `${m.stage === 'open' ? 'Reopened' : 'Locked'} ${dateText(m.changedAt.slice(0, 10))}${m.changedBy ? ` by ${m.changedBy}` : ''}${m.reason ? `: ${m.reason}` : ''}` : ''}</td>
                        <td>
                          {m.stage === 'locked' && m.reopenAsked ? (
                            <span className="yx-tim-note">Reopen asked: waiting for two approvals</span>
                          ) : m.stage === 'locked' ? (
                            <Button size="sm" onClick={() => setUnlocking({ entity: e, month: m.month })}>
                              Ask to reopen
                            </Button>
                          ) : m.stage !== 'open' ? (
                            <span className="yx-tim-note">Filed: corrections only</span>
                          ) : m.lockable ? (
                            <Button size="sm" variant="primary" onClick={() => setLocking({ entity: e, month: m.month })}>
                              Lock
                            </Button>
                          ) : (
                            <span className="yx-tim-note">Can be locked from the 2nd of the next month</span>
                          )}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </Card>
          ))}
          {!d.entities.length && <EmptyState title="No legal entity to lock" description="Locking attendance needs attendance.lock for a legal entity." />}
          {locking && <LockDrawer target={locking} onClose={() => setLocking(null)} onPreflight={p.onPreflight} onLock={p.onLock} />}
          {unlocking && <UnlockDrawer target={unlocking} onClose={() => setUnlocking(null)} onUnlock={p.onUnlock} />}
        </>
      )}
    </LivePage>
  );
}

function LockDrawer({ target, onClose, onPreflight, onLock }: { target: { entity: { id: string; name: string }; month: string }; onClose: () => void; onPreflight: PeriodsScreenProps['onPreflight']; onLock: PeriodsScreenProps['onLock'] }) {
  const [pre, setPre] = useState<Preflight | null>(null);
  const { busy, error, run } = useRun();
  useEffect(() => {
    void run('pre', async () => setPre(await onPreflight(target.entity.id, target.month)));
  }, [target.entity.id, target.month]); // eslint-disable-line react-hooks/exhaustive-deps
  const blocked = Boolean(pre && (pre.pending.length || pre.exceptions));
  return (
    <Drawer
      open
      onOpenChange={(o) => !o && onClose()}
      title={`Lock ${monthText(target.month)} for ${target.entity.name}?`}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            disabled={!pre || blocked}
            loading={busy === 'lock'}
            onClick={() =>
              void run('lock', async () => {
                await onLock(target.entity.id, target.month);
                onClose();
              })
            }
          >
            Lock the month
          </Button>
        </>
      }
    >
      <div className="yx-tim-form">
        {busy === 'pre' && <Skeleton height={80} />}
        {error && <InlineAlert tone="danger" title="Not locked">{error}</InlineAlert>}
        {pre && (
          <>
            <p className="yx-tim-muted">{pre.people} people in this legal entity during the month. Every day is worked out again before the lock.</p>
            {blocked ? (
              <InlineAlert tone="warning" title="Not ready to lock">
                <ul className="yx-tim-list">
                  {pre.pending.map((x) => (
                    <li key={x.kind}>
                      {x.count} {x.kind.toLowerCase()} still waiting for a decision
                    </li>
                  ))}
                  {pre.exceptions > 0 && <li>{pre.exceptions} days with missing punches or timesheets</li>}
                </ul>
              </InlineAlert>
            ) : (
              <InlineAlert tone="info" title="Ready to lock">
                After the lock, attendance, leave, overtime, rosters and timesheets of the month can't change, and its payroll figures are frozen. You'll be asked to confirm it's you.
              </InlineAlert>
            )}
          </>
        )}
      </div>
    </Drawer>
  );
}

function UnlockDrawer({ target, onClose, onUnlock }: { target: { entity: { id: string; name: string }; month: string }; onClose: () => void; onUnlock: PeriodsScreenProps['onUnlock'] }) {
  const [reason, setReason] = useState('');
  const { busy, error, run } = useRun();
  const errors = reason.trim().length < 10 ? [{ fieldId: 'ul-why', message: 'Give the reason in a sentence (at least 10 letters).' }] : [];
  const saveErrors = useSaveErrors(errors);
  return (
    <Drawer
      open
      onOpenChange={(o) => !o && onClose()}
      title={`Ask to reopen ${monthText(target.month)} for ${target.entity.name}?`}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="danger"
            loading={busy === 'unlock'}
            onClick={() => {
              if (errors.length) return saveErrors.reveal();
              void run('unlock', async () => {
                await onUnlock(target.entity.id, target.month, reason.trim());
                onClose();
              });
            }}
          >
            Send for approval
          </Button>
        </>
      }
    >
      <div className="yx-tim-form">
        <ErrorSummary errors={saveErrors.shownErrors} />
        {error && <InlineAlert tone="danger" title="Not sent">{error}</InlineAlert>}
        <InlineAlert tone="info" title="Two approvals, then the month opens">
          Now that payroll uses these months, reopening one needs two other people: a payroll check, then Finance or a System Admin. Once approved, the frozen payroll figures are set aside (kept for the record). A month whose bank file is released or whose payslips are issued can't be reopened.
        </InlineAlert>
        <FormField id="ul-why" label="Why" required error={saveErrors.errorOf('ul-why')}>
          <TextArea value={reason} onChange={setReason} rows={3} maxLength={500} />
        </FormField>
      </div>
    </Drawer>
  );
}

// ------------------------------------------------------------------------------------------ registers

export interface RegistersScreenProps {
  state: LoadState;
  onRetry?: () => void;
  data: Registers | null;
  month: string;
  onMonth: (month: string) => void;
  onDownload: (type: 'muster' | 'leave', locationId: string, format: 'pdf' | 'xlsx') => Promise<unknown>;
}

const STATE_TEXT: Record<string, string> = { 'IN-KA': 'Karnataka', 'IN-TN': 'Tamil Nadu' };

export function RegistersScreen(p: RegistersScreenProps) {
  const d = p.data;
  const { busy, error, run } = useRun();
  return (
    <LivePage
      title="Registers"
      description="The muster and leave registers each establishment keeps, in its state's format. Every column the law asks for is always there."
      state={p.state}
      onRetry={p.onRetry}
      what="registers"
      actions={
        <div className="yx-tim-row">
          <Button size="sm" onClick={() => p.onMonth(shiftMonth(p.month, -1))}>
            Previous month
          </Button>
          <Button size="sm" onClick={() => p.onMonth(shiftMonth(p.month, 1))}>
            Next month
          </Button>
        </div>
      }
    >
      {d && (
        <>
          {error && <InlineAlert tone="danger" title="Not downloaded">{error}</InlineAlert>}
          {d.locations.map((l) => (
            <Card key={l.id} title={`${l.name} · ${monthText(d.month)}`} actions={l.locked ? <Badge tone="neutral">Month locked</Badge> : <Badge tone="warning">Draft: month not locked</Badge>}>
              <div className="yx-tim-stack">
                <p className="yx-tim-note">
                  {l.entity} · {STATE_TEXT[l.state] ?? l.state} · {l.people} people{l.verify ? ' · formats to be confirmed by your compliance adviser' : ''}
                </p>
                {l.formats.length ? (
                  l.formats.map((f) => (
                    <div key={f.type} className="yx-tim-row">
                      <span className="yx-tim-list__main">
                        <span>{f.title}</span>
                        <span className="yx-tim-note">{f.form}</span>
                      </span>
                      {(['pdf', 'xlsx'] as const).map((fmt) => (
                        <Button key={fmt} size="sm" loading={busy === `${l.id}-${f.type}-${fmt}`} onClick={() => void run(`${l.id}-${f.type}-${fmt}`, () => p.onDownload(f.type, l.id, fmt))}>
                          Download {fmt === 'pdf' ? 'PDF' : 'Excel'}
                        </Button>
                      ))}
                    </div>
                  ))
                ) : (
                  <p className="yx-tim-muted">No register format for this state yet.</p>
                )}
              </div>
            </Card>
          ))}
          {!d.locations.length && <EmptyState title="No establishments in your scope this month" />}
        </>
      )}
    </LivePage>
  );
}

// ------------------------------------------------------------------------------------------ payroll feed

export interface PayrollFeedScreenProps {
  state: LoadState;
  onRetry?: () => void;
  data: PayrollFeed | null;
  entities: { id: string; name: string }[];
  entityId: string | null;
  onEntity: (id: string) => void;
  month: string;
  onMonth: (month: string) => void;
}

export function PayrollFeedScreen(p: PayrollFeedScreenProps) {
  const d = p.data;
  return (
    <LivePage
      title="Payroll feed"
      description="What payroll will read for each person and month. Read only: it is frozen when the month is locked."
      state={p.entityId ? p.state : 'ready'}
      onRetry={p.onRetry}
      what="the payroll feed"
      actions={
        <div className="yx-tim-row">
          <Button size="sm" onClick={() => p.onMonth(shiftMonth(p.month, -1))}>
            Previous month
          </Button>
          <Button size="sm" onClick={() => p.onMonth(shiftMonth(p.month, 1))}>
            Next month
          </Button>
        </div>
      }
    >
      <FormField id="pf-entity" label="Legal entity">
        <Select value={p.entityId} onChange={(v) => v && p.onEntity(v)} options={p.entities.map((e) => ({ value: e.id, label: e.name }))} />
      </FormField>
      {d && (
        <Card title={`${d.entity.name} · ${monthText(d.month)}`} actions={d.frozen ? <Badge tone="neutral">Frozen {d.lockedAt ? dateText(d.lockedAt.slice(0, 10)) : ''}</Badge> : <Badge tone="warning">Preview: the month is open</Badge>}>
          {d.rows.length ? (
            <div className="yx-tim-grid">
              <table aria-label="Payroll feed">
                <thead>
                  <tr>
                    <th scope="col">Person</th>
                    <th scope="col">Mode</th>
                    <th scope="col">Days</th>
                    <th scope="col">Paid days</th>
                    <th scope="col">Loss of pay</th>
                    <th scope="col">OT working day</th>
                    <th scope="col">OT weekly off</th>
                    <th scope="col">OT holiday</th>
                    <th scope="col">Night shifts</th>
                    <th scope="col">Comp-off</th>
                    <th scope="col">Timesheet</th>
                  </tr>
                </thead>
                <tbody>
                  {d.rows.map((r) => (
                    <tr key={r.employeeId}>
                      <th scope="row">
                        {r.name}
                        {r.code ? ` (${r.code})` : ''}
                      </th>
                      <td>{MODE_TEXT[r.mode] ?? r.mode}</td>
                      <td>
                        {r.calendarDays}
                        {r.unevaluatedDays ? ` (${r.unevaluatedDays} not worked out)` : ''}
                      </td>
                      <td>{r.paidDays}</td>
                      <td>{r.lopDays}</td>
                      <td>{hours(r.otNormalMinutes)}</td>
                      <td>{hours(r.otWeeklyOffMinutes)}</td>
                      <td>{hours(r.otHolidayMinutes)}</td>
                      <td>{r.nightShifts}</td>
                      <td>{r.compOffDays}</td>
                      <td>{hours(r.timesheetMinutes)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState compact title="No one in your scope for this month" />
          )}
        </Card>
      )}
    </LivePage>
  );
}
