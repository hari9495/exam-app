import { useMemo, useState } from 'react';
import { Button } from '../../../components/button';
import { Badge } from '../../../components/display';
import { Drawer } from '../../../components/drawer';
import { EmptyState, InlineAlert } from '../../../components/feedback';
import { ErrorSummary, FormField, useSaveErrors } from '../../../components/field';
import { TextArea } from '../../../components/inputs';
import { RosterGrid, type RosterLeave, type RosterValue, type Shift } from '../../../components/roster';
import { Select } from '../../../components/select';
import { Card } from '../../../components/shell';
import { useRun } from '../../org/org-kit';
import { LivePage, addDays, clock, dayText } from './kit';
import type { LoadState, MyShifts, RosterWeek } from './types';

// The roster planner (M02 §B2, YX-AT-07) on the shared roster grid: the week for the people the viewer plans (a
// manager's team, or HR in scope), changes saved as drafts on the server, conflicts from the server (rest, leave,
// holidays, the women's night-work guard), and Publish to put it in force and tell the people. My shifts shows an
// employee their next two weeks and swaps with a teammate (the colleague agrees, then the manager, through P03).

// ------------------------------------------------------------------------------------------ me › my shifts

export interface MyShiftsScreenProps {
  state: LoadState;
  onRetry?: () => void;
  data: MyShifts | null;
  today: string;
  onSwap: (input: { on: string; colleagueEmployeeId: string; reason: string }) => Promise<unknown>;
  onWithdrawSwap: (id: string) => Promise<unknown>;
}

const SWAP_STATUS = { pending: { label: 'Waiting', tone: 'info' }, approved: { label: 'Approved', tone: 'success' }, rejected: { label: 'Not approved', tone: 'danger' }, withdrawn: { label: 'Withdrawn', tone: 'neutral' } } as const;

export function MyShiftsScreen(p: MyShiftsScreenProps) {
  const d = p.data;
  const [swapping, setSwapping] = useState(false);
  const { busy, error, run } = useRun();
  return (
    <LivePage
      title="My shifts"
      description="Your shifts for the next two weeks, as published."
      state={p.state}
      onRetry={p.onRetry}
      what="your shifts"
      actions={
        d?.colleagues.length ? (
          <Button variant="primary" onClick={() => setSwapping(true)}>
            Ask to swap a shift
          </Button>
        ) : undefined
      }
    >
      {d && (
        <>
          {error && <InlineAlert tone="danger" title="That did not work">{error}</InlineAlert>}
          <table className="yx-tim-table" aria-label="My shifts">
            <thead>
              <tr>
                <th>Day</th>
                <th>Shift</th>
              </tr>
            </thead>
            <tbody>
              {d.days
                .filter((x) => x.employed)
                .map((x) => (
                  <tr key={x.on}>
                    <td>
                      {dayText(x.on)} {x.on === p.today && <Badge tone="info">Today</Badge>}
                    </td>
                    <td>{x.shift ? `${x.shift.name} · ${clock(x.shift.start)} to ${clock(x.shift.end)}` : 'Weekly off'}</td>
                  </tr>
                ))}
            </tbody>
          </table>
          <Card title="Swaps">
            {d.swaps.length ? (
              <ul className="yx-tim-list" aria-label="Swaps">
                {d.swaps.map((s) => (
                  <li key={s.id} className="yx-tim-row">
                    <span>
                      {dayText(s.on)} with {s.with}
                      {s.mine ? '' : ' (they asked you)'}
                    </span>
                    <Badge tone={SWAP_STATUS[s.status].tone}>{SWAP_STATUS[s.status].label}</Badge>
                    {s.mine && s.status === 'pending' && (
                      <Button size="sm" loading={busy === s.id} onClick={() => void run(s.id, () => p.onWithdrawSwap(s.id))}>
                        Withdraw
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="yx-tim-muted">No swaps yet. A swap goes to your colleague first, then to your manager.</p>
            )}
          </Card>
          {swapping && <SwapDrawer data={d} today={p.today} onClose={() => setSwapping(false)} onSwap={p.onSwap} />}
        </>
      )}
    </LivePage>
  );
}

function SwapDrawer({ data, today, onClose, onSwap }: { data: MyShifts; today: string; onClose: () => void; onSwap: MyShiftsScreenProps['onSwap'] }) {
  const days = data.days.filter((x) => x.employed && x.on >= today);
  const [on, setOn] = useState<string | null>(days[0]?.on ?? null);
  const [who, setWho] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const { busy, error, run } = useRun();
  const errors = [...(!on ? [{ fieldId: 'sw-day', message: 'Choose the day.' }] : []), ...(!who ? [{ fieldId: 'sw-who', message: 'Choose the colleague.' }] : []), ...(!reason.trim() ? [{ fieldId: 'sw-why', message: 'Say why you want to swap.' }] : [])];
  const saveErrors = useSaveErrors(errors);
  return (
    <Drawer
      open
      onOpenChange={(o) => !o && onClose()}
      title="Ask to swap a shift"
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            loading={busy === 'swap'}
            onClick={() => {
              if (errors.length) return saveErrors.reveal();
              void run('swap', async () => {
                await onSwap({ on: on!, colleagueEmployeeId: who!, reason: reason.trim() });
                onClose();
              });
            }}
          >
            Send to my colleague
          </Button>
        </>
      }
    >
      <div className="yx-tim-form">
        <ErrorSummary errors={saveErrors.shownErrors} title="Check these before sending" />
        {error && <InlineAlert tone="danger" title="Not sent">{error}</InlineAlert>}
        <FormField id="sw-day" label="Day" required error={saveErrors.errorOf('sw-day')}>
          <Select value={on} onChange={setOn} options={days.map((x) => ({ value: x.on, label: `${dayText(x.on)} · ${x.shift ? x.shift.name : 'Weekly off'}` }))} />
        </FormField>
        <FormField id="sw-who" label="Colleague" required helper="Someone with the same manager. They agree first, then your manager approves." error={saveErrors.errorOf('sw-who')}>
          <Select value={who} onChange={setWho} options={data.colleagues.map((c) => ({ value: c.id, label: c.name }))} />
        </FormField>
        <FormField id="sw-why" label="Why" required error={saveErrors.errorOf('sw-why')}>
          <TextArea value={reason} onChange={setReason} maxLength={500} rows={3} />
        </FormField>
      </div>
    </Drawer>
  );
}
