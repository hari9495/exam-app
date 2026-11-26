// LRN-06, wired: the designed enrolment sheet (EnrolmentSheet in learn-me.tsx) with the API behind it. One sheet for
// the four things the design draws: enrol in a course (or ask, when it needs approval), ask for external training,
// nominate people for a session, and decline a nomination. Same layout and words as the design; what the core does
// not have (the department budget check, a "complete by" date on a nomination, who nominated) is left out, not faked.
import { useEffect, useMemo, useState } from 'react';
import { Button, Link } from '../../components/button';
import { Text } from '../../components/foundations';
import { InlineAlert } from '../../components/feedback';
import { Card, DescriptionList } from '../../components/shell';
import { Drawer } from '../../components/drawer';
import { BottomSheet } from '../../components/overlay';
import { FieldRow, FormField } from '../../components/field';
import { CurrencyField, TextArea, TextField } from '../../components/inputs';
import { Checkbox } from '../../components/choice';
import { MultiSelect, Select, type SelectOption } from '../../components/select';
import { formatINR } from '../../lib/format';
import type { Device } from './growth-kit';
import { enrol as seatFor } from './growth-logic';
import type { Course } from './learn-me';
import './growth.css';

/** Courses above this carry a 12-month training bond (the design's threshold). */
export const BOND_ABOVE = 25000;

export interface SessionOption {
  id: string;
  label: string;
  seats: number;
  enrolled: number;
  waitlist: number;
}
export interface ExternalInput {
  title: string;
  provider: string;
  cost: number;
  reason: string;
  acceptBond: boolean;
}

export type LiveEnrolmentSheet = { device?: Device; onClose: () => void } & (
  | { mode: 'self'; course: Course; onSessions?: (courseId: string) => Promise<SessionOption[]>; onEnrol: (opts: { acceptBond: boolean; sessionId?: string }) => Promise<void> }
  | { mode: 'external'; onSend: (input: ExternalInput) => Promise<void> }
  | { mode: 'nominate'; course: Course; session?: { label: string; seats: number; enrolled: number; waitlist: number }; sessions?: SessionOption[]; people: SelectOption[]; onNominate: (employeeIds: string[], sessionId?: string) => Promise<void> }
  | { mode: 'decline'; course: Course; onDecline: (reason: string) => Promise<void> }
);

const fill = (n: number, p: string) => Array.from({ length: n }, (_, i) => `${p}${i}`);
const placeText = (r: ReturnType<typeof seatFor>) => (r.result === 'Waitlisted' ? `Waitlist, position ${'position' in r ? r.position : ''}` : r.result);

export function LiveEnrolmentSheetView({ live }: { live: LiveEnrolmentSheet }) {
  const course = live.mode === 'external' ? null : live.course;
  const sessionCourse = Boolean(course && (course.type === 'Classroom' || course.type === 'Virtual'));
  const [who, setWho] = useState<string[]>([]);
  const [reason, setReason] = useState('');
  const [bond, setBond] = useState(false);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState(false);
  const [ext, setExt] = useState({ title: '', provider: '' });
  const [cost, setCost] = useState<number | null>(null);
  const [sessions, setSessions] = useState<SessionOption[] | null>(live.mode === 'nominate' ? (live.sessions ?? null) : null);
  const [sessionId, setSessionId] = useState<string | null>(live.mode === 'nominate' ? (live.sessions?.[0]?.id ?? null) : null);
  const onSessions = live.mode === 'self' ? live.onSessions : undefined;
  useEffect(() => {
    if (course && sessionCourse && onSessions) void onSessions(course.id).then((xs) => (setSessions(xs), setSessionId(xs[0]?.id ?? null))).catch(() => setSessions([]));
  }, [course, sessionCourse, onSessions]);

  const picked = live.mode === 'nominate' && live.session ? live.session : sessions?.find((x) => x.id === sessionId);
  const places = useMemo(() => {
    if (!picked || live.mode === 'decline' || live.mode === 'external') return [];
    let s = { seats: picked.seats, enrolled: fill(picked.enrolled, 'x'), waitlist: fill(picked.waitlist, 'w') };
    return (live.mode === 'nominate' ? who : ['me']).map((id) => {
      const r = seatFor(s, id);
      s = r;
      return { name: live.mode === 'nominate' ? (live.people.find((p) => p.value === id)?.label ?? '') : 'You', result: placeText(r) };
    });
  }, [picked, who, live]);

  const price = live.mode === 'external' ? (cost ?? 0) : (course?.cost ?? 0);
  const needsBond = (live.mode === 'self' || live.mode === 'external') && price > BOND_ABOVE;
  const extOk = ext.title.trim().length >= 3 && ext.provider.trim().length >= 2 && cost !== null && reason.trim().length >= 10;
  const mandatory = Boolean(course?.mandatory);
  const title = live.mode === 'nominate' ? `Nominate for ${course!.title}` : live.mode === 'self' ? `Enrol in ${course!.title}` : live.mode === 'external' ? 'Request external training' : `Decline nomination: ${course!.title}`;
  const blocked =
    (needsBond && !bond) ||
    (live.mode === 'decline' && (mandatory || reason.trim().length < 10)) ||
    (live.mode === 'nominate' && (!who.length || !picked)) ||
    (live.mode === 'self' && sessionCourse && !sessionId);

  const send = async () => {
    if (live.mode === 'external' && !extOk) return setErrors(true);
    setBusy(true);
    try {
      if (live.mode === 'self') await live.onEnrol({ acceptBond: needsBond && bond, ...(sessionId ? { sessionId } : {}) });
      else if (live.mode === 'external') await live.onSend({ title: ext.title.trim(), provider: ext.provider.trim(), cost: cost ?? 0, reason: reason.trim(), acceptBond: needsBond && bond });
      else if (live.mode === 'nominate') await live.onNominate(who, sessionId ?? undefined);
      else await live.onDecline(reason.trim());
      live.onClose();
    } catch {
      // The page has said what went wrong; the sheet stays open to try again.
    } finally {
      setBusy(false);
    }
  };

  const sessionPicker =
    sessions && sessions.length === 0 ? (
      <InlineAlert tone="info">No session is scheduled yet. L&amp;D schedules sessions; ask them when the next one is.</InlineAlert>
    ) : (
      <FormField label="Session" required>
        <Select value={sessionId} onChange={setSessionId} options={(sessions ?? []).map((x) => ({ value: x.id, label: `${x.label} · ${x.enrolled} of ${x.seats} seats` }))} placeholder="Choose a session" />
      </FormField>
    );

  const body =
    live.mode === 'decline' ? (
      <div className="yx-growth-stack">
        {mandatory ? (
          <InlineAlert tone="warning" title="Mandatory courses can’t be declined">
            This course is required for your role. Talk to your manager if the date doesn’t work; they can move you to another session.
          </InlineAlert>
        ) : (
          <>
            <Text>Your manager sees your reason.</Text>
            <FormField label="Reason" required helper="At least 10 characters.">
              <TextArea value={reason} onChange={setReason} rows={3} />
            </FormField>
          </>
        )}
      </div>
    ) : (
      <div className="yx-growth-stack">
        {live.mode === 'external' ? (
          <>
            <FormField label="Course or certification" required error={errors && ext.title.trim().length < 3 ? 'Name the course or certification.' : null}>
              <TextField value={ext.title} onChange={(v) => setExt({ ...ext, title: v })} />
            </FormField>
            <FieldRow>
              <FormField label="Provider" required error={errors && ext.provider.trim().length < 2 ? 'Name the provider.' : null}>
                <TextField value={ext.provider} onChange={(v) => setExt({ ...ext, provider: v })} />
              </FormField>
              <FormField label="Cost" required helper="Fees only. Travel goes on an expense claim." error={errors && cost === null ? 'Enter the fees (0 if free).' : null}>
                <CurrencyField value={cost} onChange={setCost} />
              </FormField>
            </FieldRow>
            <FormField label="Why this helps your work" required helper="At least 10 characters." error={errors && reason.trim().length < 10 ? 'Say how it helps your work.' : null}>
              <TextArea value={reason} onChange={setReason} rows={3} />
            </FormField>
          </>
        ) : (
          <>
            <DescriptionList
              items={[
                { label: 'Course', value: course!.title },
                ...(live.mode === 'nominate' && live.session ? [{ label: 'Session', value: live.session.label }] : sessionCourse ? [] : [{ label: 'Session', value: 'Self-paced' }]),
                // From a session page the course's price is not at hand: no cost line rather than a wrong one.
                ...(live.mode === 'nominate' && live.session ? [] : [{ label: 'Cost per person', value: course!.cost ? formatINR(course!.cost) : 'No cost' }]),
              ]}
            />
            {sessionCourse && !(live.mode === 'nominate' && live.session) && sessionPicker}
            {live.mode === 'nominate' && (
              <FormField label="People" required>
                <MultiSelect value={who} onChange={setWho} options={live.people} searchable />
              </FormField>
            )}
          </>
        )}
        {needsBond && (
          <Card title="Training bond">
            <Text>
              Courses above {formatINR(BOND_ABOVE)} have a 12-month service agreement. If you leave within 12 months, a pro-rata share of {formatINR(price)} is recovered in your final settlement, after HR confirms.
            </Text>
            <div className="yx-growth-stack">
              <Link href="#bond">Read the full bond terms</Link>
              <Checkbox checked={bond} onChange={setBond} label="I accept the training bond terms" />
            </div>
          </Card>
        )}
        <div className="yx-growth-effect" aria-live="polite">
          <span className="yx-growth-effect__title">What happens</span>
          <ul>
            {(live.mode === 'nominate' || !course?.approval) &&
              places.map((s) => (
                <li key={s.name}>
                  {s.name}: {s.result}
                </li>
              ))}
            {live.mode === 'nominate' && course!.cost > 0 && who.length > 0 && <li>Cost {formatINR(course!.cost * who.length)} for {who.length === 1 ? 'one person' : `${who.length} people`}</li>}
            <li>
              {live.mode === 'nominate'
                ? mandatory
                  ? 'Each person is told. This course is mandatory, so it can’t be declined.'
                  : 'Each person is told and can decline with a reason, except for mandatory courses.'
                : live.mode === 'external' || course?.approval
                  ? 'Goes to your manager, then L&D for approval.'
                  : places[0]?.result.startsWith('Waitlist')
                    ? 'You get a seat when one frees up, and you’re told.'
                    : 'You’re enrolled straight away.'}
            </li>
            {course?.certificate && <li>A certificate is issued on completion.</li>}
          </ul>
        </div>
      </div>
    );

  const footer = (
    <div className="yx-growth-foot">
      <Button onClick={live.onClose}>Cancel</Button>
      <Button variant={live.mode === 'decline' ? 'danger' : 'primary'} disabled={blocked} loading={busy} fullWidth={live.device === 'phone'} onClick={() => void send()}>
        {live.mode === 'nominate' ? `Nominate ${who.length} ${who.length === 1 ? 'person' : 'people'}` : live.mode === 'self' ? (course!.approval ? 'Send request' : 'Enrol') : live.mode === 'external' ? 'Send request' : 'Decline nomination'}
      </Button>
    </div>
  );
  return live.device === 'phone' ? (
    <BottomSheet open onOpenChange={(o) => !o && live.onClose()} title={title} footer={footer}>
      {body}
    </BottomSheet>
  ) : (
    <Drawer open onOpenChange={(o) => !o && live.onClose()} title={title} footer={footer}>
      {body}
    </Drawer>
  );
}
