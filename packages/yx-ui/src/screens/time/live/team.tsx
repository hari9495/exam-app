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
import { KIND_LABEL } from '../time-kit';
import { fmtDuration } from '../time-logic';
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
                          {!b ? '' : b.hasBalance ? b.balance : b.takenThisYear ? `${b.takenThisYear} taken` : ''}
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
