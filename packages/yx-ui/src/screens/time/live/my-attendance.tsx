import { useState } from 'react';
import { Button } from '../../../components/button';
import { Badge } from '../../../components/display';
import { Drawer } from '../../../components/drawer';
import { EmptyState, InlineAlert } from '../../../components/feedback';
import { ErrorSummary, FormField, useSaveErrors } from '../../../components/field';
import { TextArea, TimeField } from '../../../components/inputs';
import { Segment } from '../../../components/segment';
import { Card } from '../../../components/shell';
import { useRun } from '../../org/org-kit';
import { DayStatusBadge, LivePage, MODE_TEXT, clock, dayText, duration, timeIn } from './kit';
import type { DayRow, FixInput, FixKind, LoadState, MyAttendance, PunchResult } from './types';

// Me › Attendance (TIM-07 / TIM-12 on the web): check in and out with the location shown before it counts (YX-AT-23:
// a refused attempt says why in plain words and is kept), my days this month from the day engine, and fixes
// (regularisation, Q5) with the monthly allowance.

export interface Pin {
  lat: number;
  lng: number;
  accuracyM: number;
}

export interface MyAttendanceScreenProps {
  state: LoadState;
  onRetry?: () => void;
  data: MyAttendance | null;
  month: string;
  onMonth: (month: string) => void;
  /** The browser's location, or null with the reason (permission refused, no GPS). */
  getLocation: () => Promise<{ pin: Pin | null; problem?: string }>;
  onPunch: (kind: 'in' | 'out', pin: Pin | null) => Promise<PunchResult>;
  onFix: (input: FixInput) => Promise<unknown>;
  onWithdrawFix: (id: string) => Promise<unknown>;
}

const shiftMonth = (month: string, n: number) => {
  const d = new Date(`${month}-01T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + n);
  return d.toISOString().slice(0, 7);
};
const monthText = (month: string) => new Date(`${month}-01T00:00:00Z`).toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const FIXABLE = new Set(['absent', 'missing_in', 'missing_out', 'half_day']);
const FIX_TEXT: Record<FixKind, string> = { missed_in: 'Missed check-in', missed_out: 'Missed check-out', wrong_time: 'Wrong times', full_day: 'Present all day' };

export function MyAttendanceScreen(p: MyAttendanceScreenProps) {
  const [fixing, setFixing] = useState<string | null>(null);
  const d = p.data;
  return (
    <LivePage title="My attendance" description={d ? `${MODE_TEXT[d.mode]} · ${d.shift.off ? 'Weekly off today' : `${d.shift.name} shift ${clock(d.shift.start)} to ${clock(d.shift.end)}`}` : undefined} state={p.state} onRetry={p.onRetry} what="your attendance">
      {d && (
        <>
          <Today data={d} getLocation={p.getLocation} onPunch={p.onPunch} />
          <Card
            title={monthText(p.month)}
            actions={
              <div className="yx-tim-row">
                <Button size="sm" onClick={() => p.onMonth(shiftMonth(p.month, -1))}>
                  Previous month
                </Button>
                <Button size="sm" disabled={p.month >= d.today.slice(0, 7)} onClick={() => p.onMonth(shiftMonth(p.month, 1))}>
                  Next month
                </Button>
              </div>
            }
          >
            <Days data={d} onFix={setFixing} />
          </Card>
          <Fixes data={d} onWithdraw={p.onWithdrawFix} />
          {fixing && <FixDrawer on={fixing} data={d} onClose={() => setFixing(null)} onFix={p.onFix} />}
        </>
      )}
    </LivePage>
  );
}

function Today({ data, getLocation, onPunch }: { data: MyAttendance; getLocation: MyAttendanceScreenProps['getLocation']; onPunch: MyAttendanceScreenProps['onPunch'] }) {
  const [result, setResult] = useState<PunchResult | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const { busy, error, run } = useRun();
  const punch = () =>
    void run('punch', async () => {
      setResult(null);
      const loc = await getLocation();
      setProblem(loc.pin ? null : (loc.problem ?? null));
      setResult(await onPunch(data.next, loc.pin));
    });
  const label = data.next === 'in' ? 'Check in' : 'Check out';
  return (
    <Card title={`Today, ${dayText(data.today)}`}>
      <div className="yx-tim-stack">
        <div className="yx-tim-clock-now">
          <div className="yx-tim-stack" data-gap="sm">
            <p className="yx-tim-muted">
              {data.shift.checkIn === 'field' ? 'Your location is recorded with each punch.' : data.fences.length ? `Check in at ${data.fences.map((f) => `${f.name} (within ${f.radiusM} m)`).join(' or ')}, or from the office network.` : 'Check in from the office network.'}
            </p>
            {data.mode !== 'punch' && <p className="yx-tim-note">{data.mode === 'assumed_present' ? 'You are counted present unless you are on leave, so checking in is optional.' : 'Your day comes from your timesheet; punches are kept as a record.'}</p>}
          </div>
          <Button variant="primary" loading={busy === 'punch'} onClick={punch}>
            {label}
          </Button>
        </div>
        {error && <InlineAlert tone="danger" title="That did not work">{error}</InlineAlert>}
        {problem && !result?.accepted && <InlineAlert tone="warning" title="We could not read your location">{problem}</InlineAlert>}
        {result && (
          <InlineAlert
            tone={result.accepted ? 'success' : 'danger'}
            title={result.accepted ? (result.duplicate ? 'Already recorded' : 'Done') : 'Not recorded'}
            actions={
              result.accepted ? undefined : (
                <Button size="sm" onClick={punch}>
                  Retry location
                </Button>
              )
            }
          >
            {result.message}
          </InlineAlert>
        )}
        {data.punches.length > 0 ? (
          <ul className="yx-tim-stack" data-gap="sm" aria-label="Punches today">
            {data.punches.map((x) => (
              <li key={x.id} className="yx-tim-row">
                <Badge tone={x.accepted ? 'success' : 'danger'}>{x.accepted ? (x.kind === 'in' ? 'In' : 'Out') : 'Refused'}</Badge>
                <span>{timeIn(x.at, data.zone)}</span>
                <span className="yx-tim-muted">{x.accepted ? (x.where ? `${x.verdict === 'network' ? 'Office network' : 'Inside'} · ${x.where}` : 'Recorded') : x.refusal}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="yx-tim-muted">No punches yet today.</p>
        )}
      </div>
    </Card>
  );
}

function Days({ data, onFix }: { data: MyAttendance; onFix: (on: string) => void }) {
  const pendingDays = new Set(data.requests.filter((r) => r.status === 'pending').map((r) => r.on));
  if (!data.days.length) return <EmptyState compact title="No days yet" description="Days appear here once they have been worked out." />;
  return (
    <table className="yx-tim-table" aria-label="My days">
      <thead>
        <tr>
          <th>Day</th>
          <th>Status</th>
          <th>In</th>
          <th>Out</th>
          <th>Worked</th>
          <th>
            <span className="yx-visually-hidden">Fix</span>
          </th>
        </tr>
      </thead>
      <tbody>
        {[...data.days].reverse().map((x: DayRow) => (
          <tr key={x.on}>
            <td>{dayText(x.on)}</td>
            <td>
              <DayStatusBadge status={x.status} leavePart={x.leavePart} />
              {x.lateMinutes ? <span className="yx-tim-note"> · late {x.lateMinutes} min</span> : null}
              {x.regularised ? <span className="yx-tim-note"> · fixed</span> : null}
            </td>
            <td>{timeIn(x.firstIn, data.zone)}</td>
            <td>{timeIn(x.lastOut, data.zone)}</td>
            <td className="yx-tim-num">{duration(x.workedMinutes)}</td>
            <td>
              {FIXABLE.has(x.status) && data.mode === 'punch' && (pendingDays.has(x.on) ? <Badge tone="info">Fix waiting</Badge> : <Button size="sm" onClick={() => onFix(x.on)}>Fix this day</Button>)}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Fixes({ data, onWithdraw }: { data: MyAttendance; onWithdraw: (id: string) => Promise<unknown> }) {
  const { busy, error, run } = useRun();
  if (!data.requests.length) return null;
  return (
    <Card title="My fixes">
      {error && <InlineAlert tone="danger" title="That did not work">{error}</InlineAlert>}
      <table className="yx-tim-table" aria-label="My fixes">
        <thead>
          <tr>
            <th>Day</th>
            <th>Fix</th>
            <th>Status</th>
            <th>
              <span className="yx-visually-hidden">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {data.requests.map((r) => (
            <tr key={r.id}>
              <td>{dayText(r.on)}</td>
              <td>
                {FIX_TEXT[r.kind]}
                {r.inMinute !== null ? ` · in ${clock(r.inMinute)}` : ''}
                {r.outMinute !== null ? ` · out ${clock(r.outMinute)}` : ''}
              </td>
              <td>
                <Badge tone={r.status === 'approved' ? 'success' : r.status === 'rejected' ? 'danger' : r.status === 'pending' ? 'info' : 'neutral'}>{r.status === 'pending' ? 'Waiting for approval' : r.status === 'approved' ? 'Approved' : r.status === 'rejected' ? 'Not approved' : 'Withdrawn'}</Badge>
              </td>
              <td>
                {r.status === 'pending' && (
                  <Button size="sm" loading={busy === r.id} onClick={() => void run(r.id, () => onWithdraw(r.id))}>
                    Withdraw
                  </Button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}

const toMinute = (hhmm: string | null) => (hhmm ? Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5)) : null);

function FixDrawer({ on, data, onClose, onFix }: { on: string; data: MyAttendance; onClose: () => void; onFix: (input: FixInput) => Promise<unknown> }) {
  const day = data.days.find((x) => x.on === on);
  const [kind, setKind] = useState<FixKind>(day?.status === 'missing_out' ? 'missed_out' : day?.status === 'missing_in' ? 'missed_in' : 'full_day');
  const [inTime, setIn] = useState<string | null>(null);
  const [outTime, setOut] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const { busy, error, run } = useRun();
  const needIn = kind === 'missed_in' || kind === 'wrong_time';
  const needOut = kind === 'missed_out' || kind === 'wrong_time';
  const errors = [
    ...(needIn && !inTime ? [{ fieldId: 'fx-in', message: 'Give the time you started.' }] : []),
    ...(needOut && !outTime ? [{ fieldId: 'fx-out', message: 'Give the time you finished.' }] : []),
    ...(kind === 'wrong_time' && inTime && outTime && toMinute(outTime)! <= toMinute(inTime)! ? [{ fieldId: 'fx-out', message: 'The finish time is before the start time.' }] : []),
    ...(!reason.trim() ? [{ fieldId: 'fx-reason', message: 'Say what happened.' }] : []),
  ];
  const saveErrors = useSaveErrors(errors);
  const { errorOf } = saveErrors;
  const left = Math.max(0, data.regularise.limit - data.regularise.used);
  const send = () => {
    if (errors.length) return saveErrors.reveal();
    void run('fix', async () => {
      await onFix({ on, kind, ...(needIn ? { inMinute: toMinute(inTime)! } : {}), ...(needOut ? { outMinute: toMinute(outTime)! } : {}), reason: reason.trim() });
      onClose();
    });
  };
  return (
    <Drawer
      open
      onOpenChange={(o) => !o && onClose()}
      title={`Fix ${dayText(on)}`}
      subtitle={day ? `Now: ${day.status.replace('_', ' ')}` : undefined}
      dirty={Boolean(reason)}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" loading={busy === 'fix'} onClick={send}>
            Send for approval
          </Button>
        </>
      }
    >
      <div className="yx-tim-form">
        <ErrorSummary errors={saveErrors.shownErrors} title="Check these before sending" />
        {error && <InlineAlert tone="danger" title="Not sent">{error}</InlineAlert>}
        <p className="yx-tim-muted">{left > 0 ? `Your manager approves this. ${left} of ${data.regularise.limit} fixes left this month without HR.` : 'You have used this month’s fixes, so HR approves this one after your manager.'}</p>
        <Segment label="What to fix" value={kind} onChange={setKind} options={(Object.keys(FIX_TEXT) as FixKind[]).map((k) => ({ value: k, label: FIX_TEXT[k] }))} />
        {needIn && (
          <FormField id="fx-in" label="Started at" required error={errorOf('fx-in')}>
            <TimeField value={inTime} onChange={setIn} />
          </FormField>
        )}
        {needOut && (
          <FormField id="fx-out" label="Finished at" required error={errorOf('fx-out')}>
            <TimeField value={outTime} onChange={setOut} />
          </FormField>
        )}
        <FormField id="fx-reason" label="What happened" required error={errorOf('fx-reason')}>
          <TextArea value={reason} onChange={setReason} rows={3} maxLength={500} />
        </FormField>
      </div>
    </Drawer>
  );
}
