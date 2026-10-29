// TIM-41 · Hybrid office days, live: the designed HybridPlannerScreen (roster.tsx) with the API's plan, team, compliance
// and policy. Same tabs, grid, cards, texts and buttons; the tabs shown follow what the person may do (their own plan,
// their team, compliance in scope, the policy with org.settings.manage).
import { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Lock } from 'lucide-react';
import { Segment } from '../people/people-kit';
import { Button, IconButton } from '../../components/button';
import { Badge, PersonLabel } from '../../components/display';
import { EmptyState } from '../../components/feedback';
import { useToast } from '../../components/notify';
import { Icon } from '../../components/foundations';
import { Checkbox } from '../../components/choice';
import { NumberField } from '../../components/inputs';
import { FormField } from '../../components/field';
import { Select } from '../../components/select';
import { ConfirmDialog } from '../../components/overlay';
import { useNarrow } from '../../components/stepper';
import { Card, PageHeader, Tabs, TabsContent, TabsList, TabsTrigger } from '../../components/shell';
import { formatDate } from '../../lib/format';
import { errorText } from '../org/org-kit';
import { TimePage } from './time-kit';
import { LiveGate } from './ops';
import type { LoadState } from './live/types';

export type HybridPlace = 'office' | 'home';
export type HybridEvidence = 'geofence' | 'network' | 'kiosk';
export interface HybridRule { officeDays: number; anchors: number[]; evidence: HybridEvidence[] }
export interface HybridDay { on: string; place: HybridPlace | null; anchor: boolean; closed: 'past' | 'started' | 'weekly_off' | 'holiday' | 'leave' | 'not_employed' | null; note: string | null }
export interface HybridMe {
  employee: { id: string; name: string } | null;
  today: string;
  week: string;
  thisWeek: string;
  nextWeek: string;
  rule: HybridRule | null;
  days: HybridDay[];
  colleagues: { on: string; names: string[] }[];
  /** everyone: compliance reaches the whole company (else the people in the viewer's scope). */
  can: { team: boolean; compliance: boolean; policy: boolean; everyone?: boolean };
}
export interface HybridTeam { week: string; people: { employeeId: string; name: string; rule: HybridRule; days: HybridDay[] }[] }
export interface HybridCompliance {
  week: string;
  thisWeek: string;
  people: { employeeId: string; name: string; rule: HybridRule; noRule: boolean; target: number; planned: number; office: number; leave: number; counted: number; met: boolean; short: number; missed: string[] }[];
}
export interface HybridPolicyGroup {
  scopeType: 'tenant' | 'legal_entity' | 'location' | 'department';
  scopeId: string | null;
  label: string;
  own: { officeDays: string | null; anchors: string | null; evidence: string | null };
  applies: HybridRule;
}
interface Part<T> { state: LoadState; data: T | null; onRetry?: () => void }
export interface LiveHybrid {
  me: Part<HybridMe>;
  /** Only when me.can.team. */
  team?: Part<HybridTeam>;
  /** Only when me.can.compliance. */
  compliance?: Part<HybridCompliance>;
  /** Only when me.can.policy. */
  policy?: Part<{ groups: HybridPolicyGroup[] }>;
  /** The week planned (Monday). */
  week: string;
  onWeek: (week: string) => void;
  onPlan: (input: { employeeId?: string; days: { on: string; place: HybridPlace }[] }) => Promise<unknown>;
  onRemind: (employeeId: string, week: string) => Promise<unknown>;
  /** Writes the three settings at the group (PUT /org/settings). */
  onPolicy: (group: { scopeType: HybridPolicyGroup['scopeType']; scopeId: string | null }, values: { officeDays: string; anchors: string; evidence: string }) => Promise<unknown>;
}

const WD5 = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
const ANCHOR_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri'];
const EVIDENCE: { id: HybridEvidence; label: string }[] = [
  { id: 'geofence', label: 'Punch inside an office geofence' },
  { id: 'network', label: 'Punch from the office network' },
  { id: 'kiosk', label: 'Kiosk check-in' },
];
const localDay = (iso: string) => new Date(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10)));
const dateText = (iso: string) => formatDate(localDay(iso));
const dayList = (ds: number[]) => ds.map((i) => WD5[i]).join(' and ');
const CLOSED: Record<NonNullable<HybridDay['closed']>, string> = { past: 'Over', started: 'Today', weekly_off: 'Weekly off', holiday: 'Holiday', leave: 'Leave', not_employed: 'Not employed' };
const closedText = (d: HybridDay) => (d.closed === 'holiday' && d.note ? `Holiday · ${d.note}` : CLOSED[d.closed!]);
const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? '' : 's'}`;

/** Founder rule: no greyed-out button. Pressed too early it says why in a toast; otherwise it runs `go`. */
function useWhy() {
  const { toast } = useToast();
  return (why: string | false | null | undefined, go?: () => void) => () => {
    if (why) toast({ title: why, tone: 'warning' });
    else go?.();
  };
}

/** The column head: the date, with the weekday as a separate small label. */
function DayHead({ on }: { on: string }) {
  return (
    <span className="yx-tim-stack" style={{ gap: 0 }}>
      <span className="yx-tim-muted">{WD5[(localDay(on).getDay() + 6) % 7]}</span>
      <span>{dateText(on)}</span>
    </span>
  );
}

/** One day of one person's plan: Home | Office, the fixed anchor badge, or why it can't change. */
function DayChoice({ day, place, label, onChange }: { day: HybridDay; place: HybridPlace | null; label: string; onChange: (p: HybridPlace) => void }) {
  if (day.anchor) return <Badge tone="info"><Icon icon={Lock} size="sm" /> Office · anchor</Badge>;
  if (day.closed) return <span className="yx-tim-row"><Badge tone="neutral">{closedText(day)}</Badge>{place && <span className="yx-tim-muted">{place === 'office' ? 'Office' : 'Home'}</span>}</span>;
  return <Segment label={label} value={place} onChange={onChange} options={[{ value: 'home', label: 'Home' }, { value: 'office', label: 'Office' }]} />;
}

type Plans = Record<string, Record<string, HybridPlace | null>>;
const planOf = (days: HybridDay[]) => Object.fromEntries(days.map((d) => [d.on, d.place]));

export function LiveHybridScreen({ live }: { live: LiveHybrid }) {
  const me = live.me.data;
  const { toast } = useToast();
  const why = useWhy();
  const narrow = useNarrow();
  const done = (title: string, description?: string) => toast({ title, description, tone: 'success' });
  const fail = (e: unknown) => toast({ title: errorText(e), tone: 'error' });
  const canPlan = !!me?.employee && !!me.rule;
  const mgr = !!me?.can.team;
  const team = live.team?.data;
  const rows = useMemo(() => {
    const out: { employeeId: string | null; name: string; rule: HybridRule; days: HybridDay[] }[] = [];
    if (me?.employee && me.rule && me.rule.officeDays > 0) out.push({ employeeId: null, name: mgr ? `${me.employee.name} (you)` : me.employee.name, rule: me.rule, days: me.days });
    if (mgr && team && team.week === live.week) out.push(...team.people);
    return out;
  }, [me, team, mgr, live.week]);
  const key = (r: { employeeId: string | null }) => r.employeeId ?? 'me';
  const baseline = useMemo<Plans>(() => Object.fromEntries(rows.map((r) => [key(r), planOf(r.days)])), [rows]);
  const [plans, setPlans] = useState<Plans>(baseline);
  useEffect(() => setPlans(baseline), [baseline]);
  const [busy, setBusy] = useState<string | null>(null);
  const [reminded, setReminded] = useState<string[]>([]);

  const placeOf = (r: (typeof rows)[number], d: HybridDay) => (d.anchor ? 'office' : (plans[key(r)]?.[d.on] ?? null));
  const setDay = (r: (typeof rows)[number], on: string, p: HybridPlace) => setPlans((ps) => ({ ...ps, [key(r)]: { ...ps[key(r)], [on]: p } }));
  const officeCount = (r: (typeof rows)[number]) => r.days.filter((d) => !d.closed || d.closed === 'past' || d.closed === 'started').filter((d) => placeOf(r, d) === 'office').length;
  const shortOf = (r: (typeof rows)[number]) => Math.max(0, r.rule.officeDays - officeCount(r));
  const changedRows = rows.filter((r) => r.days.some((d) => !d.anchor && !d.closed && placeOf(r, d) !== baseline[key(r)]?.[d.on]));
  const weekText = dateText(live.week);

  const savePlan = async () => {
    setBusy('save');
    try {
      for (const r of changedRows) {
        const days = r.days.filter((d) => !d.anchor && !d.closed && placeOf(r, d) && placeOf(r, d) !== baseline[key(r)]?.[d.on]).map((d) => ({ on: d.on, place: placeOf(r, d)! }));
        await live.onPlan({ ...(r.employeeId ? { employeeId: r.employeeId } : {}), days });
      }
      const others = changedRows.filter((r) => r.employeeId).map((r) => r.name);
      done(`Plan for week of ${weekText} saved`, others.length ? `Updated for ${others.join(', ')}.` : undefined);
    } catch (e) {
      fail(e);
    } finally {
      setBusy(null);
    }
  };
  const remind = (employeeId: string, name: string, week: string, label: string) => {
    const k = `${employeeId}:${week}`;
    return (
      <Button
        size="sm"
        loading={busy === `remind:${k}`}
        onClick={why(reminded.includes(k) && 'Already reminded today', async () => {
          setBusy(`remind:${k}`);
          try {
            await live.onRemind(employeeId, week);
            setReminded((x) => [...x, k]);
            done(`Reminder sent to ${name}`, `Plan office days for the week of ${dateText(week)}.`);
          } catch (e) {
            fail(e);
          } finally {
            setBusy(null);
          }
        })}
      >
        {reminded.includes(k) ? 'Reminded' : label}
      </Button>
    );
  };
  const vsTarget = (r: (typeof rows)[number]) => {
    if (!r.rule.officeDays) return <span className="yx-tim-muted">No office-day rule</span>;
    const s = shortOf(r);
    return s > 0 ? (
      <span className="yx-tim-row"><Badge tone="warning">Short by {s}</Badge>{r.employeeId && remind(r.employeeId, r.name, live.week, 'Remind')}</span>
    ) : (
      <span className="yx-tim-muted">{officeCount(r)} of {r.rule.officeDays}</span>
    );
  };

  // ---------------------------------------------------------------- plan week
  const rule = me?.rule;
  const anchors = rule?.anchors ?? [];
  const anchorHint = anchors.length ? `${dayList(anchors)} ${anchors.length === 1 ? 'is an anchor day' : 'are anchor days'}: everyone is in the office.` : '';
  const atThis = live.week === me?.thisWeek;
  const weekBar = me && (
    <div className="yx-tim-row">
      <IconButton icon={ChevronLeft} label="Previous week" size="sm" onClick={why(atThis && 'Earlier weeks are in Compliance', () => live.onWeek(me.thisWeek))} />
      <strong>Week of {weekText}</strong>
      <IconButton icon={ChevronRight} label="Next week" size="sm" onClick={why(!atThis && 'Plans open one week ahead', () => live.onWeek(me.nextWeek))} />
      <span className="yx-tim-muted">{atThis ? 'This week · earlier weeks are in Compliance' : 'Plans open one week ahead'}</span>
    </div>
  );
  const mine = rows.find((r) => r.employeeId === null);
  const teamRows = rows.filter((r) => r.employeeId !== null);
  const days = rows[0]?.days ?? me?.days ?? [];
  const inOffice = (on: string) => rows.filter((r) => { const d = r.days.find((x) => x.on === on); return d && placeOf(r, d) === 'office'; }).length;
  const othersIn = (j: number) => {
    const on = days[j]?.on;
    return days[j]?.anchor ? 'Everyone (anchor day)' : me?.colleagues.find((c) => c.on === on)?.names.join(', ') || 'No one else';
  };
  const empView = !mgr;
  const teamState = mgr ? live.team : undefined;

  const planTab = !me ? null : !canPlan && !mgr ? (
    <EmptyState title="You have no employee record here" description="Office days are planned by employees. Ask HR to link your login to your employee record." />
  ) : empView && rule && !rule.officeDays ? (
    <EmptyState title="No office-day rule for you" description="Your company has not set office days for your group, so there is nothing to plan. HR sets this in the hybrid policy." />
  ) : (
    <div className="yx-tim-stack">
      {weekBar}
      <p className="yx-tim-muted">{empView ? 'Pick Home or Office for each day.' : 'Click a day to switch it between Home and Office.'} {anchorHint}</p>
      {empView && mine && <p className="yx-tim-row"><strong>You: {officeCount(mine)} of {mine.rule.officeDays} office days</strong>{shortOf(mine) > 0 && <Badge tone="warning">Short by {shortOf(mine)}</Badge>}</p>}
      <LiveGate state={teamState?.state ?? 'ready'} onRetry={teamState?.onRetry} what="your team's plan">
        {!rows.length ? (
          <EmptyState title="No one to plan" description="No one in your team has an office-day rule this week." />
        ) : narrow ? (
          <ul className="yx-tim-list">
            {empView && mine
              ? mine.days.map((d, j) => (
                  <li key={d.on}>
                    <span className="yx-tim-list__main">
                      <strong>{WD5[j]} · {dateText(d.on)}</strong>
                      <DayChoice day={d} place={placeOf(mine, d)} label={dateText(d.on)} onChange={(p) => setDay(mine, d.on, p)} />
                      <span className="yx-tim-muted">{d.anchor ? 'Everyone is in' : `Also in: ${othersIn(j)}`}</span>
                    </span>
                  </li>
                ))
              : rows.map((r) => (
                  <li key={key(r)}>
                    <span className="yx-tim-list__main">
                      <span className="yx-tim-row"><strong>{r.name}</strong>{vsTarget(r)}</span>
                      {r.rule.officeDays > 0 && (
                        <span className="yx-tim-row">
                          {r.days.map((d, j) => !d.anchor && (d.closed ? null : (
                            <Button key={d.on} size="sm" aria-label={`${r.name}, ${dateText(d.on)}: ${placeOf(r, d) === 'office' ? 'Office' : placeOf(r, d) === 'home' ? 'Home' : 'not planned'}. Change to ${placeOf(r, d) === 'office' ? 'home' : 'office'}`} onClick={() => setDay(r, d.on, placeOf(r, d) === 'office' ? 'home' : 'office')}>
                              {WD5[j]} · {placeOf(r, d) === 'office' ? 'Office' : placeOf(r, d) === 'home' ? 'Home' : 'Not set'}
                            </Button>
                          )))}
                        </span>
                      )}
                    </span>
                  </li>
                ))}
          </ul>
        ) : (
          <div className="yx-tim-muster" tabIndex={0} role="region" aria-label="Office-day plan">
            <table aria-label={`Office-day plan, week of ${weekText}`}>
              <thead><tr>{!empView && <th scope="col">Person</th>}{days.map((d) => <th key={d.on} scope="col"><DayHead on={d.on} /></th>)}{!empView && <th scope="col">Office days</th>}</tr></thead>
              <tbody>
                {(empView ? (mine ? [mine] : []) : rows).map((r) => (
                  <tr key={key(r)}>
                    {!empView && <th scope="row">{r.name}</th>}
                    {r.days.map((d) => {
                      const p = placeOf(r, d);
                      return (
                        <td key={d.on}>
                          {!r.rule.officeDays ? <span className="yx-tim-muted">—</span>
                            : d.anchor ? <Badge tone="info"><Icon icon={Lock} size="sm" /> Anchor</Badge>
                            : d.closed ? <Badge tone="neutral">{closedText(d)}</Badge>
                            : empView ? <DayChoice day={d} place={p} label={dateText(d.on)} onChange={(x) => setDay(r, d.on, x)} />
                            : <Button size="sm" aria-label={`${r.name}, ${dateText(d.on)}: ${p === 'office' ? 'Office' : p === 'home' ? 'Home' : 'not planned'}. Change to ${p === 'office' ? 'home' : 'office'}`} onClick={() => setDay(r, d.on, p === 'office' ? 'home' : 'office')}>{p === 'office' ? 'Office' : p === 'home' ? 'Home' : 'Not set'}</Button>}
                        </td>
                      );
                    })}
                    {!empView && <td className="yx-tim-muster__total">{vsTarget(r)}</td>}
                  </tr>
                ))}
              </tbody>
              {!empView && (
                <tfoot>
                  <tr><th scope="row">In office</th>{days.map((d) => <td key={d.on} className="yx-tim-muster__total">{inOffice(d.on)} of {rows.length}</td>)}<td /></tr>
                </tfoot>
              )}
            </table>
          </div>
        )}
      </LiveGate>
      {empView && !narrow && mine && (
        <Card title="Who else is in">
          <ul className="yx-tim-days">
            {mine.days.map((d, j) => <li key={d.on}><span>{dateText(d.on)}</span><span>{othersIn(j)}</span></li>)}
          </ul>
        </Card>
      )}
      {rows.length > 0 && (
        <span className="yx-tim-row">
          <Button variant="primary" loading={busy === 'save'} onClick={why(!changedRows.length && 'No changes yet: pick office days first', () => void savePlan())}>Save plan</Button>
          {!changedRows.length && <span className="yx-tim-muted">No changes yet</span>}
        </span>
      )}
    </div>
  );

  // ---------------------------------------------------------------- compliance
  const comp = live.compliance;
  const complianceTab = comp && (
    <LiveGate state={comp.state} onRetry={comp.onRetry} what="office-day compliance">
      {comp.data && (
        <Card title={`Week of ${dateText(comp.data.week)}`}>
          {comp.data.people.length ? (
            <ul className="yx-tim-list">
              {comp.data.people.map((r) => {
                const fact = r.noRule ? 'No office-day rule' : `${plural(r.office, 'office day')}${r.leave ? ` + ${r.leave} leave` : ''}${r.missed.length ? ` · planned but not in: ${r.missed.map((m) => WD5[(localDay(m).getDay() + 6) % 7]).join(', ')}` : ''}`;
                return (
                  <li key={r.employeeId}>
                    <PersonLabel name={r.name} secondary={fact} />
                    {r.noRule ? <Badge tone="neutral">No rule</Badge> : r.met ? <Badge tone="success">Met</Badge> : (
                      <span className="yx-tim-row">
                        <Badge tone="warning">{r.counted} of {r.target}</Badge>
                        {/* The week is over, so the reminder is about planning next week. */}
                        {me && remind(r.employeeId, r.name, me.nextWeek, 'Remind about next week')}
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          ) : (
            <EmptyState compact title="No one to show" description="No one in your reach was employed that week." />
          )}
          <p className="yx-tim-note">Office days count with {rule?.evidence.length ? rule.evidence.map((e) => EVIDENCE.find((x) => x.id === e)!.label.toLowerCase()).join(', ') : 'the evidence the policy names'}. Leave days count as office days.</p>
        </Card>
      )}
    </LiveGate>
  );

  // ---------------------------------------------------------------- policy (HR)
  const pol = live.policy;
  const groups = pol?.data?.groups ?? [];
  const valuesOf = (g: HybridPolicyGroup) => ({ days: g.applies.officeDays, anchors: g.applies.anchors, evidence: g.applies.evidence });
  const [groupKey, setGroupKey] = useState<string | null>(null);
  const gk = (g: HybridPolicyGroup) => `${g.scopeType}:${g.scopeId ?? ''}`;
  const group = groups.find((g) => gk(g) === groupKey) ?? groups[0];
  const [draft, setDraft] = useState<{ days: number; anchors: number[]; evidence: HybridEvidence[] } | null>(null);
  const [daysErr, setDaysErr] = useState<string | null>(null);
  const [switchTo, setSwitchTo] = useState<string | null>(null);
  useEffect(() => {
    if (group) setDraft(valuesOf(group));
    setDaysErr(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [group && gk(group), pol?.data]);
  const saved = group ? valuesOf(group) : null;
  const dirty = !!draft && !!saved && (draft.days !== saved.days || draft.anchors.join() !== saved.anchors.join() || [...draft.evidence].sort().join() !== [...saved.evidence].sort().join());
  const hasOwn = (g: HybridPolicyGroup) => g.own.officeDays !== null || g.own.anchors !== null || g.own.evidence !== null;
  const daysError = !draft ? null : draft.days > 5 ? 'At most 5 days' : draft.days > 0 && draft.days < draft.anchors.length ? `At least ${draft.anchors.length}, the number of anchor days` : null;
  const policyText = (g: HybridPolicyGroup) => {
    const r = g.applies;
    return r.officeDays ? `${g.label} · ${r.officeDays} office days a week · ${r.anchors.length ? `anchor days ${dayList(r.anchors)}` : 'no anchor days'} · not linked to pay or ratings` : `${g.label} · no office-day rule`;
  };
  const savePolicy = async () => {
    if (!group || !draft) return;
    setBusy('policy');
    try {
      await live.onPolicy({ scopeType: group.scopeType, scopeId: group.scopeId }, { officeDays: String(draft.days), anchors: draft.anchors.map((i) => ANCHOR_KEYS[i]).join(','), evidence: EVIDENCE.filter((e) => draft.evidence.includes(e.id)).map((e) => e.id).join(',') });
      done('Policy saved', draft.days ? `Applies from now to ${group.label}. Evidence: ${EVIDENCE.filter((e) => draft.evidence.includes(e.id)).map((e) => e.label.toLowerCase()).join(', ')}.` : `${group.label} now has no office-day rule.`);
    } catch (e) {
      fail(e);
    } finally {
      setBusy(null);
    }
  };
  const policyForm = pol && (
    <LiveGate state={pol.state} onRetry={pol.onRetry} what="the hybrid policy">
      {group && draft && (
        <div className="yx-tim-form">
          <FormField label="Policy for" helper={hasOwn(group) ? undefined : 'This group has no policy of its own yet: it follows the one above it. Save to add one.'}>
            <Select value={gk(group)} onChange={(v) => v && v !== gk(group) && (dirty ? setSwitchTo(v) : setGroupKey(v))} options={groups.map((g) => ({ value: gk(g), label: `${g.label}${hasOwn(g) ? '' : ' · no policy yet'}` }))} />
          </FormField>
          <FormField label="Office days per week" helper="0: no office-day rule" error={daysErr}>
            <NumberField value={draft.days} min={0} max={5} onChange={(v) => { setDraft({ ...draft, days: v ?? 0 }); setDaysErr(null); }} />
          </FormField>
          <FormField label="Anchor days" helper="Everyone is in the office on these days">
            <div className="yx-tim-row">{WD5.map((d, i) => <Checkbox key={d} label={d} checked={draft.anchors.includes(i)} onChange={(c) => { setDraft({ ...draft, anchors: c ? [...draft.anchors, i].sort((x, y) => x - y) : draft.anchors.filter((x) => x !== i) }); setDaysErr(null); }} />)}</div>
          </FormField>
          <FormField label="Evidence" helper="What counts as a day in the office">
            <div className="yx-tim-stack">
              {EVIDENCE.map((e) => <Checkbox key={e.id} label={e.label} checked={draft.evidence.includes(e.id)} onChange={(c) => setDraft({ ...draft, evidence: c ? [...draft.evidence, e.id] : draft.evidence.filter((x) => x !== e.id) })} />)}
            </div>
          </FormField>
          <FormField label="Pay and ratings">
            <span className="yx-tim-muted">Missed office days don't affect pay or ratings.</span>
          </FormField>
          <span className="yx-tim-row">
            <Button
              variant="primary"
              loading={busy === 'policy'}
              onClick={why(!dirty ? 'No changes yet' : !draft.evidence.length && 'Pick at least one kind of evidence', () => {
                if (daysError) {
                  setDaysErr(daysError);
                  document.querySelector<HTMLInputElement>('.yx-tim-form input[inputmode]')?.focus();
                  return;
                }
                void savePolicy();
              })}
            >
              Save policy
            </Button>
            {!dirty ? <span className="yx-tim-muted">No changes yet</span> : !draft.evidence.length ? <span className="yx-tim-muted">Pick at least one kind of evidence</span> : null}
          </span>
          <ConfirmDialog
            open={!!switchTo}
            onOpenChange={(o) => !o && setSwitchTo(null)}
            title={`Discard your changes to the ${group.label} policy?`}
            consequence={switchTo ? `You haven't saved them. ${groups.find((g) => gk(g) === switchTo)?.label} opens with its own policy.` : undefined}
            confirmLabel="Discard and switch"
            onConfirm={() => { if (switchTo) setGroupKey(switchTo); setSwitchTo(null); }}
          />
        </div>
      )}
    </LiveGate>
  );

  // ---------------------------------------------------------------- page
  const tabs = [
    ...(canPlan || mgr ? [{ value: 'plan', label: 'Plan week', body: planTab }] : []),
    ...(me?.can.compliance && complianceTab ? [{ value: 'compliance', label: 'Compliance', body: complianceTab }] : []),
    ...(me?.can.policy && policyForm ? [{ value: 'policy', label: 'Policy', body: policyForm }] : []),
  ];
  const onlyPolicy = tabs.length === 1 && tabs[0].value === 'policy';
  // The design's "Office days · <team>": a manager plans their team; HR (compliance without a team) sees everyone in reach.
  const wide = !mgr && !!me?.can.compliance;
  const title = onlyPolicy ? 'Hybrid policy' : mgr ? 'Office days · Your team' : wide ? `Office days · ${me?.can.everyone ? 'Everyone' : 'The people you see'}` : 'My office days';
  const ruleText = (r: HybridRule) => `${plural(r.officeDays, 'office day')} a week${r.anchors.length ? ` · anchor ${r.anchors.length === 1 ? 'day' : 'days'} ${dayList(r.anchors)}` : ''}`;
  const company = live.policy?.data?.groups.find((g) => g.scopeType === 'tenant');
  const groupRules = live.policy?.data?.groups.filter((g) => g.scopeType !== 'tenant' && g.own.officeDays !== null).length ?? 0;
  const description = onlyPolicy
    ? group ? `Policy: ${policyText(group)}` : 'Office days per group'
    : wide && company?.applies.officeDays ? `Whole company · ${ruleText(company.applies)}`
    : wide && groupRules ? `Office-day rules for ${plural(groupRules, 'group')} · see the Policy tab`
    : rule?.officeDays ? ruleText(rule) : 'No office-day rule yet. HR sets one on the Policy tab.';
  return (
    <TimePage active={mgr || wide || onlyPolicy ? 'Office days' : 'My office days'}>
      <PageHeader title={title} description={me ? description : undefined} />
      <LiveGate state={live.me.state} onRetry={live.me.onRetry} what="your office days">
        {me && (tabs.length > 1 ? (
          <Tabs defaultValue={tabs[0].value}>
            <TabsList aria-label="Hybrid">{tabs.map((t) => <TabsTrigger key={t.value} value={t.value}>{t.label}</TabsTrigger>)}</TabsList>
            {tabs.map((t) => <TabsContent key={t.value} value={t.value}>{t.body}</TabsContent>)}
          </Tabs>
        ) : tabs.length ? tabs[0].body : (
          <EmptyState title="You have no employee record here" description="Office days are planned by employees. Ask HR to link your login to your employee record." />
        ))}
      </LiveGate>
    </TimePage>
  );
}
