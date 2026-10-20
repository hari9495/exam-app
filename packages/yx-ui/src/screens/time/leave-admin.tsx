// Leave and location set-up for HR. TIM-26, TIM-27, TIM-28, TIM-29, TIM-31, TIM-42.
import { useEffect, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, Check, Copy, Plus, RefreshCw } from 'lucide-react';
import { Icon } from '../../components/foundations';
import { Button, IconButton } from '../../components/button';
import { Badge } from '../../components/display';
import { Drawer } from '../../components/drawer';
import { EmptyState, InlineAlert } from '../../components/feedback';
import { ConfirmDialog, TypeToConfirmDialog } from '../../components/overlay';
import { Breadcrumbs, Card, DescriptionList, PageHeader, Tabs, TabsContent, TabsList, TabsTrigger } from '../../components/shell';
import { DataTable, type TableColumn } from '../../components/table';
import { Checkbox, RadioGroup, Switch } from '../../components/choice';
import { NumberField, TextArea, TextField, TimeField } from '../../components/inputs';
import { ErrorSummary, FieldRow, FormField, FormSection, useSaveErrors } from '../../components/field';
import { PersonPicker, Select, type SelectOption } from '../../components/select';
import { DatePicker } from '../../components/date';
import { Stepper, useNarrow } from '../../components/stepper';
import { MenuItem } from '../../components/menu';
import { FilterBar } from '../../components/filters';
import { EMPLOYEES, ENTITIES, LOCATIONS, entityHeadcount, locationHeadcount } from '../_kit/data';
import { DueBadge, GeoMap, Kpis, TimePage } from './time-kit';
import { EL_ENCASH_MAX, EL_ENCASH_MIN_LEFT, HR_ADMIN, LEAVE_REQUESTS, TODAY, balancesFor, elEncashLeftAtYearEnd } from './time-data';
import { countLeaveDays, yearEndSplit, type YearEndRow } from './time-logic';
import { LoadingBlock, type ViewState } from './attendance';
import { ErrorState } from '../../components/feedback';
import type { LeaveRules, LoadState, LocationRule, PolicyLine, TimeSetup, YearEndPreview } from './live/types';
import { WEEKDAYS, clock, dateText, offsText } from './live/kit';
import { useRun } from '../org/org-kit';
import { useToast } from '../../components/notify';
import { Segment } from '../../components/segment';
import '../people/people.css'; // shared toggle chip (yx-ppl__chip--toggle), as roster.tsx and ops.tsx use
import './time.css';

/* ---------------- small local helpers ---------------- */

/** A select that keeps its own value and reports a change, so set-up forms know when Save can run. */
function Sel({ initial, options, onDirty, label, disabled }: { initial: string; options: SelectOption[]; onDirty?: () => void; label?: string; disabled?: boolean }) {
  const [v, setV] = useState<string | null>(initial);
  return <Select aria-label={label} value={v} disabled={disabled} onChange={(x) => { setV(x); onDirty?.(); }} options={options} />;
}

function Num({ initial, onDirty, label }: { initial: number | null; onDirty?: () => void; label?: string }) {
  const [v, setV] = useState<number | null>(initial);
  return <NumberField aria-label={label} value={v} onChange={(x) => { setV(x); onDirty?.(); }} />;
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const weekday = (d: Date) => d.toLocaleDateString('en-IN', { weekday: 'short' });
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** "1 Jan 2027", no leading zero. ponytail: local until formatDate drops its zero padding. */
const day = (d: Date) => `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
const dayShort = (d: Date) => `${d.getDate()} ${MONTHS[d.getMonth()]}`;
/** 1.25, 1.5, 4.5: at most two decimals, no trailing zeros. */
const num = (n: number) => String(Number(n.toFixed(2)));
const daysFromToday = (d: Date) => Math.round((d.getTime() - TODAY.getTime()) / 86_400_000);
/** Office weekly offs: Sundays and the 2nd and 4th Saturdays. */
const isWeeklyOff = (d: Date) => d.getDay() === 0 || (d.getDay() === 6 && [2, 4].includes(Math.ceil(d.getDate() / 7)));

/** Links to other screens' stories (same pattern as roster.tsx). */
const storyHref = (id: string) => `/?path=/story/${id}`;
const STORY = {
  calendars: 'screens-time-tim-26-·-holiday-calendars--chennai',
  calendarTemplate: 'screens-time-tim-26-·-holiday-calendars--template',
  feedReview: 'screens-time-tim-42-·-holiday-feed-settings--review',
  pendingRequests: 'screens-platform-inbox-requests--plt-04-waiting',
  payrollInputs: 'screens-pay-pay-03-·-run-workspace--inputs',
  leaveCard: 'screens-time-tim-21-·-leave-card--hr',
  policies: 'screens-time-tim-28-·-leave-policies--list',
};
const StoryLink = ({ to, children }: { to: string; children: string }) => (
  <Button size="sm" asChild><a href={storyHref(to)} target="_top">{children}</a></Button>
);

/* =====================================================================
   TIM-26 · Holiday calendars (per location, state templates, clone to next year)
   ===================================================================== */

interface Holiday { date: Date; name: string; optional?: boolean; /** Festival whose date changes every year. */ moves?: boolean }

const TN_2026: Holiday[] = [
  { date: new Date(2026, 0, 15), name: 'Pongal' },
  { date: new Date(2026, 0, 26), name: 'Republic Day' },
  { date: new Date(2026, 3, 14), name: 'Tamil New Year' },
  { date: new Date(2026, 4, 1), name: 'May Day' },
  { date: new Date(2026, 7, 15), name: 'Independence Day' },
  { date: new Date(2026, 8, 14), name: 'Vinayaka Chaturthi', moves: true },
  { date: new Date(2026, 9, 2), name: 'Gandhi Jayanti' },
  { date: new Date(2026, 9, 10), name: 'Mahalaya Amavasya', optional: true, moves: true },
  { date: new Date(2026, 9, 20), name: 'Ayudha Puja', moves: true },
  { date: new Date(2026, 10, 8), name: 'Deepavali', moves: true },
  { date: new Date(2026, 10, 24), name: 'Karthigai Deepam', optional: true, moves: true },
  { date: new Date(2026, 11, 25), name: 'Christmas' },
];
/** Chennai office 2026: the Tamil Nadu list plus three more optional holidays (5 optional in all, as on My leave). */
const MAA_2026: Holiday[] = [
  ...TN_2026,
  { date: new Date(2026, 7, 26), name: 'Onam', optional: true, moves: true },
  { date: new Date(2026, 9, 21), name: 'Vijayadashami', optional: true, moves: true },
  { date: new Date(2026, 11, 24), name: 'Christmas Eve', optional: true },
].sort((a, b) => a.date.getTime() - b.date.getTime());
/** The Tamil Nadu feed's latest dates (Deepavali moved to Mon 9 Nov). New calendars start from these. */
const TN_LATEST: Holiday[] = TN_2026.map((h) => (h.name === 'Deepavali' ? { ...h, date: new Date(2026, 10, 9) } : h));

const KA_2026: Holiday[] = [
  { date: new Date(2026, 0, 14), name: 'Makara Sankranti' },
  { date: new Date(2026, 0, 26), name: 'Republic Day' },
  { date: new Date(2026, 2, 19), name: 'Ugadi', moves: true },
  { date: new Date(2026, 4, 1), name: 'May Day' },
  { date: new Date(2026, 7, 15), name: 'Independence Day' },
  { date: new Date(2026, 8, 14), name: 'Vinayaka Chaturthi', moves: true },
  { date: new Date(2026, 9, 2), name: 'Gandhi Jayanti' },
  { date: new Date(2026, 9, 20), name: 'Ayudha Puja', moves: true },
  { date: new Date(2026, 10, 1), name: 'Kannada Rajyotsava' },
  { date: new Date(2026, 10, 8), name: 'Deepavali', moves: true },
  { date: new Date(2026, 11, 25), name: 'Christmas' },
];

type LocKey = 'maa' | 'blr' | 'hsr' | 'mdu';
interface CalLoc { key: LocKey; name: string; state: string; template: Holiday[]; /** A new site: its calendar starts on this date. */ opens?: Date; /** Days off set elsewhere that people at this site also get. */ note?: string }
const CAL_LOCS: CalLoc[] = [
  { key: 'maa', name: 'Chennai office', state: 'Tamil Nadu', template: TN_LATEST },
  { key: 'blr', name: 'Bengaluru head office', state: 'Karnataka', template: KA_2026 },
  { key: 'hsr', name: 'Hosur plant', state: 'Tamil Nadu', template: TN_LATEST, note: 'The plant is also shut 7–9 Nov 2026 for Deepavali. The shutdown is set in Roster, not in this calendar.' },
  { key: 'mdu', name: 'Madurai depot', state: 'Tamil Nadu', template: TN_LATEST, opens: new Date(2026, 10, 1) },
];
const locName = (k: LocKey) => CAL_LOCS.find((l) => l.key === k)!.name;
const CALENDARS_PUBLISHED = new Date(2026, 0, 2);

/** Changes from the Tamil Nadu feed waiting for review (TIM-42). */
const TN_FEED_CHANGES = [
  {
    id: 'c1', locs: ['maa', 'hsr'] as LocKey[], date: new Date(2026, 10, 9),
    short: 'Deepavali moves to Mon 9 Nov.',
    title: 'Deepavali moves from Sun 8 Nov to Mon 9 Nov 2026',
    note: 'State notification dated 25 Sep. Applies to Chennai office and Hosur plant, and to Madurai depot once its calendar starts.',
    onLeave: [{ name: 'Rahul Deshpande', type: 'Earned leave' }, { name: 'Fathima Beevi', type: 'Casual leave' }],
  },
  {
    id: 'c2', locs: ['maa'] as LocKey[], date: new Date(2026, 9, 15),
    short: 'Thu 15 Oct is a new local body election holiday.',
    title: 'New: Local body election holiday, Thu 15 Oct 2026',
    note: 'Chennai office only.',
    onLeave: [] as { name: string; type: string }[],
  },
];
const feedChangesFor = (k: LocKey) => TN_FEED_CHANGES.filter((c) => c.locs.includes(k));

interface CalRules { rule: string; choose: number | null; transfer: string | null }
const defaultRules = (rows: Holiday[]): CalRules => ({ rule: 'none', choose: rows.filter((h) => h.optional).length, transfer: 'share' });
const sameRules = (a: CalRules, b: CalRules) => a.rule === b.rule && a.choose === b.choose && a.transfer === b.transfer;
const offText = (d: Date) => (isWeeklyOff(d) ? ` · on a ${d.getDay() === 0 ? 'Sunday' : 'Saturday off'}` : '');

interface CalendarPanelProps {
  loc: CalLoc;
  rows: Holiday[];
  rules: CalRules;
  saved: CalRules;
  onRules: (r: CalRules) => void;
  onSaveRules: () => void;
  draft: boolean;
  published: Date;
  onPublish: () => void;
  onAdd: () => void;
  onEdit: (h: Holiday) => void;
  onRemove: (h: Holiday) => void;
  onTemplate: () => void;
}

function CalendarPanel({ loc, rows, rules, saved, onRules, onSaveRules, draft, published, onPublish, onAdd, onEdit, onRemove, onTemplate }: CalendarPanelProps) {
  const optionalCount = rows.filter((h) => h.optional).length;
  const optionalOff = rows.filter((h) => h.optional && h.date >= TODAY && isWeeklyOff(h.date));
  const dirty = !sameRules(rules, saved);
  const onOff = rows.filter((h) => isWeeklyOff(h.date));
  const changes = feedChangesFor(loc.key);

  if (rows.length === 0) {
    return (
      <EmptyState
        title={`${loc.name} has no 2026 calendar`}
        description={`${loc.opens ? `${loc.name} opens on ${day(loc.opens)}. ` : ''}People there see no holidays until you add and publish a calendar. Start from the ${loc.state} template, then edit it before publishing.`}
        action={<Button variant="primary" onClick={onTemplate}>Start from the {loc.state} template</Button>}
      />
    );
  }

  const cols: TableColumn<Holiday>[] = [
    { key: 'name', header: 'Holiday', value: (r) => r.name },
    {
      key: 'date', header: 'Date', type: 'date', value: (r) => r.date,
      render: (r) => (
        <span className="yx-tim-row">
          <span>{weekday(r.date)} {day(r.date)}</span>
          {r.date >= TODAY && daysFromToday(r.date) <= 30 && <DueBadge date={r.date} />}
        </span>
      ),
    },
    {
      key: 'kind', header: 'Type', type: 'status',
      value: (r) => `${r.optional ? 'Optional' : 'Holiday'}${offText(r.date)}`,
      statusTone: (v) => (String(v).startsWith('Optional') ? 'info' : 'neutral'),
    },
  ];
  return (
    <div className="yx-tim-stack">
      {changes.length > 0 && (
        <InlineAlert tone="warning" title={`${plural(changes.length, 'change')} from the Tamil Nadu feed ${changes.length === 1 ? 'is' : 'are'} waiting`} actions={<StoryLink to={STORY.feedReview}>Review changes</StoryLink>}>
          {changes.map((c) => c.short).join(' ')} This calendar keeps the old dates until you accept and publish the changes in Review changes.
        </InlineAlert>
      )}
      <div className="yx-tim-row">
        {draft ? <Badge tone="neutral">Draft · not published</Badge> : <Badge tone="success">Published {dayShort(published)}</Badge>}
        <Button icon={Plus} onClick={onAdd}>Add holiday</Button>
      </div>
      {rows.some((h) => h.date < TODAY) && <p className="yx-tim-muted">Holidays before today are locked: they are already in attendance records.</p>}
      <div className="yx-tim-editor">
        <DataTable
          cardSummary
          label={`${loc.name} holidays`}
          columns={cols}
          rows={rows}
          getRowId={(r) => `${r.name}-${r.date.getTime()}`}
          defaultSort={{ key: 'date', dir: 'asc' }}
          rowActions={(r) =>
            r.date < TODAY ? null : (
              <>
                <MenuItem onSelect={() => onEdit(r)}>Change date</MenuItem>
                <MenuItem destructive onSelect={() => onRemove(r)}>Remove holiday</MenuItem>
              </>
            )
          }
        />
        <div className="yx-tim-stack">
          <Card title="Rules for this calendar">
            <div className="yx-tim-form">
              <FormField label="Holiday on a weekly off">
                <RadioGroup aria-label="Holiday on a weekly off" value={rules.rule} onChange={(v) => onRules({ ...rules, rule: v })} options={[{ value: 'none', label: 'No extra day off (default)' }, { value: 'sub', label: 'Substitute day off' }, { value: 'comp', label: 'Comp-off credit' }]} />
              </FormField>
              {optionalCount > 0 && (
                <FormField label="Optional holidays each person chooses" helper={`People choose ${rules.choose ?? 0} of the ${optionalCount} optional holidays.${optionalOff.map((h) => ` ${h.name} falls on a ${h.date.getDay() === 0 ? 'Sunday' : 'Saturday off'}, so people can't pick it in My leave.`).join('')}`}>
                  <NumberField value={rules.choose} onChange={(v) => onRules({ ...rules, choose: v })} min={0} max={optionalCount} />
                </FormField>
              )}
              <FormField label="When someone moves to another office">
                <Select value={rules.transfer} onChange={(v) => onRules({ ...rules, transfer: v })} options={[{ value: 'share', label: 'Split by months at each office' }, { value: 'reset', label: 'New office calendar from the move' }]} />
              </FormField>
              <div className="yx-tim-row">
                <Button variant="primary" disabled={!dirty} onClick={onSaveRules}>Save rules</Button>
                {!dirty && <span className="yx-tim-muted">No changes to save</span>}
              </div>
            </div>
          </Card>
          <p className="yx-tim-note">
            {onOff.length === 0 ? 'No holiday falls on a weekly off this year.' : `${plural(onOff.length, 'holiday')} ${onOff.length === 1 ? 'falls' : 'fall'} on a weekly off this year (${onOff.map((h) => h.name).join(', ')}).`}
          </p>
          {loc.note && <p className="yx-tim-note">{loc.note}</p>}
        </div>
      </div>
      {draft && (
        <div className="yx-tim-row">
          <Button variant="primary" onClick={onPublish}>Publish {loc.name} calendar</Button>
          <span className="yx-tim-muted">Employees see these holidays only after you publish</span>
        </div>
      )}
    </div>
  );
}

const byLoc = <T,>(f: (l: CalLoc) => T) => Object.fromEntries(CAL_LOCS.map((l) => [l.key, f(l)])) as Record<LocKey, T>;

/** What the live app gives Holiday calendars (design audit): each location's calendar and the calls that change it. */
export interface LiveHolidayCalendars {
  state: LoadState;
  onRetry?: () => void;
  data: TimeSetup | null;
  onCreateCalendar: (input: { name: string; locationId?: string; optionalLimit: number }) => Promise<unknown>;
  onUpdateCalendar: (id: string, input: { name: string; locationId?: string; optionalLimit: number; halfDayOpenHalf: 'first' | 'second' }) => Promise<unknown>;
  onAddHoliday: (calendarId: string, input: { on: string; name: string; kind: string; halfDay: boolean }) => Promise<unknown>;
  onRemoveHoliday: (id: string) => Promise<unknown>;
}

type HolidayCalendarsProps = { loc?: LocKey; dialog?: 'clone' | 'template'; state?: ViewState; /** The live app's data. Stories leave it out. */ live?: LiveHolidayCalendars };

export function HolidayCalendarsScreen(props: HolidayCalendarsProps) {
  return props.live ? <LiveHolidayCalendarsView live={props.live} /> : <StoryHolidayCalendars {...props} />;
}

type LiveCalendar = TimeSetup['calendars'][number];
type LiveHoliday = LiveCalendar['holidays'][number];
const HOLIDAY_KIND: Record<string, string> = { national: 'National', state: 'State', festival: 'Festival', optional: 'Optional', restricted: 'Restricted' };

/** TIM-26 on live data: a tab per location (and the company calendar), the holidays table, the calendar's rules. */
function LiveHolidayCalendarsView({ live }: { live: LiveHolidayCalendars }) {
  const { toast } = useToast();
  const d = live.data;
  const today = d ? fromIso(d.today) : new Date();
  const year = today.getFullYear();
  // One tab per location, and the company calendar (for locations without their own) when there is one.
  const tabs = d ? [...d.locations.map((l) => ({ key: l.id, name: l.name, cal: d.calendars.find((c) => c.locationId === l.id) ?? null })), ...d.calendars.filter((c) => !c.locationId).map((c) => ({ key: c.id, name: 'Company calendar', cal: c as LiveCalendar | null }))] : [];
  const [tab, setTab] = useState<string | null>(null);
  const cur = tabs.find((x) => x.key === tab) ?? tabs[0];
  const [hol, setHol] = useState<{ name: string; date: Date | null; kind: string; halfDay: boolean } | null>(null);
  const [removing, setRemoving] = useState<LiveHoliday | null>(null);
  const [limit, setLimit] = useState<Record<string, number | null>>({});
  const [busy, setBusy] = useState(false);
  const act = async (fn: () => Promise<unknown>, done: string) => {
    setBusy(true);
    try {
      await fn();
      toast({ tone: 'success', title: done });
      return true;
    } catch (e) {
      toast({ tone: 'error', title: 'That did not work', description: e instanceof Error ? e.message : 'Try again.' });
      return false;
    } finally {
      setBusy(false);
    }
  };
  const cols: TableColumn<LiveHoliday>[] = [
    { key: 'name', header: 'Holiday', value: (r) => r.name, render: (r) => `${r.name}${r.halfDay ? ' (half day)' : ''}` },
    {
      key: 'date', header: 'Date', type: 'date', value: (r) => fromIso(r.on),
      render: (r) => (
        <span className="yx-tim-row">
          <span>{weekday(fromIso(r.on))} {day(fromIso(r.on))}</span>
          {r.on >= d!.today && Math.round((fromIso(r.on).getTime() - today.getTime()) / 86_400_000) <= 30 && <DueBadge date={fromIso(r.on)} today={today} />}
        </span>
      ),
    },
    { key: 'kind', header: 'Type', type: 'status', value: (r) => HOLIDAY_KIND[r.kind] ?? r.kind, statusTone: (v) => (v === 'Optional' || v === 'Restricted' ? 'info' : 'neutral') },
  ];
  if (live.state === 'no-access') return <EmptyState title="You can't change holidays" description="Holiday calendars need the leave and attendance set-up key." />;
  return (
    <TimePage active="Holiday calendars">
      <PageHeader title={`Holiday calendars · ${year}`} description="People get the holidays of the office they work at, including people sent to another office for a while." />
      {live.state === 'loading' || !d ? (live.state === 'error' ? <ErrorState title="The holiday calendars didn't load" description="Nothing has changed. Try again in a moment." onRetry={live.onRetry} /> : <LoadingBlock rows={8} />) : !tabs.length ? (
        <EmptyState title="No locations yet" description="Add the company's locations in Settings first; each gets its own holiday calendar." />
      ) : (
        <Tabs value={cur.key} onValueChange={setTab}>
          <TabsList aria-label="Locations">
            {tabs.map((x) => <TabsTrigger key={x.key} value={x.key} count={x.cal?.holidays.length ?? 0}>{x.name}</TabsTrigger>)}
          </TabsList>
          {tabs.map((x) => (
            <TabsContent key={x.key} value={x.key}>
              {!x.cal ? (
                <EmptyState
                  title={`${x.name} has no ${year} calendar`}
                  description={d.calendars.some((c) => !c.locationId) ? `People there get the company calendar until it has its own.` : 'People there see no holidays until you add a calendar.'}
                  action={<Button variant="primary" loading={busy} onClick={() => void act(() => live.onCreateCalendar({ name: `${x.name} holidays`, locationId: x.key, optionalLimit: 2 }), `Added the ${x.name} holiday calendar`)}>Start the {x.name} calendar</Button>}
                />
              ) : (() => {
                const cal = x.cal!;
                const optional = cal.holidays.filter((h) => h.kind === 'optional' || h.kind === 'restricted').length;
                const value = limit[cal.id] === undefined ? cal.optionalLimit : limit[cal.id];
                const dirty = value !== cal.optionalLimit;
                return (
                  <div className="yx-tim-stack">
                    <div className="yx-tim-row">
                      <Badge tone="success">In use</Badge>
                      <Button icon={Plus} onClick={() => setHol({ name: '', date: null, kind: 'festival', halfDay: false })}>Add holiday</Button>
                    </div>
                    {cal.holidays.some((h) => h.on < d.today) && <p className="yx-tim-muted">Holidays before today are locked: they are already in attendance records.</p>}
                    <div className="yx-tim-editor">
                      <DataTable
                        cardSummary
                        label={`${x.name} holidays`}
                        columns={cols}
                        rows={cal.holidays}
                        getRowId={(r) => r.id}
                        defaultSort={{ key: 'date', dir: 'asc' }}
                        rowActions={(r) => (r.on < d.today ? null : <MenuItem destructive onSelect={() => setRemoving(r)}>Remove holiday</MenuItem>)}
                        empty={<EmptyState compact title="No holidays yet" description="Add the holidays your company gives at this office." />}
                      />
                      <div className="yx-tim-stack">
                        <Card title="Rules for this calendar">
                          <div className="yx-tim-form">
                            <FormField label="Optional holidays each person chooses" helper={optional ? `People choose ${value ?? 0} of the ${optional} optional holidays.` : 'Mark a holiday optional to let people choose it.'}>
                              <NumberField value={value} onChange={(v) => setLimit({ ...limit, [cal.id]: v })} min={0} max={20} />
                            </FormField>
                            <div className="yx-tim-row">
                              <Button variant="primary" disabled={!dirty || value === null} loading={busy} onClick={() => void act(() => live.onUpdateCalendar(cal.id, { name: cal.name, ...(cal.locationId ? { locationId: cal.locationId } : {}), optionalLimit: value ?? 0, halfDayOpenHalf: cal.halfDayOpenHalf }), `Saved the rules of ${x.name}`).then((ok) => ok && setLimit((l) => { const n = { ...l }; delete n[cal.id]; return n; }))}>Save rules</Button>
                              {!dirty && <span className="yx-tim-muted">No changes to save</span>}
                            </div>
                          </div>
                        </Card>
                        <p className="yx-tim-note">On a half-day holiday the {cal.halfDayOpenHalf === 'first' ? 'morning' : 'afternoon'} is worked.</p>
                      </div>
                    </div>
                  </div>
                );
              })()}
            </TabsContent>
          ))}
        </Tabs>
      )}
      <ConfirmDialog
        open={!!hol}
        onOpenChange={(o) => !o && setHol(null)}
        title={`Add a holiday to ${cur?.name ?? ''}`}
        consequence={`People with leave on ${hol?.date ? `${weekday(hol.date)} ${day(hol.date)}` : 'the new date'} get that day back.`}
        confirmLabel="Add holiday"
        confirmDisabled={!hol?.name.trim() || !hol?.date || busy}
        onConfirm={() => {
          const h = hol!;
          const cal = cur!.cal!;
          void act(() => live.onAddHoliday(cal.id, { on: isoDate(h.date!), name: h.name.trim(), kind: h.kind, halfDay: h.kind === 'optional' || h.kind === 'restricted' ? false : h.halfDay }), `Added ${h.name.trim()} on ${dayShort(h.date!)} to ${cur!.name}`).then((ok) => ok && setHol(null));
        }}
      >
        {hol && (
          <div className="yx-tim-form">
            <FormField label="Name" required><TextField value={hol.name} maxLength={100} onChange={(v) => setHol({ ...hol, name: v })} /></FormField>
            <FormField label="Date" required helper="Only today or later: earlier days are already in attendance records.">
              <DatePicker value={hol.date} onChange={(v) => setHol({ ...hol, date: v })} min={today} />
            </FormField>
            <FormField label="Type"><Select value={hol.kind} onChange={(v) => v && setHol({ ...hol, kind: v })} options={[{ value: 'national', label: 'National' }, { value: 'state', label: 'State' }, { value: 'festival', label: 'Festival' }, { value: 'optional', label: 'Optional (each person chooses)' }, { value: 'restricted', label: 'Restricted (each person chooses)' }]} /></FormField>
            {hol.kind !== 'optional' && hol.kind !== 'restricted' && <Checkbox label="Half day" checked={hol.halfDay} onChange={(v) => setHol({ ...hol, halfDay: v })} />}
          </div>
        )}
      </ConfirmDialog>
      <ConfirmDialog
        open={!!removing}
        onOpenChange={(o) => !o && setRemoving(null)}
        title={`Remove ${removing?.name ?? ''} from the ${cur?.name ?? ''} calendar?`}
        consequence={removing ? `${weekday(fromIso(removing.on))} ${day(fromIso(removing.on))} becomes a working day. Leave already applied for that day is counted again.` : undefined}
        confirmLabel="Remove holiday"
        destructive
        confirmDisabled={busy}
        onConfirm={() => { const r = removing!; void act(() => live.onRemoveHoliday(r.id), `Removed ${r.name} from ${cur!.name}`).then((ok) => ok && setRemoving(null)); }}
      />
    </TimePage>
  );
}

function StoryHolidayCalendars({ loc = 'maa', dialog, state = 'ready' }: HolidayCalendarsProps) {
  const [tab, setTab] = useState<LocKey>(loc);
  const [dlg, setDlg] = useState(dialog);
  const [rows, setRows] = useState<Record<LocKey, Holiday[]>>(() => ({
    maa: state === 'empty' ? [] : [...MAA_2026],
    blr: [...KA_2026],
    hsr: [...TN_2026],
    mdu: [],
  }));
  // Rules and publish status live here, per location, so they survive switching tabs.
  // Chennai office: people choose 2 of its 5 optional holidays (the same list My leave offers).
  const [rules, setRules] = useState(() => byLoc((l) => (l.key === 'maa' && rows.maa.length ? { ...defaultRules(rows.maa), choose: 2 } : defaultRules(rows[l.key]))));
  const [saved, setSaved] = useState(rules);
  const [draft, setDraft] = useState(() => byLoc(() => false));
  const [published, setPublished] = useState(() => byLoc(() => CALENDARS_PUBLISHED));
  const [removing, setRemoving] = useState<Holiday | null>(null);
  const [hol, setHol] = useState<{ orig?: Holiday; name: string; date: Date | null; optional: boolean } | null>(null);
  // 2027 drafts made by "Clone to 2027": festivals with changing dates keep `moves` until their date is confirmed.
  const [next, setNext] = useState<Partial<Record<LocKey, Holiday[]>>>({});
  const [nextPublished, setNextPublished] = useState<Partial<Record<LocKey, boolean>>>({});
  const [year, setYear] = useState<2026 | 2027>(2026);
  const [confirming, setConfirming] = useState<{ orig: Holiday; date: Date | null } | null>(null);
  const cur = CAL_LOCS.find((l) => l.key === tab)!;
  const nextRows = next[tab];
  const toConfirm = nextRows?.filter((h) => h.moves).length ?? 0;
  const clone = () => {
    setNext((n) => ({ ...n, [tab]: curRows.map((h) => ({ ...h, date: new Date(2027, h.date.getMonth(), h.date.getDate()) })) }));
    setDlg(undefined);
  };
  const curRows = rows[tab];
  const movers = curRows.filter((h) => h.moves).length;
  const pendingFeed = feedChangesFor(tab).length;
  const tmplStart = cur.opens ?? TODAY;
  const tmpl = cur.template.filter((h) => h.date >= tmplStart);
  const changeRows = (k: LocKey, f: (rs: Holiday[]) => Holiday[]) => {
    setRows((r) => ({ ...r, [k]: f(r[k]) }));
    setDraft((d) => ({ ...d, [k]: true }));
  };
  const saveHoliday = () => {
    if (!hol?.date) return;
    const next: Holiday = { ...hol.orig, name: hol.name.trim(), date: hol.date, optional: hol.optional || undefined };
    changeRows(tab, (rs) => (hol.orig ? rs.map((h) => (h === hol.orig ? next : h)) : [...rs, next]));
    setHol(null);
  };
  return (
    <TimePage active="Holiday calendars" user={HR_ADMIN}>
      <PageHeader
        title={year === 2027 && nextRows ? `${cur.name} · 2027` : 'Holiday calendars · 2026'}
        description="People get the holidays of the office they work at, including people sent to another office for a while."
        actions={
          year === 2027 ? (
            <Button onClick={() => setYear(2026)}>Back to 2026</Button>
          ) : curRows.length > 0 && !nextRows ? (
            <div className="yx-tim-row">
              {pendingFeed > 0 && <span className="yx-tim-muted">Review the feed changes first</span>}
              <Button variant="primary" icon={Copy} disabled={pendingFeed > 0} onClick={() => setDlg('clone')}>Clone {cur.name} to 2027</Button>
            </div>
          ) : undefined
        }
      />
      {year === 2027 && nextRows ? (
        <div className="yx-tim-stack">
          {nextPublished[tab] ? (
            <InlineAlert tone="success" title={`${cur.name} 2027 calendar published`}>Employees at {cur.name} now see the 2027 holidays.</InlineAlert>
          ) : (
            <div className="yx-tim-row">
              <Badge tone="neutral">Draft · not published</Badge>
              {toConfirm > 0 && <span className="yx-tim-muted">{plural(toConfirm, 'festival date')} to confirm before you publish</span>}
            </div>
          )}
          <DataTable
            label={`${cur.name} 2027 holidays`}
            columns={[
              { key: 'name', header: 'Holiday', value: (r: Holiday) => r.name },
              { key: 'date', header: 'Date', type: 'date', value: (r: Holiday) => r.date, render: (r: Holiday) => `${weekday(r.date)} ${day(r.date)}` },
              { key: 'kind', header: 'Type', type: 'status', value: (r: Holiday) => (r.moves && !nextPublished[tab] ? 'Confirm date' : r.optional ? 'Optional' : 'Holiday'), statusTone: (v) => (v === 'Confirm date' ? 'warning' : v === 'Optional' ? 'info' : 'neutral') },
            ]}
            rows={nextRows}
            getRowId={(r) => `${r.name}-${r.date.getTime()}`}
            defaultSort={{ key: 'date', dir: 'asc' }}
            rowButtons={(r) => (r.moves && !nextPublished[tab] ? <Button size="sm" onClick={() => setConfirming({ orig: r, date: r.date })}>Confirm date</Button> : null)}
          />
          {!nextPublished[tab] && (
            <div className="yx-tim-row">
              <Button variant="primary" disabled={toConfirm > 0} onClick={() => setNextPublished((p) => ({ ...p, [tab]: true }))}>Publish {cur.name} 2027 calendar</Button>
              <span className="yx-tim-muted">{toConfirm > 0 ? `Confirm the ${plural(toConfirm, 'festival date')} first` : 'Employees see these holidays only after you publish'}</span>
            </div>
          )}
        </div>
      ) : (
      <>
      {nextRows && (
        <InlineAlert tone="success" title={`2027 draft created for ${cur.name}`} actions={<Button size="sm" onClick={() => setYear(2027)}>Open 2027 draft</Button>}>
          {nextPublished[tab] ? 'The 2027 calendar is published.' : `${plural(toConfirm, 'festival date')} to confirm. Employees see nothing until you publish the 2027 calendar.`}
        </InlineAlert>
      )}
      <Tabs value={tab} onValueChange={(v) => setTab(v as LocKey)}>
        <TabsList aria-label="Locations">
          {CAL_LOCS.map((l) => <TabsTrigger key={l.key} value={l.key} count={rows[l.key].length}>{l.name}</TabsTrigger>)}
        </TabsList>
        {CAL_LOCS.map((l) => (
          <TabsContent key={l.key} value={l.key}>
            <CalendarPanel
              loc={l}
              rows={rows[l.key]}
              rules={rules[l.key]}
              saved={saved[l.key]}
              onRules={(r) => setRules((s) => ({ ...s, [l.key]: r }))}
              onSaveRules={() => setSaved((s) => ({ ...s, [l.key]: rules[l.key] }))}
              draft={draft[l.key]}
              published={published[l.key]}
              onPublish={() => { setPublished((p) => ({ ...p, [l.key]: TODAY })); setDraft((d) => ({ ...d, [l.key]: false })); }}
              onAdd={() => setHol({ name: '', date: null, optional: false })}
              onEdit={(h) => setHol({ orig: h, name: h.name, date: h.date, optional: !!h.optional })}
              onRemove={setRemoving}
              onTemplate={() => setDlg('template')}
            />
          </TabsContent>
        ))}
      </Tabs>
      </>
      )}
      <ConfirmDialog
        open={dlg === 'clone'}
        onOpenChange={(o) => !o && setDlg(undefined)}
        title={`Clone ${cur.name} calendar to 2027?`}
        consequence={`Fixed-date holidays move to their 2027 dates. ${plural(movers, 'festival')} with changing dates ${movers === 1 ? 'is' : 'are'} added as drafts for you to confirm. Nothing is visible to employees until you publish.`}
        confirmLabel="Clone to 2027"
        onConfirm={clone}
      />
      <ConfirmDialog
        open={!!confirming}
        onOpenChange={(o) => !o && setConfirming(null)}
        title={`Confirm the 2027 date of ${confirming?.orig.name ?? ''}`}
        consequence="Check the date in the state's 2027 holiday notification. The draft copied the 2026 day and month."
        confirmLabel="Confirm date"
        confirmDisabled={!confirming?.date}
        onConfirm={() => {
          if (!confirming?.date) return;
          const d = confirming.date;
          setNext((n) => ({ ...n, [tab]: n[tab]!.map((h) => (h === confirming.orig ? { ...h, date: d, moves: undefined } : h)) }));
          setConfirming(null);
        }}
      >
        {confirming && (
          <FormField label="Date" required>
            <DatePicker value={confirming.date} onChange={(v) => setConfirming({ ...confirming, date: v })} min={new Date(2027, 0, 1)} max={new Date(2027, 11, 31)} />
          </FormField>
        )}
      </ConfirmDialog>
      <ConfirmDialog
        open={dlg === 'template'}
        onOpenChange={(o) => !o && setDlg(undefined)}
        title={`Start ${cur.name} from the ${cur.state} template?`}
        consequence={`Adds ${plural(tmpl.filter((h) => !h.optional).length, 'holiday')} and ${plural(tmpl.filter((h) => h.optional).length, 'optional holiday')} from ${day(tmplStart)} to 31 Dec 2026, using the feed's latest dates. ${cur.opens ? `${cur.name} opens on ${day(cur.opens)}, so earlier holidays are left out.` : 'Holidays before today are left out, so past attendance does not change.'} You can edit them before publishing.`}
        confirmLabel="Use template"
        onConfirm={() => {
          changeRows(tab, () => [...tmpl]);
          const r = defaultRules(tmpl);
          setRules((s) => ({ ...s, [tab]: r }));
          setSaved((s) => ({ ...s, [tab]: r }));
          setDlg(undefined);
        }}
      />
      <ConfirmDialog
        open={!!hol}
        onOpenChange={(o) => !o && setHol(null)}
        title={hol?.orig ? `Change the date of ${hol.orig.name}?` : `Add a holiday to ${cur.name}`}
        consequence={`${hol?.orig ? `${weekday(hol.orig.date)} ${day(hol.orig.date)} becomes a working day. ` : ''}People with leave on ${hol?.date ? `${weekday(hol.date)} ${day(hol.date)}` : 'the new date'} get that day back when you publish.`}
        confirmLabel={hol?.orig ? 'Change date' : 'Add holiday'}
        confirmDisabled={!hol?.name.trim() || !hol?.date}
        onConfirm={saveHoliday}
      >
        {hol && (
          <div className="yx-tim-form">
            <FormField label="Name" required><TextField value={hol.name} onChange={(v) => setHol({ ...hol, name: v })} /></FormField>
            <FormField label="Date" required helper="Only today or later: earlier days are already in attendance records.">
              <DatePicker value={hol.date} onChange={(v) => setHol({ ...hol, date: v })} min={TODAY} max={new Date(2026, 11, 31)} />
            </FormField>
            <Checkbox label="Optional holiday (each person chooses)" checked={hol.optional} onChange={(v) => setHol({ ...hol, optional: v })} />
          </div>
        )}
      </ConfirmDialog>
      <ConfirmDialog
        open={!!removing}
        onOpenChange={(o) => !o && setRemoving(null)}
        title={`Remove ${removing?.name ?? ''} from the ${cur.name} calendar?`}
        consequence={removing ? `${weekday(removing.date)} ${day(removing.date)} becomes a working day. Leave already applied for that day is counted again.` : undefined}
        confirmLabel="Remove holiday"
        destructive
        onConfirm={() => { changeRows(tab, (rs) => rs.filter((h) => h !== removing)); setRemoving(null); }}
      />
    </TimePage>
  );
}

/* =====================================================================
   TIM-28 data (also read by TIM-27 and TIM-29)
   ===================================================================== */

const TYPE_WORDS: Record<string, string> = { CL: 'Casual leave', SL: 'Sick leave', EL: 'Earned leave', CO: 'Comp-off', LWP: 'Unpaid leave' };
/** Non-breaking hyphen in Comp‑off so it never splits across lines. */
const TYPE_SHORT: Record<string, string> = { CL: 'Casual', SL: 'Sick', EL: 'Earned', CO: 'Comp‑off', LWP: 'Unpaid' };
const TYPE_NOTE: Record<string, string> = { CO: 'earned for work on an off day', LWP: 'no balance, unpaid' };
interface Entitlement { code: string; /** Days a year. */ days?: number; /** Plant workers: 1 day per this many days worked. */ perWorked?: number }
interface Override { name: string; change: string; from: Date; to?: Date; note?: string; /** Ended early with "End": kept as history. */ ended?: boolean }
interface PolicyRule { entity?: string; grade?: string; location?: string; empType?: string }
interface PolicyRow {
  id: string;
  name: string;
  ents: Entitlement[];
  rule: PolicyRule;
  /** Matched by the rule today, before overrides. Today's headcount is peopleToday(). */
  people: number;
  from: Date;
  overrides: Override[];
}

const POLICIES: PolicyRow[] = [
  {
    // By rule, from the shared entity headcount: Tamil Nadu minus the 48 plant workers and the 3 S5 joiners no rule covers.
    id: 'p1', name: 'Staff · Tamil Nadu', people: entityHeadcount('kf-tn') - 48 - 3, from: new Date(2026, 0, 1),
    ents: [{ code: 'CL', days: 8 }, { code: 'SL', days: 8 }, { code: 'EL', days: 15 }, { code: 'CO' }, { code: 'LWP' }],
    rule: { entity: 'kf-tn', grade: 's1-s4' },
    overrides: [
      { name: 'Anitha Rajan', change: 'Plant workers → Staff · Tamil Nadu', from: new Date(2026, 5, 1), note: 'Moved to the plant office as a supervisor' },
      { name: 'Farhan Siddiqui', change: 'Staff · Karnataka → Staff · Tamil Nadu', from: new Date(2026, 6, 15), to: new Date(2026, 11, 31), note: 'Sent to Chennai office' },
    ],
  },
  {
    id: 'p2', name: 'Staff · Karnataka', people: entityHeadcount('kf-ka'), from: new Date(2026, 0, 1),
    ents: [{ code: 'CL', days: 10 }, { code: 'SL', days: 10 }, { code: 'EL', days: 18 }, { code: 'CO' }, { code: 'LWP' }],
    rule: { entity: 'kf-ka', grade: 'all' },
    overrides: [],
  },
  {
    id: 'p3', name: 'Plant workers · Factories Act', people: 48, from: new Date(2026, 3, 1),
    ents: [{ code: 'CL', days: 7 }, { code: 'SL', days: 7 }, { code: 'EL', perWorked: 20 }, { code: 'LWP' }],
    rule: { location: 'hsr', empType: 'worker' },
    overrides: [{ name: 'Selvam Murugan', change: 'Staff · Tamil Nadu → Plant workers', from: new Date(2026, 7, 1), note: 'Kept on the plant policy after moving to stores' }],
  },
];

/** The name used in an override's "from → to" text ("Plant workers"). */
const shortPolicy = (name: string) => (name.startsWith('Plant workers') ? 'Plant workers' : name);
/** In force today: started, and not ended before today. A future end date still counts until that day. */
const overrideActive = (o: Override) => o.from <= TODAY && (!o.to || o.to >= TODAY);
/** Today's headcount: matched by rule, plus overrides into this policy, minus overrides out of it. The total never changes. */
const peopleToday = (r: PolicyRow, all: PolicyRow[]) =>
  r.people
  + r.overrides.filter(overrideActive).length
  - all.reduce((s, p) => s + p.overrides.filter((o) => overrideActive(o) && o.change.split(' → ')[0] === shortPolicy(r.name)).length, 0);

/** New joiners on grade S5 in the Tamil Nadu entity: no policy rule covers them yet. */
const NO_POLICY = [
  { name: 'Nandhini Kumar', joined: new Date(2026, 8, 14) },
  { name: 'Vignesh Balaji', joined: new Date(2026, 8, 21) },
  { name: 'Harini Sekar', joined: new Date(2026, 8, 28) },
];

const GRADE_OPTIONS = [{ value: 'all', label: 'All grades' }, { value: 's1-s4', label: 'S1–S4' }, { value: 's1-s5', label: 'S1–S5' }, { value: 's5', label: 'S5' }];
const LOCATION_OPTIONS = [{ value: 'hsr', label: 'Hosur plant' }, { value: 'maa', label: 'Chennai office' }, { value: 'blr', label: 'Bengaluru head office' }];
const amountText = (e: Entitlement) => (e.days != null ? `${e.days} days a year` : e.perWorked ? `1 day per ${e.perWorked} days worked` : TYPE_NOTE[e.code] ?? '');
const typesText = (p: PolicyRow) => p.ents.map((e) => `${TYPE_SHORT[e.code]}${e.days != null ? ` ${e.days}` : e.perWorked ? ` 1 per ${e.perWorked} days worked` : ''}`).join(' · ');
const ruleText = (r: PolicyRule) =>
  r.location
    ? `${LOCATION_OPTIONS.find((o) => o.value === r.location)?.label} · ${r.empType === 'staff' ? 'staff' : 'workers'}`
    : `${r.entity === 'kf-ka' ? 'Karnataka' : 'Tamil Nadu'} entity · ${r.grade === 'all' || !r.grade ? 'all grades' : `grade${r.grade === 's5' ? '' : 's'} ${GRADE_OPTIONS.find((o) => o.value === r.grade)?.label}`}`;
const elOf = (p: PolicyRow) => p.ents.find((e) => e.code === 'EL');
const EL_POLICIES = POLICIES.filter((p) => elOf(p));
const EL_PEOPLE = EL_POLICIES.reduce((s, p) => s + peopleToday(p, POLICIES), 0);
/** Monthly earned-leave credit for staff of an entity, from its policy (15 a year → 1.25). */
const monthlyEL = (entity: string) => (elOf(POLICIES.find((p) => p.rule.entity === entity)!)?.days ?? 0) / 12;
const CF_CAP = 30;

/* =====================================================================
   TIM-27 · Leave type editor (sectioned, live example)
   ===================================================================== */

/** Staff on Staff · Tamil Nadu (Sat/Sun-type weekly offs), so the example's offs and crediting are theirs. */
const EXAMPLE_PEOPLE = ['Priya Shankar', 'Arun Prakash', 'Divya Raghunathan'];
const EXAMPLE_POLICY = POLICIES[0];
const elRateText = (p: PolicyRow) => {
  const e = elOf(p)!;
  return e.days != null ? `${p.name} ${e.days} a year` : `${p.name} 1 day per ${e.perWorked} days worked`;
};
type CreditHow = 'upfront' | 'monthly' | 'worked';
const CREDIT_OPTIONS: { value: CreditHow; label: string }[] = [
  { value: 'upfront', label: 'All on 1 Jan' },
  { value: 'monthly', label: 'Every month (a twelfth of the yearly days)' },
  { value: 'worked', label: 'By days worked' },
];
/** Matches the TIM-30 ledger: staff get the whole year on 1 Jan; plant workers earn by days worked. */
const creditDefault = (p: PolicyRow): CreditHow => (elOf(p)?.perWorked ? 'worked' : 'upfront');
/** Only the methods the policy's entitlement allows: by days worked needs a per-days-worked rate, the others need yearly days. */
const creditOptions = (p: PolicyRow) => CREDIT_OPTIONS.filter((o) => (o.value === 'worked') === !!elOf(p)?.perWorked);
/** "which credits all 15 days on 1 Jan", to follow the policy name. */
const creditText = (p: PolicyRow, how: CreditHow) => {
  const e = elOf(p)!;
  if (how === 'worked' && e.perWorked) return `which earns 1 day per ${e.perWorked} days worked`;
  if (how === 'monthly') return `which credits ${num((e.days ?? 0) / 12)} days on the 1st of each month`;
  return `which credits all ${e.days ?? 0} days on 1 Jan`;
};
const SECTIONS = { basics: 'Basics', eligibility: 'Eligibility', crediting: 'Crediting', counting: 'Counting', rules: 'Rules', yearend: 'Year end', absence: 'Absence & notice' } as const;

interface BlockedDates { id: string; from: Date; to: Date; reason: string }

export function LeaveTypeEditorScreen({ section = 'counting', statutory = false }: { section?: string; statutory?: boolean }) {
  const [sandwich, setSandwich] = useState<'none' | 'sandwich' | 'always'>('sandwich');
  const [dirty, setDirty] = useState(false);
  const [colourSaved, setColourSaved] = useState(false);
  const [saveOpen, setSaveOpen] = useState(false);
  const [from, setFrom] = useState<Date | null>(new Date(2026, 9, 1));
  const [person, setPerson] = useState<string | null>(EXAMPLE_PEOPLE[0]);
  const [pay, setPay] = useState('paid');
  const [payPct, setPayPct] = useState<number | null>(50);
  const [blocked, setBlocked] = useState<BlockedDates[]>([{ id: 'b1', from: new Date(2027, 2, 25), to: new Date(2027, 2, 31), reason: 'Year-end audit' }]);
  const [addingDates, setAddingDates] = useState<{ from: Date | null; to: Date | null; reason: string } | null>(null);
  const [sec, setSec] = useState(section === 'notice' ? 'absence' : section);
  const narrow = useNarrow();
  const [creditBy, setCreditBy] = useState<Record<string, CreditHow>>(() => Object.fromEntries(EL_POLICIES.map((p) => [p.id, creditDefault(p)])));
  const [maxRequest, setMaxRequest] = useState<number | null>(10);
  const [maxMonth, setMaxMonth] = useState<number | null>(10);
  const limitErr = maxRequest != null && maxMonth != null && maxRequest > maxMonth ? `More than the monthly limit of ${maxMonth} days. A request that big can never be approved.` : null;
  const [typeName, setTypeName] = useState(statutory ? 'Maternity leave' : 'Earned leave');
  const [code, setCode] = useState('EL');
  const payPctErr = pay === 'part' && (payPct == null || payPct < 1 || payPct > 99) ? 'Enter a share between 1 and 99%' : null;
  // The first thing to fix, shown beside the disabled Save button.
  const saveBlocked = !typeName.trim() ? 'Fill in the name in Basics' : !code.trim() ? 'Fill in the code in Basics' : payPctErr ? 'Fix the pay share in Basics' : limitErr ? 'Fix the request limit in Rules' : null;
  const touch = () => { setDirty(true); setColourSaved(false); };
  // Fri 13 – Mon 16 Nov: clear of every example person's own leave requests (Arun 19–23 Oct, Divya 12–13 and 30 Oct).
  const ex = countLeaveDays({ from: new Date(2026, 10, 13), to: new Date(2026, 10, 16), holidays: [], weeklyOffDays: [0], weeklyOffDates: [new Date(2026, 10, 14)], sandwich });
  const elRow = balancesFor(person ?? EXAMPLE_PEOPLE[0]).find((b) => b.code === 'EL');
  const elBalance = elRow?.balance ?? 0;
  const elPending = elRow?.pending ?? 0;
  const name = statutory ? 'Maternity leave' : 'Earned leave';

  return (
    <TimePage active="Leave types & policies" user={HR_ADMIN}>
      <PageHeader
        breadcrumbs={<Breadcrumbs items={[{ label: 'Leave types & policies', href: '#' }, { label: name }]} />}
        title={name}
        description={
          statutory
            ? 'Statutory · Maternity Benefit Act. The law sets the length and pay; you can change only the colour.'
            : `Paid · used in ${plural(EL_POLICIES.length, 'policy', 'policies')} (${EL_PEOPLE} people): ${EL_POLICIES.map(elRateText).join('; ')}.`
        }
        status={<Badge tone="success">{statutory ? 'Active' : 'Active · version 4'}</Badge>}
        actions={
          statutory ? (
            <div className="yx-tim-row">
              {colourSaved ? <span className="yx-tim-muted">Colour saved</span> : !dirty && <span className="yx-tim-muted">No changes yet</span>}
              <Button variant="primary" disabled={!dirty} onClick={() => { setDirty(false); setColourSaved(true); }}>Save colour</Button>
            </div>
          ) : (
            <div className="yx-tim-row">
              {!dirty ? <span className="yx-tim-muted">No changes yet</span> : saveBlocked && <span className="yx-tim-muted">{saveBlocked}</span>}
              <Button variant="primary" disabled={!dirty || !!saveBlocked} onClick={() => setSaveOpen(true)}>Save as version 5</Button>
            </div>
          )
        }
      />
      <div className="yx-tim-editor">
        <div className="yx-tim-form">
          {statutory ? (
            <>
              <InlineAlert tone="info" title="The law sets these values">
                26 weeks (at most 8 before delivery); 12 weeks for mothers who adopt a baby or have one through surrogacy, and from the 3rd child; 6 weeks after miscarriage; 2 weeks after tubectomy. Eligibility: 80 days worked in the 12 months before the expected date.
              </InlineAlert>
              <FormSection title="Set by law">
                {/* Read-only text, not inputs: these can't be changed. */}
                <DescriptionList items={[{ label: 'Name', value: name }, { label: 'Code', value: 'ML' }, { label: 'Length', value: '26 weeks' }, { label: 'Pay', value: 'Paid, full wages' }]} />
              </FormSection>
              <FormSection title="Set by you">
                <FormField label="Colour"><Sel initial="purple" onDirty={touch} options={[{ value: 'purple', label: 'Purple' }, { value: 'teal', label: 'Teal' }, { value: 'blue', label: 'Blue' }]} /></FormField>
              </FormSection>
            </>
          ) : (
            <Tabs value={sec} onValueChange={setSec}>
              {narrow ? (
                <FormField label="Section">
                  <Select value={sec} onChange={(v) => v && setSec(v)} options={Object.entries(SECTIONS).map(([value, label]) => ({ value, label }))} />
                </FormField>
              ) : (
                <TabsList aria-label="Sections">
                  {Object.entries(SECTIONS).map(([s, label]) => <TabsTrigger key={s} value={s}>{label}</TabsTrigger>)}
                </TabsList>
              )}
              <TabsContent value="basics">
                <FormSection title="Basics">
                  <FieldRow>
                    <FormField label="Name" required error={typeName.trim() ? null : 'Enter a name'}><TextField value={typeName} onChange={(v) => { setTypeName(v); touch(); }} /></FormField>
                    <FormField label="Code" required error={code.trim() ? null : 'Enter a code'}><TextField value={code} onChange={(v) => { setCode(v); touch(); }} /></FormField>
                  </FieldRow>
                  <FormField label="Pay"><RadioGroup aria-label="Pay" value={pay} onChange={(v) => { setPay(v); touch(); }} orientation="horizontal" options={[{ value: 'paid', label: 'Paid' }, { value: 'unpaid', label: 'Unpaid (shows days taken, no balance)' }, { value: 'part', label: 'Partially paid' }]} /></FormField>
                  {pay === 'part' && (
                    <FormField label="Paid at (% of daily wage)" required error={payPctErr}>
                      <NumberField value={payPct} min={1} max={99} onChange={(v) => { setPayPct(v); touch(); }} />
                    </FormField>
                  )}
                  <FormField label="Colour"><Sel initial="teal" onDirty={touch} options={[{ value: 'teal', label: 'Teal' }, { value: 'blue', label: 'Blue' }, { value: 'amber', label: 'Amber' }, { value: 'purple', label: 'Purple' }]} /></FormField>
                </FormSection>
              </TabsContent>
              <TabsContent value="eligibility">
                <FormSection title="Who gets it">
                  <FieldRow><FormField label="Employment type"><Sel initial="pc" onDirty={touch} options={[{ value: 'pc', label: 'Permanent and contract' }, { value: 'perm', label: 'Permanent only' }, { value: 'all', label: 'Permanent, contract and interns' }]} /></FormField><FormField label="After working (months)"><Num initial={0} onDirty={touch} /></FormField></FieldRow>
                  <Switch label="Available during probation" defaultChecked onChange={touch} />
                  <FormField label="Who can take it"><Sel initial="a" onDirty={touch} options={[{ value: 'a', label: 'Everyone' }, { value: 'f', label: 'Women only' }, { value: 'm', label: 'Men only' }]} /></FormField>
                </FormSection>
              </TabsContent>
              <TabsContent value="crediting">
                <FormSection title="Crediting">
                  <p className="yx-tim-muted">Each policy credits it its own way. The yearly days are set in the policy.</p>
                  {EL_POLICIES.map((p) => (
                    <FormField key={p.id} label={`${p.name} · ${amountText(elOf(p)!)}`} helper={creditOptions(p).length === 1 ? 'The only method for an entitlement by days worked. Change the entitlement in Leave policies.' : undefined}>
                      <Select value={creditBy[p.id]} disabled={creditOptions(p).length === 1} onChange={(v) => { if (v) { setCreditBy((c) => ({ ...c, [p.id]: v as CreditHow })); touch(); } }} options={creditOptions(p)} />
                    </FormField>
                  ))}
                  <Switch label="Reduce by unpaid leave days" defaultChecked onChange={touch} />
                  <Switch label="Pro-rata for people who join during the year" defaultChecked onChange={touch} />
                  <FormField label="Rounding"><Sel initial="0.25" onDirty={touch} options={[{ value: 'none', label: 'None' }, { value: '0.25', label: 'To 0.25 · halfway rounds up' }, { value: '0.5', label: 'To 0.5' }, { value: '1', label: 'To a whole day' }]} /></FormField>
                </FormSection>
              </TabsContent>
              <TabsContent value="counting">
                <FormSection title="Counting">
                  <FormField label="Weekly offs and holidays inside the leave" helper="For example, a Saturday and Sunday between Friday and Monday leave">
                    <RadioGroup aria-label="Weekly offs and holidays inside the leave" value={sandwich} onChange={(v) => { setSandwich(v as typeof sandwich); touch(); }} options={[{ value: 'none', label: 'Never count them' }, { value: 'sandwich', label: 'Count them when they fall between leave days' }, { value: 'always', label: 'Always count them' }]} />
                  </FormField>
                  <FormField label="Applies to" disabled={sandwich === 'none'} helper={sandwich === 'none' ? 'Not used when weekly offs and holidays are never counted' : undefined}>
                    <Sel initial="both" disabled={sandwich === 'none'} onDirty={touch} options={[{ value: 'both', label: 'Weekly offs and holidays' }, { value: 'off', label: 'Weekly offs only' }]} />
                  </FormField>
                  <Switch label="Half days (first or second half)" defaultChecked onChange={touch} />
                  <Switch label="Leave by the hour" defaultChecked={false} onChange={touch} />
                </FormSection>
              </TabsContent>
              <TabsContent value="rules">
                <FormSection title="Rules">
                  <FieldRow>
                    <FormField label="Apply at least (days ahead)"><Num initial={7} onDirty={touch} /></FormField>
                    <FormField label="Most days in one request" error={limitErr}><NumberField aria-label="Most days in one request" value={maxRequest} min={1} onChange={(v) => { setMaxRequest(v); touch(); }} /></FormField>
                    <FormField label="Most days in a month"><NumberField aria-label="Most days in a month" value={maxMonth} min={1} onChange={(v) => { setMaxMonth(v); touch(); }} /></FormField>
                  </FieldRow>
                  <FieldRow>
                    <FormField label="Ask for a document when leave is longer than (days)" helper="Leave blank to never ask"><Num initial={null} onDirty={touch} /></FormField>
                    <FormField label="Balance may go below zero by (days)"><Num initial={2} onDirty={touch} /></FormField>
                  </FieldRow>
                  <FormField label="Dates when no one can take it">
                    <div className="yx-tim-stack">
                      {blocked.length === 0 ? (
                        <p className="yx-tim-muted">None. People can take it on any working day.</p>
                      ) : (
                        <ul className="yx-tim-list">
                          {blocked.map((b) => (
                            <li key={b.id}>
                              <span className="yx-tim-list__main"><strong>{dayShort(b.from)} – {day(b.to)}</strong><span className="yx-tim-muted">{b.reason}</span></span>
                              <Button size="sm" onClick={() => { setBlocked((bs) => bs.filter((x) => x.id !== b.id)); touch(); }}>Remove</Button>
                            </li>
                          ))}
                        </ul>
                      )}
                      <span><Button icon={Plus} onClick={() => setAddingDates({ from: null, to: null, reason: '' })}>Add dates</Button></span>
                    </div>
                  </FormField>
                </FormSection>
              </TabsContent>
              <TabsContent value="yearend">
                <FormSection title="Year end">
                  <FieldRow><FormField label="Carry forward up to (days)"><Num initial={CF_CAP} onDirty={touch} /></FormField><FormField label="Encash per year in total, up to (days)"><Num initial={EL_ENCASH_MAX} onDirty={touch} /></FormField><FormField label="Keep at least (days) after encashing"><Num initial={EL_ENCASH_MIN_LEFT} onDirty={touch} /></FormField></FieldRow>
                  <FormField label="Pay for each day paid out"><Sel initial="26" onDirty={touch} options={[{ value: '26', label: '(Basic + DA) ÷ 26' }, { value: '30', label: '(Basic + DA) ÷ 30' }]} /></FormField>
                  <Switch label="Pay out the balance when someone leaves (in the final settlement)" defaultChecked onChange={touch} />
                </FormSection>
              </TabsContent>
              <TabsContent value="absence">
                <FormSection title="During long absence">
                  <RadioGroup aria-label="Crediting during long absence" defaultValue="pause" onChange={touch} options={[{ value: 'pause', label: 'Stop crediting during a sabbatical or long unpaid leave (default)' }, { value: 'continue', label: 'Keep crediting' }]} />
                  <p className="yx-tim-note">Maternity leave always counts as service, so crediting continues by law.</p>
                </FormSection>
                <FormSection title="During the notice period">
                  <RadioGroup aria-label="During notice" defaultValue="allowed" onChange={touch} options={[{ value: 'allowed', label: 'Allowed (default)' }, { value: 'unpaid', label: 'Counted as unpaid leave' }, { value: 'extends', label: 'Moves the last working day later' }, { value: 'blocked', label: 'Not allowed' }]} />
                </FormSection>
              </TabsContent>
            </Tabs>
          )}
        </div>
        <div className="yx-tim-sticky">
          {statutory ? (
            <Card title="Example">
              <p className="yx-tim-muted">Delivery expected Sun 10 Jan 2027</p>
              <Kpis items={[{ label: 'Leave', value: '15 Nov 2026 – 15 May 2027' }, { label: 'Length', value: '26 weeks, paid' }]} />
              <p className="yx-tim-note">Starts at most 8 weeks before the expected date.</p>
            </Card>
          ) : (
            <Card title="Live example">
              <div className="yx-tim-stack">
                <FormField label="Preview for"><Select value={person} onChange={setPerson} options={EXAMPLE_PEOPLE.map((p) => ({ value: p, label: p }))} /></FormField>
                <p className="yx-tim-muted">{person} applies Fri 13 Nov – Mon 16 Nov (Sat 14 and Sun 15 Nov are weekly offs)</p>
                <ul className="yx-tim-days">{ex.days.map((d) => <li key={d.date.getTime()}><span>{weekday(d.date)} {day(d.date)}</span><strong>{d.kind === 'counted' ? '1' : d.kind === 'sandwich' ? '1 (between leave days)' : '0 (off)'}</strong></li>)}</ul>
                <Kpis items={[{ label: 'Days counted', value: ex.total }, { label: 'Earned leave balance', value: `${num(elBalance)}${elPending > 0 ? ` (${num(elPending)} pending)` : ''} → ${num(elBalance - elPending - ex.total)}` }]} />
                <p className="yx-tim-note">{person} is on {EXAMPLE_POLICY.name}, {creditText(EXAMPLE_POLICY, creditBy[EXAMPLE_POLICY.id])}.</p>
                {/* The type's rules check the example too (founder decision 20 Oct 2026): what would stop it, or that nothing does. */}
                {maxMonth != null && ex.total > maxMonth ? (
                  <InlineAlert tone="warning" title="This request would be refused"><ul className="yx-tim-steps"><li>{name} is at most {maxMonth} days in a month.</li></ul></InlineAlert>
                ) : (
                  <p className="yx-tim-note">The rules let this request through.</p>
                )}
              </div>
            </Card>
          )}
        </div>
      </div>
      <ConfirmDialog
        open={saveOpen}
        onOpenChange={setSaveOpen}
        title={`Save ${name.toLowerCase()} as version 5?`}
        consequence={from ? `${EL_PEOPLE} people get the new rules. Leave days before ${day(from)} follow version 4; leave on or after it follows version 5.` : 'Choose the date the new rules start.'}
        confirmLabel="Save version 5"
        confirmDisabled={!from}
        onConfirm={() => { setSaveOpen(false); setDirty(false); }}
      >
        <FormField label="Applies from" required><DatePicker value={from} onChange={setFrom} min={TODAY} /></FormField>
      </ConfirmDialog>
      <ConfirmDialog
        open={!!addingDates}
        onOpenChange={(o) => !o && setAddingDates(null)}
        title="Add dates when no one can take it"
        confirmLabel="Add dates"
        confirmDisabled={!addingDates?.from || !addingDates.to || !addingDates.reason.trim()}
        onConfirm={() => {
          if (!addingDates?.from || !addingDates.to) return;
          setBlocked((bs) => [...bs, { id: `b${Date.now()}`, from: addingDates.from!, to: addingDates.to!, reason: addingDates.reason.trim() }]);
          setAddingDates(null);
          touch();
        }}
      >
        {addingDates && (
          <div className="yx-tim-form">
            <FieldRow>
              <FormField label="From" required><DatePicker value={addingDates.from} onChange={(v) => setAddingDates({ ...addingDates, from: v })} min={TODAY} /></FormField>
              <FormField label="To" required><DatePicker value={addingDates.to} onChange={(v) => setAddingDates({ ...addingDates, to: v })} min={addingDates.from ?? TODAY} /></FormField>
            </FieldRow>
            <FormField label="Reason" required helper="People see this when they pick a blocked date"><TextField value={addingDates.reason} onChange={(v) => setAddingDates({ ...addingDates, reason: v })} /></FormField>
          </div>
        )}
      </ConfirmDialog>
    </TimePage>
  );
}

/* =====================================================================
   TIM-28 · Leave policies & assignment rules
   ===================================================================== */

const ENTITY_OPTIONS = ENTITIES.map((e) => ({ value: e.id, label: e.name }));

const newPolicy = (patch: Partial<PolicyRow> = {}): PolicyRow => ({
  id: `new-${Date.now()}`, name: '', people: 0, from: new Date(2026, 9, 1),
  ents: POLICIES[0].ents.map((e) => ({ ...e })), rule: { entity: 'kf-tn', grade: 'all' }, overrides: [],
  ...patch,
});

/** The policy someone gets by rule, from where they work. ponytail: by location only; use the real rule match when people carry entity, grade and employee type. */
const policyByRule = (location: string) => (location === 'Hosur plant' ? 'Plant workers' : location === 'Bengaluru head office' ? 'Staff · Karnataka' : 'Staff · Tamil Nadu');

/** Office locations sit in one entity each. */
const LOC_ENTITY: Record<string, string> = { hsr: 'kf-tn', maa: 'kf-tn', blr: 'kf-ka' };
const GRADES: Record<string, string[]> = { all: ['s1', 's2', 's3', 's4', 's5'], 's1-s4': ['s1', 's2', 's3', 's4'], 's1-s5': ['s1', 's2', 's3', 's4', 's5'], s5: ['s5'] };
/** Do two rules match some of the same people? ponytail: workers carry no S grade, so a worker rule never overlaps a grade rule. */
const rulesOverlap = (a: PolicyRule, b: PolicyRule) => {
  if (a.location && b.location) return a.location === b.location && a.empType === b.empType;
  if (a.location || b.location) {
    const l = a.location ? a : b;
    const e = a.location ? b : a;
    return LOC_ENTITY[l.location!] === e.entity && l.empType === 'staff';
  }
  return a.entity === b.entity && GRADES[a.grade ?? 'all'].some((g) => GRADES[b.grade ?? 'all'].includes(g));
};

function PolicyDrawerBody({ p, isNew, onChange, from, onFrom, today }: { p: PolicyRow; isNew: boolean; onChange: (patch: Partial<PolicyRow>) => void; from: Date | null; onFrom: (d: Date | null) => void; /** People on this policy today. */ today: number }) {
  const [editing, setEditing] = useState<string | null>(null);
  const blankOverride = { personId: null as string | null, from: TODAY as Date | null, to: null as Date | null, note: '' };
  const [ov, setOv] = useState<typeof blankOverride | null>(null);
  const [ending, setEnding] = useState<{ o: Override; on: Date | null } | null>(null);
  const shortName = shortPolicy(p.name);
  /** Not over yet: in force now or starting later. */
  const current = (o: Override) => !o.to || o.to >= TODAY;
  // People who could get an override here: not already on this policy by rule or by a current override.
  const candidates = EMPLOYEES.filter((e) => policyByRule(e.location) !== shortName && !p.overrides.some((o) => o.name === e.name && current(o)))
    .map((e) => ({ id: e.id, name: e.name, role: e.role, department: e.department, note: `Now on ${policyByRule(e.location)}` }));
  const picked = EMPLOYEES.find((e) => e.id === ov?.personId);
  const setEnt = (code: string, patch: Partial<Entitlement>) => onChange({ ents: p.ents.map((e) => (e.code === code ? { ...e, ...patch } : e)) });
  const setRule = (patch: PolicyRule) => onChange({ rule: { ...p.rule, ...patch } });
  return (
    <div className="yx-tim-stack">
      {isNew && <FormField label="Policy name" required><TextField value={p.name} onChange={(v) => onChange({ name: v })} /></FormField>}
      <FormSection title="Entitlements">
        <ul className="yx-tim-check">
          {p.ents.map((e) => (
            <li key={e.code}>
              {editing === e.code ? (
                <>
                  <FormField label={e.perWorked ? `${TYPE_WORDS[e.code]}: 1 day per how many days worked` : `${TYPE_WORDS[e.code]}: days a year`}>
                    <NumberField value={e.perWorked ?? e.days ?? null} min={0} onChange={(v) => setEnt(e.code, e.perWorked ? { perWorked: v ?? 0 } : { days: v ?? 0 })} />
                  </FormField>
                  <Button size="sm" onClick={() => setEditing(null)}>Done</Button>
                </>
              ) : (
                <>
                  <span>{TYPE_WORDS[e.code]} · {amountText(e)}</span>
                  {(e.days != null || e.perWorked) && <Button size="sm" onClick={() => setEditing(e.code)}>Edit</Button>}
                </>
              )}
            </li>
          ))}
        </ul>
      </FormSection>
      <FormSection title="Who gets this policy">
        {p.rule.location ? (
          <FieldRow>
            <FormField label="Location"><Select value={p.rule.location} onChange={(v) => v && setRule({ location: v })} options={LOCATION_OPTIONS} /></FormField>
            <FormField label="Employee type"><Select value={p.rule.empType ?? 'worker'} onChange={(v) => v && setRule({ empType: v })} options={[{ value: 'worker', label: 'Worker' }, { value: 'staff', label: 'Staff' }]} /></FormField>
          </FieldRow>
        ) : (
          <FieldRow>
            <FormField label="Entity"><Select value={p.rule.entity ?? 'kf-tn'} onChange={(v) => v && setRule({ entity: v })} options={ENTITY_OPTIONS} /></FormField>
            <FormField label="Grade"><Select value={p.rule.grade ?? 'all'} onChange={(v) => v && setRule({ grade: v })} options={GRADE_OPTIONS} /></FormField>
          </FieldRow>
        )}
        <FormField label="Applies from" required helper="Changes start on this date; earlier months stay as they were.">
          <DatePicker value={from} onChange={onFrom} min={TODAY} />
        </FormField>
        <p className="yx-tim-muted">{today > 0 ? `Matches ${plural(today, 'person', 'people')} today.` : 'People are matched when you save.'}</p>
      </FormSection>
      <FormSection title={`People with an override (${p.overrides.filter(overrideActive).length})`}>
        {p.overrides.length === 0 ? (
          <p className="yx-tim-muted">No overrides. Everyone here gets the policy by the rule above.</p>
        ) : (
          <ul className="yx-tim-list">
            {p.overrides.map((o) => (
              <li key={`${o.name}-${o.from.getTime()}`}>
                <span className="yx-tim-list__main">
                  <strong>{o.name}</strong>
                  <span className="yx-tim-muted">{o.change} · {o.to ? `${day(o.from)} – ${day(o.to)}` : `from ${day(o.from)}`}</span>
                  {o.note && <span className="yx-tim-muted">{o.note}</span>}
                </span>
                <span className="yx-tim-row">
                  {o.from > TODAY && <Badge tone="neutral">Starts {dayShort(o.from)}</Badge>}
                  {o.ended && o.to ? (
                    <Badge tone="neutral">{o.to < TODAY ? 'Ended' : 'Ends'} {dayShort(o.to)}</Badge>
                  ) : (
                    <Button size="sm" onClick={() => setEnding({ o, on: o.from > TODAY ? o.from : TODAY })}>End</Button>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
        <span><Button icon={Plus} onClick={() => setOv(blankOverride)}>Add override</Button></span>
      </FormSection>
      <ConfirmDialog
        open={!!ov}
        onOpenChange={(o) => !o && setOv(null)}
        title={`Add an override to ${p.name || 'this policy'}`}
        consequence="This person gets this policy instead of the one their rule gives them."
        confirmLabel="Add override"
        confirmDisabled={!picked || !ov?.from}
        onConfirm={() => {
          if (!ov?.from || !picked) return;
          // Counts follow from the dates (peopleToday), so a future start changes nothing today.
          onChange({ overrides: [...p.overrides, { name: picked.name, change: `${policyByRule(picked.location)} → ${shortName || 'this policy'}`, from: ov.from, to: ov.to ?? undefined, note: ov.note.trim() || undefined }] });
          setOv(null);
        }}
      >
        {ov && (
          <div className="yx-tim-form">
            <FormField label="Person" required helper="Only people not already on this policy"><PersonPicker aria-label="Person" people={candidates} value={ov.personId} onChange={(v) => setOv({ ...ov, personId: v })} /></FormField>
            <FieldRow>
              <FormField label="From" required><DatePicker value={ov.from} onChange={(v) => setOv({ ...ov, from: v })} min={TODAY} /></FormField>
              <FormField label="Until" optional><DatePicker value={ov.to} onChange={(v) => setOv({ ...ov, to: v })} min={ov.from ?? undefined} /></FormField>
            </FieldRow>
            <FormField label="Reason" optional><TextField value={ov.note} onChange={(v) => setOv({ ...ov, note: v })} /></FormField>
          </div>
        )}
      </ConfirmDialog>
      <ConfirmDialog
        open={!!ending}
        onOpenChange={(o) => !o && setEnding(null)}
        title={`End ${ending?.o.name ?? ''}'s override?`}
        consequence={`From the day after, they get the policy their rule gives them. Months before stay on ${p.name || 'this policy'}.`}
        confirmLabel="End override"
        confirmDisabled={!ending?.on}
        onConfirm={() => {
          if (!ending?.on) return;
          const on = ending.on;
          onChange({ overrides: p.overrides.map((x) => (x === ending.o ? { ...x, to: on, ended: true } : x)) });
          setEnding(null);
        }}
      >
        {ending && (
          <FormField label="Ends on" required>
            <DatePicker value={ending.on} onChange={(v) => setEnding({ ...ending, on: v })} min={ending.o.from > TODAY ? ending.o.from : TODAY} max={ending.o.to} />
          </FormField>
        )}
      </ConfirmDialog>
    </div>
  );
}

/** What the live app gives Leave types & policies (design audit): the company's types and policies, and the set-up calls. */
export interface LiveLeavePolicies {
  state: LoadState;
  onRetry?: () => void;
  data: TimeSetup | null;
  /** TIM-27 live example: a few people with this type in their policy, their balance and how the policy credits it. */
  onTypeExample?: (typeId: string) => Promise<{ people: TypeExamplePerson[] }>;
  /** A change to the rules applies from `validFrom` (today or later) as a new version; leave before it keeps the old rules. */
  onSaveType: (id: string | null, input: { code: string; name: string; kind: string; paid: boolean; colour: string; rules: LeaveRules; active?: boolean; validFrom?: string }) => Promise<unknown>;
  onCreatePolicy: (name: string) => Promise<unknown>;
  onAddVersion: (policyId: string, input: { validFrom: string; lines: PolicyLine[]; note?: string }) => Promise<unknown>;
  onAssign: (policyId: string, input: { scopeType: string; scopeId?: string; validFrom: string }) => Promise<unknown>;
  onRemoveAssignment: (id: string) => Promise<unknown>;
}

export interface TypeExamplePerson { employeeId: string; name: string; balance: number; pending: number; policy: { name: string; annualDays: number; frequency: 'monthly' | 'yearly' }; joinedOn?: string; category?: string | null; probation?: boolean; noticeUntil?: string | null }

type PoliciesProps = { state?: ViewState; openId?: string; /** The live app's data. Stories leave it out. */ live?: LiveLeavePolicies };

export function LeavePoliciesScreen(props: PoliciesProps) {
  return props.live ? <LiveLeavePoliciesView live={props.live} /> : <StoryLeavePolicies {...props} />;
}

const KIND_OPTIONS = [
  { value: 'earned', label: 'Earned' },
  { value: 'casual', label: 'Casual' },
  { value: 'sick', label: 'Sick' },
  { value: 'comp_off', label: 'Comp-off' },
  { value: 'lop', label: 'Unpaid (loss of pay)' },
  { value: 'maternity', label: 'Maternity (by law)' },
  { value: 'paternity', label: 'Paternity' },
  { value: 'other', label: 'Other' },
];
const COLOUR_OPTIONS = ['blue', 'green', 'teal', 'purple', 'orange', 'pink', 'grey', 'red'].map((c) => ({ value: c, label: c[0].toUpperCase() + c.slice(1) }));
const BASE_RULES: LeaveRules = { sandwich: 'none', sandwichOn: 'both', sandwichHalfDays: false, halfDays: true, minDays: null, maxDays: null, noticeDays: 0, certificateAfterDays: null, medical: false, negativeLimit: 0, encashable: false, hrApprovalAboveDays: null, employment: 'all', minServiceMonths: 0, duringProbation: true, maxDaysPerMonth: null, blockedDates: [], hourly: false, longAbsence: 'continue', duringNotice: 'allowed' };
const STATE_NAMES: Record<string, string> = { 'IN-KA': 'Karnataka', 'IN-TN': 'Tamil Nadu' };
const isoDate = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const fromIso = (iso: string) => new Date(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10)));
/** The version in force on a day, or the first one still to come. */
const inForce = (pol: TimeSetup['policies'][number], today: string) => pol.versions.filter((v) => v.validFrom <= today).sort((a, b) => b.validFrom.localeCompare(a.validFrom))[0] ?? pol.versions[pol.versions.length - 1];

/** TIM-28 (and TIM-27 for a type) on live data: the policies table and drawer, and the leave types with the designed editor. */
function LiveLeavePoliciesView({ live }: { live: LiveLeavePolicies }) {
  const { toast } = useToast();
  const d = live.data;
  const [open, setOpen] = useState<TimeSetup['policies'][number] | 'new' | null>(null);
  const [editingType, setEditingType] = useState<string | 'new' | null>(null);
  if (live.state === 'no-access') return <EmptyState title="You can't change leave set-up" description="Leave types and policies need the leave and attendance set-up key." />;
  if (d && editingType) return <LiveLeaveTypeEditor live={live} data={d} typeId={editingType} onBack={() => setEditingType(null)} />;
  const typeName = (id: string) => d?.types.find((t) => t.id === id)?.name.replace(/ leave$/, '') ?? 'Unknown';
  const rows = d?.policies.filter((x) => !x.archived) ?? [];
  const cols: TableColumn<TimeSetup['policies'][number]>[] = [
    { key: 'name', header: 'Policy', value: (r) => r.name, render: (r) => <strong>{r.name}</strong> },
    { key: 'types', header: 'Leave types', value: (r) => (inForce(r, d!.today)?.lines ?? []).map((l) => `${typeName(l.leaveTypeId)} ${l.annualDays}`).join(' · ') || 'No entitlements yet' },
    {
      key: 'who', header: 'Who gets it', value: (r) => r.assignments.map((a) => a.scopeName).join(', '),
      render: (r) => {
        const v = inForce(r, d!.today);
        const later = r.versions.find((x) => x.validFrom > d!.today);
        return (
          <span className="yx-tim-list__main" style={{ flex: 'none' }}>
            <span>{r.assignments.length ? r.assignments.map((a) => a.scopeName).join(', ') : 'Not assigned yet'}</span>
            {v && <span className="yx-tim-muted">from {day(fromIso(v.validFrom))}</span>}
            {later && <span><Badge tone="neutral">Changes from {day(fromIso(later.validFrom))}</Badge></span>}
          </span>
        );
      },
    },
  ];
  return (
    <TimePage active="Leave types & policies">
      <PageHeader
        title="Leave policies"
        description="Each policy is a set of leave types given to people by rule (the whole company, a legal entity or a location). When someone matches more than one rule, the most specific one wins: a location over its entity, an entity over the company."
        actions={<Button variant="primary" icon={Plus} disabled={!d} onClick={() => setOpen('new')}>New policy</Button>}
      />
      {d && d.statutory.length > 0 && (
        <InlineAlert tone="info" title="Minimums set by law">
          {d.statutory.map((x) => `${STATE_NAMES[x.jurisdiction] ?? x.jurisdiction}: ${(x.values.floors ?? []).map((f) => `${f.kinds.join(' and ')} ${f.days} days a year`).join(', ')}`).join(' · ')}. A policy below the minimum is raised to it when credits are made.
        </InlineAlert>
      )}
      <DataTable
        label="Leave policies"
        columns={cols}
        rows={rows}
        getRowId={(r) => r.id}
        rowNoun={['policy', 'policies']}
        onRowClick={(r) => setOpen(r)}
        activeRowId={open && open !== 'new' ? open.id : null}
        state={live.state === 'loading' ? 'loading' : live.state === 'error' ? 'error' : 'ready'}
        onRetry={live.onRetry}
        empty={<EmptyState title="No leave policies yet" description="No one gets leave until you add a policy." action={<Button variant="primary" onClick={() => setOpen('new')}>New policy</Button>} />}
      />
      {d && (
        <Card title="Leave types" actions={<Button size="sm" icon={Plus} onClick={() => setEditingType('new')}>New leave type</Button>}>
          <ul className="yx-tim-list">
            {d.types.map((t) => (
              <li key={t.id}>
                <span className="yx-tim-list__main"><strong>{t.name}</strong><span className="yx-tim-muted">{t.code} · {KIND_OPTIONS.find((k) => k.value === t.kind)?.label ?? t.kind} · {t.paid ? 'Paid' : 'Unpaid'}{t.active ? '' : ' · not in use'}</span></span>
                <Button size="sm" onClick={() => setEditingType(t.id)}>Edit</Button>
              </li>
            ))}
            {!d.types.length && <li><span className="yx-tim-muted">No leave types yet.</span></li>}
          </ul>
        </Card>
      )}
      {open && d && (
        <LivePolicyDrawer
          key={open === 'new' ? 'new' : open.id}
          live={live}
          data={d}
          policy={open === 'new' ? null : open}
          onClose={() => setOpen(null)}
          onSaved={(m) => { toast({ tone: 'success', title: m }); setOpen(null); }}
        />
      )}
    </TimePage>
  );
}

function LivePolicyDrawer({ live, data, policy, onClose, onSaved }: { live: LiveLeavePolicies; data: TimeSetup; policy: TimeSetup['policies'][number] | null; onClose: () => void; onSaved: (message: string) => void }) {
  const { toast } = useToast();
  const isNew = !policy;
  const current = policy ? inForce(policy, data.today) : undefined;
  const [name, setName] = useState('');
  const [lines, setLines] = useState<PolicyLine[]>(current?.lines ?? []);
  const [editing, setEditing] = useState<string | null>(null);
  const [scopeType, setScopeType] = useState<string | null>(null);
  const [scopeId, setScopeId] = useState<string | null>(null);
  const [from, setFrom] = useState<Date | null>(fromIso(data.today));
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState('');
  const typeOf = (id: string) => data.types.find((t) => t.id === id);
  const changedLines = JSON.stringify(lines) !== JSON.stringify(current?.lines ?? []);
  const assigning = !!scopeType && (scopeType === 'tenant' || !!scopeId);
  const canSave = !!from && (isNew ? !!name.trim() : changedLines || assigning);
  const addable = data.types.filter((t) => t.active && t.kind !== 'lop' && t.kind !== 'maternity' && !lines.some((l) => l.leaveTypeId === t.id));
  const setLine = (id: string, patch: Partial<PolicyLine>) => setLines(lines.map((l) => (l.leaveTypeId === id ? { ...l, ...patch } : l)));
  const scopeOptions = scopeType === 'legal_entity' ? data.entities.map((e) => ({ value: e.id, label: e.name })) : scopeType === 'location' ? data.locations.map((l) => ({ value: l.id, label: l.name })) : [];
  const save = async () => {
    setBusy(true);
    setFailed('');
    try {
      const validFrom = isoDate(from!);
      let id = policy?.id;
      if (isNew) id = ((await live.onCreatePolicy(name.trim())) as { id: string }).id;
      if (isNew ? lines.length > 0 : changedLines) await live.onAddVersion(id!, { validFrom, lines: lines.filter((l) => l.annualDays > 0) });
      if (assigning) await live.onAssign(id!, { scopeType: scopeType!, ...(scopeType === 'tenant' ? {} : { scopeId: scopeId! }), validFrom });
      onSaved(`${isNew ? `Added ${name.trim()}` : `Saved ${policy!.name}`} · from ${day(from!)}`);
    } catch (e) {
      setFailed(e instanceof Error ? e.message : 'Not saved. Try again.');
    } finally {
      setBusy(false);
    }
  };
  const remove = async (id: string, who: string) => {
    try {
      await live.onRemoveAssignment(id);
      toast({ tone: 'success', title: `${who} no longer gets ${policy!.name}` });
    } catch (e) {
      setFailed(e instanceof Error ? e.message : 'Not removed. Try again.');
    }
  };
  return (
    <Drawer
      open
      onOpenChange={(o) => !o && onClose()}
      title={isNew ? 'New policy' : policy!.name}
      subtitle={policy && policy.assignments.length ? policy.assignments.map((a) => a.scopeName).join(', ') : 'Not assigned yet'}
      size="lg"
      footer={
        <>
          {!canSave && <span className="yx-tim-muted" style={{ flexBasis: 'auto' }}>{isNew && !name.trim() ? 'Name the policy to save it.' : !from ? 'Choose the date the change applies from.' : 'No changes yet'}</span>}
          <Button style={{ flexBasis: 'auto' }} onClick={onClose}>Cancel</Button>
          <Button style={{ flexBasis: 'auto' }} variant="primary" disabled={!canSave} loading={busy} onClick={() => void save()}>{from ? `Save from ${day(from)}` : 'Save'}</Button>
        </>
      }
    >
      <div className="yx-tim-stack">
        {failed && <InlineAlert tone="danger" title="Not saved">{failed}</InlineAlert>}
        {isNew && <FormField label="Policy name" required><TextField value={name} maxLength={100} onChange={setName} /></FormField>}
        <FormSection title="Entitlements">
          <ul className="yx-tim-check">
            {lines.map((l) => (
              <li key={l.leaveTypeId}>
                {editing === l.leaveTypeId ? (
                  <div className="yx-tim-stack" style={{ flex: 1 }}>
                    <FieldRow>
                      <FormField label={`${typeOf(l.leaveTypeId)?.name ?? ''}: days a year`}><NumberField value={l.annualDays} decimals min={0} max={366} onChange={(v) => setLine(l.leaveTypeId, { annualDays: v ?? 0 })} /></FormField>
                      <FormField label="Carry forward up to (days)" optional helper="Empty: all of it."><NumberField value={l.carryForwardMax} decimals min={0} max={366} onChange={(v) => setLine(l.leaveTypeId, { carryForwardMax: v })} /></FormField>
                    </FieldRow>
                    <FormField label="Credited"><Segment label="Credited" value={l.frequency} onChange={(v) => setLine(l.leaveTypeId, { frequency: v })} options={[{ value: 'monthly', label: 'Monthly' }, { value: 'yearly', label: 'Once a year' }]} /></FormField>
                    <Checkbox label="Joiners get a share for the part of the year they work" checked={l.proRata} onChange={(v) => setLine(l.leaveTypeId, { proRata: v })} />
                    <span><Button size="sm" onClick={() => setEditing(null)}>Done</Button></span>
                  </div>
                ) : (
                  <>
                    <span>{typeOf(l.leaveTypeId)?.name ?? 'Unknown'} · {l.annualDays} days a year{l.frequency === 'monthly' ? ', monthly' : ''}{l.carryForwardMax === null ? '' : ` · carries up to ${l.carryForwardMax}`}</span>
                    <Button size="sm" onClick={() => setEditing(l.leaveTypeId)}>Edit</Button>
                  </>
                )}
              </li>
            ))}
            {!lines.length && <li><span className="yx-tim-muted">No entitlements yet.</span></li>}
          </ul>
          {addable.length > 0 && (
            <FormField label="Add a leave type">
              <Select value={null} placeholder="Choose a leave type" onChange={(v) => { if (v) { setLines([...lines, { leaveTypeId: v, annualDays: 0, frequency: 'monthly', proRata: true, rounding: 0.5, carryForwardMax: 0 }]); setEditing(v); } }} options={addable.map((t) => ({ value: t.id, label: t.name }))} />
            </FormField>
          )}
        </FormSection>
        <FormSection title="Who gets this policy">
          {policy && policy.assignments.length > 0 && (
            <ul className="yx-tim-list">
              {policy.assignments.map((a) => (
                <li key={a.id}>
                  <span className="yx-tim-list__main"><strong>{a.scopeName}</strong><span className="yx-tim-muted">from {day(fromIso(a.validFrom))}</span></span>
                  {a.removable && <Button size="sm" onClick={() => void remove(a.id, a.scopeName)}>Remove</Button>}
                </li>
              ))}
            </ul>
          )}
          <FieldRow>
            <FormField label="Give it to" optional><Select value={scopeType} placeholder="No one new" onChange={(v) => { setScopeType(v); setScopeId(null); }} options={[{ value: 'tenant', label: 'The whole company' }, { value: 'legal_entity', label: 'A legal entity' }, { value: 'location', label: 'A location' }]} /></FormField>
            {scopeType && scopeType !== 'tenant' && <FormField label={scopeType === 'legal_entity' ? 'Legal entity' : 'Location'} required><Select value={scopeId} onChange={setScopeId} options={scopeOptions} /></FormField>}
          </FieldRow>
          <FormField label="Applies from" required helper="Changes start on this date; earlier months stay as they were.">
            <DatePicker value={from} onChange={setFrom} min={fromIso(data.today)} />
          </FormField>
        </FormSection>
      </div>
    </Drawer>
  );
}

const LIVE_SECTIONS = { basics: 'Basics', eligibility: 'Eligibility', crediting: 'Crediting', counting: 'Counting', rules: 'Rules', yearend: 'Year end', absence: 'Absence & notice' } as const;
const EMPLOYMENT_FOR: Record<string, string[] | null> = { all: null, permanent_contract: ['permanent', 'probation', 'fixed_term', 'deployed_contractor', 'consultant', 'retired_reemployed'], permanent: ['permanent', 'probation', 'retired_reemployed'] };
const EMPLOYMENT_TEXT: Record<string, string> = { permanent: 'permanent staff', permanent_contract: 'permanent and contract staff' };
/** What the TIM-27 rules (all dated with the version) say about the live example's request, in the server's words. */
function exampleStops(name: string, r: LeaveRules, p: TypeExamplePerson | null, today: string, days: { on: string; counted: boolean }[], total: number): string[] {
  const out: string[] = [];
  const first = days[0]?.on ?? today;
  const noticeDays = r.noticeDays ?? 0;
  if (noticeDays && Math.round((fromIso(first).getTime() - fromIso(today).getTime()) / 86_400_000) < noticeDays) out.push(`${name} needs ${noticeDays} ${noticeDays === 1 ? "day's" : "days'"} notice.`);
  for (const b of r.blockedDates ?? []) {
    const hit = days.find((d) => d.counted && d.on >= b.from && d.on <= b.to);
    if (hit) out.push(`${day(fromIso(hit.on))} is a company block date for ${name} (${b.reason}). Pick other dates.`);
  }
  if (r.maxDaysPerMonth != null && total > r.maxDaysPerMonth) out.push(`${name} is at most ${num(r.maxDaysPerMonth)} days in a month.`);
  if (p) {
    const allowed = EMPLOYMENT_FOR[r.employment ?? 'all'];
    if (allowed && !allowed.includes(p.category ?? '')) out.push(`${name} is for ${EMPLOYMENT_TEXT[r.employment!]} only.`);
    if (r.minServiceMonths && p.joinedOn) {
      const j = fromIso(p.joinedOn);
      const reach = new Date(j.getFullYear(), j.getMonth() + r.minServiceMonths, j.getDate());
      if (fromIso(first) < reach) out.push(`${name} can be taken after ${r.minServiceMonths} months of work: from ${day(reach)}.`);
    }
    if (r.duringProbation === false && p.probation) out.push(`${name} can't be taken during probation.`);
    if (p.noticeUntil && first <= p.noticeUntil && r.duringNotice === 'blocked') out.push(`${name} can't be taken during the notice period.`);
  }
  return out;
}
const WHO_CAN: Record<string, string[] | null> = { all: null, f: ['female'], m: ['male'] };

/** TIM-27 on live data: one leave type's basics, counting, rules and year end, with the live example of a Fri–Mon request. */
function LiveLeaveTypeEditor({ live, data, typeId, onBack }: { live: LiveLeavePolicies; data: TimeSetup; typeId: string; onBack: () => void }) {
  const { toast } = useToast();
  const row = data.types.find((t) => t.id === typeId) ?? null;
  // The newest version (one still to start, if any) is what a change builds on.
  const latest = row?.versions[0] ?? null;
  const upcoming = latest && latest.validFrom > data.today ? latest : null;
  const start = { code: row?.code ?? '', name: row?.name ?? '', kind: row?.kind ?? 'other', paid: latest?.paid ?? row?.paid ?? true, colour: row?.colour ?? 'blue', active: row?.active ?? true, rules: { ...BASE_RULES, ...(row ? {} : { longAbsence: 'pause' as const }), ...(latest?.rules ?? row?.rules ?? {}) } };
  const [asking, setAsking] = useState(false);
  const [from, setFrom] = useState<Date | null>(upcoming ? fromIso(upcoming.validFrom) : fromIso(data.today));
  const [form, setForm] = useState(start);
  const [sec, setSec] = useState<string>('basics');
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState('');
  const narrow = useNarrow();
  const set = (patch: Partial<typeof form>) => setForm({ ...form, ...patch });
  const setRules = (patch: Partial<LeaveRules>) => setForm({ ...form, rules: { ...form.rules, ...patch } });
  const dirty = JSON.stringify(form) !== JSON.stringify(start);
  const limitErr = form.rules.minDays != null && form.rules.maxDays != null && form.rules.minDays > form.rules.maxDays ? 'More than the most days in one request.' : null;
  const saveBlocked = !form.name.trim() ? 'Fill in the name in Basics' : !/^[A-Z][A-Z0-9]{0,7}$/.test(form.code) ? 'Fill in a code of 1 to 8 capital letters in Basics' : limitErr ? 'Fix the request limit in Rules' : !form.paid && form.rules.hourly ? 'Unpaid leave cannot be taken by the hour: see Counting' : null;
  const usedIn = data.policies.filter((x) => (inForce(x, data.today)?.lines ?? []).some((l) => l.leaveTypeId === typeId));
  const back = useCrumbBack(dirty, onBack, (row?.name ?? 'the new leave type').toLowerCase());
  const [examples, setExamples] = useState<TypeExamplePerson[]>([]);
  const [exampleId, setExampleId] = useState<string | null>(null);
  useEffect(() => {
    if (!row || !live.onTypeExample) return;
    let on = true;
    live.onTypeExample(row.id).then((x) => { if (on) { setExamples(x.people); setExampleId(x.people[0]?.employeeId ?? null); } }, () => undefined);
    return () => { on = false; };
    // Loaded once per type.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [row?.id]);
  const person = examples.find((x) => x.employeeId === exampleId) ?? null;
  // Fri 13 – Mon 16 Nov with Sat 14 and Sun 15 as weekly offs: how this type counts the weekend between.
  const ex = countLeaveDays({ from: new Date(2026, 10, 13), to: new Date(2026, 10, 16), holidays: [], weeklyOffDays: [0, 6], weeklyOffDates: [], sandwich: form.rules.sandwich });
  // Pay is dated with the rules (founder decision 20 Oct 2026): either asks for the date the new version starts.
  const rulesChanged = JSON.stringify(form.rules) !== JSON.stringify(start.rules) || form.paid !== start.paid;
  const [addingDates, setAddingDates] = useState<{ from: Date | null; to: Date | null; reason: string } | null>(null);
  const monthErr = form.rules.maxDays != null && form.rules.maxDaysPerMonth != null && form.rules.maxDays > form.rules.maxDaysPerMonth ? `More than the monthly limit of ${num(form.rules.maxDaysPerMonth)} days. A request that big can never be approved.` : null;
  const next = upcoming ? upcoming.version : (row?.version ?? 0) + 1;
  const save = async () => {
    setBusy(true);
    setFailed('');
    try {
      const validFrom = row && rulesChanged ? isoDate(from!) : undefined;
      await live.onSaveType(row?.id ?? null, { code: form.code, name: form.name.trim(), kind: form.kind, paid: form.paid, colour: form.colour, rules: form.rules, active: form.active, ...(validFrom ? { validFrom } : {}) });
      toast({ tone: 'success', title: !row ? `Added ${form.name.trim()}` : validFrom ? `Saved ${form.name.trim()} as version ${next} · from ${day(from!)}` : `Saved ${form.name.trim()}` });
      setAsking(false);
      onBack();
    } catch (e) {
      setFailed(e instanceof Error ? e.message : 'Not saved. Try again.');
    } finally {
      setBusy(false);
    }
  };
  const title = form.name.trim() || 'New leave type';
  return (
    <TimePage active="Leave types & policies">
      <div onClickCapture={back.onClickCapture}>
      <PageHeader
        breadcrumbs={<Breadcrumbs items={[{ label: 'Leave types & policies', href: '#policies' }, { label: title }]} />}
        title={title}
        description={`${form.paid ? 'Paid' : 'Unpaid'} · ${usedIn.length ? `used in ${plural(usedIn.length, 'policy', 'policies')}: ${usedIn.map((x) => x.name).join('; ')}` : 'not in a policy yet'}.`}
        status={row ? <Badge tone={row.active ? 'success' : 'neutral'}>{`${row.active ? 'Active' : 'Not in use'} · version ${row.version}`}</Badge> : <Badge tone="neutral">Not saved yet</Badge>}
        actions={
          <div className="yx-tim-row">
            {!dirty ? <span className="yx-tim-muted">No changes yet</span> : saveBlocked && <span className="yx-tim-muted">{saveBlocked}</span>}
            <Button variant="primary" disabled={!dirty || !!saveBlocked} loading={busy} onClick={() => (row && rulesChanged ? setAsking(true) : void save())}>{!row ? 'Add leave type' : rulesChanged || !dirty ? `Save as version ${next}` : 'Save changes'}</Button>
          </div>
        }
      />
      </div>
      {back.dialog}
      {failed && <InlineAlert tone="danger" title="Not saved">{failed}</InlineAlert>}
      <ConfirmDialog
        open={!!addingDates}
        onOpenChange={(o) => !o && setAddingDates(null)}
        title="Add dates when no one can take it"
        confirmLabel="Add dates"
        confirmDisabled={!addingDates?.from || !addingDates.to || !addingDates.reason.trim() || addingDates.to < addingDates.from}
        onConfirm={() => {
          if (!addingDates?.from || !addingDates.to) return;
          setRules({ blockedDates: [...(form.rules.blockedDates ?? []), { from: isoDate(addingDates.from), to: isoDate(addingDates.to), reason: addingDates.reason.trim() }] });
          setAddingDates(null);
        }}
      >
        {addingDates && (
          <div className="yx-tim-form">
            <FieldRow>
              <FormField label="From" required><DatePicker value={addingDates.from} onChange={(v) => setAddingDates({ ...addingDates, from: v })} min={fromIso(data.today)} /></FormField>
              <FormField label="To" required><DatePicker value={addingDates.to} onChange={(v) => setAddingDates({ ...addingDates, to: v })} min={addingDates.from ?? fromIso(data.today)} /></FormField>
            </FieldRow>
            <FormField label="Reason" required helper="People see it when they pick these dates."><TextField value={addingDates.reason} maxLength={100} onChange={(v) => setAddingDates({ ...addingDates, reason: v })} /></FormField>
          </div>
        )}
      </ConfirmDialog>
      {upcoming && <InlineAlert tone="info" title={`Version ${upcoming.version} starts on ${day(fromIso(upcoming.validFrom))}`}>You are changing that version. Leave before it follows version {row!.version}.</InlineAlert>}
      <ConfirmDialog
        open={asking}
        onOpenChange={setAsking}
        title={`Save ${title.toLowerCase()} as version ${next}?`}
        consequence={from ? `Leave that starts before ${day(from)} keeps the rules and pay of version ${row?.version ?? 1}; leave that starts on or after it follows version ${next}. Leave already taken or asked for, and payslips already made, do not change.` : 'Choose the date the new rules start.'}
        confirmLabel={`Save version ${next}`}
        confirmDisabled={!from || busy}
        onConfirm={() => void save()}
      >
        <FormField label="Applies from" required><DatePicker value={from} onChange={setFrom} min={fromIso(data.today)} /></FormField>
      </ConfirmDialog>
      <div className="yx-tim-editor">
        <div className="yx-tim-form">
          <Tabs value={sec} onValueChange={setSec}>
            {narrow ? (
              <FormField label="Section"><Select value={sec} onChange={(v) => v && setSec(v)} options={Object.entries(LIVE_SECTIONS).map(([value, label]) => ({ value, label }))} /></FormField>
            ) : (
              <TabsList aria-label="Sections">{Object.entries(LIVE_SECTIONS).map(([k, label]) => <TabsTrigger key={k} value={k}>{label}</TabsTrigger>)}</TabsList>
            )}
            <TabsContent value="basics">
              <FormSection title="Basics">
                <FieldRow>
                  <FormField label="Name" required><TextField value={form.name} maxLength={60} onChange={(v) => set({ name: v })} /></FormField>
                  <FormField label="Code" required helper={row ? "A saved type's code doesn't change." : '1 to 8 capital letters, for example EL.'}><TextField value={form.code} maxLength={8} disabled={!!row} onChange={(v) => set({ code: v.toUpperCase() })} /></FormField>
                </FieldRow>
                <FormField label="Kind"><Select value={form.kind} disabled={!!row} onChange={(v) => v && set({ kind: v })} options={KIND_OPTIONS} /></FormField>
                <FormField label="Pay"><RadioGroup aria-label="Pay" value={form.paid ? 'paid' : 'unpaid'} onChange={(v) => set({ paid: v === 'paid' })} orientation="horizontal" options={[{ value: 'paid', label: 'Paid' }, { value: 'unpaid', label: 'Unpaid (shows days taken, no balance)' }]} /></FormField>
                <FormField label="Colour"><Select value={form.colour} onChange={(v) => v && set({ colour: v })} options={COLOUR_OPTIONS} /></FormField>
                {row && <Switch label="In use" description="A type not in use can't be applied for; what was taken stays." checked={form.active} onChange={(v) => set({ active: v })} />}
              </FormSection>
            </TabsContent>
            <TabsContent value="eligibility">
              <FormSection title="Who gets it">
                <FieldRow>
                  <FormField label="Employment type"><Select value={form.rules.employment ?? 'all'} onChange={(v) => v && setRules({ employment: v as LeaveRules['employment'] })} options={[{ value: 'permanent_contract', label: 'Permanent and contract' }, { value: 'permanent', label: 'Permanent only' }, { value: 'all', label: 'Permanent, contract and interns' }]} /></FormField>
                  <FormField label="After working (months)"><NumberField value={form.rules.minServiceMonths ?? 0} min={0} max={120} onChange={(v) => setRules({ minServiceMonths: v ?? 0 })} /></FormField>
                </FieldRow>
                <Switch label="Available during probation" checked={form.rules.duringProbation ?? true} onChange={(v) => setRules({ duringProbation: v })} />
                <FormField label="Who can take it">
                  <Select value={Object.keys(WHO_CAN).find((k) => JSON.stringify(WHO_CAN[k]) === JSON.stringify(form.rules.eligibleGenders ?? null)) ?? 'all'} onChange={(v) => v && setRules({ eligibleGenders: WHO_CAN[v] as LeaveRules['eligibleGenders'] })} options={[{ value: 'all', label: 'Everyone' }, { value: 'f', label: 'Women only' }, { value: 'm', label: 'Men only' }]} />
                </FormField>
                <p className="yx-tim-note">Who gets it at all is set by the policies it is in. HR can let one person through, with a reason.</p>
              </FormSection>
            </TabsContent>
            <TabsContent value="crediting">
              <FormSection title="Crediting">
                <p className="yx-tim-muted">Each policy credits it its own way. The yearly days are set in the policy.</p>
                {usedIn.length === 0 ? (
                  <p className="yx-tim-muted">Not in a policy yet, so no one is credited it.</p>
                ) : (
                  <ul className="yx-tim-list">
                    {usedIn.map((x) => {
                      const l = inForce(x, data.today)!.lines.find((y) => y.leaveTypeId === typeId)!;
                      return (
                        <li key={x.id}>
                          <span className="yx-tim-list__main">
                            <strong>{x.name}</strong>
                            <span className="yx-tim-muted">{num(l.annualDays)} days a year · {l.frequency === 'monthly' ? 'credited each month' : 'credited once a year'}{l.proRata ? ' · pro-rata for people who join during the year' : ''}{l.rounding ? ` · rounded to ${num(l.rounding)}` : ''}</span>
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </FormSection>
            </TabsContent>
            <TabsContent value="counting">
              <FormSection title="Counting">
                <FormField label="Weekly offs and holidays inside the leave" helper="For example, a Saturday and Sunday between Friday and Monday leave">
                  <RadioGroup aria-label="Weekly offs and holidays inside the leave" value={form.rules.sandwich} onChange={(v) => setRules({ sandwich: v as LeaveRules['sandwich'] })} options={[{ value: 'none', label: 'Never count them' }, { value: 'sandwich', label: 'Count them when they fall between leave days' }, { value: 'always', label: 'Always count them' }]} />
                </FormField>
                <FormField label="Applies to" disabled={form.rules.sandwich === 'none'} helper={form.rules.sandwich === 'none' ? 'Not used when weekly offs and holidays are never counted' : undefined}>
                  <Select value={form.rules.sandwichOn} disabled={form.rules.sandwich === 'none'} onChange={(v) => v && setRules({ sandwichOn: v as LeaveRules['sandwichOn'] })} options={[{ value: 'both', label: 'Weekly offs and holidays' }, { value: 'weekly_offs', label: 'Weekly offs only' }, { value: 'holidays', label: 'Holidays only' }]} />
                </FormField>
                <Switch label="Half days (first or second half)" checked={form.rules.halfDays} onChange={(v) => setRules({ halfDays: v })} />
                <Switch label="A half day next to a weekend also counts the weekend" checked={form.rules.sandwichHalfDays} disabled={form.rules.sandwich === 'none'} onChange={(v) => setRules({ sandwichHalfDays: v })} />
                <Switch label="Leave by the hour" description={form.paid ? 'People can ask for some hours of one day; they count toward the day.' : 'Only paid leave can be taken by the hour.'} checked={form.rules.hourly ?? false} disabled={!form.paid && !form.rules.hourly} onChange={(v) => setRules({ hourly: v })} />
              </FormSection>
            </TabsContent>
            <TabsContent value="rules">
              <FormSection title="Rules">
                <FieldRow>
                  <FormField label="Apply at least (days ahead)"><NumberField value={form.rules.noticeDays} min={0} max={90} onChange={(v) => setRules({ noticeDays: v ?? 0 })} /></FormField>
                  <FormField label="Fewest days in one request" error={limitErr}><NumberField value={form.rules.minDays} decimals min={0.5} max={366} onChange={(v) => setRules({ minDays: v })} /></FormField>
                  <FormField label="Most days in one request" error={monthErr}><NumberField value={form.rules.maxDays} decimals min={0.5} max={366} onChange={(v) => setRules({ maxDays: v })} /></FormField>
                  <FormField label="Most days in a month"><NumberField value={form.rules.maxDaysPerMonth ?? null} decimals min={0.5} max={31} onChange={(v) => setRules({ maxDaysPerMonth: v })} /></FormField>
                </FieldRow>
                <FieldRow>
                  <FormField label="Ask for a certificate when leave is longer than (days)" helper="Leave blank to never ask"><NumberField value={form.rules.certificateAfterDays} min={0} max={366} onChange={(v) => setRules({ certificateAfterDays: v })} /></FormField>
                  <FormField label="Balance may go below zero by (days)"><NumberField value={form.rules.negativeLimit} decimals min={0} max={30} onChange={(v) => setRules({ negativeLimit: v ?? 0 })} /></FormField>
                </FieldRow>
                <FormField label="HR approves too when longer than (days)" helper="Leave blank for the manager alone"><NumberField value={form.rules.hrApprovalAboveDays} decimals min={0} max={366} onChange={(v) => setRules({ hrApprovalAboveDays: v })} /></FormField>
                <Switch label="Medical leave" description="The reason and the certificate are seen only by the person and HR." checked={form.rules.medical} onChange={(v) => setRules({ medical: v })} />
                <FormField label="Dates when no one can take it">
                  <div className="yx-tim-stack">
                    {(form.rules.blockedDates ?? []).length === 0 ? (
                      <p className="yx-tim-muted">None. People can take it on any working day.</p>
                    ) : (
                      <ul className="yx-tim-list">
                        {(form.rules.blockedDates ?? []).map((b, i) => (
                          <li key={`${b.from}-${i}`}>
                            <span className="yx-tim-list__main"><strong>{b.from === b.to ? day(fromIso(b.from)) : `${dayShort(fromIso(b.from))} – ${day(fromIso(b.to))}`}</strong><span className="yx-tim-muted">{b.reason}</span></span>
                            <Button size="sm" aria-label={`Remove the blocked dates ${b.reason}`} onClick={() => setRules({ blockedDates: (form.rules.blockedDates ?? []).filter((_, j) => j !== i) })}>Remove</Button>
                          </li>
                        ))}
                      </ul>
                    )}
                    <span><Button icon={Plus} onClick={() => setAddingDates({ from: null, to: null, reason: '' })}>Add dates</Button></span>
                  </div>
                </FormField>
              </FormSection>
            </TabsContent>
            <TabsContent value="yearend">
              <FormSection title="Year end">
                <Switch label="Can be paid out (encashed)" checked={form.rules.encashable} onChange={(v) => setRules({ encashable: v })} />
                <p className="yx-tim-note">How much carries forward is set for each policy, in Leave policies.</p>
              </FormSection>
            </TabsContent>
            <TabsContent value="absence">
              <FormSection title="During long absence">
                <RadioGroup aria-label="Crediting during long absence" value={form.rules.longAbsence ?? 'continue'} onChange={(v) => setRules({ longAbsence: v as LeaveRules['longAbsence'] })} options={[{ value: 'pause', label: 'Stop crediting during a sabbatical or long unpaid leave (default)' }, { value: 'continue', label: 'Keep crediting' }]} />
                <p className="yx-tim-note">A month spent wholly on unpaid leave earns no monthly credit when crediting stops. Maternity leave always counts as service, so crediting continues by law.</p>
              </FormSection>
              <FormSection title="During the notice period">
                <RadioGroup aria-label="During notice" value={form.rules.duringNotice ?? 'allowed'} onChange={(v) => setRules({ duringNotice: v as LeaveRules['duringNotice'] })} options={[{ value: 'allowed', label: 'Allowed (default)' }, { value: 'unpaid', label: 'Counted as unpaid leave' }, { value: 'extends', label: 'Moves the last working day later' }, { value: 'blocked', label: 'Not allowed' }]} />
              </FormSection>
            </TabsContent>
          </Tabs>
        </div>
        <div className="yx-tim-sticky">
          <Card title="Live example">
            <div className="yx-tim-stack">
              {examples.length > 0 && <FormField label="Preview for"><Select value={exampleId} onChange={setExampleId} options={examples.map((x) => ({ value: x.employeeId, label: x.name }))} /></FormField>}
              <p className="yx-tim-muted">{person?.name ?? 'Someone'} applies Fri 13 Nov – Mon 16 Nov (Sat 14 and Sun 15 Nov are weekly offs)</p>
              <ul className="yx-tim-days">{ex.days.map((x) => <li key={x.date.getTime()}><span>{weekday(x.date)} {day(x.date)}</span><strong>{x.kind === 'counted' ? '1' : x.kind === 'sandwich' ? '1 (between leave days)' : '0 (off)'}</strong></li>)}</ul>
              <Kpis items={[{ label: 'Days counted', value: ex.total }, ...(person ? [{ label: `${title} balance`, value: `${num(person.balance)}${person.pending > 0 ? ` (${num(person.pending)} pending)` : ''} → ${num(person.balance - person.pending - ex.total)}` }] : [])]} />
              {person && <p className="yx-tim-note">{person.name} is on {person.policy.name}, which credits {num(person.policy.annualDays)} days a year {person.policy.frequency === 'monthly' ? 'month by month' : 'all at once at the start of the leave year'}.</p>}
              {(() => {
                const stops = exampleStops(title, form.rules, person, data.today, ex.days.map((x) => ({ on: isoDate(x.date), counted: x.kind === 'counted' || x.kind === 'sandwich' })), ex.total);
                return stops.length ? (
                  <InlineAlert tone="warning" title="This request would be refused">
                    <ul className="yx-tim-steps">{stops.map((m) => <li key={m}>{m}</li>)}</ul>
                  </InlineAlert>
                ) : (
                  <p className="yx-tim-note">The rules let this request through.</p>
                );
              })()}
            </div>
          </Card>
        </div>
      </div>
    </TimePage>
  );
}

function StoryLeavePolicies({ state = 'ready', openId }: PoliciesProps) {
  const [rows, setRows] = useState<PolicyRow[]>(POLICIES);
  const [draft, setDraft] = useState<PolicyRow | null>(openId ? POLICIES.find((p) => p.id === openId) ?? null : null);
  const [isNew, setIsNew] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [from, setFrom] = useState<Date | null>(new Date(2026, 9, 1));
  const [showUncovered, setShowUncovered] = useState(false);
  // The arrows change a draft order; it applies only after "Save order" with a date.
  const [order, setOrder] = useState<string[] | null>(null);
  const [orderSave, setOrderSave] = useState(false);
  const [orderFrom, setOrderFrom] = useState<Date | null>(new Date(2026, 9, 1));
  const shown = order ? [...order.map((id) => rows.find((r) => r.id === id)!), ...rows.filter((r) => !order.includes(r.id))] : rows;
  const move = (id: string, by: -1 | 1) => {
    const ids = shown.map((r) => r.id);
    const i = ids.indexOf(id);
    const j = i + by;
    if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    setOrder(ids.join() === rows.map((r) => r.id).join() ? null : ids);
  };
  // Policy changes saved with a later start date: the table keeps today's values and shows "Changes from …".
  const [pending, setPending] = useState<Record<string, { row: PolicyRow; from: Date }>>({});
  const [pendingOrder, setPendingOrder] = useState<{ ids: string[]; from: Date } | null>(null);
  const openPolicy = (p: PolicyRow | null, fresh = false) => { setDraft(p); setIsNew(fresh); setDirty(fresh); };
  // A row with a saved future change opens on that change; overrides always come from today's row.
  const openRow = (r: PolicyRow) => openPolicy(pending[r.id] ? { ...pending[r.id].row, overrides: r.overrides } : r);
  const change = (patch: Partial<PolicyRow>) => { setDraft((d) => d && { ...d, ...patch }); setDirty(true); };
  const save = () => {
    if (!draft || !from) return;
    const orig = rows.find((r) => r.id === draft.id);
    const policyChanged = !orig || JSON.stringify([draft.ents, draft.rule]) !== JSON.stringify([orig.ents, orig.rule]);
    const later = from > TODAY;
    // Overrides carry their own dates, so they are kept at once; entitlement and rule changes wait for their start date.
    setRows((rs) => (isNew ? [...rs, { ...draft, from }] : rs.map((r) => (r.id !== draft.id ? r : later || !policyChanged ? { ...r, overrides: draft.overrides } : { ...draft, from }))));
    if (!isNew && later && policyChanged) setPending((p) => ({ ...p, [draft.id]: { row: { ...draft, from }, from } }));
    openPolicy(null);
  };
  const canSave = dirty && !!from && (!isNew || draft?.name.trim() !== '');
  const uncovered = rows.some((r) => r.rule.entity === 'kf-tn' && (r.rule.grade === 's5' || r.rule.grade === 's1-s5')) ? 0 : NO_POLICY.length;
  const covered = rows.reduce((s, r) => s + peopleToday(r, rows), 0);
  const ready = state === 'ready';
  const activeOverrides = (r: PolicyRow) => r.overrides.filter(overrideActive).length;
  // Who changes policy with the new order: each overlapping pair whose order flipped.
  // ponytail: the overlap is the smaller policy's headcount; count per person when people carry entity, grade and type.
  const orderMoves = rows.flatMap((a, i) =>
    rows.slice(i + 1).flatMap((b) =>
      shown.indexOf(b) < shown.indexOf(a) && rulesOverlap(a.rule, b.rule)
        ? [`${plural(Math.min(peopleToday(a, rows), peopleToday(b, rows)), 'person moves', 'people move')} from ${a.name} to ${b.name}.`]
        : [],
    ),
  );
  const nowrap = { whiteSpace: 'nowrap' } as const;
  // Order sits in the Policy cell (badge and name, arrows at the right end) so phone cards stay short (R10).
  const cols: TableColumn<PolicyRow>[] = [
    {
      key: 'name', header: 'Policy (order)', value: (r) => r.name,
      render: (r) => {
        const i = shown.indexOf(r);
        return (
          <span className="yx-tim-row" style={{ flexWrap: 'nowrap', alignItems: 'flex-start' }}>
            <Badge tone="neutral">#{i + 1}</Badge>
            <strong style={{ flex: 1, minWidth: 0 }}>{r.name}</strong>
            {/* Arrows reorder; they must not also open the drawer. */}
            <span className="yx-tim-row" style={{ flexWrap: 'nowrap', flexShrink: 0 }} onClick={(e) => e.stopPropagation()}>
              <IconButton icon={ArrowUp} label={`Move ${r.name} up`} size="sm" disabled={i === 0} onClick={() => move(r.id, -1)} />
              <IconButton icon={ArrowDown} label={`Move ${r.name} down`} size="sm" disabled={i === shown.length - 1} onClick={() => move(r.id, 1)} />
            </span>
          </span>
        );
      },
    },
    { key: 'types', header: 'Leave types', value: typesText },
    {
      key: 'rule', header: 'Who gets it',
      value: (r) => `${ruleText(r.rule)} · ${plural(peopleToday(r, rows), 'person', 'people')}${activeOverrides(r) > 0 ? ` · ${plural(activeOverrides(r), 'override')}` : ''} · from ${day(r.from)}`,
      // Two lines: the rule, then the count and start date, with dates and counts kept whole (R10).
      render: (r) => (
        // flex: none: in the phone card's column cell the list__main flex-basis would become a 256 px minimum height.
        <span className="yx-tim-list__main" style={{ flex: 'none' }}>
          <span>{ruleText(r.rule)}</span>
          <span className="yx-tim-muted">
            <span style={nowrap}>{plural(peopleToday(r, rows), 'person', 'people')}</span>
            {activeOverrides(r) > 0 && <> · <span style={nowrap}>{plural(activeOverrides(r), 'override')}</span></>}
            {' · '}<span style={nowrap}>from {day(r.from)}</span>
          </span>
          {pending[r.id] && <span><Badge tone="neutral">Changes from {day(pending[r.id].from)}</Badge></span>}
        </span>
      ),
    },
  ];
  const templateButtons = (
    <div className="yx-tim-row">
      <Button variant="primary" onClick={() => openPolicy(newPolicy({ name: 'Staff · Tamil Nadu' }), true)}>Use the Tamil Nadu template</Button>
      <Button onClick={() => openPolicy(newPolicy({ name: 'Staff · Karnataka', ents: POLICIES[1].ents.map((e) => ({ ...e })), rule: { entity: 'kf-ka', grade: 'all' } }), true)}>Use the Karnataka template</Button>
    </div>
  );
  return (
    <TimePage active="Leave types & policies" user={HR_ADMIN}>
      <PageHeader
        title="Leave policies"
        description="Each policy is a set of leave types given to people by rule (entity, location, grade or employee type). When someone matches more than one rule, the policy higher in the order wins."
        actions={<Button variant="primary" icon={Plus} onClick={() => openPolicy(newPolicy(), true)}>New policy</Button>}
      />
      {ready && uncovered > 0 && (
        <InlineAlert
          tone="warning"
          title={`${uncovered} people match no policy`}
          actions={
            <>
              <Button size="sm" onClick={() => setShowUncovered((s) => !s)}>{showUncovered ? 'Hide them' : 'Show them'}</Button>
              <Button size="sm" onClick={() => openPolicy(newPolicy({ name: 'Staff · Tamil Nadu · grade S5', people: NO_POLICY.length, rule: { entity: 'kf-tn', grade: 's5' } }), true)}>Add a rule for grade S5</Button>
            </>
          }
        >
          {uncovered} new joiners on grade S5 in the Tamil Nadu entity get no leave until a rule covers them.
          {showUncovered && <ul className="yx-tim-days">{NO_POLICY.map((p) => <li key={p.name}><span>{p.name}</span><strong>Joined {dayShort(p.joined)}</strong></li>)}</ul>}
        </InlineAlert>
      )}
      {ready && <p className="yx-tim-muted">{covered} people covered by {plural(rows.length, 'policy', 'policies')}{uncovered > 0 ? ` · ${uncovered} not covered` : ''}</p>}
      <DataTable
        label="Leave policies"
        columns={cols}
        rows={state === 'empty' ? [] : shown}
        getRowId={(r) => r.id}
        rowNoun={['policy', 'policies']}
        onRowClick={openRow}
        activeRowId={draft?.id ?? null}
        state={state === 'loading' ? 'loading' : state === 'error' ? 'error' : 'ready'}
        onRetry={() => {}}
        empty={<EmptyState title="No leave policies yet" description="No one gets leave until you add a policy. Start from the Tamil Nadu or Karnataka template and edit it." action={templateButtons} />}
      />
      {order && (
        <div className="yx-tim-row">
          <span className="yx-tim-muted">Order changed, not saved yet</span>
          <Button onClick={() => setOrder(null)}>Cancel</Button>
          <Button variant="primary" onClick={() => setOrderSave(true)}>Save order</Button>
        </div>
      )}
      {pendingOrder && !order && (
        <div className="yx-tim-row">
          <Badge tone="neutral">New order from {day(pendingOrder.from)}</Badge>
          <span className="yx-tim-muted">{pendingOrder.ids.map((id, i) => `#${i + 1} ${rows.find((r) => r.id === id)?.name ?? ''}`).join(' · ')}</span>
        </div>
      )}
      <ConfirmDialog
        open={orderSave}
        onOpenChange={setOrderSave}
        title="Save the new policy order?"
        consequence={`${orderMoves.length > 0 ? orderMoves.join(' ') : 'No one changes policy: the policies you moved share no people.'} Earlier months stay as they were.`}
        confirmLabel={orderFrom ? `Save from ${day(orderFrom)}` : 'Save order'}
        confirmDisabled={!orderFrom}
        onConfirm={() => {
          if (!orderFrom) return;
          // A later start keeps today's order in the table until that date.
          if (orderFrom > TODAY) setPendingOrder({ ids: shown.map((r) => r.id), from: orderFrom });
          else { setRows(shown); setPendingOrder(null); }
          setOrder(null);
          setOrderSave(false);
        }}
      >
        <FormField label="Applies from" required><DatePicker value={orderFrom} onChange={setOrderFrom} min={TODAY} /></FormField>
      </ConfirmDialog>
      <Drawer
        open={!!draft}
        onOpenChange={(o) => !o && openPolicy(null)}
        title={isNew ? 'New policy' : draft?.name ?? ''}
        subtitle={draft ? ruleText(draft.rule) : undefined}
        size="lg"
        footer={
          <>
            {/* flexBasis auto: the shared phone rule's 100% basis is a full height in the stacked footer and pushed the buttons into a second column off-screen. */}
            {draft && !canSave && <span className="yx-tim-muted" style={{ flexBasis: 'auto' }}>{isNew && !draft.name.trim() ? 'Name the policy to save it.' : !from ? 'Choose the date the change applies from.' : 'No changes yet'}</span>}
            <Button style={{ flexBasis: 'auto' }} onClick={() => openPolicy(null)}>Cancel</Button>
            <Button style={{ flexBasis: 'auto' }} variant="primary" disabled={!canSave} onClick={save}>{from ? `Save from ${day(from)}` : 'Save'}</Button>
          </>
        }
      >
        {draft && <PolicyDrawerBody key={draft.id} p={draft} isNew={isNew} onChange={change} from={from} onFrom={(d) => { setFrom(d); setDirty(true); }} today={peopleToday(draft, isNew ? [...rows, draft] : rows.map((r) => (r.id === draft.id ? draft : r)))} />}
      </Drawer>
    </TimePage>
  );
}

/* =====================================================================
   TIM-29 · Year-end wizard + leave-year change transition wizard
   ===================================================================== */

type EntityId = 'kf-tn' | 'kf-ka';
type YeSample = YearEndRow & { entity: EntityId };
/** Projected 31 Dec 2026 earned leave: balance today − pending (the year's credit was granted on 1 Jan). */
const elClosing = (person: string) => {
  const b = balancesFor(person).find((x) => x.code === 'EL')!;
  return b.balance - b.pending;
};
/** 7 days a year in total: days encashed during the year (TIM-24) leave the balance and come off the year-end payout limit. */
const el = (name: string, entity: EntityId, closing: number, encashed = 0): YeSample => ({ name, entity, type: 'Earned leave', closing: closing - encashed, cfCap: CF_CAP, encashMax: elEncashLeftAtYearEnd(encashed) });
/** A sample of people; the KPIs cover everyone. */
const YE_SAMPLE: YeSample[] = [
  // Divya's 5-day encashment from TIM-24, projected as paid in October.
  el('Divya Raghunathan', 'kf-tn', elClosing('Divya Raghunathan'), 5),
  el('Arun Prakash', 'kf-tn', 18),
  el('Meera Krishnan', 'kf-tn', 45),
  el('Priya Shankar', 'kf-tn', elClosing('Priya Shankar')),
  { name: 'Sanjay Rao', entity: 'kf-tn', type: 'Casual leave', closing: 3, cfCap: 0, encashMax: 0 },
  el('Ananya Hegde', 'kf-ka', 16.5),
  el('Rohit Kulkarni', 'kf-ka', 26.5),
  el('Shwetha Gowda', 'kf-ka', 32.5),
  el('Naveen Shetty', 'kf-ka', 10.5),
];
const entityPeople = (id: string) => entityHeadcount(id);
/** Year-end totals per entity (all people, not just the sample). */
const YE_TOTALS: Record<EntityId, { carried: number; lapse: number; drafts: number }> = {
  'kf-ka': { carried: 1236, lapse: 214, drafts: 15 },
  'kf-tn': { carried: 2176, lapse: 397, drafts: 26 },
};
const yeTotals = (id: string) => {
  const ids: EntityId[] = id === 'all' ? ['kf-tn', 'kf-ka'] : [id as EntityId];
  return ids.reduce((s, i) => ({ people: s.people + entityPeople(i), carried: s.carried + YE_TOTALS[i].carried, lapse: s.lapse + YE_TOTALS[i].lapse, drafts: s.drafts + YE_TOTALS[i].drafts }), { people: 0, carried: 0, lapse: 0, drafts: 0 });
};
const YEAR_END_OPENS = new Date(2027, 0, 1);
const thousands = (n: number) => n.toLocaleString('en-IN');

type YeRow = YeSample & { carry: number; encash: number; lapse: number };
type SyRow = { name: string; jan: number; credit: number; mar: number; carry: number; lapse: number };

/** What the live app gives the year-end wizard (design audit): the preview of a leave year's end, and posting it. */
export interface LiveYearEnd {
  /** yyyy-mm-dd in the company's time. */
  today: string;
  onPreview: (yearEnd: string) => Promise<YearEndPreview>;
  onRun: (yearEnd: string) => Promise<unknown>;
}

type YearEndProps = {
  /** Stories: open on the posted result. */
  posted?: boolean;
  mode?: 'yearend' | 'transition';
  current?: string;
  confirm?: boolean;
  /** The date the wizard runs on (stories). Year-end can be posted from 1 Jan 2027. */
  asOf?: Date;
  /** The admin ticked "post anyway" for the pending leave requests. */
  pendingAcknowledged?: boolean;
  /** The live app's calls. Stories leave it out. */
  live?: LiveYearEnd;
};

export function YearEndWizard(props: YearEndProps) {
  return props.live ? <LiveYearEndView live={props.live} /> : <StoryYearEnd {...props} />;
}

/** TIM-29 on live data: scope (the year's last day), the per-person preview from the server, then post behind a typed confirm. */
function LiveYearEndView({ live }: { live: LiveYearEnd }) {
  const { toast } = useToast();
  const [yearEnd, setYearEnd] = useState<Date | null>(fromIso(`${Number(live.today.slice(0, 4)) - 1}-12-31`));
  const [preview, setPreview] = useState<YearEndPreview | null>(null);
  const [failed, setFailed] = useState('');
  const [q, setQ] = useState('');
  const [onlyLosing, setOnlyLosing] = useState(false);
  const [c, setC] = useState(false);
  const [posted, setPosted] = useState<string | null>(null);
  const iso = yearEnd ? isoDate(yearEnd) : '';
  useEffect(() => {
    setPreview(null);
    setFailed('');
    if (!iso) return;
    let on = true;
    live.onPreview(iso).then((x) => on && setPreview(x), (e: unknown) => on && setFailed(e instanceof Error ? e.message : 'The preview did not load.'));
    return () => { on = false; };
    // The preview follows the chosen day.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [iso]);
  const year = yearEnd ? yearEnd.getFullYear() : '';
  const title = `Leave year-end ${year}`;
  const rows = (preview?.rows ?? []).map((r) => ({ ...r, id: `${r.employeeId}-${r.type}` }));
  const shown = rows.filter((r) => r.name.toLowerCase().includes(q.trim().toLowerCase()) && (!onlyLosing || r.lapse > 0));
  const people = new Set(rows.map((r) => r.employeeId)).size;
  const carried = rows.reduce((a, r) => a + r.carry, 0);
  const lapse = rows.reduce((a, r) => a + r.lapse, 0);
  const cols: TableColumn<(typeof rows)[number]>[] = [
    { key: 'name', header: 'Employee', value: (r) => r.name, render: (r) => <span className="yx-tim-list__main"><strong>{r.name}</strong><span className="yx-tim-muted">{r.type}{r.encashable && r.lapse > 0 ? ' · can be paid out' : ''}</span></span> },
    {
      key: 'split', header: 'Balance → carried', value: (r) => r.lapse,
      render: (r) => (
        <span className="yx-tim-row">
          <span>{r.balance !== r.carry ? `${num(r.balance)} → ` : ''}{num(r.carry)} carried</span>
          {r.lapse > 0 && <Badge tone="warning">{num(r.lapse)} lapse</Badge>}
        </span>
      ),
    },
  ];
  const blocked = !yearEnd ? 'Choose the last day of the leave year' : iso > live.today ? `Available from ${day(addDaysTo(yearEnd, 1))}: balances are not final until the year ends` : !preview ? 'Wait for the preview' : !rows.length ? 'No one’s leave year ends on that day' : undefined;
  if (posted)
    return (
      <TimePage active="Year-end">
        <PageHeader title={title} />
        <InlineAlert tone="success" title={`Year-end ${year} is being posted`}>
          {people} people · {num(carried)} days carried forward · {num(lapse)} days lapse. It runs in the background and is recorded in the audit log; balances update in a few moments.
        </InlineAlert>
      </TimePage>
    );
  return (
    <TimePage active="Year-end">
      <PageHeader title={title} description="Carry forward and lapse each person’s leave at the end of the leave year, up to each policy’s limit (never below the legal minimum)." />
      {failed && <InlineAlert tone="danger" title="The preview did not load">{failed}</InlineAlert>}
      <Stepper
        title={title}
        defaultCurrent="scope"
        finishLabel="Post year-end"
        finishBlocked={blocked}
        onFinish={() => setC(true)}
        review={{ note: 'Posting writes carry-forward and lapse entries for every person. Entries can be reversed only by new adjustments.' }}
        steps={[
          {
            id: 'scope', title: 'Scope', description: 'The leave year',
            content: (
              <div className="yx-tim-form">
                <FormField label="Last day of the leave year" required><DatePicker value={yearEnd} onChange={setYearEnd} /></FormField>
                <DescriptionList items={[{ label: 'Leave year', value: yearEnd ? `ends ${day(yearEnd)}` : '—' }]} />
              </div>
            ),
            summary: yearEnd ? `Leave year ending ${day(yearEnd)}` : 'No day chosen',
          },
          {
            id: 'preview', title: 'Preview', description: 'Per employee',
            content: !preview ? (failed ? <p className="yx-tim-muted">Choose the day again to retry.</p> : <LoadingBlock rows={5} />) : (
              <div className="yx-tim-stack">
                <Kpis items={[{ label: 'People', value: people }, { label: 'Carried forward', value: `${num(carried)} days` }, { label: 'Lapse', value: `${num(lapse)} days` }]} />
                <DataTable
                  cardSummary
                  label="Year-end preview per employee"
                  columns={cols}
                  rows={shown}
                  getRowId={(r) => r.id}
                  filtered={q !== '' || onlyLosing}
                  onClearFilters={() => { setQ(''); setOnlyLosing(false); }}
                  empty={<EmptyState compact title="Nothing to process" description="No one’s leave year ends on that day." />}
                  toolbar={
                    <FilterBar fields={[]} value={[]} onChange={() => {}} search={q} onSearchChange={setQ} searchPlaceholder="Search by name">
                      <button type="button" className="yx-ppl__chip yx-ppl__chip--toggle" aria-pressed={onlyLosing} onClick={() => setOnlyLosing(!onlyLosing)}>
                        {onlyLosing && <Icon icon={Check} size="sm" />}
                        Only people losing days ({rows.filter((r) => r.lapse > 0).length})
                      </button>
                    </FilterBar>
                  }
                />
              </div>
            ),
            summary: preview ? `${people} people · ${num(lapse)} days lapse` : '',
          },
        ]}
      />
      <TypeToConfirmDialog
        open={c}
        onOpenChange={setC}
        title={`Post year-end ${year}`}
        consequence={`${people} people · ${num(carried)} days carried forward · ${num(lapse)} days lapse. Entries can be reversed only by new adjustments.`}
        objectName={`LEAVE YEAR ${year}`}
        confirmLabel="Post entries"
        onConfirm={() => {
          setC(false);
          live.onRun(iso).then(() => { setPosted(iso); toast({ tone: 'success', title: `Year-end ${year} sent for posting` }); }, (e: unknown) => setFailed(e instanceof Error ? e.message : 'Not posted. Try again.'));
        }}
      />
    </TimePage>
  );
}
const addDaysTo = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);

function StoryYearEnd({ mode = 'yearend', current = 'scope', confirm = false, asOf = TODAY, pendingAcknowledged = false, posted: postedInitially = false }: YearEndProps) {
  const [c, setC] = useState(confirm);
  const [q, setQ] = useState('');
  const [onlyLosing, setOnlyLosing] = useState(false);
  const [yeEntity, setYeEntity] = useState<string | null>('all');
  const [entity, setEntity] = useState<string | null>('kf-ka');
  const [tell, setTell] = useState(true);
  const [drafts, setDrafts] = useState(true);
  const [managers, setManagers] = useState(false);
  const [ack, setAck] = useState(pendingAcknowledged);
  const [posted, setPosted] = useState(postedInitially);
  // Below 1366 (laptop, tablet, phone): the short-year sum in one cell; four number columns plus the outcome don't fit the panel there.
  const narrow = useNarrow(1365);
  const pendingLeave = LEAVE_REQUESTS.filter((r) => r.status === 'Pending').length;
  const ent = ENTITY_OPTIONS.find((e) => e.value === entity) ?? ENTITY_OPTIONS[0];
  const entPeople = entityPeople(ent.value);
  const yeScope = yeEntity ?? 'all';
  const yeLabel = yeScope === 'all' ? 'All entities' : ENTITY_OPTIONS.find((e) => e.value === yeScope)?.label ?? 'All entities';
  const tot = yeTotals(yeScope);
  const match = (name: string) => name.toLowerCase().includes(q.trim().toLowerCase());
  const afterYear = asOf >= YEAR_END_OPENS;
  const title = mode === 'yearend' ? 'Leave year-end 2026' : `Change leave year · ${ent.label}`;

  const yeAll: YeRow[] = YE_SAMPLE.filter((r) => yeScope === 'all' || r.entity === yeScope).map((r) => ({ ...r, ...yearEndSplit(r) }));
  const yeRows = yeAll.filter((r) => match(r.name) && (!onlyLosing || r.lapse > 0));
  // Two lines per person on every width: name and type, then "45 → 30 carried · 7 to pay out" with the lapse badge (R10).
  const yeCols: TableColumn<YeRow>[] = [
    { key: 'name', header: 'Employee', value: (r) => r.name, render: (r) => <span className="yx-tim-list__main"><strong>{r.name}</strong><span className="yx-tim-muted">{r.type}</span></span> },
    {
      key: 'split', header: afterYear ? 'Balance 31 Dec → carried' : 'Projected 31 Dec → at year end', value: (r) => r.lapse,
      render: (r) => (
        <span className="yx-tim-row">
          <span>{r.closing !== r.carry ? `${num(r.closing)} → ` : ''}{num(r.carry)} carried{r.encash > 0 ? ` · ${num(r.encash)} to pay out` : ''}</span>
          {r.lapse > 0 && <Badge tone="warning">{num(r.lapse)} lapse</Badge>}
        </span>
      ),
    },
  ];
  const credit = 3 * monthlyEL(ent.value);
  // No cap while the short year runs; the carry-forward cap applies on 31 Mar, as at any year end.
  const syAll: SyRow[] = YE_SAMPLE.filter((r) => r.type === 'Earned leave' && r.entity === ent.value).map((r) => {
    const jan = yearEndSplit(r).carry;
    const mar = jan + credit;
    return { name: r.name, jan, credit, mar, carry: Math.min(CF_CAP, mar), lapse: Math.max(0, mar - CF_CAP) };
  });
  const syRows = syAll.filter((r) => match(r.name));
  const syCols: TableColumn<SyRow>[] = [
    { key: 'name', header: 'Employee', value: (r) => r.name },
    { key: 'jan', header: 'Opening 1 Jan 2027', type: 'number', value: (r) => r.jan, render: (r) => num(r.jan) },
    // The KPI above already gives the credit, so this column hides first when the panel is narrow; the outcome (apr) never hides.
    { key: 'credit', header: 'Jan–Mar credit', type: 'number', optional: true, value: (r) => r.credit, render: (r) => num(r.credit) },
    { key: 'mar', header: 'Balance 31 Mar', type: 'number', value: (r) => r.mar, render: (r) => num(r.mar) },
    {
      key: 'apr', header: 'Opening 1 Apr 2027', hideable: false, value: (r) => r.carry,
      render: (r) => (
        <span className="yx-tim-row" style={{ flexWrap: 'nowrap' }}>
          <span style={{ whiteSpace: 'nowrap' }}>{num(r.carry)} carried</span>
          {r.lapse > 0 && <Badge tone="warning">{num(r.lapse)} lapse</Badge>}
        </span>
      ),
    },
  ];
  // Phones: two lines per person, the name and then the sum (R10).
  const syColsNarrow: TableColumn<SyRow>[] = [
    syCols[0],
    {
      key: 'sum', header: 'Opening 1 Jan + Jan–Mar credit = 31 Mar → 1 Apr', value: (r) => r.carry,
      render: (r) => (
        <span className="yx-tim-row">
          <span>{num(r.jan)} + {num(r.credit)} = {num(r.mar)} → {num(r.carry)} carried</span>
          {r.lapse > 0 && <Badge tone="warning">{num(r.lapse)} lapse</Badge>}
        </span>
      ),
    },
  ];
  const plantPolicy = POLICIES.find((p) => p.rule.location === 'hsr' && elOf(p)?.perWorked);
  const shortYearEL = ent.value === 'kf-tn' && plantPolicy
    ? `Staff ${num(credit)} days each · plant workers 1 day per ${elOf(plantPolicy)!.perWorked} days worked`
    : `${num(credit)} days each`;
  const sampleSize = mode === 'yearend' ? yeAll.length : syAll.length;
  const total = mode === 'yearend' ? tot.people : entPeople;

  const preview = (
    <div className="yx-tim-stack">
      <Kpis
        items={
          mode === 'yearend'
            ? [{ label: 'People', value: tot.people }, { label: 'Carried forward', value: `${thousands(tot.carried)} days` }, { label: 'Lapse', value: `${thousands(tot.lapse)} days` }, { label: 'Pay-out drafts', value: tot.drafts, note: 'Amounts are shown in payroll' }]
            : [{ label: 'People', value: entPeople }, { label: 'Short year', value: 'Jan–Mar 2027 (3 months)' }, { label: 'Earned leave for the short year', value: shortYearEL }]
        }
      />
      <p className="yx-tim-muted">
        Sample of {sampleSize} of the {total} people.{' '}
        {mode === 'yearend'
          ? afterYear ? `Closing balances on 31 Dec 2026. All ${total} are posted.` : `Projected to 31 Dec 2026 from today's balances. All ${total} are posted.`
          : `Opening 1 Jan 2027 is after the 2026 year-end. Assumes no leave taken; on 31 Mar up to ${CF_CAP} days carry forward and the rest lapses.`}
      </p>
      {mode === 'yearend' ? (
        <DataTable
          cardSummary
          label="Year-end preview per employee"
          columns={yeCols}
          rows={yeRows}
          getRowId={(r) => r.name + r.type}
          filtered={q !== '' || onlyLosing}
          onClearFilters={() => { setQ(''); setOnlyLosing(false); }}
          toolbar={
            <FilterBar fields={[]} value={[]} onChange={() => {}} search={q} onSearchChange={setQ} searchPlaceholder="Search by name">
              <button type="button" className="yx-ppl__chip yx-ppl__chip--toggle" aria-pressed={onlyLosing} onClick={() => setOnlyLosing(!onlyLosing)}>
                {onlyLosing && <Icon icon={Check} size="sm" />}
                Only people losing days ({yeAll.filter((r) => r.lapse > 0).length})
              </button>
            </FilterBar>
          }
        />
      ) : (
        <DataTable
          cardSummary
          label="Short-year preview per employee"
          columns={narrow ? syColsNarrow : syCols}
          rows={syRows}
          getRowId={(r) => r.name}
          filtered={q !== ''}
          onClearFilters={() => setQ('')}
          toolbar={<FilterBar fields={[]} value={[]} onChange={() => {}} search={q} onSearchChange={setQ} searchPlaceholder="Search by name" />}
        />
      )}
    </div>
  );

  const pendingText = plural(pendingLeave, 'pending leave request');
  const blocked =
    mode !== 'yearend'
      ? undefined
      : !afterYear
        ? `Available from ${day(YEAR_END_OPENS)}: balances are not final until the year ends`
        : pendingLeave > 0 && !ack
          ? `Decide the ${pendingText} first, or tick "Post anyway" in Scope`
          : undefined;
  const ackText = afterYear && ack && pendingLeave > 0 ? `${plural(pendingLeave, 'pending request')} carried into 2027` : null;
  const letters = [tell ?'Employees told' : 'Employees not told', managers ? 'managers emailed' : 'managers not emailed', drafts ? 'pay-out drafts to January payroll' : 'no payroll drafts'].join(' · ');

  if (posted) {
    return (
      <TimePage active="Year-end" user={HR_ADMIN}>
        <PageHeader title={title} />
        {mode === 'yearend' ? (
          <InlineAlert
            tone="success"
            title={`Year-end 2026 posted on ${day(asOf)}`}
            actions={<>{drafts && <StoryLink to={STORY.payrollInputs}>Open payroll drafts</StoryLink>}{ackText && <StoryLink to={STORY.pendingRequests}>{`Open ${plural(pendingLeave, 'pending request')}`}</StoryLink>}<StoryLink to={STORY.leaveCard}>View leave card</StoryLink></>}
          >
            {yeLabel} · {tot.people} people · {thousands(tot.carried)} days carried forward · {thousands(tot.lapse)} days lapse{drafts ? ` · ${tot.drafts} pay-out drafts added to January payroll` : ''}{ackText ? ` · ${ackText}` : ''}.
          </InlineAlert>
        ) : (
          <InlineAlert tone="success" title={`Leave-year change scheduled on ${day(asOf)}`} actions={<StoryLink to={STORY.policies}>View leave policies</StoryLink>}>
            {entPeople} people at {ent.label} move to a short year from 1 Jan 2027. Leave entries are posted on 1 Jan 2027.
          </InlineAlert>
        )}
      </TimePage>
    );
  }

  return (
    <TimePage active="Year-end" user={HR_ADMIN}>
      <PageHeader
        title={title}
        description={mode === 'yearend' ? 'Carry forward, pay out and lapse each person’s leave for 1 Jan – 31 Dec 2026.' : 'Move from the calendar year to the financial year, with a short year in between.'}
      />
      <Stepper
        title={title}
        defaultCurrent={current}
        finishLabel={mode === 'yearend' ? 'Post year-end' : 'Post transition'}
        finishBlocked={blocked}
        onFinish={() => setC(true)}
        review={{ note: mode === 'yearend' ? 'Posting writes carry-forward, lapse and pay-out entries for every person. Entries can be reversed only by new adjustments.' : 'Posting schedules the short year. Ledger entries are written on 1 Jan 2027.' }}
        steps={[
          {
            id: 'scope', title: 'Scope', description: mode === 'yearend' ? 'Entity and leave year' : 'Entity and new leave year',
            content: mode === 'yearend' ? (
              <div className="yx-tim-form">
                <FormField label="Entity"><Select value={yeEntity} onChange={setYeEntity} options={[{ value: 'all', label: 'All entities (calendar year)' }, ...ENTITY_OPTIONS]} /></FormField>
                <DescriptionList items={[{ label: 'Leave year', value: '1 Jan – 31 Dec 2026' }]} />
                {pendingLeave > 0 && (
                  <>
                    <InlineAlert tone="warning" title={afterYear ? `${plural(pendingLeave, 'leave request')} from 2026 ${pendingLeave === 1 ? 'is' : 'are'} still pending` : `${plural(pendingLeave, 'leave request')} ${pendingLeave === 1 ? 'is' : 'are'} still pending`} actions={<StoryLink to={STORY.pendingRequests}>{`Open ${plural(pendingLeave, 'pending request')}`}</StoryLink>}>
                      {afterYear ? 'Decide them before you post, or post anyway and they stay pending in 2027.' : 'Decide them before you post.'}
                    </InlineAlert>
                    {afterYear && <Checkbox label={`Post anyway: ${pendingLeave === 1 ? 'this request stays' : `these ${pendingLeave} requests stay`} pending in 2027`} checked={ack} onChange={setAck} />}
                  </>
                )}
              </div>
            ) : (
              <div className="yx-tim-form">
                <FormField label="Entity"><Select value={entity} onChange={setEntity} options={ENTITY_OPTIONS} /></FormField>
                <DescriptionList items={[{ label: 'Leave year', value: 'Calendar year (Jan–Dec) → financial year (Apr–Mar), from 1 Jan 2027 (the day after the 2026 year-end)' }]} />
                <InlineAlert tone="info" title="A short year is created">1 Jan – 31 Mar 2027 with entitlements for 3 months, then the first full year from 1 Apr 2027.</InlineAlert>
              </div>
            ),
            summary: mode === 'yearend' ? `${yeLabel} · 2026${ackText ? ` · ${ackText}` : ''}` : `${ent.label} · calendar year → financial year from 1 Jan 2027`,
          },
          { id: 'preview', title: 'Preview', description: 'Per employee', content: preview, summary: mode === 'yearend' ? `${tot.people} people · ${tot.drafts} pay-out drafts` : `${entPeople} people · short year Jan–Mar 2027` },
          {
            id: 'notify', title: 'Letters and notices', description: 'What people receive',
            content: (
              <div className="yx-tim-stack">
                <Checkbox label="Tell each employee what is carried forward and what lapses" checked={tell} onChange={setTell} />
                <Checkbox label="Add pay-out drafts to January payroll" checked={drafts} onChange={setDrafts} />
                <Checkbox label="Email managers a team summary" checked={managers} onChange={setManagers} />
              </div>
            ),
            summary: letters,
          },
        ]}
      />
      <TypeToConfirmDialog
        open={c}
        onOpenChange={setC}
        title={mode === 'yearend' ? 'Post year-end 2026' : 'Post leave-year change'}
        consequence={
          mode === 'yearend'
            ? `${yeLabel} · ${tot.people} people · ${thousands(tot.carried)} days carried forward · ${thousands(tot.lapse)} days lapse · ${drafts ? `${tot.drafts} pay-out drafts for January payroll` : 'no payroll drafts'} · ${letters.split(' · ').slice(0, 2).join(', ').toLowerCase()}${ackText ? ` · ${ackText}` : ''}. Entries can be reversed only by new adjustments.`
            : `${entPeople} people at ${ent.label} move to a short year with 3 months of entitlements. Ledger entries are posted on 1 Jan 2027.`
        }
        objectName={mode === 'yearend' ? 'LEAVE YEAR 2026' : 'SHORT YEAR 2027'}
        confirmLabel="Post entries"
        onConfirm={() => { setC(false); setPosted(true); }}
      />
    </TimePage>
  );
}

/* =====================================================================
   TIM-31 · Locations & geofence map editor
   ===================================================================== */

interface GeoPoint { id: string; name: string; lat: string; lng: string; r: number | null }
const MAIN_POINT: GeoPoint = { id: 'a', name: 'Main block', lat: '12.9894', lng: '80.2481', r: 200 };
/** A second building about 450 m away, so its zone sits clear of Main block's. */
const ANNEXE_POINT: GeoPoint = { id: 'b', name: 'Annexe', lat: '12.9921', lng: '80.2512', r: 80 };
/** Shared Chennai office record (fictional address, R3). 5th floor matches the office Wi-Fi name KF-Taramani-5F. */
const CHENNAI = LOCATIONS.find((l) => l.id === 'maa')!;
const CENTRE = { lat: CHENNAI.lat, lng: CHENNAI.lng };
const latError = (v: string) => (v.trim() === '' ? 'Enter a latitude' : !(Number(v) >= -90 && Number(v) <= 90) ? 'Enter a latitude between -90 and 90' : null);
const lngError = (v: string) => (v.trim() === '' ? 'Enter a longitude' : !(Number(v) >= -180 && Number(v) <= 180) ? 'Enter a longitude between -180 and 180' : null);
const radiusBad = (r: number | null) => r == null || r < 50 || r > 1000;
const nameError = (v: string) => (v.trim() === '' ? 'Enter a point name' : null);
/** Number of wrong fields in a point (name, latitude, longitude, radius). */
const pointErrors = (p: GeoPoint) => [nameError(p.name), latError(p.lat), lngError(p.lng), radiusBad(p.r)].filter(Boolean).length;
const pointBad = (p: GeoPoint) => pointErrors(p) > 0;
/** Map position from coordinates: the drawing's centre (160, 100) is the office centre, 1 map unit = 5 m. */
const toMap = (p: GeoPoint, c: { lat: number; lng: number } = CENTRE) => {
  if (latError(p.lat) || lngError(p.lng)) return null;
  const m = 111_320;
  return { x: 160 + ((Number(p.lng) - c.lng) * m * Math.cos((c.lat * Math.PI) / 180)) / 5, y: 100 - ((Number(p.lat) - c.lat) * m) / 5 };
};

/** First bad line in a one-range-per-line IP list, e.g. "Line 2: 10.20.300.0/24 is not a valid range…". */
export function ipRangeError(text: string): string | null {
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i].trim();
    if (!l) continue;
    const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})\/(\d{1,2})$/.exec(l);
    if (!m || m.slice(1, 5).some((o) => Number(o) > 255) || Number(m[5]) > 32) return `Line ${i + 1}: ${l} is not a valid range. Each part must be 0–255, e.g. 10.20.4.0/24.`;
  }
  return null;
}

/** What the live app gives the locations screen (design audit): each location's shift, weekly offs and check-in mode. */
export interface LiveLocations {
  state: LoadState;
  onRetry?: () => void;
  data: TimeSetup | null;
  onSetRule: (locationId: string, input: { validFrom: string; shiftName: string; shiftStart: number; shiftEnd: number; graceMinutes: number; weeklyOffs: { weekday: number; nth?: number[] }[]; checkIn: 'restricted' | 'field' }) => Promise<unknown>;
  /** The site's allowed points, office networks, Wi-Fi names and phone binding (one save). */
  onSaveCheckIn: (locationId: string, input: { fences: { name: string; lat: number; lng: number; radiusM: number }[]; ipRanges: string[]; wifiNames: string[]; bindDevice: boolean }) => Promise<unknown>;
  /** Unbinds a person's phone: their next check-in binds the phone they use. */
  onResetPhone: (employeeId: string) => Promise<unknown>;
}

type GeofenceProps = { view?: 'edit' | 'multi' | 'field'; ipError?: boolean; /** The live app's data. Stories leave it out. */ live?: LiveLocations };

export function GeofenceEditorScreen(props: GeofenceProps) {
  return props.live ? <LiveLocationsView live={props.live} /> : <StoryGeofenceEditor {...props} />;
}

type LiveLocation = TimeSetup['locations'][number];

/** TIM-31 on live data: each location's check-in mode with its shift and weekly offs, changed from a date.
 *  The geofence and office networks stay on the location in Settings › Locations (one circle, no Wi-Fi or phone binding yet). */
function LiveLocationsView({ live }: { live: LiveLocations }) {
  const [editing, setEditing] = useState<LiveLocation | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const d = live.data;
  const opened = d?.locations.find((l) => l.id === openId);
  if (d && opened) return <LiveLocationEditor key={opened.id} live={live} data={d} location={opened} onBack={() => setOpenId(null)} />;
  const cols: TableColumn<LiveLocation>[] = [
    { key: 'name', header: 'Location', value: (l) => l.name, render: (l) => <span className="yx-tim-list__main"><strong>{l.name}</strong><span className="yx-tim-muted">{STATE_NAMES[l.state] ?? l.state}</span></span> },
    {
      key: 'shift', header: 'Shift', value: (l) => l.rule.shiftName,
      render: (l) => (
        <span className="yx-tim-list__main">
          <span>{l.rule.shiftName} {clock(l.rule.shiftStart)} to {clock(l.rule.shiftEnd)} · {l.rule.graceMinutes} min grace</span>
          {l.upcoming.length ? <span className="yx-tim-muted">Changes on {dateText(l.upcoming[0].validFrom!)}</span> : null}
        </span>
      ),
    },
    { key: 'offs', header: 'Weekly offs', value: (l) => offsText(l.rule.weeklyOffs) },
    {
      key: 'checkin', header: 'Check-in', value: (l) => l.rule.checkIn,
      render: (l) => (
        <span className="yx-tim-list__main">
          {l.rule.checkIn === 'field' ? <Badge tone="info">Field check-in</Badge> : <Badge tone="success">Restricted check-in</Badge>}
          <span className="yx-tim-muted">{l.fences.length ? plural(l.fences.length, 'point') : 'No geofence'} · {l.ipRanges.length ? `${l.ipRanges.length} office network${l.ipRanges.length === 1 ? '' : 's'}` : 'no office network'}{l.bindDevice ? ' · one phone' : ''}</span>
        </span>
      ),
    },
    {
      key: 'act', header: 'Actions', value: () => '',
      render: (l) => (
        <span className="yx-tim-row">
          <Button size="sm" aria-label={`Check-in at ${l.name}`} onClick={() => setOpenId(l.id)}>Check-in</Button>
          <Button size="sm" aria-label={`Shift and weekly offs at ${l.name}`} onClick={() => setEditing(l)}>Shift</Button>
        </span>
      ),
    },
  ];
  if (live.state === 'no-access') return <EmptyState title="You can't change locations" description="Location rules need the leave and attendance set-up key." />;
  return (
    <TimePage active="Locations & geofences">
      <PageHeader title="Locations" description="Each location's shift, weekly offs and how people check in there. Changes start on a date you choose." />
      {live.state === 'error' ? (
        <ErrorState title="The locations didn't load" description="Nothing has changed. Try again in a moment." onRetry={live.onRetry} />
      ) : !d ? (
        <LoadingBlock rows={5} />
      ) : (
        <div className="yx-tim-stack">
          <DataTable
            cardSummary
            label="Locations"
            columns={cols}
            rows={d.locations}
            getRowId={(l) => l.id}
            empty={<EmptyState compact title="No locations yet" description="Add the company's locations in Settings › Locations first." />}
          />
        </div>
      )}
      {editing && d && <LiveRuleDrawer today={d.today} location={editing} onClose={() => setEditing(null)} onSave={live.onSetRule} />}
    </TimePage>
  );
}

/**
 * The breadcrumb back to the list on a deep page: it never loses changes silently. A click on a crumb link is taken
 * before the app frame follows it; with unsaved changes it asks first.
 */
function useCrumbBack(dirty: boolean, onBack: () => void, what: string) {
  const [asking, setAsking] = useState(false);
  const onClickCapture = (e: React.MouseEvent) => {
    if (!(e.target as HTMLElement).closest('.yx-crumbs__link')) return;
    e.preventDefault();
    if (dirty) setAsking(true);
    else onBack();
  };
  const dialog = (
    <ConfirmDialog
      open={asking}
      onOpenChange={setAsking}
      title="Leave without saving?"
      consequence={`Your changes to ${what} are not saved.`}
      cancelLabel="Keep editing"
      confirmLabel="Leave without saving"
      destructive
      onConfirm={() => { setAsking(false); onBack(); }}
    />
  );
  return { onClickCapture, dialog };
}

const fenceToPoint = (f: LiveLocation['fences'][number], i: number): GeoPoint => ({ id: `p${i}`, name: f.name, lat: String(f.lat), lng: String(f.lng), r: f.radiusM });

/** TIM-31 on live data: the designed editor for one location's points, office network, Wi-Fi and phone binding. */
function LiveLocationEditor({ live, data, location, onBack }: { live: LiveLocations; data: TimeSetup; location: LiveLocation; onBack: () => void }) {
  const { toast } = useToast();
  const startPoints = location.fences.map(fenceToPoint);
  const [points, setPoints] = useState<GeoPoint[]>(startPoints);
  const [sel, setSel] = useState(startPoints[0]?.id ?? '');
  const [ips, setIps] = useState(location.ipRanges.join('\n'));
  const [wifi, setWifi] = useState(location.wifiNames.join(', '));
  const [mode, setMode] = useState<string>(location.rule.checkIn);
  const [bind, setBind] = useState(location.bindDevice);
  // Founder decision 20 Oct 2026: HR turns phone binding on per site, after a confirm; existing sites stay as they are.
  const [askBind, setAskBind] = useState(false);
  const [showPoints, setShowPoints] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState('');
  const [askRemove, setAskRemove] = useState(false);
  // Field errors show after the first save, never while someone is still typing (founder rule).
  const [tried, setTried] = useState(false);
  const shown = (msg: string | null) => (tried ? msg : null);
  const [resetting, setResetting] = useState<TimeSetup['phones'][number] | null>(null);
  const formRef = useRef<HTMLDivElement>(null);
  const cur = points.find((p) => p.id === sel) ?? points[0];
  const edit = (patch: Partial<GeoPoint>) => setPoints((ps) => ps.map((p) => (p.id === cur.id ? { ...p, ...patch } : p)));
  const ipErr = ipRangeError(ips);
  const wifiNames = wifi.split(',').map((w) => w.trim()).filter(Boolean);
  const wifiErr = wifiNames.length > 10 ? 'Give at most 10 Wi-Fi names' : wifiNames.some((w) => w.length > 32) ? 'A Wi-Fi name is at most 32 characters' : null;
  const errors = (ipErr ? 1 : 0) + (wifiErr ? 1 : 0) + points.reduce((n, p) => n + pointErrors(p), 0);
  const field = mode === 'field';
  const ipList = ips.split('\n').map((l) => l.trim()).filter(Boolean);
  const dirty = JSON.stringify(points) !== JSON.stringify(startPoints) || ipList.join('\n') !== location.ipRanges.join('\n') || wifiNames.join(',') !== location.wifiNames.join(',') || mode !== location.rule.checkIn || bind !== location.bindDevice;
  const phones = data.phones.filter((x) => x.locationId === location.id);
  const back = useCrumbBack(dirty, onBack, location.name);
  const a = location.address ?? {};
  const where = [...(a.lines ?? []), [a.city, a.postalCode].filter(Boolean).join(' ')].filter(Boolean).join(', ');
  const centre = (() => {
    const first = points.find((p) => !latError(p.lat) && !lngError(p.lng));
    return first ? { lat: Number(first.lat), lng: Number(first.lng) } : { lat: 0, lng: 0 };
  })();
  const addPoint = () => {
    const id = `p${Date.now()}`;
    setPoints((ps) => [...ps, { id, name: `Point ${ps.length + 1}`, lat: '', lng: '', r: 100 }]);
    setSel(id);
  };
  const jumpToError = () => {
    setShowPoints(true);
    const bad = points.find(pointBad);
    if (bad && cur && !pointBad(cur) && !ipErr) setSel(bad.id);
    requestAnimationFrame(() => {
      const el = formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]');
      el?.scrollIntoView({ block: 'center' });
      el?.focus();
    });
  };
  const save = async () => {
    setBusy(true);
    setFailed('');
    try {
      await live.onSaveCheckIn(location.id, { fences: points.map((p) => ({ name: p.name.trim(), lat: Number(p.lat), lng: Number(p.lng), radiusM: p.r! })), ipRanges: ipList, wifiNames, bindDevice: bind });
      if (mode !== location.rule.checkIn) {
        const r = location.rule;
        await live.onSetRule(location.id, { validFrom: data.today, shiftName: r.shiftName, shiftStart: r.shiftStart, shiftEnd: r.shiftEnd, graceMinutes: r.graceMinutes, weeklyOffs: r.weeklyOffs, checkIn: mode as 'restricted' | 'field' });
      }
      toast({ tone: 'success', title: `Saved check-in at ${location.name}` });
      onBack();
    } catch (e) {
      setFailed(e instanceof Error ? e.message : 'Not saved. Try again.');
    } finally {
      setBusy(false);
      setAskRemove(false);
    }
  };
  // Taking every point off opens check-in to anywhere on the site's networks: ask first (founder rule 19 Oct 2026).
  const trySave = () => {
    if (errors > 0) { setTried(true); return jumpToError(); }
    return startPoints.length > 0 && points.length === 0 ? setAskRemove(true) : void save();
  };
  const saveRow = (
    <div className="yx-tim-row">
      {tried && errors > 0 && <Button size="sm" onClick={jumpToError}>{plural(errors, 'error')} to fix</Button>}
      {!dirty && errors === 0 && <span className="yx-tim-muted">No changes yet</span>}
      <Button variant="primary" disabled={!dirty || (tried && errors > 0)} loading={busy} onClick={trySave}>Save location</Button>
    </div>
  );
  const pointsSection = (
    <FormSection title="Allowed points">
      {points.length === 0 ? (
        <p className="yx-tim-muted">No points yet: check-in here is checked against the office network only{ipList.length ? '' : ', so it is not restricted'}.</p>
      ) : (
        <ul className="yx-tim-list">
          {points.map((p) => (
            <li key={p.id}>
              <span className="yx-tim-list__main">
                <strong>{p.name.trim() || 'Unnamed point'}</strong>
                <span className="yx-tim-muted">{p.lat || '—'}, {p.lng || '—'} · {p.r ?? '—'} m</span>
              </span>
              <span className="yx-tim-row">
                {tried && pointBad(p) && <Badge tone="danger">Needs fixing</Badge>}
                {/* Same two buttons on every row so Remove lines up (R9). */}
                <Button size="sm" disabled={p.id === cur?.id} onClick={() => setSel(p.id)}>{p.id === cur?.id ? 'Editing' : 'Edit'}</Button>
                <Button size="sm" aria-label={`Remove ${p.name.trim() || 'this point'}`} onClick={() => { setPoints((ps) => ps.filter((x) => x.id !== p.id)); if (p.id === cur?.id) setSel(points.find((x) => x.id !== p.id)?.id ?? ''); }}>Remove</Button>
              </span>
            </li>
          ))}
        </ul>
      )}
      {cur && (
        <>
          <FormField label="Point name" required error={shown(nameError(cur.name))}><TextField value={cur.name} maxLength={60} onChange={(v) => edit({ name: v })} /></FormField>
          <FieldRow>
            <FormField label="Latitude" error={shown(latError(cur.lat))}><TextField value={cur.lat} inputMode="decimal" onChange={(v) => edit({ lat: v })} /></FormField>
            <FormField label="Longitude" error={shown(lngError(cur.lng))}><TextField value={cur.lng} inputMode="decimal" onChange={(v) => edit({ lng: v })} /></FormField>
          </FieldRow>
          <FormField label="Radius (m)" helper="50–1,000 m. Phone GPS is usually accurate to 20–50 m outdoors." error={shown(radiusBad(cur.r) ? 'Enter a radius between 50 and 1,000 m' : null)}>
            <NumberField value={cur.r} onChange={(v) => edit({ r: v })} />
          </FormField>
        </>
      )}
      <span><Button icon={Plus} onClick={addPoint}>{points.length ? 'Add another point' : 'Add a point'}</Button></span>
    </FormSection>
  );
  const networkSection = (
    <FormSection title="Office network (web check-in)">
      <FormField label="IP ranges" helper="One range per line, e.g. 10.20.4.0/24" error={shown(ipErr)}>
        <TextArea value={ips} onChange={setIps} rows={3} spellCheck={false} />
      </FormField>
      <FormField label="Wi-Fi names" optional helper="Shown to people so they join the right network; check-in is checked by office network and location. Separate names with commas." error={shown(wifiErr)}>
        <TextField value={wifi} onChange={setWifi} />
      </FormField>
    </FormSection>
  );
  const fences = points.flatMap((p) => {
    const at = toMap(p, centre);
    return at ? [{ id: p.id, label: `${p.name.trim() || 'Unnamed point'} · ${p.r ?? 0} m`, x: at.x, y: at.y, r: (p.r ?? 0) / 5, active: points.length > 1 && p.id === cur?.id }] : [];
  });
  return (
    <TimePage active="Locations & geofences">
      <div onClickCapture={back.onClickCapture}>
        <PageHeader
          breadcrumbs={<Breadcrumbs items={[{ label: 'Locations', href: '#locations' }, { label: location.name }]} />}
          title={location.name}
          description={[where, STATE_NAMES[location.state] ?? location.state, plural(location.people, 'person', 'people')].filter(Boolean).join(' · ')}
          status={field ? <Badge tone="info">Field check-in</Badge> : <Badge tone="success">Restricted check-in</Badge>}
        />
      </div>
      {back.dialog}
      {failed && <InlineAlert tone="danger" title="Not saved">{failed}</InlineAlert>}
      <div className="yx-tim-editor">
        {fences.length ? (
          <GeoMap
            height={300}
            fences={fences}
            pins={[]}
            editable={!field}
            // The map draws 1 px per 5 m; the radius snaps to 10 m.
            onRadiusChange={(id, r) => { if (id === cur?.id) edit({ r: Math.round((r * 5) / 10) * 10 }); }}
            caption={field ? 'Used to label check-ins as at office' : 'Drag the handle, or type the radius in the form'}
          />
        ) : (
          <EmptyState compact title="No points on the map" description="Add a point with its latitude, longitude and radius to draw it here." />
        )}
        <div className="yx-tim-form" ref={formRef}>
          <FormSection title="Check-in mode">
            <RadioGroup
              aria-label="Check-in mode"
              value={mode}
              onChange={setMode}
              options={[{ value: 'restricted', label: 'Restricted', description: 'Must be inside a point or on the office network' }, { value: 'field', label: 'Field', description: 'Location recorded, not restricted' }]}
            />
            <Switch label="Bind check-in to one phone" description="Off until HR turns it on for this site" checked={bind} onChange={(v) => (v ? setAskBind(true) : setBind(false))} />
            {phones.length > 0 && (
              <ul className="yx-tim-list" aria-label="Phones bound here">
                {phones.map((x) => (
                  <li key={x.employeeId}>
                    <span className="yx-tim-list__main"><strong>{x.name}</strong><span className="yx-tim-muted">Phone bound {dateText(x.boundAt.slice(0, 10))}</span></span>
                    <Button size="sm" aria-label={`Reset ${x.name}'s phone`} onClick={() => setResetting(x)}>Reset phone</Button>
                  </li>
                ))}
              </ul>
            )}
          </FormSection>
          {field && !showPoints ? (
            <FormSection title="Points and office network">
              <p className="yx-tim-muted">In field mode, points are used only to label check-ins as at office. {plural(points.length, 'point')} and the office network are kept.</p>
              <span><Button onClick={() => setShowPoints(true)}>Show points and network</Button></span>
            </FormSection>
          ) : (
            <>
              {pointsSection}
              {networkSection}
            </>
          )}
          {saveRow}
        </div>
      </div>
<ConfirmDialog
        open={askBind}
        onOpenChange={setAskBind}
        title="Bind check-in to one phone?"
        consequence="People who check in from another phone will be refused from now on. HR can reset a person's phone."
        confirmLabel="Turn it on"
        onConfirm={() => { setBind(true); setAskBind(false); }}
      />
      <ConfirmDialog
        open={askRemove}
        onOpenChange={setAskRemove}
        title={`Remove the geofence from ${location.name}?`}
        consequence={ipList.length ? `People at ${location.name} can then check in from anywhere on its office network.` : `People at ${location.name} can then check in from anywhere.`}
        cancelLabel="Keep it"
        confirmLabel="Remove geofence"
        destructive
        confirmDisabled={busy}
        onConfirm={() => void save()}
      />
      <ConfirmDialog
        open={!!resetting}
        onOpenChange={(o) => !o && setResetting(null)}
        title={`Reset ${resetting?.name ?? ''}'s phone?`}
        consequence="Their next check-in binds the phone they use then."
        confirmLabel="Reset phone"
        confirmDisabled={busy}
        onConfirm={() => {
          const x = resetting!;
          setBusy(true);
          live.onResetPhone(x.employeeId).then(
            () => { toast({ tone: 'success', title: `${x.name}'s phone is reset` }); setResetting(null); },
            (e: unknown) => toast({ tone: 'error', title: 'Not reset', description: e instanceof Error ? e.message : 'Try again.' }),
          ).finally(() => setBusy(false));
        }}
      />
    </TimePage>
  );
}

const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
const minute = (t: string | null) => (t ? Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5)) : null);

function LiveRuleDrawer({ today, location, onClose, onSave }: { today: string; location: TimeSetup['locations'][number]; onClose: () => void; onSave: LiveLocations['onSetRule'] }) {
  const r: LocationRule = location.rule;
  const [validFrom, setValidFrom] = useState(today);
  const [shiftName, setShiftName] = useState(r.shiftName);
  const [start, setStart] = useState<string | null>(hhmm(r.shiftStart));
  const [end, setEnd] = useState<string | null>(hhmm(r.shiftEnd));
  const [grace, setGrace] = useState<number | null>(r.graceMinutes);
  const [offs, setOffs] = useState(r.weeklyOffs);
  const [checkIn, setCheckIn] = useState(r.checkIn);
  const { busy, error, run } = useRun();
  const { toast } = useToast();
  const toggle = (weekday: number, on: boolean) => setOffs((x) => (on ? [...x.filter((o) => o.weekday !== weekday), { weekday }] : x.filter((o) => o.weekday !== weekday)));
  const sat = offs.find((o) => o.weekday === 6);
  const errors = [...(!start || !end ? [{ fieldId: 'rl-start', message: 'Give the shift start and end.' }] : []), ...(start && end && start === end ? [{ fieldId: 'rl-start', message: 'The shift ends at a different time from when it starts.' }] : []), ...(validFrom < today ? [{ fieldId: 'rl-from', message: 'Changes start today or later.' }] : [])];
  const saveErrors = useSaveErrors(errors);
  return (
    <Drawer
      open
      onOpenChange={(o) => !o && onClose()}
      title={`${location.name}: shift and weekly offs`}
      size="lg"
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            loading={busy === 'save'}
            onClick={() => {
              if (errors.length) return saveErrors.reveal();
              void run('save', async () => {
                await onSave(location.id, { validFrom, shiftName: shiftName.trim() || 'General', shiftStart: minute(start)!, shiftEnd: minute(end)!, graceMinutes: grace ?? 0, weeklyOffs: offs, checkIn });
                toast({ tone: 'success', title: `Saved ${location.name} from ${dateText(validFrom)}` });
                onClose();
              });
            }}
          >
            Save
          </Button>
        </>
      }
    >
      <div className="yx-tim-form">
        <ErrorSummary errors={saveErrors.shownErrors} />
        {error && <InlineAlert tone="danger" title="Not saved">{error}</InlineAlert>}
        <FormField id="rl-from" label="From" required>
          <TextField type="date" value={validFrom} min={today} onChange={setValidFrom} />
        </FormField>
        <div className="yx-tim-row">
          <FormField id="rl-name" label="Shift name">
            <TextField value={shiftName} onChange={setShiftName} maxLength={60} />
          </FormField>
          <FormField id="rl-start" label="Starts" required>
            <TimeField value={start} onChange={setStart} />
          </FormField>
          <FormField id="rl-end" label="Ends" required helper="Before the start for a night shift.">
            <TimeField value={end} onChange={setEnd} />
          </FormField>
          <FormField id="rl-grace" label="Grace (minutes)">
            <NumberField value={grace} onChange={setGrace} min={0} max={120} />
          </FormField>
        </div>
        <fieldset className="yx-tim-stack" data-gap="sm">
          <legend className="yx-tim-h3">Weekly offs</legend>
          {WEEKDAYS.map((w, i) => (
            <Checkbox key={w} label={w} checked={offs.some((o) => o.weekday === i + 1)} onChange={(c) => toggle(i + 1, c)} />
          ))}
          {sat && (
            <Segment
              label="Which Saturdays"
              value={sat.nth?.join(',') === '2,4' ? 'alt' : 'all'}
              onChange={(v) => setOffs((x) => x.map((o) => (o.weekday === 6 ? (v === 'alt' ? { weekday: 6, nth: [2, 4] } : { weekday: 6 }) : o)))}
              options={[{ value: 'all', label: 'Every Saturday' }, { value: 'alt', label: '2nd and 4th Saturday' }]}
            />
          )}
        </fieldset>
        <FormField id="rl-checkin" label="Checking in">
          <Segment label="Checking in" value={checkIn} onChange={setCheckIn} options={[{ value: 'restricted', label: 'Inside the site or its network' }, { value: 'field', label: 'Anywhere, location recorded' }]} />
        </FormField>
      </div>
    </Drawer>
  );
}


function StoryGeofenceEditor({ view = 'edit', ipError = false }: GeofenceProps) {
  const [points, setPoints] = useState<GeoPoint[]>(view === 'multi' ? [MAIN_POINT, ANNEXE_POINT] : [MAIN_POINT]);
  const [sel, setSel] = useState(points[0].id);
  const [ips, setIpsRaw] = useState(ipError ? '10.20.4.0/24\n10.20.300.0/24' : '10.20.4.0/24\n10.20.5.0/24');
  const [mode, setMode] = useState(view === 'field' ? 'field' : 'restricted');
  const [bind, setBind] = useState(view !== 'field');
  const [askBind, setAskBind] = useState(false);
  const [showPoints, setShowPoints] = useState(false);
  const [saved, setSaved] = useState(false);
  const formRef = useRef<HTMLDivElement>(null);
  const cur = points.find((p) => p.id === sel) ?? points[0];
  const edit = (patch: Partial<GeoPoint>) => { setPoints((ps) => ps.map((p) => (p.id === cur.id ? { ...p, ...patch } : p))); setSaved(false); };
  const setIps = (v: string) => { setIpsRaw(v); setSaved(false); };
  const [wifi, setWifiRaw] = useState('KF-Taramani-5F');
  const setWifi = (v: string) => { setWifiRaw(v); setSaved(false); };
  const ipErr = ipRangeError(ips);
  const radiusErr = 'Enter a radius between 50 and 1,000 m';
  // One per wrong field, so "4 errors to fix" matches what the form marks.
  const errors = (ipErr ? 1 : 0) + points.reduce((s, p) => s + pointErrors(p), 0);
  const field = mode === 'field';
  const addPoint = () => {
    const id = `p${Date.now()}`;
    setPoints((ps) => [...ps, { id, name: `Point ${ps.length + 1}`, lat: '', lng: '', r: 100 }]);
    setSel(id);
    setSaved(false);
  };
  const jumpToError = () => {
    setShowPoints(true);
    const bad = points.find(pointBad);
    if (bad && !pointBad(cur) && !ipErr) setSel(bad.id);
    requestAnimationFrame(() => {
      const el = formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]');
      el?.scrollIntoView({ block: 'center' });
      el?.focus();
    });
  };
  const saveRow = (
    <div className="yx-tim-row">
      {errors > 0 && <Button size="sm" onClick={jumpToError}>{plural(errors, 'error')} to fix</Button>}
      {saved && <span className="yx-tim-muted">Saved</span>}
      <Button variant="primary" disabled={errors > 0} onClick={() => setSaved(true)}>Save location</Button>
    </div>
  );

  const pointsSection = (
    <FormSection title="Allowed points">
      <ul className="yx-tim-list">
        {points.map((p) => (
          <li key={p.id}>
            <span className="yx-tim-list__main">
              <strong>{p.name.trim() || 'Unnamed point'}</strong>
              <span className="yx-tim-muted">{p.lat || '—'}, {p.lng || '—'} · {p.r ?? '—'} m</span>
            </span>
            {points.length > 1 && (
              <span className="yx-tim-row">
                {pointBad(p) && <Badge tone="danger">Needs fixing</Badge>}
                {/* Same two buttons on every row so Remove lines up (R9). */}
                <Button size="sm" disabled={p.id === cur.id} onClick={() => setSel(p.id)}>{p.id === cur.id ? 'Editing' : 'Edit'}</Button>
                <Button size="sm" onClick={() => { setPoints((ps) => ps.filter((x) => x.id !== p.id)); if (p.id === cur.id) setSel(points.find((x) => x.id !== p.id)!.id); setSaved(false); }}>Remove</Button>
              </span>
            )}
          </li>
        ))}
      </ul>
      <FormField label="Point name" required error={nameError(cur.name)}><TextField value={cur.name} onChange={(v) => edit({ name: v })} /></FormField>
      <FieldRow>
        <FormField label="Latitude" error={latError(cur.lat)}><TextField value={cur.lat} inputMode="decimal" onChange={(v) => edit({ lat: v })} /></FormField>
        <FormField label="Longitude" error={lngError(cur.lng)}><TextField value={cur.lng} inputMode="decimal" onChange={(v) => edit({ lng: v })} /></FormField>
      </FieldRow>
      <FormField label="Radius (m)" helper="50–1,000 m. Phone GPS is usually accurate to 20–50 m outdoors." error={radiusBad(cur.r) ? radiusErr : null}>
        <NumberField value={cur.r} onChange={(v) => edit({ r: v })} />
      </FormField>
      <span><Button icon={Plus} onClick={addPoint}>Add another point</Button></span>
    </FormSection>
  );
  const networkSection = (
    <FormSection title="Office network (web check-in)">
      <FormField label="IP ranges" helper="One range per line, e.g. 10.20.4.0/24" error={ipErr}>
        <TextArea value={ips} onChange={setIps} rows={3} />
      </FormField>
      <FormField label="Wi-Fi names" optional helper="Shown to people so they join the right network; check-in is checked by office network and location."><TextField value={wifi} onChange={setWifi} /></FormField>
    </FormSection>
  );
  const fences = points.flatMap((p) => {
    const at = toMap(p);
    return at ? [{ id: p.id, label: `${p.name.trim() || 'Unnamed point'} · ${p.r ?? 0} m`, x: at.x, y: at.y, r: (p.r ?? 0) / 5, active: points.length > 1 && p.id === cur.id }] : [];
  });

  return (
    <TimePage active="Locations & geofences" user={HR_ADMIN}>
      <PageHeader
        breadcrumbs={<Breadcrumbs items={[{ label: 'Locations', href: '#' }, { label: 'Chennai office' }]} />}
        title="Chennai office"
        description={`${CHENNAI.address} · ${CHENNAI.state} · ${plural(locationHeadcount(CHENNAI.name), 'person', 'people')}`}
        status={field ? <Badge tone="info">Field check-in</Badge> : <Badge tone="success">Restricted check-in</Badge>}
      />
      <div className="yx-tim-editor">
        <GeoMap
          height={300}
          fences={fences}
          pins={[]}
          editable={!field}
          // The map draws 1 px per 5 m; the radius snaps to 10 m.
          onRadiusChange={(id, r) => { if (id === cur.id) edit({ r: Math.round((r * 5) / 10) * 10 }); }}
          caption={field ? 'Used to label check-ins as at office' : 'Drag the handle, or type the radius in the form'}
        />
        <div className="yx-tim-form" ref={formRef}>
          <FormSection title="Check-in mode">
            <RadioGroup
              aria-label="Check-in mode"
              value={mode}
              onChange={(v) => { setMode(v); setSaved(false); }}
              options={[{ value: 'restricted', label: 'Restricted', description: 'Must be inside a point or on the office network' }, { value: 'field', label: 'Field', description: 'Location recorded, not restricted' }]}
            />
            <Switch label="Bind check-in to one phone" description="Off until HR turns it on for this site" checked={bind} onChange={(v) => { if (v) setAskBind(true); else setBind(false); setSaved(false); }} />
          </FormSection>
          {field && !showPoints ? (
            <FormSection title="Points and office network">
              <p className="yx-tim-muted">In field mode, points are used only to label check-ins as at office. {plural(points.length, 'point')} and the office network are kept.</p>
              <span><Button onClick={() => setShowPoints(true)}>Show points and network</Button></span>
            </FormSection>
          ) : (
            <>
              {pointsSection}
              {networkSection}
            </>
          )}
          {saveRow}
        </div>
      </div>
      <ConfirmDialog
        open={askBind}
        onOpenChange={setAskBind}
        title="Bind check-in to one phone?"
        consequence="People who check in from another phone will be refused from now on. HR can reset a person's phone."
        confirmLabel="Turn it on"
        onConfirm={() => { setBind(true); setAskBind(false); }}
      />
    </TimePage>
  );
}

/* =====================================================================
   TIM-42 · Holiday feed settings
   ===================================================================== */

interface Feed { id: string; state: string; locations: string; /** A site in this state that has no calendar yet. */ noCalendar?: LocKey; /** Last check; none yet for a feed just added. */ checked?: Date; added?: Date }
const FEEDS_CHECKED = new Date(2026, 8, 28);
const FEEDS: Feed[] = [
  { id: 'tn', state: 'Tamil Nadu', locations: 'Chennai office, Hosur plant', noCalendar: 'mdu', checked: FEEDS_CHECKED },
  { id: 'ka', state: 'Karnataka', locations: 'Bengaluru head office', checked: FEEDS_CHECKED },
];
/** Waiting changes come only from the Tamil Nadu feed (keyed by state, so a removed and re-added feed still gets them). */
const TN_STATE = 'Tamil Nadu';
const FEED_STATES = ['Karnataka', 'Tamil Nadu', 'Kerala', 'Maharashtra'];
const locsIn = (state: string | null) => CAL_LOCS.filter((l) => l.state === state).map((l) => l.name);

export function HolidayFeedScreen({ view = 'settings' }: { view?: 'settings' | 'review' | 'off' }) {
  const [on, setOn] = useState(view !== 'off');
  const [feeds, setFeeds] = useState(FEEDS);
  const [review, setReview] = useState(view === 'review');
  const [waitingIds, setWaitingIds] = useState(TN_FEED_CHANGES.map((c) => c.id));
  const [decisions, setDecisions] = useState<Record<string, 'accepted' | 'ignored' | undefined>>({});
  const [peopleOpen, setPeopleOpen] = useState(false);
  const [publishedMsg, setPublishedMsg] = useState<{ title: string; body: string } | null>(null);
  const [checked, setChecked] = useState(false);
  const [offAsk, setOffAsk] = useState(false);
  const [removing, setRemoving] = useState<Feed | null>(null);
  const [adding, setAdding] = useState<{ state: string | null; locs: string[] } | null>(null);
  // Removed feeds by state, so adding one back keeps its last-checked date.
  const [gone, setGone] = useState<Record<string, Feed>>({});
  const waiting = TN_FEED_CHANGES.filter((c) => waitingIds.includes(c.id));
  const accepted = waiting.filter((c) => decisions[c.id] === 'accepted');
  const ignored = waiting.filter((c) => decisions[c.id] === 'ignored');
  const undecided = waiting.length - accepted.length - ignored.length;
  const decide = (id: string, d: 'accepted' | 'ignored' | undefined) => setDecisions((s) => ({ ...s, [id]: d }));
  const subscribed = feeds.map((f) => f.state);
  const hasTn = subscribed.includes(TN_STATE);
  const tnWaiting = hasTn ? waiting.length : 0;
  const removingSite = removing?.noCalendar ? CAL_LOCS.find((l) => l.key === removing.noCalendar) : undefined;

  const publish = () => {
    const back = accepted.flatMap((c) => c.onLeave).length;
    const cals = [...new Set(accepted.flatMap((c) => c.locs))].map(locName);
    setWaitingIds((ids) => ids.filter((id) => !decisions[id]));
    const dismissed = ignored.length > 0 ? `${plural(ignored.length, 'change')} dismissed; calendars keep their dates for ${ignored.length === 1 ? 'it' : 'them'}.` : '';
    setPublishedMsg(
      accepted.length === 0
        ? { title: 'Changes dismissed', body: dismissed }
        : {
            title: 'Published',
            body: `Published ${plural(accepted.length, 'change')} to the ${cals.join(' and ')} ${cals.length === 1 ? 'calendar' : 'calendars'}.${back > 0 ? ` ${plural(back, 'person gets', 'people get')} their leave day back and ${back === 1 ? 'is' : 'are'} notified.` : ''}${dismissed ? ` ${dismissed}` : ''}`,
          },
    );
  };
  const openAdd = () => {
    const free = FEED_STATES.find((s) => !subscribed.includes(s)) ?? null;
    setAdding({ state: free, locs: locsIn(free) });
  };

  return (
    <TimePage active="Holiday calendars" user={HR_ADMIN}>
      <PageHeader
        title="Public-holiday feeds"
        description="Calendars follow a state feed. Changes wait for your review before employees see them."
        actions={on ? <div className="yx-tim-row"><Button icon={Plus} onClick={openAdd}>Add feed</Button><Button icon={RefreshCw} onClick={() => { setFeeds((fs) => fs.map((f) => ({ ...f, checked: TODAY }))); setChecked(true); }}>Check for updates</Button></div> : undefined}
      />
      {on && checked && (
        <InlineAlert tone="info" title={`Checked all feeds on ${dayShort(TODAY)}`}>
          No new changes{tnWaiting > 0 ? ` besides the ${plural(tnWaiting, 'change')} waiting for your review` : ''}.
        </InlineAlert>
      )}
      <Card title="Subscriptions">
        <div className="yx-tim-stack">
          <Switch label="Use public-holiday feeds" checked={on} onChange={(v) => (!v && tnWaiting > 0 ? setOffAsk(true) : setOn(v))} />
          {on ? (
            <ul className="yx-tim-list">
              {feeds.map((f) => {
                const site = f.noCalendar ? CAL_LOCS.find((l) => l.key === f.noCalendar) : undefined;
                return (
                <li key={f.id}>
                  <span className="yx-tim-list__main">
                    <strong>India · {f.state}</strong>
                    <span className="yx-tim-muted">{f.locations} · {f.checked ? `last checked ${dayShort(f.checked)}` : `added ${dayShort(f.added ?? TODAY)} · first check pending`}</span>
                    {site && <span className="yx-tim-muted">{site.name}{site.opens ? ` · opens ${dayShort(site.opens)}` : ''} · no calendar yet</span>}
                  </span>
                  <span className="yx-tim-row">
                    {site && <StoryLink to={STORY.calendarTemplate}>{`Start ${site.name} calendar`}</StoryLink>}
                    {!f.checked ? (
                      <Badge tone="neutral">First check pending</Badge>
                    ) : f.state !== TN_STATE || waiting.length === 0 ? (
                      <Badge tone="success">Up to date</Badge>
                    ) : review ? (
                      <Badge tone="neutral">{plural(waiting.length, 'change')} to review</Badge>
                    ) : (
                      <Button size="sm" variant="review" onClick={() => setReview(true)}>Review {plural(waiting.length, 'change')}</Button>
                    )}
                    <Button size="sm" onClick={() => setRemoving(f)}>Remove</Button>
                  </span>
                </li>
                );
              })}
            </ul>
          ) : (
            <InlineAlert tone="info" title="Feeds are off" actions={<StoryLink to={STORY.calendars}>Open holiday calendars</StoryLink>}>
              Calendars keep their holidays. You add changes by hand in Holiday calendars.
            </InlineAlert>
          )}
        </div>
      </Card>
      {on && review && hasTn && (waiting.length > 0 || publishedMsg) && (
        <Card title="Changes from the Tamil Nadu feed · review before publishing">
          <div className="yx-tim-stack">
            {publishedMsg && <InlineAlert tone="success" title={publishedMsg.title}>{publishedMsg.body}</InlineAlert>}
            {waiting.length > 0 && (
              <>
                <ul className="yx-tim-list">
                  {waiting.map((ch) => {
                    const d = decisions[ch.id];
                    return (
                      <li key={ch.id}>
                        <span className="yx-tim-list__main">
                          <strong>{ch.title}</strong>
                          <span className="yx-tim-muted">{ch.note}</span>
                          {ch.onLeave.length > 0 && (
                            <span className="yx-tim-muted">
                              {plural(ch.onLeave.length, 'person has', 'people have')} leave on {dayShort(ch.date)}. When you publish, their {dayShort(ch.date)} leave goes back to their balance and they are notified.
                            </span>
                          )}
                          {peopleOpen && ch.onLeave.length > 0 && (
                            <ul className="yx-tim-days">{ch.onLeave.map((p) => <li key={p.name}><span>{p.name}</span><strong>{p.type} · {dayShort(ch.date)}</strong></li>)}</ul>
                          )}
                          <span className="yx-tim-row"><DueBadge date={ch.date} /></span>
                        </span>
                        <span className="yx-tim-row">
                          {ch.onLeave.length > 0 && <Button size="sm" onClick={() => setPeopleOpen((o) => !o)}>{peopleOpen ? 'Hide people' : `See ${plural(ch.onLeave.length, 'person', 'people')}`}</Button>}
                          {d ? (
                            <>
                              <Badge tone={d === 'accepted' ? 'success' : 'neutral'}>{d === 'accepted' ? 'Accepted' : 'Ignored'}</Badge>
                              <Button size="sm" onClick={() => decide(ch.id, undefined)}>Undo</Button>
                            </>
                          ) : (
                            <>
                              <Button size="sm" onClick={() => decide(ch.id, 'ignored')}>Ignore</Button>
                              <Button size="sm" variant="approve" onClick={() => decide(ch.id, 'accepted')}>Accept</Button>
                            </>
                          )}
                        </span>
                      </li>
                    );
                  })}
                </ul>
                <div className="yx-tim-row">
                  <Button variant="primary" disabled={undecided > 0} onClick={publish}>
                    {accepted.length > 0 ? `Publish ${plural(accepted.length, 'change')}` : ignored.length > 0 ? `Dismiss ${plural(ignored.length, 'change')}` : 'Publish changes'}
                  </Button>
                  {undecided > 0 && <span className="yx-tim-muted">Accept or ignore {undecided === waiting.length ? 'each change' : `the ${plural(undecided, 'change')} left`}</span>}
                </div>
              </>
            )}
          </div>
        </Card>
      )}
      <ConfirmDialog
        open={!!removing}
        onOpenChange={(o) => !o && setRemoving(null)}
        title={`Remove the ${removing?.state ?? ''} feed?`}
        consequence={
          removing
            ? `${removing.locations} keep${removing.locations.includes(',') ? '' : 's'} the current holidays.${removing.state === TN_STATE && waiting.length > 0 ? ` The ${plural(waiting.length, 'waiting change')} ${waiting.length === 1 ? 'is' : 'are'} not applied unless you add the feed again.` : ''} New state changes are no longer shown here.${removingSite ? ` ${removingSite.name}${removingSite.opens ? ` (opens ${dayShort(removingSite.opens)})` : ''} will have no feed to start its calendar from. Set it up by hand in Holiday calendars.` : ''}`
            : undefined
        }
        confirmLabel="Remove feed"
        destructive
        onConfirm={() => {
          if (removing) setGone((g) => ({ ...g, [removing.state]: removing }));
          setFeeds((fs) => fs.filter((x) => x.id !== removing?.id));
          setRemoving(null);
        }}
      />
      <ConfirmDialog
        open={offAsk}
        onOpenChange={setOffAsk}
        title="Turn off holiday feeds?"
        consequence={`The ${plural(tnWaiting, 'waiting change')} (${waiting.map((c) => c.short.replace(/\.$/, '')).join('; ')}) won't be added. Add them by hand in Holiday calendars.`}
        confirmLabel="Turn off feeds"
        destructive
        onConfirm={() => { setOn(false); setOffAsk(false); }}
      />
      <ConfirmDialog
        open={!!adding}
        onOpenChange={(o) => !o && setAdding(null)}
        title="Add a holiday feed"
        confirmLabel="Add feed"
        confirmDisabled={!adding?.state || subscribed.includes(adding.state)}
        onConfirm={() => {
          if (!adding?.state) return;
          const st = adding.state;
          // A state subscribed before comes back as it was (same id, sites and waiting changes).
          const known = gone[st] ?? FEEDS.find((f) => f.state === st);
          setFeeds((fs) => [...fs, known ?? { id: st.toLowerCase().replace(/\s+/g, '-'), state: st, locations: adding.locs.join(', ') || 'No locations yet', added: TODAY }]);
          setAdding(null);
        }}
      >
        {adding && (
          <div className="yx-tim-form">
            <FormField label="Country"><Sel initial="in" options={[{ value: 'in', label: 'India' }]} /></FormField>
            <FormField label="State">
              <Select
                value={adding.state}
                onChange={(v) => setAdding({ state: v, locs: locsIn(v) })}
                options={FEED_STATES.map((s) => ({ value: s, label: s, disabled: subscribed.includes(s), description: subscribed.includes(s) ? 'Already subscribed' : undefined }))}
              />
            </FormField>
            <FormField label="Locations">
              {locsIn(adding.state).length === 0 ? (
                <p className="yx-tim-muted">No Kaveri Foods location in {adding.state ?? 'this state'} yet. The feed is ready when one opens.</p>
              ) : (
                <div className="yx-tim-stack">
                  {locsIn(adding.state).map((n) => (
                    <Checkbox key={n} label={n} checked={adding.locs.includes(n)} onChange={(v) => setAdding({ ...adding, locs: v ? [...adding.locs, n] : adding.locs.filter((x) => x !== n) })} />
                  ))}
                </div>
              )}
            </FormField>
          </div>
        )}
      </ConfirmDialog>
    </TimePage>
  );
}
