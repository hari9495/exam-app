import { useState } from 'react';
import { Button } from '../../../components/button';
import { Badge } from '../../../components/display';
import { Drawer } from '../../../components/drawer';
import { EmptyState, InlineAlert } from '../../../components/feedback';
import { ErrorSummary, FormField } from '../../../components/field';
import { NumberField, TextArea } from '../../../components/inputs';
import { Select } from '../../../components/select';
import { useRun } from '../../org/org-kit';
import { DAY_STATUS, DayStatusBadge, LivePage, MODE_TEXT, addDays, dayText, duration, timeIn } from './kit';
import type { DayCard, HrBalances, LedgerRow, LoadState, Muster, TeamCalendar } from './types';

// Team › Leave calendar (TIM-20) and HR › Muster (TIM-02, read-only in batch 1), both opening on the viewer's widest
// scope (YX-AT-14: a manager's team, HR's people in scope); HR › Leave balances with an adjustment that needs a reason.

const SCOPE_TEXT = { team: 'Your team', granted: 'The people you look after', company: 'Everyone in the company' } as const;
const dates = (from: string, to: string) => {
  const out: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
};
const dayNum = (iso: string) => Number(iso.slice(8));
const weekday = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', { weekday: 'narrow', timeZone: 'UTC' });

export interface TeamLeaveScreenProps {
  state: LoadState;
  onRetry?: () => void;
  data: TeamCalendar | null;
  onRange: (from: string) => void;
  /** Where approvals are answered (the shared P03 inbox). */
  approvalsHref: string;
  onNavigate: (href: string) => void;
}

export function TeamLeaveScreen(p: TeamLeaveScreenProps) {
  const d = p.data;
  return (
    <LivePage
      title="Team leave"
      description={d ? `${SCOPE_TEXT[d.scope]}, ${dayText(d.from)} to ${dayText(d.to)}. Waiting requests have a dashed border.` : undefined}
      state={p.state}
      onRetry={p.onRetry}
      what="team leave"
      actions={<Button onClick={() => p.onNavigate(p.approvalsHref)}>Answer approvals</Button>}
    >
      {d && (
        <>
          <div className="yx-tim-row">
            <Button size="sm" onClick={() => p.onRange(addDays(d.from, -28))}>
              Earlier
            </Button>
            <Button size="sm" onClick={() => p.onRange(addDays(d.from, 28))}>
              Later
            </Button>
          </div>
          {d.people.length ? (
            <div className="yx-tim-grid">
              <table aria-label="Team leave calendar">
                <thead>
                  <tr>
                    <th scope="col">Person</th>
                    {dates(d.from, d.to).map((x) => (
                      <th key={x} scope="col" title={dayText(x)}>
                        {weekday(x)}
                        <br />
                        {dayNum(x)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {d.people.map((person) => (
                    <tr key={person.id}>
                      <th scope="row">
                        {person.name}
                        {person.me ? ' (you)' : ''}
                      </th>
                      {dates(d.from, d.to).map((x) => {
                        const leave = person.days.find((y) => y.on === x);
                        const hol = person.holidays.find((h) => h.on === x);
                        if (leave)
                          return (
                            <td key={x} data-tone="info" data-pending={leave.status === 'pending' || undefined} title={`${leave.name}${leave.part !== 'full' ? `, ${leave.part} half` : ''}${leave.status === 'pending' ? ', waiting for approval' : ''}`}>
                              {leave.code}
                              {leave.part !== 'full' ? '½' : ''}
                            </td>
                          );
                        if (hol)
                          return (
                            <td key={x} data-off title={hol.name}>
                              H
                            </td>
                          );
                        return <td key={x} />;
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState compact title="No one to show" description="People you manage, or look after in HR, appear here." />
          )}
        </>
      )}
    </LivePage>
  );
}

export interface MusterScreenProps {
  state: LoadState;
  onRetry?: () => void;
  data: Muster | null;
  month: string;
  onMonth: (month: string) => void;
  onOpenDay: (employeeId: string, on: string) => Promise<DayCard>;
}

const shiftMonth = (month: string, n: number) => {
  const d = new Date(`${month}-01T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + n);
  return d.toISOString().slice(0, 7);
};

export function MusterScreen(p: MusterScreenProps) {
  const [card, setCard] = useState<DayCard | null>(null);
  const { busy, error, run } = useRun();
  const d = p.data;
  return (
    <LivePage
      title="Attendance muster"
      description={d ? `${SCOPE_TEXT[d.scope]} · ${new Date(`${p.month}-01T00:00:00Z`).toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' })}. Read only: fixes go through each person’s request.` : undefined}
      state={p.state}
      onRetry={p.onRetry}
      what="the muster"
    >
      {d && (
        <>
          <div className="yx-tim-row">
            <Button size="sm" onClick={() => p.onMonth(shiftMonth(p.month, -1))}>
              Previous month
            </Button>
            <Button size="sm" onClick={() => p.onMonth(shiftMonth(p.month, 1))}>
              Next month
            </Button>
          </div>
          <div className="yx-tim-legend" aria-label="Legend">
            {(['present', 'half_day', 'absent', 'leave', 'holiday', 'weekly_off', 'missing_out', 'missing_in'] as const).map((s) => (
              <Badge key={s} tone={DAY_STATUS[s].tone}>
                {DAY_STATUS[s].code} {DAY_STATUS[s].label}
              </Badge>
            ))}
          </div>
          {error && <InlineAlert tone="danger" title="That did not work">{error}</InlineAlert>}
          {d.people.length ? (
            <div className="yx-tim-grid">
              <table aria-label="Muster">
                <thead>
                  <tr>
                    <th scope="col">Person</th>
                    <th scope="col">Mode</th>
                    {dates(d.from, d.to).map((x) => (
                      <th key={x} scope="col" title={dayText(x)}>
                        {dayNum(x)}
                      </th>
                    ))}
                    <th scope="col">Present</th>
                  </tr>
                </thead>
                <tbody>
                  {d.people.map((person) => (
                    <tr key={person.id}>
                      <th scope="row">
                        {person.name}
                        <span className="yx-tim-note"> {person.code ?? ''}</span>
                      </th>
                      <td title={person.mode === 'punch' ? (person.missingPunchEffect === 'warning_only' ? 'Missing punches warn only' : 'Missing punches block payroll approval') : undefined}>{MODE_TEXT[person.mode] ?? person.mode}</td>
                      {dates(d.from, d.to).map((x) => {
                        const day = person.days.find((y) => y.on === x);
                        if (!day) return <td key={x} />;
                        const s = DAY_STATUS[day.status];
                        return (
                          <td key={x} data-tone={day.status === 'holiday' || day.status === 'weekly_off' ? undefined : s.tone} data-off={day.status === 'holiday' || day.status === 'weekly_off' || undefined}>
                            <button type="button" className="yx-tim-cell" aria-label={`${person.name}, ${dayText(x)}: ${s.label}`} disabled={busy !== null} onClick={() => void run(`${person.id}${x}`, async () => setCard(await p.onOpenDay(person.id, x)))}>
                              {s.code}
                              {day.lateMinutes ? '*' : ''}
                            </button>
                          </td>
                        );
                      })}
                      <td className="yx-tim-num">{person.days.filter((x) => x.status === 'present').length + person.days.filter((x) => x.status === 'half_day').length / 2}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState compact title="No one to show" description="People you manage, or look after in HR, appear here." />
          )}
          <p className="yx-tim-note">* came in after the grace time.</p>
          {card && (
            <Drawer open onOpenChange={(o) => !o && setCard(null)} title={`${card.person.name}, ${dayText(card.on)}`} subtitle={card.day ? DAY_STATUS[card.day.status].label : 'Not worked out yet'}>
              <div className="yx-tim-stack">
                {card.day && (
                  <p className="yx-tim-muted">
                    <DayStatusBadge status={card.day.status} leavePart={card.day.leavePart} /> {card.day.workedMinutes !== null ? `Worked ${duration(card.day.workedMinutes)}.` : ''} {card.day.lateMinutes ? `Late by ${card.day.lateMinutes} min.` : ''} {card.day.regularised ? 'Fixed by an approved request.' : ''}
                  </p>
                )}
                {card.punches.length ? (
                  <table className="yx-tim-table" aria-label="Punches">
                    <thead>
                      <tr>
                        <th>Time</th>
                        <th>Punch</th>
                        <th>Where</th>
                      </tr>
                    </thead>
                    <tbody>
                      {card.punches.map((x) => (
                        <tr key={x.id}>
                          <td>{timeIn(x.at, card.zone)}</td>
                          <td>{x.accepted ? (x.kind === 'in' ? 'In' : 'Out') : <Badge tone="danger">Refused</Badge>}</td>
                          <td>
                            {x.accepted ? `${x.verdict === 'network' ? 'Office network' : x.verdict === 'inside' ? 'Inside' : x.verdict === 'field' ? 'Field (recorded)' : 'Recorded'}${x.where ? ` · ${x.where}` : ''}${x.distanceM !== null ? ` · ${x.distanceM} m from the site` : ''}` : x.refusal}
                            <span className="yx-tim-note"> · {x.source}</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <p className="yx-tim-muted">No punches on this day.</p>
                )}
              </div>
            </Drawer>
          )}
        </>
      )}
    </LivePage>
  );
}

export interface LeaveBalancesScreenProps {
  state: LoadState;
  onRetry?: () => void;
  data: HrBalances | null;
  onLedger: (employeeId: string) => Promise<LedgerRow[]>;
  onAdjust: (employeeId: string, input: { leaveTypeId: string; days: number; reason: string }) => Promise<unknown>;
}

const KIND_TEXT: Record<string, string> = { opening: 'Opening balance', accrual: 'Credit', taken: 'Leave taken', cancelled: 'Leave cancelled', adjustment: 'Adjustment', carry_forward: 'Carried forward', lapse: 'Lapsed' };

export function LeaveBalancesScreen(p: LeaveBalancesScreenProps) {
  const [person, setPerson] = useState<HrBalances['people'][number] | null>(null);
  const [ledger, setLedger] = useState<LedgerRow[] | null>(null);
  const [adjusting, setAdjusting] = useState(false);
  const { busy, error, run } = useRun();
  const d = p.data;
  const open = (x: HrBalances['people'][number], adjust: boolean) =>
    void run(x.employeeId, async () => {
      setLedger(await p.onLedger(x.employeeId));
      setPerson(x);
      setAdjusting(adjust);
    });
  return (
    <LivePage title="Leave balances" description="Every balance is the sum of its ledger. An adjustment adds a ledger line with your reason." state={p.state} onRetry={p.onRetry} what="leave balances">
      {d && (
        <>
          {error && <InlineAlert tone="danger" title="That did not work">{error}</InlineAlert>}
          {d.people.length ? (
            <table className="yx-tim-table" aria-label="Leave balances">
              <thead>
                <tr>
                  <th>Person</th>
                  {d.types.map((t) => (
                    <th key={t.id} title={t.name}>
                      {t.code}
                    </th>
                  ))}
                  <th>
                    <span className="yx-visually-hidden">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {d.people.map((x) => (
                  <tr key={x.employeeId}>
                    <td>
                      {x.name} <span className="yx-tim-note">{x.code ?? ''}</span>
                    </td>
                    {d.types.map((t) => {
                      const b = x.balances.find((y) => y.leaveTypeId === t.id);
                      return (
                        <td key={t.id} className="yx-tim-num">
                          {!b ? '' : b.hasBalance ? b.balance : `${b.takenThisYear} taken`}
                        </td>
                      );
                    })}
                    <td>
                      <div className="yx-tim-row">
                        <Button size="sm" loading={busy === x.employeeId && !adjusting} onClick={() => open(x, false)}>
                          Ledger
                        </Button>
                        {x.canAdjust && (
                          <Button size="sm" onClick={() => open(x, true)}>
                            Adjust
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <EmptyState compact title="No one to show" description="People in your HR scope appear here." />
          )}
          {person && ledger && (
            <Drawer open onOpenChange={(o) => !o && (setPerson(null), setLedger(null))} title={person.name} subtitle={adjusting ? 'Adjust a balance' : 'Ledger'} size="lg">
              <div className="yx-tim-stack">
                {adjusting && (
                  <Adjust
                    types={d.types.filter((t) => person.balances.some((b) => b.leaveTypeId === t.id && b.hasBalance))}
                    onSave={async (input) => {
                      await p.onAdjust(person.employeeId, input);
                      setLedger(await p.onLedger(person.employeeId));
                      setAdjusting(false);
                    }}
                  />
                )}
                <table className="yx-tim-table" aria-label="Ledger">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Leave</th>
                      <th>What</th>
                      <th>Days</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ledger.map((l) => (
                      <tr key={l.id}>
                        <td>{dayText(l.on)}</td>
                        <td>{l.type}</td>
                        <td>
                          {KIND_TEXT[l.kind] ?? l.kind}
                          <span className="yx-tim-note"> · {l.reason}</span>
                        </td>
                        <td className="yx-tim-num">{l.days > 0 ? `+${l.days}` : l.days}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Drawer>
          )}
        </>
      )}
    </LivePage>
  );
}

function Adjust({ types, onSave }: { types: HrBalances['types']; onSave: (input: { leaveTypeId: string; days: number; reason: string }) => Promise<void> }) {
  const [typeId, setTypeId] = useState<string | null>(types[0]?.id ?? null);
  const [days, setDays] = useState<number | null>(null);
  const [reason, setReason] = useState('');
  const [showErrors, setShowErrors] = useState(false);
  const { busy, error, run } = useRun();
  const errors = [
    ...(!typeId ? [{ fieldId: 'adj-type', message: 'Choose the leave.' }] : []),
    ...(!days ? [{ fieldId: 'adj-days', message: 'Give the days to add, or a minus number to take away.' }] : []),
    ...(reason.trim().length < 3 ? [{ fieldId: 'adj-reason', message: 'Say why (it goes on the ledger and the audit log).' }] : []),
  ];
  const errorOf = (id: string) => (showErrors ? errors.find((x) => x.fieldId === id)?.message : undefined);
  return (
    <div className="yx-tim-form">
      {showErrors && errors.length > 0 && <ErrorSummary errors={errors} />}
      {error && <InlineAlert tone="danger" title="Not saved">{error}</InlineAlert>}
      <FormField id="adj-type" label="Leave" required error={errorOf('adj-type')}>
        <Select value={typeId} onChange={setTypeId} options={types.map((t) => ({ value: t.id, label: t.name }))} />
      </FormField>
      <FormField id="adj-days" label="Days" required helper="Use a minus number to take days away, e.g. -1.5." error={errorOf('adj-days')}>
        <NumberField value={days} onChange={setDays} decimals min={-100} max={100} />
      </FormField>
      <FormField id="adj-reason" label="Reason" required error={errorOf('adj-reason')}>
        <TextArea value={reason} onChange={setReason} rows={2} maxLength={500} />
      </FormField>
      <div>
        <Button
          variant="primary"
          loading={busy === 'save'}
          onClick={() => {
            setShowErrors(true);
            if (errors.length) return;
            void run('save', () => onSave({ leaveTypeId: typeId!, days: days!, reason: reason.trim() }));
          }}
        >
          Add to the ledger
        </Button>
      </div>
    </div>
  );
}
