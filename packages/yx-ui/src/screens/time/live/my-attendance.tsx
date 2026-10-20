import { useState } from 'react';
import { Button } from '../../../components/button';
import { Badge } from '../../../components/display';
import { Drawer } from '../../../components/drawer';
import { InlineAlert } from '../../../components/feedback';
import { FormField } from '../../../components/field';
import { Switch } from '../../../components/choice';
import { CodeField } from '../../../components/inputs';
import { Card } from '../../../components/shell';
import { useRun } from '../../org/org-kit';
import { ClockCard } from '../time-kit';
import type { ClockState, Punch } from '../time-logic';
import { dateText } from './kit';
import type { MyAttendance, MyNightWork, NightCodeSent, PunchKind, PunchResult } from './types';

// Me › Attendance pieces that live outside the designed calendar (attendance.tsx, LiveMyAttendance): the Home clock card
// on the person's live day, and Night work (founder decisions 9 Oct 2026): opt in to the night-work protection (only
// the person can turn it off), and confirm or withdraw a consent HR recorded, with a one-time code.

export interface Pin {
  lat: number;
  lng: number;
  accuracyM: number;
}

export interface NightWorkProps {
  night: MyNightWork;
  onNightOptIn?: (optIn: boolean) => Promise<unknown>;
  onNightCode?: (consentId: string) => Promise<NightCodeSent>;
  onNightConfirm?: (consentId: string, code: string) => Promise<unknown>;
  onNightWithdraw?: (consentId: string) => Promise<unknown>;
}

/** Me › Attendance › Night work: the opt-in and the consents HR recorded, confirmed or withdrawn with a one-time code. */
export function NightWorkCard({ night, ...p }: NightWorkProps) {
  const { busy, error, run } = useRun();
  const [sent, setSent] = useState<{ id: string; to: string } | null>(null);
  const [code, setCode] = useState('');
  const [withdrawing, setWithdrawing] = useState<string | null>(null);
  const open = night.consents.filter((x) => !x.withdrawnOn);
  return (
    <Card title="Night work">
      <div className="yx-tim-stack">
        {night.byRecord ? (
          <p className="yx-tim-muted">The night-work protection applies to you: you are placed on a shift between 7 pm and 6 am only with your consent, confirmed by you here, and the workplace safeguards in place.</p>
        ) : (
          <Switch
            label="Night-work protection"
            description="Placed on a shift between 7 pm and 6 am only with your consent, confirmed by you here, and the workplace safeguards in place. HR can see this. Only you can turn it off."
            checked={night.optedIn}
            disabled={busy === 'opt' || !p.onNightOptIn}
            onChange={(on) => void run('opt', () => p.onNightOptIn!(on))}
          />
        )}
        {error && <InlineAlert tone="danger" title="That did not work">{error}</InlineAlert>}
        {night.consents.length > 0 && (
          <ul className="yx-tim-list" aria-label="My night-work consents">
            {night.consents.map((x) => (
              <li key={x.id} className="yx-tim-row">
                <Badge tone={x.withdrawnOn ? 'neutral' : x.confirmedAt ? 'success' : 'warning'}>{x.withdrawnOn ? 'Withdrawn' : x.confirmedAt ? 'Confirmed' : 'Needs your confirmation'}</Badge>
                <span className="yx-tim-list__main">
                  <span>{x.location}</span>
                  <span className="yx-tim-note">
                    Given {dateText(x.givenOn)} · {x.reference}
                    {x.withdrawnOn ? ` · withdrawn from ${dateText(x.withdrawnOn)}` : ''}
                  </span>
                </span>
                {!x.withdrawnOn && !x.confirmedAt && p.onNightCode && (
                  <Button size="sm" loading={busy === `code-${x.id}`} onClick={() => void run(`code-${x.id}`, async () => setSent({ id: x.id, to: (await p.onNightCode!(x.id)).sentTo }))}>
                    {sent?.id === x.id ? 'Send a new code' : 'Confirm with a code'}
                  </Button>
                )}
                {!x.withdrawnOn && p.onNightWithdraw && (
                  <Button size="sm" onClick={() => setWithdrawing(x.id)}>
                    Withdraw
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
        {sent && open.some((x) => x.id === sent.id && !x.confirmedAt) && (
          <div className="yx-tim-row">
            <FormField id="nw-code" label={`The 6-digit code sent to ${sent.to}`} required>
              <CodeField value={code} onChange={setCode} />
            </FormField>
            <Button variant="primary" disabled={code.length !== 6} loading={busy === 'confirm'} onClick={() => void run('confirm', async () => (await p.onNightConfirm!(sent.id, code), setSent(null), setCode('')))}>
              Confirm my consent
            </Button>
          </div>
        )}
      </div>
      {withdrawing && (
        <Drawer
          open
          onOpenChange={(o) => !o && setWithdrawing(null)}
          title="Withdraw your night-work consent"
          footer={
            <>
              <Button onClick={() => setWithdrawing(null)}>Cancel</Button>
              <Button variant="primary" loading={busy === 'withdraw'} onClick={() => void run('withdraw', async () => (await p.onNightWithdraw!(withdrawing), setWithdrawing(null)))}>
                Withdraw
              </Button>
            </>
          }
        >
          <p>From today you are not placed on shifts between 7 pm and 6 am at this workplace. Withdrawing never leads to any action against you.</p>
        </Drawer>
      )}
    </Card>
  );
}

const SOURCES: Punch['source'][] = ['web', 'mobile', 'biometric', 'kiosk', 'teams', 'desktop', 'field'];
/** Hours and minutes of a moment in a time zone, as "HH:MM" and minutes since midnight. */
function zoneTime(at: Date, zone: string) {
  const [h, m, s] = at.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false, timeZone: zone }).split(':').map(Number);
  const hh = h % 24;
  return { hhmm: `${String(hh).padStart(2, '0')}:${String(m).padStart(2, '0')}`, minute: hh * 60 + m, second: s };
}
const hhmmOf = (minute: number) => `${String(Math.floor(minute / 60) % 24).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`;

/**
 * "Attendance today" on the Home (PLT-02): the designed clock card on the person's live day. Checking in and out and
 * Start break / End break go to the server, which applies the location and network rules to each.
 */
export function HomeClockCard({ data, now, getLocation, onPunch, attendanceHref, onRegularise }: {
  data: MyAttendance;
  now: Date;
  /** The browser's location, or null with the reason (permission refused, no GPS). */
  getLocation: () => Promise<{ pin: Pin | null; problem?: string }>;
  onPunch: (kind: PunchKind, pin: Pin | null) => Promise<PunchResult>;
  attendanceHref: string;
  onRegularise: () => void;
}) {
  const t = zoneTime(now, data.zone);
  const punches: Punch[] = data.punches
    .filter((p) => p.accepted)
    .map((p) => ({ id: p.id, kind: p.kind, time: zoneTime(new Date(p.at), data.zone).hhmm, source: SOURCES.includes(p.source as Punch['source']) ? (p.source as Punch['source']) : 'web', where: p.where ?? '', verdict: p.verdict === 'outside' ? 'outside' : p.verdict === 'field' ? 'field' : p.verdict === 'network' ? 'network' : 'inside' }));
  const state: ClockState = data.next === 'out' ? (data.onBreak ? 'break' : 'working') : punches.length ? 'out' : 'not_in';
  const day = data.days.find((d) => d.on === data.today);
  const dayOff = data.shift.off ? 'Weekly off today' : day?.status === 'holiday' ? 'Holiday today' : day?.status === 'leave' && (!day.leavePart || day.leavePart === 'full') ? 'On leave today' : undefined;
  return (
    <ClockCard
      variant="home"
      live
      now={t.minute}
      seconds={t.second}
      date={now}
      // The server decides when check-in opens; the card never blocks before the shift.
      shift={{ name: data.shift.name, start: hhmmOf(data.shift.start), end: hhmmOf(data.shift.end), graceMin: data.shift.grace, opensBeforeMin: data.shift.start }}
      state={state}
      punches={punches}
      mode={data.shift.checkIn}
      wfhToday={data.wfhToday}
      dayOff={dayOff}
      punchesHref={attendanceHref}
      lateMarksBefore={data.days.filter((d) => d.on < data.today && (d.lateMinutes ?? 0) > 0).length}
      onRegularise={onRegularise}
      onPunch={async (kind) => {
        const loc = await getLocation();
        const r = await onPunch(kind, loc.pin);
        // The browser's own reason (location off, not found) is the clearer one; never two messages run together.
        return { accepted: r.accepted, message: r.accepted ? r.message : (loc.problem ?? r.message) };
      }}
    />
  );
}
