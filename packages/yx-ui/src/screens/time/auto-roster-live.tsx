// TIM-34 · Auto-roster, live: the designed AutoRosterScreen (roster.tsx) with the API's demand, run result and draft.
// Same header, tabs (Demand, Coverage and draft, Rules), coverage chips, "Why slots are unfilled" card, Explain drawer,
// approve and publish. The demand table edits the location's people needed per shift and weekday; "Run again" saves
// changed demand first, then generates. Publish is the roster's own publish (every rule is checked again there).
import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Play, Send } from 'lucide-react';
import { Button, IconButton } from '../../components/button';
import { Badge } from '../../components/display';
import { Drawer } from '../../components/drawer';
import { EmptyState, ErrorState, InlineAlert, NoAccessState } from '../../components/feedback';
import { useToast } from '../../components/notify';
import { ConfirmDialog } from '../../components/overlay';
import { Card, PageHeader, Tabs, TabsContent, TabsList, TabsTrigger } from '../../components/shell';
import { DataTable, type TableColumn } from '../../components/table';
import { Select } from '../../components/select';
import { RosterGrid, type RosterPerson, type RosterValue, type Shift } from '../../components/roster';
import { formatDate } from '../../lib/format';
import { errorText } from '../org/org-kit';
import { LoadingBlock } from './attendance';
import { Kpis, TimePage } from './time-kit';
import { fmt12 } from './time-logic';
import { FactList, Legend } from './roster';
import type { LoadState } from './live/types';

export interface AutoRosterShift { id: string; code: string; name: string; colour: string; night: boolean; start: number | null; end: number | null }
export interface AutoRosterSkip { employeeId: string; name: string; kind: string; why: string }
export interface AutoRosterSlot {
  on: string;
  weekday: string;
  shiftId: string;
  code: string;
  name: string;
  start: number;
  end: number;
  night: boolean;
  need: number;
  /** Already on the shift before the run (published, drafts, pattern). */
  had: number;
  got: number;
  placed: { employeeId: string; name: string }[];
  /** For a slot still short: who was tried and why each was skipped. */
  skipped: AutoRosterSkip[];
  reasons: { kind: string; label: string; count: number }[];
  noCandidates: boolean;
  closed: 'past' | 'no_times' | null;
}
export interface AutoRosterResult {
  week: string;
  to: string;
  location: { id: string; name: string };
  generatedAt: string;
  people: number;
  capped: { total: number; used: number } | null;
  placed: number;
  coverage: { required: number; filled: number; unfilled: number; shortSlots: number; overSlots: number };
  nights: { min: number; max: number; most: string } | null;
  slots: AutoRosterSlot[];
}
export interface AutoRosterData {
  today: string;
  week: string;
  to: string;
  maxPeople: number;
  locations: { id: string; name: string }[];
  location: { id: string; name: string };
  shifts: AutoRosterShift[];
  demand: { shiftId: string; weekday: number; need: number }[];
  people: { count: number; used: number };
  rules: { minRestHours: number; maxDailyHours: number; maxWeeklyHours: number; maxSpreadOverHours: number; minWeeklyOffs: number } | null;
  /** Unpublished draft days in the week for the people shown. */
  drafts: number;
  draft: { id: string; name: string; code: string | null; days: (string | null)[] }[];
  run: { id: string; status: 'running' | 'done' | 'failed'; startedAt: string; finishedAt: string | null; error: string | null; result: AutoRosterResult | null } | null;
}
export interface LiveAutoRoster {
  state: LoadState;
  data: AutoRosterData | null;
  week: string;
  onWeek: (week: string) => void;
  onLocation: (locationId: string) => void;
  onRetry?: () => void;
  onDemand: (locationId: string, rows: { shiftId: string; weekday: number; need: number }[]) => Promise<unknown>;
  onGenerate: (locationId: string, week: string) => Promise<unknown>;
  onPublish: (week: string) => Promise<unknown>;
  /** Where "Offer as open shift" goes (TIM-35). */
  openShiftsHref?: string;
}

const WD = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const COLOUR_NUMBER: Record<string, number> = { blue: 1, green: 2, teal: 3, purple: 4, orange: 5, pink: 6, grey: 7, red: 8 };
const localDate = (iso: string) => new Date(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10)));
const isoOf = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const plusDays = (iso: string, n: number) => { const d = localDate(iso); return isoOf(new Date(d.getFullYear(), d.getMonth(), d.getDate() + n)); };
const hhmm = (m: number) => `${String(Math.floor((m % 1440) / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
const timesText = (start: number, end: number) => `${fmt12(hhmm(start))} – ${fmt12(hhmm(end))}`.replace(/:00/g, '');
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const key = (shiftId: string, weekday: number) => `${shiftId}|${weekday}`;

export function LiveAutoRosterScreen({ live: p }: { live: LiveAutoRoster }) {
  const d = p.data;
  const { toast } = useToast();
  const why = (msg: string | false | null | undefined, go: () => void) => () => (msg ? toast({ title: msg, tone: 'warning' }) : go());
  const [tab, setTab] = useState<string | null>(null);
  const [explain, setExplain] = useState<string | null>(null);
  const [approvedRun, setApprovedRun] = useState<string | null>(null);
  const [publishedRun, setPublishedRun] = useState<string | null>(null);
  const [pub, setPub] = useState(false);
  const [rerun, setRerun] = useState(false);
  const [busy, setBusy] = useState<'generate' | 'demand' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [edits, setEdits] = useState<Record<string, number>>({});
  const [missingDemand, setMissingDemand] = useState(false);

  const saved = useMemo(() => new Map((d?.demand ?? []).map((x) => [key(x.shiftId, x.weekday), x.need])), [d]);
  const needOf = (shiftId: string, wd: number) => edits[key(shiftId, wd)] ?? saved.get(key(shiftId, wd)) ?? 0;
  const changedRows = Object.entries(edits).filter(([k, n]) => (saved.get(k) ?? 0) !== n).map(([k, need]) => ({ shiftId: k.split('|')[0], weekday: Number(k.split('|')[1]), need }));
  const demandChanged = changedRows.length > 0;
  const setUp = (d?.demand.length ?? 0) > 0 || Object.values(edits).some((n) => n > 0);
  const run = d?.run ?? null;
  const result = run?.status === 'done' ? run.result : null;
  const running = busy === 'generate' || run?.status === 'running';
  const approved = !!result && approvedRun === run?.id;
  const published = !!result && publishedRun === run?.id;
  const activeTab = tab ?? (!d?.demand.length ? 'demand' : 'draft');

  if (p.state === 'no-access') return <TimePage active="Roster"><PageHeader title="Auto-roster" /><NoAccessState what="the auto-roster" grantedBy="HR" /></TimePage>;
  if (p.state === 'error') return <TimePage active="Roster"><PageHeader title="Auto-roster" /><ErrorState title="The auto-roster didn't load" description="Check your connection and try again. Nothing has changed." onRetry={p.onRetry} /></TimePage>;
  if (p.state === 'loading' || !d) return <TimePage active="Roster"><PageHeader title="Auto-roster" /><LoadingBlock rows={8} /></TimePage>;

  const start = localDate(d.week);
  const shifts = d.shifts.filter((s) => s.start !== null && s.end !== null);
  const shiftName = new Map(d.shifts.map((s) => [s.id, s.name]));
  const slots = result?.slots ?? [];
  const short = slots.filter((s) => s.got < s.need);
  const open = slots.find((s) => `${s.on}|${s.shiftId}` === explain) ?? null;
  const demanded = shifts.filter((s) => slots.some((x) => x.shiftId === s.id));
  const totalNeed = shifts.reduce((n, s) => n + WD.reduce((m, _, i) => m + needOf(s.id, i + 1), 0), 0);
  const slotName = (s: AutoRosterSlot) => `${s.name} · ${formatDate(localDate(s.on))}`;

  const saveDemand = async () => {
    if (!changedRows.length) return true;
    setBusy('demand');
    setError(null);
    try {
      await p.onDemand(d.location.id, changedRows);
      setEdits({});
      return true;
    } catch (e) {
      setError(errorText(e));
      return false;
    } finally {
      setBusy(null);
    }
  };
  const generate = async () => {
    if (!setUp) {
      setTab('demand');
      setMissingDemand(true);
      window.setTimeout(() => document.querySelector<HTMLInputElement>('.yx-tim-numcell')?.focus(), 0);
      return;
    }
    if (!(await saveDemand())) return;
    setBusy('generate');
    setError(null);
    try {
      await p.onGenerate(d.location.id, d.week);
      setTab('draft');
      toast({ title: 'Draft generated', description: 'Review the coverage, then approve and publish it.', tone: 'success' });
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(null);
    }
  };
  const runAgain = () => (approved ? setRerun(true) : void generate());
  const blocked = running ? 'Wait for the run to finish' : published ? 'Published · change it on the roster' : '';
  const approveBlocked = running ? 'Wait for the run to finish' : !result ? 'Generate the draft first' : demandChanged ? 'Run again to use the new demand' : '';
  const offer = (s: AutoRosterSlot) => (p.openShiftsHref && !s.closed ? <Button size="sm" asChild><a href={p.openShiftsHref}>Offer as open shift</a></Button> : null);
  const lastRun = run ? `run ${formatDate(new Date(run.startedAt))}, ${new Date(run.startedAt).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true }).toLowerCase()}` : 'not run yet';

  const covCols: TableColumn<AutoRosterShift>[] = [
    { key: 'slot', header: 'Slot', width: 140, value: (s) => s.name, render: (s) => <span className="yx-tim-list__main" style={{ flex: 'none' }}><strong>{s.name}</strong><span className="yx-tim-muted">{timesText(s.start!, s.end!)}</span></span> },
    ...WD.map((w, i): TableColumn<AutoRosterShift> => ({
      key: w,
      header: w,
      width: 84,
      value: (s) => { const x = slots.find((y) => y.shiftId === s.id && y.on === plusDays(d.week, i)); return x ? `${x.got}/${x.need}` : ''; },
      render: (s) => {
        const x = slots.find((y) => y.shiftId === s.id && y.on === plusDays(d.week, i));
        if (!x) return <span className="yx-tim-muted" aria-label={`${s.name} ${w}: no demand`}>–</span>;
        const st = x.got < x.need ? 'short' : x.got > x.need ? 'over' : 'ok';
        const label = `${s.name} ${w}: ${x.got} of ${x.need}${st === 'short' ? ', short' : st === 'over' ? ', over-staffed' : ''}`;
        return st === 'short' ? (
          <button type="button" className="yx-tim-cov" data-state={st} style={{ border: 0, font: 'inherit', fontWeight: 'var(--yx-weight-medium)', cursor: 'pointer' }} onClick={() => setExplain(`${x.on}|${x.shiftId}`)} aria-label={`${label}. Explain`}>{x.got}/{x.need}</button>
        ) : <span className="yx-tim-cov" data-state={st} aria-label={label}>{x.got}/{x.need}</span>;
      },
    })),
  ];
  const gridShifts: Shift[] = [...shifts.map((s) => ({ code: s.code, name: s.name, start: hhmm(s.start!), end: hhmm(s.end!), hours: Math.round((((s.end! - s.start! + 1440) % 1440) / 60) * 10) / 10, color: COLOUR_NUMBER[s.colour] ?? 1 })), { code: 'OFF', name: 'Weekly off', hours: 0 }];
  const gridPeople: RosterPerson[] = d.draft.map((x) => ({ id: x.id, name: x.name, role: x.code ?? undefined }));
  const gridValue: RosterValue = Object.fromEntries(d.draft.map((x) => [x.id, x.days]));
  const summary = (s: AutoRosterSlot) =>
    s.closed === 'past' ? 'This day has passed, so it was not filled.' : s.closed === 'no_times' ? `${s.name} has no times on this day.` : s.noCandidates ? 'No one you plan works at this location that day.' : `${plural(s.need - s.got, 'person', 'people')} short. ${s.reasons.map((r) => `${r.label}: ${r.count}`).join(' · ')}.`;

  return (
    <TimePage active="Roster">
      <PageHeader
        title={`Auto-roster · ${d.location.name}`}
        description={`Week of ${formatDate(start)} · ${plural(d.people.count, 'person', 'people')} you plan · ${lastRun}`}
        // The location picker (HR with several places) sits under the subtitle, so the actions stay one row level with the title, as designed.
        facts={d.locations.length > 1 ? <Select className="yx-tim-place" aria-label="Location" size="sm" value={d.location.id} onChange={(v) => v && p.onLocation(v)} options={d.locations.map((l) => ({ value: l.id, label: l.name }))} /> : undefined}
        status={running ? <Badge tone="neutral">Generating</Badge> : !setUp ? <Badge tone="neutral">Not set up</Badge> : run?.status === 'failed' ? <Badge tone="danger">Failed</Badge> : !result ? <Badge tone="neutral">Not generated</Badge> : <Badge tone={published || approved ? 'success' : 'warning'}>{published ? 'Published' : approved ? 'Approved · ready to publish' : 'Draft'}</Badge>}
        actions={
          <div className="yx-tim-row">
            <IconButton icon={ChevronLeft} label="Previous week" size="sm" onClick={() => p.onWeek(plusDays(p.week, -7))} />
            <IconButton icon={ChevronRight} label="Next week" size="sm" onClick={() => p.onWeek(plusDays(p.week, 7))} />
            {(blocked || (result && approveBlocked)) && <span className="yx-tim-muted">{blocked || approveBlocked}</span>}
            <Button icon={Play} loading={busy === 'generate'} onClick={why(blocked, runAgain)}>{run ? 'Run again' : 'Generate'}</Button>
            {result && !published && (approved
              ? <Button variant="primary" icon={Send} onClick={why(approveBlocked, () => setPub(true))}>Publish roster</Button>
              : <Button variant="approve" onClick={why(approveBlocked, () => { setApprovedRun(run!.id); toast({ title: 'Draft approved', description: 'Publish it to tell the people.', tone: 'success' }); })}>Approve draft</Button>)}
          </div>
        }
      />
      {error && <InlineAlert tone="danger" title="That didn't work">{error}</InlineAlert>}
      {published && (
        <InlineAlert tone="info" title="Published · the people are told" actions={p.openShiftsHref ? <Button size="sm" asChild><a href={p.openShiftsHref}>Open open shifts</a></Button> : undefined}>
          {short.length ? `Still short: ${short.map(slotName).join(', ')}. Offer them as open shifts.` : 'Every slot is covered.'}
        </InlineAlert>
      )}
      {running ? (
        <div className="yx-tim-stack" aria-live="polite">
          <p>Generating the roster for {plural(d.people.used, 'person', 'people')} and {plural(totalNeed, 'slot')}…</p>
          <LoadingBlock rows={6} />
          {busy !== 'generate' && <span className="yx-tim-row"><span className="yx-tim-muted">Another planner started this run.</span><Button size="sm" onClick={p.onRetry}>Check again</Button></span>}
        </div>
      ) : (
        <Tabs value={activeTab} onValueChange={setTab}>
          <TabsList aria-label="Auto-roster">
            <TabsTrigger value="demand">Demand</TabsTrigger>
            <TabsTrigger value="draft">Coverage and draft</TabsTrigger>
            <TabsTrigger value="rules">Rules</TabsTrigger>
          </TabsList>
          <TabsContent value="demand">
            <div className="yx-tim-stack">
              <p className="yx-tim-muted">People needed for each shift, each weekday, at {d.location.name}. Change a number, then save it or use Run again at the top.</p>
              {missingDemand && !setUp && <InlineAlert tone="warning" title="Set the people needed first">Enter how many people each shift needs on at least one day.</InlineAlert>}
              {shifts.length ? (
                <div className="yx-tim-muster" tabIndex={0} role="region" aria-label="Staffing demand table">
                  <table aria-label="Staffing demand">
                    <thead><tr><th scope="col">Slot</th><th scope="col">Times</th>{WD.map((w) => <th key={w} scope="col">{w}</th>)}</tr></thead>
                    <tbody>
                      {shifts.map((s) => (
                        <tr key={s.id}>
                          <th scope="row">{s.name}</th><td className="yx-tim-muster__total">{timesText(s.start!, s.end!)}</td>
                          {WD.map((w, i) => (
                            <td key={w} style={{ padding: 'var(--yx-space-1)' }}>
                              <input
                                className="yx-tim-numcell"
                                type="number"
                                min={0}
                                max={500}
                                value={needOf(s.id, i + 1)}
                                style={{ border: 'var(--yx-border-width) solid var(--yx-color-border-strong)', borderRadius: 'var(--yx-radius-control)', background: 'var(--yx-color-bg-surface)' }}
                                onChange={(e) => setEdits({ ...edits, [key(s.id, i + 1)]: Math.min(500, Math.max(0, Math.floor(Number(e.target.value) || 0))) })}
                                aria-label={`${s.name} ${w}`}
                              />
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <EmptyState title="No shifts yet" description="HR sets up shifts first (Time › Shifts). Then set the people each shift needs here." />
              )}
              <div className="yx-tim-row">
                <Button loading={busy === 'demand'} onClick={why(!demandChanged && 'Nothing changed', () => void saveDemand().then((ok) => ok && toast({ title: 'Demand saved', tone: 'success' })))}>Save demand</Button>
                {demandChanged && <span className="yx-tim-muted">Changed · save it, or use Run again at the top to save and use it</span>}
              </div>
            </div>
          </TabsContent>
          <TabsContent value="draft">
            <div className="yx-tim-stack">
              {!setUp ? (
                <EmptyState title="No demand yet" description="Set how many people each shift needs, then generate the week's draft." action={<Button onClick={() => setTab('demand')}>Set demand</Button>} />
              ) : run?.status === 'failed' ? (
                <InlineAlert tone="danger" title="The last run did not finish" actions={<Button size="sm" onClick={why(blocked, runAgain)}>Run again</Button>}>{run.error ?? 'Nothing was saved. Try again.'}</InlineAlert>
              ) : !result ? (
                <EmptyState title="No draft for this week yet" description="Generate fills the empty days of the people you plan to meet the demand, as a draft only you see." action={<Button icon={Play} onClick={why(blocked, runAgain)}>Generate</Button>} />
              ) : (
                <>
                  <Kpis items={[{ label: 'Slots filled', value: `${result.coverage.filled} of ${result.coverage.required}` }, { label: 'Unfilled', value: result.coverage.unfilled }, ...(result.coverage.overSlots ? [{ label: 'Over-staffed', value: result.coverage.overSlots }] : []), { label: 'New drafts', value: result.placed }, ...(result.nights ? [{ label: 'Nights per person', value: `${result.nights.min}–${result.nights.max}`, note: `Most: ${result.nights.most} (${result.nights.max})` }] : [])]} />
                  {result.capped && <InlineAlert tone="warning" title={`Only the first ${result.capped.used} of ${result.capped.total} people were planned`}>A run plans at most {result.capped.used} people at once (by employee code). Plan the rest on the roster.</InlineAlert>}
                  <DataTable label="Coverage: filled of required" toolbar={<strong>Coverage: filled of required</strong>} columns={covCols} rows={demanded} getRowId={(s) => s.id} />
                  {short.length > 0 && (
                    <Card title="Why slots are unfilled">
                      <ul className="yx-tim-list">
                        {short.map((s) => (
                          <li key={`${s.on}|${s.shiftId}`}>
                            <span className="yx-tim-list__main">
                              <strong>{formatDate(localDate(s.on))} · {s.name} · {s.need - s.got} short</strong>
                              <span className="yx-tim-note">{s.weekday}</span>
                              <span className="yx-tim-muted">{summary(s)}</span>
                            </span>
                            <span className="yx-tim-row">
                              <Button size="sm" onClick={() => setExplain(`${s.on}|${s.shiftId}`)}>Explain</Button>
                              {offer(s)}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </Card>
                  )}
                  <p className="yx-tim-muted">{published ? 'Published roster' : approved ? 'Approved draft' : 'Draft'} for the people you plan at {d.location.name}{d.drafts ? ` · ${plural(d.drafts, 'draft day')} not yet published` : ''}. Coverage counts the people you plan; it shows the run of {formatDate(new Date(result.generatedAt))}.</p>
                </>
              )}
              {gridPeople.length > 0 && <RosterGrid key={JSON.stringify(gridValue)} people={gridPeople} start={start} shifts={gridShifts} defaultValue={gridValue} status={published ? 'published' : 'draft'} hideStatus readOnly today={localDate(d.today)} />}
              {gridPeople.length > 0 && <Legend shifts={gridShifts} />}
              {gridPeople.length > 0 && <p className="yx-tim-note">Empty cells follow the person’s shift pattern or the location’s usual shift.</p>}
            </div>
          </TabsContent>
          <TabsContent value="rules">
            <Card title="Hard constraints (never broken)">
              <ul className="yx-tim-check">
                {[
                  'Only the empty days of the people you plan; never over a draft or a published day',
                  'Approved and waiting leave, holidays, locked months',
                  `Minimum rest ${d.rules?.minRestHours ?? 11} h between shifts; one shift at a time`,
                  `At most ${d.rules?.maxDailyHours ?? 9} h a day, ${d.rules?.maxWeeklyHours ?? 48} h a week, spread over ${d.rules?.maxSpreadOverHours ?? 10.5} h`,
                  `At least ${plural(d.rules?.minWeeklyOffs ?? 1, 'weekly off')} a week`,
                  "Women's night-work consent and safeguards (law)",
                  'Required licences valid on the day',
                ].map((t) => <li key={t}><span>{t}</span><Badge tone="neutral">Hard</Badge></li>)}
              </ul>
            </Card>
            <Card title="Fair order">
              <ul className="yx-tim-check">
                <li><span>Fewest scheduled hours that week first</span><Badge tone="info">1st</Badge></li>
                <li><span>Then fewest nights that week</span><Badge tone="info">2nd</Badge></li>
                <li><span>Then employee code</span><Badge tone="info">3rd</Badge></li>
              </ul>
            </Card>
          </TabsContent>
        </Tabs>
      )}
      <Drawer open={!!open} onOpenChange={(o) => !o && setExplain(null)} title={open ? `${open.name} · ${formatDate(localDate(open.on))}` : ''} subtitle={open ? `${open.weekday} · ${open.got} of ${open.need} filled` : undefined}>
        {open && (
          <div className="yx-tim-stack">
            <p>{summary(open)}</p>
            {open.placed.length > 0 && <p className="yx-tim-muted">Placed by this run: {open.placed.map((x) => x.name).join(', ')}.</p>}
            {open.reasons.length > 0 && <FactList rows={open.reasons.map((r) => [plural(r.count, 'person', 'people'), r.label])} />}
            {open.skipped.length > 0 && (
              <>
                <p>Checked:</p>
                <FactList rows={open.skipped.map((x) => [x.name, x.why])} />
              </>
            )}
            {offer(open) && <span className="yx-tim-row">{offer(open)}</span>}
          </div>
        )}
      </Drawer>
      <ConfirmDialog
        open={pub}
        onOpenChange={setPub}
        title={`Publish the roster for ${formatDate(start)} – ${formatDate(localDate(d.to))}?`}
        consequence={`Publishes all your drafts for this week and next, also ones you made on the roster. Every rule is checked again, and the people are told.${short.length ? ` ${plural(short.length, 'slot')} stay short; offer them as open shifts.` : ''}`}
        confirmLabel="Publish roster"
        onConfirm={async () => {
          setError(null);
          try {
            await p.onPublish(d.week);
            setPublishedRun(run!.id);
            toast({ title: 'Roster published', description: 'The people are told.', tone: 'success' });
          } catch (e) {
            // The publish refusal (a rule break, or a change inside the notice) stays on the page until fixed.
            setError(errorText(e));
            setPub(false);
          }
        }}
      />
      <ConfirmDialog open={rerun} onOpenChange={setRerun} title="Run auto-roster again?" consequence="Running again discards the approval. It only fills days that are still empty; review and approve the new draft." confirmLabel="Run again" onConfirm={() => { setRerun(false); setApprovedRun(null); void generate(); }} />
    </TimePage>
  );
}
