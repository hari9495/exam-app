// Leave and location set-up for HR. TIM-26, TIM-27, TIM-28, TIM-29, TIM-31, TIM-42.
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { FilterToggle } from '../../components/filter-toggle';
import { ArrowDown, ArrowUp, Copy, Plus, RefreshCw } from 'lucide-react';
import { Icon } from '../../components/foundations';
import { Button, IconButton } from '../../components/button';
import { Badge, DayDate } from '../../components/display';
import { Drawer } from '../../components/drawer';
import { EmptyState, ErrorState, InlineAlert, NoAccessState, Skeleton } from '../../components/feedback';
import { useToast } from '../../components/notify';
import { Segment } from '../../components/segment';
import { ConfirmDialog, TypeToConfirmDialog } from '../../components/overlay';
import { Breadcrumbs, Card, DescriptionList, PageHeader, Tabs, TabsContent, TabsList, TabsTrigger } from '../../components/shell';
import { DataTable, type TableColumn } from '../../components/table';
import { Checkbox, RadioGroup, Switch } from '../../components/choice';
import { NumberField, TextArea, TextField, TimeField } from '../../components/inputs';
import { ErrorSummary, FieldRow, FormField, FormSection, useSaveErrors, useTooEarly } from '../../components/field';
import { PersonPicker, Select, type SelectOption } from '../../components/select';
import { DatePicker } from '../../components/date';
import { Stepper, useNarrow } from '../../components/stepper';
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from '../../components/menu';
import { FilterBar } from '../../components/filters';
import { EMPLOYEES, ENTITIES, LOCATIONS, entityHeadcount, locationHeadcount } from '../_kit/data';
import { DueBadge, GeoMap, Kpis, TimePage, type TimeNav } from './time-kit';
import { formatDate } from '../../lib/format';
import { errorText, useRun } from '../org/org-kit';
import type { BlockDateInput, BlockDates, HolidayFeeds, HolidayRow, LeaveRules, LeaveTypeRow, LoadState, LocationRule, PolicyLine, TimeSetup, YearChangePreview, YearEndPreview } from './live/types';
import { EL_ENCASH_MAX, EL_ENCASH_MIN_LEFT, HR_ADMIN, LEAVE_REQUESTS, TODAY, balancesFor, elEncashLeftAtYearEnd } from './time-data';
import { countLeaveDays, yearEndSplit, type YearEndRow } from './time-logic';
import type { ViewState } from './attendance';
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
/** "1 Jan 2027". */
const day = formatDate;
const dayShort = formatDate;
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

/** One location's calendar: the sample (stories), or `live` (the app). */
function CalendarPanel(p: CalendarPanelProps | { live: LiveCalendarPanelProps }) {
  return 'live' in p ? <LiveCalendarPanel {...p.live} /> : <SampleCalendarPanel {...p} />;
}

function SampleCalendarPanel({ loc, rows, rules, saved, onRules, onSaveRules, draft, published, onPublish, onAdd, onEdit, onRemove, onTemplate }: CalendarPanelProps) {
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
          <DayDate date={r.date} />
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
                {/* Never greyed out: with nothing changed it does nothing, and the note beside it says so. */}
                <Button variant="primary" onClick={() => dirty && onSaveRules()}>Save rules</Button>
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

/** TIM-26. Stories show the sample; the app passes `live` (the company's calendars per location). */
export function HolidayCalendarsScreen({ live, ...sample }: { loc?: LocKey; dialog?: 'clone' | 'template'; state?: ViewState; live?: LiveHolidayCalendars }) {
  return live ? <LiveHolidays live={live} /> : <SampleHolidayCalendars {...sample} />;
}

function SampleHolidayCalendars({ loc = 'maa', dialog, state = 'ready' }: { loc?: LocKey; dialog?: 'clone' | 'template'; state?: ViewState }) {
  const { toast } = useToast();
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
  const [triedDate, setTriedDate] = useState(false);
  const [triedHol, setTriedHol] = useState(false);
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
    setTriedHol(true);
    if (!hol?.name.trim() || !hol?.date) return false;
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
              <Button variant="primary" icon={Copy} onClick={() => pendingFeed === 0 && setDlg('clone')}>Clone {cur.name} to 2027</Button>
            </div>
          ) : undefined
        }
      />
      {year === 2027 && nextRows ? (
        <div className="yx-tim-stack">
          {nextPublished[tab] ? (
            <div className="yx-tim-row"><Badge tone="success">Published</Badge><span className="yx-tim-muted">Employees at {cur.name} now see the 2027 holidays.</span></div>
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
              { key: 'date', header: 'Date', type: 'date', value: (r: Holiday) => r.date, render: (r: Holiday) => <DayDate date={r.date} /> },
              { key: 'kind', header: 'Type', type: 'status', value: (r: Holiday) => (r.moves && !nextPublished[tab] ? 'Confirm date' : r.optional ? 'Optional' : 'Holiday'), statusTone: (v) => (v === 'Confirm date' ? 'warning' : v === 'Optional' ? 'info' : 'neutral') },
            ]}
            rows={nextRows}
            getRowId={(r) => `${r.name}-${r.date.getTime()}`}
            defaultSort={{ key: 'date', dir: 'asc' }}
            rowButtons={(r) => (r.moves && !nextPublished[tab] ? <Button size="sm" onClick={() => (setTriedDate(false), setConfirming({ orig: r, date: r.date }))}>Confirm date</Button> : null)}
          />
          {!nextPublished[tab] && (
            <div className="yx-tim-row">
              <Button variant="primary" onClick={() => { if (toConfirm > 0) return; setNextPublished((p) => ({ ...p, [tab]: true })); toast({ tone: 'success', title: `${cur.name} 2027 calendar published` }); }}>Publish {cur.name} 2027 calendar</Button>
              <span className="yx-tim-muted">{toConfirm > 0 ? `Confirm the ${plural(toConfirm, 'festival date')} first` : 'Employees see these holidays only after you publish'}</span>
            </div>
          )}
        </div>
      ) : (
      <>
      {nextRows && (
        <InlineAlert tone="info" title={`2027 draft created for ${cur.name}`} actions={<Button size="sm" onClick={() => setYear(2027)}>Open 2027 draft</Button>}>
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
              onAdd={() => (setTriedHol(false), setHol({ name: '', date: null, optional: false }))}
              onEdit={(h) => (setTriedHol(false), setHol({ orig: h, name: h.name, date: h.date, optional: !!h.optional }))}
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
        onConfirm={() => {
          setTriedDate(true);
          if (!confirming?.date) return false;
          const d = confirming.date;
          setNext((n) => ({ ...n, [tab]: n[tab]!.map((h) => (h === confirming.orig ? { ...h, date: d, moves: undefined } : h)) }));
          setConfirming(null);
        }}
      >
        {confirming && (
          <FormField label="Date" required error={triedDate && !confirming.date ? 'Choose the 2027 date.' : null}>
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
        consequence={`${hol?.orig ? `${day(hol.orig.date)} becomes a working day. ` : ''}People with leave on ${hol?.date ? day(hol.date) : 'the new date'} get that day back when you publish.`}
        confirmLabel={hol?.orig ? 'Change date' : 'Add holiday'}
        onConfirm={saveHoliday}
      >
        {hol && (
          <div className="yx-tim-form">
            <FormField label="Name" required error={triedHol && !hol.name.trim() ? 'Enter the holiday name.' : null}><TextField value={hol.name} onChange={(v) => setHol({ ...hol, name: v })} /></FormField>
            <FormField label="Date" required helper="Only today or later: earlier days are already in attendance records." error={triedHol && !hol.date ? 'Choose the date.' : null}>
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
        consequence={removing ? `${day(removing.date)} becomes a working day. Leave already applied for that day is counted again.` : undefined}
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

/** TIM-27. Stories show the sample; the app passes `live` (one leave type, or a new one). */
export function LeaveTypeEditorScreen({ live, ...sample }: { section?: string; statutory?: boolean; live?: LiveLeaveTypeEditor }) {
  return live ? <LiveTypeEditor live={live} /> : <SampleLeaveTypeEditor {...sample} />;
}

function SampleLeaveTypeEditor({ section = 'counting', statutory = false }: { section?: string; statutory?: boolean }) {
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
  const [triedFrom, setTriedFrom] = useState(false);
  const [triedDates, setTriedDates] = useState(false);
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
              <Button variant="primary" onClick={() => { if (!dirty) return; setDirty(false); setColourSaved(true); }}>Save colour</Button>
            </div>
          ) : (
            <div className="yx-tim-row">
              {!dirty ? <span className="yx-tim-muted">No changes yet</span> : saveBlocked && <span className="yx-tim-muted">{saveBlocked}</span>}
              <Button variant="primary" onClick={() => { if (!dirty || saveBlocked) return; setTriedFrom(false); setSaveOpen(true); }}>Save as version 5</Button>
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
                    <FormField label="Apply at least (days ahead)" helper="Leave blank to use the company default (3 days). Sick leave: none unless set here."><Num initial={7} onDirty={touch} /></FormField>
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
                      <span><Button icon={Plus} onClick={() => (setTriedDates(false), setAddingDates({ from: null, to: null, reason: '' }))}>Add dates</Button></span>
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
                <p className="yx-tim-muted">{person} applies 13 Nov 2026 – 16 Nov 2026 (the Saturday and Sunday between are weekly offs)</p>
                <ul className="yx-tim-days">{ex.days.map((d) => <li key={d.date.getTime()}><DayDate date={d.date} /><strong>{d.kind === 'counted' ? '1' : d.kind === 'sandwich' ? '1 (between leave days)' : '0 (off)'}</strong></li>)}</ul>
                <Kpis items={[{ label: 'Days counted', value: ex.total }, { label: 'Earned leave balance', value: `${num(elBalance)}${elPending > 0 ? ` (${num(elPending)} pending)` : ''} → ${num(elBalance - elPending - ex.total)}` }]} />
                <p className="yx-tim-note">{person} is on {EXAMPLE_POLICY.name}, {creditText(EXAMPLE_POLICY, creditBy[EXAMPLE_POLICY.id])}.</p>
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
        onConfirm={() => {
          setTriedFrom(true);
          if (!from) return false;
          setSaveOpen(false);
          setDirty(false);
        }}
      >
        <FormField label="Applies from" required error={triedFrom && !from ? 'Choose the date the new rules start.' : null}><DatePicker value={from} onChange={setFrom} min={TODAY} /></FormField>
      </ConfirmDialog>
      <ConfirmDialog
        open={!!addingDates}
        onOpenChange={(o) => !o && setAddingDates(null)}
        title="Add dates when no one can take it"
        confirmLabel="Add dates"
        onConfirm={() => {
          setTriedDates(true);
          if (!addingDates?.from || !addingDates.to || !addingDates.reason.trim()) return false;
          setBlocked((bs) => [...bs, { id: `b${Date.now()}`, from: addingDates.from!, to: addingDates.to!, reason: addingDates.reason.trim() }]);
          setAddingDates(null);
          touch();
        }}
      >
        {addingDates && (
          <div className="yx-tim-form">
            <FieldRow>
              <FormField label="From" required error={triedDates && !addingDates.from ? 'Choose the first date.' : null}><DatePicker value={addingDates.from} onChange={(v) => setAddingDates({ ...addingDates, from: v })} min={TODAY} /></FormField>
              <FormField label="To" required error={triedDates && !addingDates.to ? 'Choose the last date.' : null}><DatePicker value={addingDates.to} onChange={(v) => setAddingDates({ ...addingDates, to: v })} min={addingDates.from ?? TODAY} /></FormField>
            </FieldRow>
            <FormField label="Reason" required helper="People see this when they pick a blocked date" error={triedDates && !addingDates.reason.trim() ? 'Enter a reason.' : null}><TextField value={addingDates.reason} onChange={(v) => setAddingDates({ ...addingDates, reason: v })} /></FormField>
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
  const [triedOv, setTriedOv] = useState(false);
  const [triedEnd, setTriedEnd] = useState(false);
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
                    <Button size="sm" onClick={() => (setTriedEnd(false), setEnding({ o, on: o.from > TODAY ? o.from : TODAY }))}>End</Button>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
        <span><Button icon={Plus} onClick={() => (setTriedOv(false), setOv(blankOverride))}>Add override</Button></span>
      </FormSection>
      <ConfirmDialog
        open={!!ov}
        onOpenChange={(o) => !o && setOv(null)}
        title={`Add an override to ${p.name || 'this policy'}`}
        consequence="This person gets this policy instead of the one their rule gives them."
        confirmLabel="Add override"
        onConfirm={() => {
          setTriedOv(true);
          if (!ov?.from || !picked) return false;
          // Counts follow from the dates (peopleToday), so a future start changes nothing today.
          onChange({ overrides: [...p.overrides, { name: picked.name, change: `${policyByRule(picked.location)} → ${shortName || 'this policy'}`, from: ov.from, to: ov.to ?? undefined, note: ov.note.trim() || undefined }] });
          setOv(null);
        }}
      >
        {ov && (
          <div className="yx-tim-form">
            <FormField label="Person" required helper="Only people not already on this policy" error={triedOv && !picked ? 'Choose the person.' : null}><PersonPicker aria-label="Person" people={candidates} value={ov.personId} onChange={(v) => setOv({ ...ov, personId: v })} /></FormField>
            <FieldRow>
              <FormField label="From" required error={triedOv && !ov.from ? 'Choose the start date.' : null}><DatePicker value={ov.from} onChange={(v) => setOv({ ...ov, from: v })} min={TODAY} /></FormField>
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
        onConfirm={() => {
          setTriedEnd(true);
          if (!ending?.on) return false;
          const on = ending.on;
          onChange({ overrides: p.overrides.map((x) => (x === ending.o ? { ...x, to: on, ended: true } : x)) });
          setEnding(null);
        }}
      >
        {ending && (
          <FormField label="Ends on" required error={triedEnd && !ending.on ? 'Choose the end date.' : null}>
            <DatePicker value={ending.on} onChange={(v) => setEnding({ ...ending, on: v })} min={ending.o.from > TODAY ? ending.o.from : TODAY} max={ending.o.to} />
          </FormField>
        )}
      </ConfirmDialog>
    </div>
  );
}

/** TIM-28. Stories show the sample; the app passes `live` (the company's policies and where they apply). */
export function LeavePoliciesScreen({ live, ...sample }: { state?: ViewState; openId?: string; /** Stories: the block dates card with Add open, or with none yet. */ blockDates?: 'add' | 'empty'; live?: LiveLeavePolicies }) {
  return live ? <LivePolicies live={live} /> : <SampleLeavePolicies {...sample} />;
}

function SampleLeavePolicies({ state = 'ready', openId, blockDates }: { state?: ViewState; openId?: string; blockDates?: 'add' | 'empty' }) {
  const [blocks, setBlocks] = useState(() => sampleBlockDates(blockDates === 'empty'));
  const { toast } = useToast();
  const [rows, setRows] = useState<PolicyRow[]>(POLICIES);
  const [draft, setDraft] = useState<PolicyRow | null>(openId ? POLICIES.find((p) => p.id === openId) ?? null : null);
  const [isNew, setIsNew] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [from, setFrom] = useState<Date | null>(new Date(2026, 9, 1));
  const [showUncovered, setShowUncovered] = useState(false);
  // The arrows change a draft order; it applies only after "Save order" with a date.
  const [order, setOrder] = useState<string[] | null>(null);
  const [orderSave, setOrderSave] = useState(false);
  const [triedOrder, setTriedOrder] = useState(false);
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
              {/* At the top or bottom the arrow still works and says why nothing moved. */}
              <IconButton icon={ArrowUp} label={`Move ${r.name} up`} size="sm" onClick={() => (i === 0 ? toast({ title: `${r.name} is already first.` }) : move(r.id, -1))} />
              <IconButton icon={ArrowDown} label={`Move ${r.name} down`} size="sm" onClick={() => (i === shown.length - 1 ? toast({ title: `${r.name} is already last.` }) : move(r.id, 1))} />
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
  const blockCard = (
    <BlockDatesCard
      state={state === 'loading' ? 'loading' : state === 'error' ? 'error' : 'ready'}
      data={blocks}
      today="2026-09-30"
      addOpen={blockDates === 'add'}
      onAdd={async (x) => {
        setBlocks((b) => ({ ...b, dates: [...b.dates, { id: `bd${Date.now()}`, ...x, scopeId: x.scopeId ?? null, scopeName: [...b.entities, ...b.locations].find((p) => p.id === x.scopeId)?.name ?? null, leaveTypeIds: x.leaveTypeIds ?? [], affected: [] }] }));
        toast({ tone: 'success', title: 'Block dates added' });
      }}
      onRemove={async (id) => {
        setBlocks((b) => ({ ...b, dates: b.dates.filter((x) => x.id !== id) }));
        toast({ tone: 'success', title: 'Block dates removed' });
      }}
    />
  );
  return (
    <TimePage active="Leave types & policies" user={HR_ADMIN}>
      <PageHeader
        title="Leave policies"
        description="Each policy is a set of leave types given to people by rule (entity, location, grade or employee type). When someone matches more than one rule, the policy higher in the order wins."
        actions={<Button variant="primary" icon={Plus} onClick={() => openPolicy(newPolicy(), true)}>New policy</Button>}
      />
      <PoliciesAndBlocks start={blockDates ? 'blocks' : 'policies'} blocks={state === 'empty' ? null : blockCard}>
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
          <Button variant="primary" onClick={() => (setTriedOrder(false), setOrderSave(true))}>Save order</Button>
        </div>
      )}
      {pendingOrder && !order && (
        <div className="yx-tim-row">
          <Badge tone="neutral">New order from {day(pendingOrder.from)}</Badge>
          <span className="yx-tim-muted">{pendingOrder.ids.map((id, i) => `#${i + 1} ${rows.find((r) => r.id === id)?.name ?? ''}`).join(' · ')}</span>
        </div>
      )}
      </PoliciesAndBlocks>
      <ConfirmDialog
        open={orderSave}
        onOpenChange={setOrderSave}
        title="Save the new policy order?"
        consequence={`${orderMoves.length > 0 ? orderMoves.join(' ') : 'No one changes policy: the policies you moved share no people.'} Earlier months stay as they were.`}
        confirmLabel={orderFrom ? `Save from ${day(orderFrom)}` : 'Save order'}
        onConfirm={() => {
          setTriedOrder(true);
          if (!orderFrom) return false;
          // A later start keeps today's order in the table until that date.
          if (orderFrom > TODAY) setPendingOrder({ ids: shown.map((r) => r.id), from: orderFrom });
          else { setRows(shown); setPendingOrder(null); }
          setOrder(null);
          setOrderSave(false);
        }}
      >
        <FormField label="Applies from" required error={triedOrder && !orderFrom ? 'Choose the date the new order starts.' : null}><DatePicker value={orderFrom} onChange={setOrderFrom} min={TODAY} /></FormField>
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
            <Button style={{ flexBasis: 'auto' }} variant="primary" onClick={() => canSave && save()}>{from ? `Save from ${day(from)}` : 'Save'}</Button>
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

type YearEndSampleProps = {
  /** Stories: open on the posted result. */
  posted?: boolean;
  mode?: 'yearend' | 'transition';
  current?: string;
  confirm?: boolean;
  /** The date the wizard runs on (stories). Year-end can be posted from 1 Jan 2027. */
  asOf?: Date;
  /** The admin ticked "post anyway" for the pending leave requests. */
  pendingAcknowledged?: boolean;
};

/** TIM-29. Stories show the sample; the app passes `live` (preview from the ledger, then post). */
export function YearEndWizard({ live, ...sample }: YearEndSampleProps & { live?: LiveYearEnd }) {
  return live ? <LiveYearEndWizard live={live} /> : <SampleYearEndWizard {...sample} />;
}

/** The posted year end stays on the page: it runs in the background until the balances update (founder approved). */
function YearEndPosted({ title: postedTitle, actions: postedActions, children }: { title: string; actions?: ReactNode; children: ReactNode }) {
  return <InlineAlert tone="success" title={postedTitle} actions={postedActions}>{children}</InlineAlert>;
}

function SampleYearEndWizard({ mode = 'yearend', current = 'scope', confirm = false, asOf = TODAY, pendingAcknowledged = false, posted: postedInitially = false }: {
  /** Stories: open on the posted result. */
  posted?: boolean;
  mode?: 'yearend' | 'transition';
  current?: string;
  confirm?: boolean;
  /** The date the wizard runs on (stories). Year-end can be posted from 1 Jan 2027. */
  asOf?: Date;
  /** The admin ticked "post anyway" for the pending leave requests. */
  pendingAcknowledged?: boolean;
}) {
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
              <FilterToggle pressed={onlyLosing} onPressedChange={setOnlyLosing}>
Only people losing days ({yeAll.filter((r) => r.lapse > 0).length})
</FilterToggle>
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
          <YearEndPosted
            title={`Year-end 2026 posted on ${day(asOf)}`}
            actions={<>{drafts && <StoryLink to={STORY.payrollInputs}>Open payroll drafts</StoryLink>}{ackText && <StoryLink to={STORY.pendingRequests}>{`Open ${plural(pendingLeave, 'pending request')}`}</StoryLink>}<StoryLink to={STORY.leaveCard}>View leave card</StoryLink></>}
          >
            {yeLabel} · {tot.people} people · {thousands(tot.carried)} days carried forward · {thousands(tot.lapse)} days lapse{drafts ? ` · ${tot.drafts} pay-out drafts added to January payroll` : ''}{ackText ? ` · ${ackText}` : ''}.
          </YearEndPosted>
        ) : (
          <InlineAlert tone="info" title={`Leave-year change scheduled on ${day(asOf)}`} actions={<StoryLink to={STORY.policies}>View leave policies</StoryLink>}>
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
const toMap = (p: GeoPoint) => {
  if (latError(p.lat) || lngError(p.lng)) return null;
  const m = 111_320;
  return { x: 160 + ((Number(p.lng) - CENTRE.lng) * m * Math.cos((CENTRE.lat * Math.PI) / 180)) / 5, y: 100 - ((Number(p.lat) - CENTRE.lat) * m) / 5 };
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

/** TIM-31. Stories show the sample; the app passes `live` (each location's check-in mode, shift and weekly offs). */
export function GeofenceEditorScreen({ live, ...sample }: { view?: 'edit' | 'multi' | 'field'; ipError?: boolean; live?: LiveLocations }) {
  return live ? <LiveLocationsScreen live={live} /> : <SampleGeofenceEditor {...sample} />;
}

function SampleGeofenceEditor({ view = 'edit', ipError = false }: { view?: 'edit' | 'multi' | 'field'; ipError?: boolean }) {
  const [points, setPoints] = useState<GeoPoint[]>(view === 'multi' ? [MAIN_POINT, ANNEXE_POINT] : [MAIN_POINT]);
  const [sel, setSel] = useState(points[0].id);
  const [ips, setIpsRaw] = useState(ipError ? '10.20.4.0/24\n10.20.300.0/24' : '10.20.4.0/24\n10.20.5.0/24');
  const [mode, setMode] = useState(view === 'field' ? 'field' : 'restricted');
  const [bind, setBind] = useState(view !== 'field');
  const [bindTouched, setBindTouched] = useState(false);
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
      <Button variant="primary" onClick={() => (errors > 0 ? jumpToError() : setSaved(true))}>Save location</Button>
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
                <Button size="sm" onClick={() => setSel(p.id)}>{p.id === cur.id ? 'Editing' : 'Edit'}</Button>
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
      <FormField label="Wi-Fi names" optional><TextField value={wifi} onChange={setWifi} /></FormField>
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
              onChange={(v) => { setMode(v); if (!bindTouched) setBind(v === 'restricted'); setSaved(false); }}
              options={[{ value: 'restricted', label: 'Restricted', description: 'Must be inside a point or on the office network' }, { value: 'field', label: 'Field', description: 'Location recorded, not restricted' }]}
            />
            <Switch label="Bind check-in to one phone" description="On by default for restricted check-in" checked={bind} onChange={(v) => { setBind(v); setBindTouched(true); setSaved(false); }} />
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

export function HolidayFeedScreen({ view = 'settings', live }: { view?: 'settings' | 'review' | 'off'; /** The app: the company's feeds and the changes waiting for review. */ live?: LiveHolidayFeeds }) {
  if (live) return <LiveHolidayFeedScreen live={live} />;
  const { toast } = useToast();
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
  const [tried, setTried] = useState(false);
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
    const msg =
      accepted.length === 0
        ? { title: 'Changes dismissed', body: dismissed }
        : {
            title: 'Published',
            body: `Published ${plural(accepted.length, 'change')} to the ${cals.join(' and ')} ${cals.length === 1 ? 'calendar' : 'calendars'}.${back > 0 ? ` ${plural(back, 'person gets', 'people get')} their leave day back and ${back === 1 ? 'is' : 'are'} notified.` : ''}${dismissed ? ` ${dismissed}` : ''}`,
          };
    setPublishedMsg(msg);
    toast({ tone: 'success', title: msg.title });
  };
  const openAdd = () => {
    const free = FEED_STATES.find((s) => !subscribed.includes(s)) ?? null;
    setTried(false);
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
            {publishedMsg && <p className="yx-tim-muted">{publishedMsg.body}</p>}
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
                  <Button variant="primary" onClick={() => undecided === 0 && publish()}>
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
        onConfirm={() => {
          setTried(true);
          if (!adding?.state || subscribed.includes(adding.state)) return false;
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
            <FormField label="State" error={tried && !adding.state ? 'Choose the state.' : tried && subscribed.includes(adding.state!) ? 'Choose a state not already subscribed.' : null}>
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

/* =====================================================================
   Live (the app): TIM-26, 27, 28, 29 and 31 filled with the company's set-up (GET /time/setup).
   The page's API glue (toasts after a save, refetch) stays in apps/web; errors show here.
   ===================================================================== */

export interface SetupLive {
  state: LoadState;
  onRetry?: () => void;
  data: TimeSetup | null;
}
export type LeaveTypeInput = { code: string; name: string; kind: string; paid: boolean; colour: string; active: boolean; rules: LeaveRules };
export type LocationRuleInput = { validFrom: string; shiftName: string; shiftStart: number; shiftEnd: number; graceMinutes: number; weeklyOffs: { weekday: number; nth?: number[] }[]; checkIn: 'restricted' | 'field' };
export interface LiveLeavePolicies extends SetupLive {
  /** Resolves to the new policy (`{ id }`), so its drawer stays open on it. */
  onCreatePolicy: (name: string) => Promise<unknown>;
  onAddVersion: (policyId: string, input: { validFrom: string; lines: PolicyLine[] }) => Promise<unknown>;
  onAssign: (policyId: string, input: { scopeType: string; scopeId?: string; validFrom: string }) => Promise<unknown>;
  onRemoveAssignment: (id: string) => Promise<unknown>;
  /** TIM-28: the policy order (every policy, first wins) from a date. */
  onSaveOrder: (policyIds: string[], validFrom: string) => Promise<unknown>;
  /** Opens TIM-27 for a type, or 'new'. */
  onOpenType: (id: string) => void;
  /** Founder decision 1: the company block dates card. */
  blockDates?: LiveBlockDates;
}
export interface LiveLeaveTypeEditor extends SetupLive {
  /** A leave type's id, or 'new'. */
  typeId: string;
  onSaveType: (id: string | null, input: LeaveTypeInput) => Promise<unknown>;
  /** After a new type is added (`{ id }` from the API). */
  onAdded?: (id: string) => void;
  policiesHref: string;
}
export interface LiveHolidayCalendars extends SetupLive {
  onCreateCalendar: (input: { name: string; locationId?: string; optionalLimit: number }) => Promise<unknown>;
  onUpdateCalendar: (id: string, input: { name: string; optionalLimit: number; halfDayOpenHalf: 'first' | 'second'; onWeeklyOff?: 'none' | 'substitute' | 'comp_off'; onMove?: 'share' | 'reset' }) => Promise<unknown>;
  onAddHoliday: (calendarId: string, input: { on: string; name: string; kind: string; halfDay: boolean }) => Promise<unknown>;
  onRemoveHoliday: (id: string) => Promise<unknown>;
  /** "Change date" of a holiday in force (a draft's date goes through onConfirmDraft). */
  onChangeHoliday: (id: string, on: string) => Promise<unknown>;
  /** A location's calendar from its state template, as a draft. */
  onTemplate: (locationId: string, name: string) => Promise<unknown>;
  /** This year's holidays copied to next year as a draft. */
  onClone: (calendarId: string, name: string, year: number) => Promise<unknown>;
  onConfirmDraft: (id: string, on: string) => Promise<unknown>;
  onRemoveDraft: (id: string) => Promise<unknown>;
  onPublish: (calendarId: string, name: string, year: number) => Promise<unknown>;
  /** TIM-42 Review changes (the holiday feed page). */
  onReviewFeed?: () => void;
}
export interface LiveYearEnd extends SetupLive {
  /** TIM-29 Transition: the leave-year change of a legal entity instead of the year end. */
  mode?: 'yearend' | 'transition';
  onYearChangePreview?: (legalEntityId: string, newStartMonth: number) => Promise<YearChangePreview>;
  onYearChangeSchedule?: (legalEntityId: string, newStartMonth: number) => Promise<unknown>;
  policiesHref?: string;
  onYearEndPreview: (yearEnd: string) => Promise<YearEndPreview>;
  /** acknowledgePending: post with leave requests still waiting (they stay pending into the new year). */
  onYearEndRun: (yearEnd: string, acknowledgePending: boolean) => Promise<unknown>;
  /** Opens a waiting request (the Approvals inbox). */
  pendingHref?: string;
  onNavigate?: (href: string) => void;
}
export interface LiveLocations extends SetupLive {
  onSetRule: (locationId: string, input: LocationRuleInput) => Promise<unknown>;
  /** TIM-31 IpError: save the location's office networks (one IP range per line; the server checks each again). */
  onSetNetworks?: (locationId: string, ipRanges: string[]) => Promise<unknown>;
  /** Settings › Locations, where the point, radius and office networks are set. */
  settingsHref: string;
}

type SetupPolicy = TimeSetup['policies'][number];
type SetupLocation = TimeSetup['locations'][number];
type SetupCalendar = TimeSetup['calendars'][number];

const pad2 = (n: number) => String(n).padStart(2, '0');
const isoOf = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const dateOfIso = (iso: string) => new Date(`${iso}T00:00:00`);
const isoDay = (iso: string) => day(dateOfIso(iso));

const KINDS = [
  { value: 'earned', label: 'Earned' },
  { value: 'casual', label: 'Casual' },
  { value: 'sick', label: 'Sick' },
  { value: 'lop', label: 'Leave without pay' },
  { value: 'comp_off', label: 'Comp-off' },
  { value: 'maternity', label: 'Maternity' },
  { value: 'paternity', label: 'Paternity' },
  { value: 'other', label: 'Other' },
];
const kindText = (k: string) => KINDS.find((x) => x.value === k)?.label ?? k;
const COLOURS = ['blue', 'green', 'teal', 'purple', 'orange', 'pink', 'grey', 'red'].map((c) => ({ value: c, label: c[0].toUpperCase() + c.slice(1) }));
const DEFAULT_RULES: LeaveRules = { sandwich: 'none', sandwichOn: 'both', sandwichHalfDays: false, halfDays: true, minDays: null, maxDays: null, noticeDays: null, noticeMode: 'block', certificateAfterDays: null, medical: false, negativeLimit: 0, encashable: false, hrApprovalAboveDays: null };
const STATE_TEXT: Record<string, string> = { 'IN-KA': 'Karnataka', 'IN-TN': 'Tamil Nadu' };
const HOLIDAY_KINDS = [
  { value: 'national', label: 'National holiday' },
  { value: 'state', label: 'State holiday' },
  { value: 'festival', label: 'Festival' },
  { value: 'optional', label: 'Optional (each person chooses)' },
  { value: 'restricted', label: 'Restricted (each person chooses)' },
];
const choosable = (kind: string | null) => kind === 'optional' || kind === 'restricted';
/** The version in force today (the API sends the newest first). */
const versionToday = (p: SetupPolicy, today: string) => p.versions.find((v) => v.validFrom <= today) ?? p.versions[p.versions.length - 1];
/** Types a policy credits days of; leave without pay, comp-off and the statutory ones carry no yearly days. */
const creditedTypes = (d: TimeSetup) => d.types.filter((t) => t.active && !['lop', 'maternity', 'paternity', 'comp_off'].includes(t.kind));
const blankLine = (leaveTypeId: string): PolicyLine => ({ leaveTypeId, annualDays: 0, frequency: 'monthly', proRata: true, rounding: 0.5, carryForwardMax: 0 });
const typeShort = (d: TimeSetup, id: string) => (d.types.find((t) => t.id === id)?.name ?? 'Unknown type').replace(/ leave$/, '');
const lineText = (l: PolicyLine) => `${num(l.annualDays)} days a year, ${l.frequency === 'monthly' ? 'credited every month' : 'all at the start of the year'}${l.proRata ? ', a share for joiners' : ''}`;
const carryText = (l: PolicyLine) => (l.carryForwardMax === null ? 'carries forward in full' : l.carryForwardMax === 0 ? 'lapses at year end' : `carries forward up to ${num(l.carryForwardMax)} days`);
/** Is the day a weekly off under the location's rule (weekday 1 = Monday … 7 = Sunday; nth = which ones in the month)? */
const offUnder = (iso: string, offs: LocationRule['weeklyOffs']) => {
  const dt = dateOfIso(iso);
  const wd = dt.getDay() === 0 ? 7 : dt.getDay();
  return offs.some((o) => o.weekday === wd && (!o.nth?.length || o.nth.includes(Math.ceil(dt.getDate() / 7))));
};

/** Loading, could not load and no access around a live set-up screen; when ready the screen draws its own header. */
function SetupGate({ live, active, header, children }: { live: SetupLive; active: TimeNav; header: ReactNode; children: (d: TimeSetup) => ReactNode }) {
  const d = live.state === 'ready' ? live.data : null;
  return (
    <TimePage active={active} user={HR_ADMIN}>
      {d ? (
        children(d)
      ) : (
        <>
          {header}
          {live.state === 'error' ? (
            <ErrorState title="We couldn't load the leave set-up." description="Nothing has changed. Try again in a moment." onRetry={live.onRetry} />
          ) : live.state === 'no-access' ? (
            <NoAccessState grantedBy="your HR admin" what="the leave set-up" />
          ) : (
            <div className="yx-tim-stack" role="status" aria-busy="true" aria-label="Loading the leave set-up">
              <Skeleton height={96} />
              <Skeleton height={240} />
            </div>
          )}
        </>
      )}
    </TimePage>
  );
}

/** The minimums the law sets for the company's states (P07); a policy below them is raised when credits are made. */
function Statutory({ d }: { d: TimeSetup }) {
  if (!d.statutory.length) return null;
  return (
    <InlineAlert tone="info" title="Minimums set by law">
      {d.statutory.map((s) => (
        <span key={s.jurisdiction}>
          {STATE_TEXT[s.jurisdiction] ?? s.jurisdiction}: {(s.values.floors ?? []).map((f) => `${f.kinds.map(kindText).join(' and ')} ${f.days} days a year`).join(', ')}
          {s.values.carry?.earned ? `; earned leave carries forward up to at least ${s.values.carry.earned} days` : ''}. {s.verify ? 'Being confirmed with our compliance partner.' : ''}{' '}
        </span>
      ))}
      A policy below the minimum is raised to it when credits are made.
    </InlineAlert>
  );
}

/* ---------------- Founder decision 1 (29 Oct 2026): company block dates on Leave policies ---------------- */

/** The app: company block dates (leave.settings.manage). Adding never cancels leave already asked for: the card lists it. */
export interface LiveBlockDates {
  state: LoadState;
  onRetry?: () => void;
  data: BlockDates | null;
  onAdd: (input: BlockDateInput) => Promise<unknown>;
  onRemove: (id: string) => Promise<unknown>;
}
const BLOCK_WHERE = [
  { value: 'tenant' as const, label: 'Whole company' },
  { value: 'legal_entity' as const, label: 'A legal entity' },
  { value: 'location' as const, label: 'A location' },
];
const blockSpan = (a: string, b: string) => (a === b ? isoDay(a) : `${isoDay(a)} – ${isoDay(b)}`);

/** Leave policies and company block dates as two tabs, so the page fits 1278 x 635 without scrolling. */
function PoliciesAndBlocks({ blocks, start = 'policies', children }: { blocks: ReactNode; start?: 'policies' | 'blocks'; children: ReactNode }) {
  const [tab, setTab] = useState<string>(start);
  if (!blocks) return <>{children}</>;
  return (
    <Tabs value={tab} onValueChange={setTab}>
      <TabsList aria-label="Leave policies and block dates">
        <TabsTrigger value="policies">Policies</TabsTrigger>
        <TabsTrigger value="blocks">Company block dates</TabsTrigger>
      </TabsList>
      <TabsContent value="policies"><div className="yx-tim-stack">{children}</div></TabsContent>
      <TabsContent value="blocks">{blocks}</TabsContent>
    </Tabs>
  );
}

function BlockDatesCard({ state, onRetry, data, onAdd, onRemove, today, addOpen = false }: LiveBlockDates & { today: string; /** Story: the Add dialog open. */ addOpen?: boolean }) {
  const [adding, setAdding] = useState(addOpen);
  const [removing, setRemoving] = useState<BlockDates['dates'][number] | null>(null);
  const add = <Button size="sm" icon={Plus} onClick={() => setAdding(true)}>Add block dates</Button>;
  const typeText = (ids: string[]) => (ids.length ? ids.map((id) => data?.types.find((t) => t.id === id)?.name ?? 'A removed leave type').join(', ') : 'Planned leave (not sick, maternity, paternity or unpaid leave)');
  return (
    <Card title="Company block dates" actions={state === 'ready' && data ? add : undefined}>
      {state === 'loading' ? (
        <div role="status" aria-busy="true" aria-label="Loading the block dates"><Skeleton height={72} /></div>
      ) : state === 'error' || !data ? (
        <ErrorState title="The block dates didn't load" description="Nothing has changed. Try again." onRetry={onRetry} />
      ) : (
        <div className="yx-tim-stack">
          <p className="yx-tim-muted">{data.mode === 'warn' ? 'Leave on these dates is allowed; the approver sees a note.' : 'Leave on these dates is refused.'} Sick leave is never stopped unless you pick it.</p>
          {data.dates.length === 0 ? (
            <EmptyState compact title="No block dates" description="Add the days when the company needs everyone in, such as a stock count or an audit." action={add} />
          ) : (
            <ul className="yx-tim-list">
              {data.dates.map((b) => (
                <li key={b.id}>
                  <span className="yx-tim-list__main">
                    <strong>{blockSpan(b.from, b.to)} · {b.reason}</strong>
                    <span className="yx-tim-muted">{b.scopeType === 'tenant' ? 'Whole company' : (b.scopeName ?? 'One place')} · {typeText(b.leaveTypeIds)}</span>
                    {b.affected.length > 0 && (
                      <span className="yx-tim-note">
                        Already on leave then (their leave stays): {b.affected.map((a) => `${a.name} · ${a.type} ${blockSpan(a.from, a.to)} (${a.status === 'pending' ? 'waiting' : 'approved'})`).join('; ')}
                      </span>
                    )}
                  </span>
                  {b.to >= today && <Button size="sm" onClick={() => setRemoving(b)}>Remove</Button>}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      {data && <AddBlockDatesDialog open={adding} onOpenChange={setAdding} data={data} today={today} onAdd={onAdd} />}
      <ConfirmDialog
        open={!!removing}
        onOpenChange={(o) => !o && setRemoving(null)}
        title="Remove these block dates?"
        consequence={removing ? `${blockSpan(removing.from, removing.to)} (${removing.reason}): people can take leave on these dates again.` : undefined}
        confirmLabel="Remove"
        destructive
        onConfirm={async () => {
          await onRemove(removing!.id);
          setRemoving(null);
        }}
      />
    </Card>
  );
}

function AddBlockDatesDialog({ open, onOpenChange, data, today, onAdd }: { open: boolean; onOpenChange: (o: boolean) => void; data: BlockDates; today: string; onAdd: LiveBlockDates['onAdd'] }) {
  const defaults = () => data.types.filter((t) => t.canStop && t.stoppedByDefault).map((t) => t.id);
  const [from, setFrom] = useState<Date | null>(null);
  const [to, setTo] = useState<Date | null>(null);
  const [reason, setReason] = useState('');
  const [where, setWhere] = useState<BlockDateInput['scopeType']>('tenant');
  const [scopeId, setScopeId] = useState<string | null>(null);
  const [types, setTypes] = useState<string[]>(defaults);
  const long = from && to && (to.getTime() - from.getTime()) / 86_400_000 > 31;
  const early = useTooEarly([
    ...(from ? [] : [{ fieldId: 'bd-from', message: 'Choose the first date.' }]),
    ...(!to ? [{ fieldId: 'bd-to', message: 'Choose the last date.' }] : from && to < from ? [{ fieldId: 'bd-to', message: 'The last date is on or after the first.' }] : long ? [{ fieldId: 'bd-to', message: 'Block at most 32 days at a time.' }] : []),
    ...(reason.trim().length >= 3 ? [] : [{ fieldId: 'bd-reason', message: 'Enter a reason people will see.' }]),
    ...(where !== 'tenant' && !scopeId ? [{ fieldId: 'bd-scope', message: where === 'location' ? 'Choose the location.' : 'Choose the legal entity.' }] : []),
    ...(types.length ? [] : [{ fieldId: 'bd-types', message: 'Pick at least one leave type.' }]),
  ]);
  const reset = () => {
    setFrom(null);
    setTo(null);
    setReason('');
    setWhere('tenant');
    setScopeId(null);
    setTypes(defaults());
    early.reset();
  };
  const places = where === 'location' ? data.locations : data.entities;
  return (
    <ConfirmDialog
      open={open}
      onOpenChange={(o) => {
        if (!o) reset();
        onOpenChange(o);
      }}
      title="Add block dates"
      consequence="Leave already asked for or approved on these dates stays; it is listed on the card so you can talk to the people."
      confirmLabel="Add block dates"
      onConfirm={async () => {
        if (early.stop()) return false;
        // The default set is sent as "none picked", so leave types added later follow the default too.
        const same = types.length === defaults().length && types.every((t) => defaults().includes(t));
        await onAdd({ from: isoOf(from!), to: isoOf(to!), reason: reason.trim(), scopeType: where, ...(where === 'tenant' ? {} : { scopeId: scopeId! }), ...(same ? {} : { leaveTypeIds: types }) });
        reset();
      }}
    >
      <div className="yx-tim-form">
        <FieldRow>
          <FormField id="bd-from" label="From" required error={early.errorOf('bd-from')}><DatePicker value={from} onChange={setFrom} min={dateOfIso(today)} /></FormField>
          <FormField id="bd-to" label="To" required error={early.errorOf('bd-to')}><DatePicker value={to} onChange={setTo} min={from ?? dateOfIso(today)} /></FormField>
        </FieldRow>
        <FormField id="bd-reason" label="Reason" required helper="People see this when they pick a blocked date." error={early.errorOf('bd-reason')}><TextField value={reason} onChange={setReason} maxLength={200} /></FormField>
        <FormField label="Where"><Segment label="Where" value={where} onChange={(v) => { setWhere(v); setScopeId(null); }} options={BLOCK_WHERE} /></FormField>
        {where !== 'tenant' && (
          <FormField id="bd-scope" label={where === 'location' ? 'Location' : 'Legal entity'} required error={early.errorOf('bd-scope')}>
            <Select value={scopeId} onChange={setScopeId} options={places.map((x) => ({ value: x.id, label: x.name }))} placeholder="Choose" />
          </FormField>
        )}
        <FormField id="bd-types" label="Leave types it stops" required helper="Sick leave is not stopped unless you tick it. Maternity leave can never be stopped (Maternity Benefit Act)." error={early.errorOf('bd-types')}>
          <div id="bd-types" tabIndex={-1} role="group" aria-label="Leave types it stops" className="yx-tim-row">
            {data.types.filter((t) => t.canStop).map((t) => (
              <Checkbox key={t.id} label={t.name} checked={types.includes(t.id)} onChange={(on) => setTypes((x) => (on ? [...x, t.id] : x.filter((y) => y !== t.id)))} />
            ))}
          </div>
        </FormField>
      </div>
    </ConfirmDialog>
  );
}

/** Stories: Kaveri Foods' block dates (the year-end stock count at the Chennai office; Arun already has leave then). */
const SAMPLE_BLOCK_TYPES: BlockDates['types'] = [
  { id: 'EL', name: 'Earned leave', kind: 'earned', stoppedByDefault: true, canStop: true },
  { id: 'CL', name: 'Casual leave', kind: 'casual', stoppedByDefault: true, canStop: true },
  { id: 'CO', name: 'Comp-off', kind: 'comp_off', stoppedByDefault: true, canStop: true },
  { id: 'SL', name: 'Sick leave', kind: 'sick', stoppedByDefault: false, canStop: true },
  { id: 'LWP', name: 'Leave without pay', kind: 'lop', stoppedByDefault: false, canStop: true },
  { id: 'ML', name: 'Maternity leave', kind: 'maternity', stoppedByDefault: false, canStop: false },
];
const sampleBlockDates = (empty: boolean): BlockDates => ({
  mode: 'block',
  types: SAMPLE_BLOCK_TYPES,
  entities: ENTITIES.map((e) => ({ id: e.id, name: e.name })),
  locations: LOCATIONS.map((l) => ({ id: l.id, name: l.name })),
  dates: empty
    ? []
    : [
        { id: 'bd1', from: '2026-11-25', to: '2026-11-26', reason: 'Year-end stock count', scopeType: 'location', scopeId: 'maa', scopeName: 'Chennai office', leaveTypeIds: [], affected: [{ id: 'lr9', name: 'Arun Prakash', type: 'Earned leave', from: '2026-11-25', to: '2026-11-25', status: 'approved' }] },
        { id: 'bd2', from: '2027-03-29', to: '2027-03-31', reason: 'Financial year-end close', scopeType: 'tenant', scopeId: null, scopeName: null, leaveTypeIds: ['EL', 'CL'], affected: [] },
      ],
});

/* ---------------- TIM-28 live ---------------- */

const POLICIES_TEXT = 'Each policy is a set of leave types given to people by rule (the whole company, a legal entity, a location or a grade). When someone matches more than one rule, the policy higher in the order wins.';

function LivePolicies({ live }: { live: LiveLeavePolicies }) {
  const [openId, setOpenId] = useState<string | null>(null);
  // The arrows change a draft order; it applies only after "Save order" with a date.
  const [order, setOrder] = useState<string[] | null>(null);
  const [orderSave, setOrderSave] = useState(false);
  const [orderFrom, setOrderFrom] = useState<Date | null>(null);
  const [triedOrder, setTriedOrder] = useState(false);
  const [showUncovered, setShowUncovered] = useState(false);
  const { toast } = useToast();
  return (
    <SetupGate live={live} active="Leave types & policies" header={<PageHeader title="Leave policies" description={POLICIES_TEXT} />}>
      {(d) => {
        const policy = openId && openId !== 'new' ? d.policies.find((p) => p.id === openId) ?? null : null;
        const all = d.policies.filter((p) => !p.archived);
        // Today's order (saved, else the API's order by name), then any policy added since it was saved.
        const saved = d.order?.current ?? [];
        const base = [...saved.map((id) => all.find((p) => p.id === id)).filter((p): p is SetupPolicy => !!p), ...all.filter((p) => !saved.includes(p.id))];
        const shown = order ? order.map((id) => all.find((p) => p.id === id)).filter((p): p is SetupPolicy => !!p) : base;
        const move = (id: string, by: -1 | 1) => {
          const ids = shown.map((r) => r.id);
          const i = ids.indexOf(id);
          const j = i + by;
          if (j < 0 || j >= ids.length) return;
          [ids[i], ids[j]] = [ids[j]!, ids[i]!];
          setOrder(ids.join() === base.map((r) => r.id).join() ? null : ids);
        };
        const cov = (id: string) => d.coverage?.[id] ?? { people: 0, overrides: 0 };
        const nowrap = { whiteSpace: 'nowrap' } as const;
        const uncovered = d.uncovered?.count ?? 0;
        const cols: TableColumn<SetupPolicy>[] = [
          {
            key: 'name', header: 'Policy (order)', value: (r) => r.name,
            render: (r) => {
              const i = shown.indexOf(r);
              return (
                <span className="yx-tim-row" style={{ flexWrap: 'nowrap', alignItems: 'flex-start' }}>
                  <Badge tone="neutral">#{i + 1}</Badge>
                  <strong style={{ flex: 1, minWidth: 0 }}>{r.name}</strong>
                  {/* Arrows reorder; they must not also open the drawer. At the top or bottom they say why nothing moved. */}
                  <span className="yx-tim-row" style={{ flexWrap: 'nowrap', flexShrink: 0 }} onClick={(e) => e.stopPropagation()}>
                    <IconButton icon={ArrowUp} label={`Move ${r.name} up`} size="sm" onClick={() => (i === 0 ? toast({ title: `${r.name} is already first.` }) : move(r.id, -1))} />
                    <IconButton icon={ArrowDown} label={`Move ${r.name} down`} size="sm" onClick={() => (i === shown.length - 1 ? toast({ title: `${r.name} is already last.` }) : move(r.id, 1))} />
                  </span>
                </span>
              );
            },
          },
          {
            key: 'types', header: 'Leave types',
            value: (r) => versionToday(r, d.today)?.lines.map((l) => `${typeShort(d, l.leaveTypeId)} ${num(l.annualDays)}`).join(' · ') || 'No leave types yet',
          },
          {
            key: 'rule', header: 'Who gets it',
            value: (r) => r.assignments.filter((a) => a.scopeType !== 'employee').map((a) => a.scopeName).join(', ') || 'No one yet',
            render: (r) => {
              const v = versionToday(r, d.today);
              const later = r.versions.find((x) => x.validFrom > d.today);
              const rules = r.assignments.filter((a) => a.scopeType !== 'employee');
              const c = cov(r.id);
              return (
                <span className="yx-tim-list__main" style={{ flex: 'none' }}>
                  <span>{rules.length ? rules.map((a) => `${a.scopeName} from ${isoDay(a.validFrom)}`).join(' · ') : 'Not applied to anyone yet'}</span>
                  <span className="yx-tim-muted">
                    <span style={nowrap}>{plural(c.people, 'person', 'people')}</span>
                    {c.overrides > 0 && <> · <span style={nowrap}>{plural(c.overrides, 'override')}</span></>}
                    {v && <> · <span style={nowrap}>entitlements from {isoDay(v.validFrom)}</span></>}
                  </span>
                  {later && <span><Badge tone="neutral">Changes from {isoDay(later.validFrom)}</Badge></span>}
                </span>
              );
            },
          },
        ];
        const newPolicy = <Button variant="primary" icon={Plus} onClick={() => setOpenId('new')}>New policy</Button>;
        const upcoming = d.order?.upcoming;
        return (
          <>
            <PageHeader
              title="Leave policies"
              description={POLICIES_TEXT}
              actions={
                <div className="yx-tim-row">
                  {/* Question: the design has no list of leave types; each opens TIM-27 from this menu. */}
                  <Menu>
                    <MenuTrigger asChild>
                      <Button>Leave types</Button>
                    </MenuTrigger>
                    <MenuContent>
                      {d.types.map((t) => (
                        <MenuItem key={t.id} onSelect={() => live.onOpenType(t.id)}>
                          {t.name}
                          {t.active ? '' : ' (not in use)'}
                        </MenuItem>
                      ))}
                      {d.types.length > 0 && <MenuSeparator />}
                      <MenuItem onSelect={() => live.onOpenType('new')}>New leave type</MenuItem>
                    </MenuContent>
                  </Menu>
                  {newPolicy}
                </div>
              }
            />
            <PoliciesAndBlocks blocks={live.blockDates ? <BlockDatesCard {...live.blockDates} today={d.today} /> : null}>
            <Statutory d={d} />
            {uncovered > 0 && (
              <InlineAlert
                tone="warning"
                title={`${plural(uncovered, 'person matches', 'people match')} no policy`}
                actions={<Button size="sm" onClick={() => setShowUncovered((s) => !s)}>{showUncovered ? 'Hide them' : 'Show them'}</Button>}
              >
                They get no leave until a policy covers them. Apply a policy to their legal entity, location or grade.
                {showUncovered && (
                  <ul className="yx-tim-days">
                    {d.uncovered!.people.map((p) => <li key={p.id}><span>{p.name}{p.code ? ` · ${p.code}` : ''}</span><strong>Joined {isoDay(p.joinedOn)}</strong></li>)}
                    {uncovered > d.uncovered!.people.length && <li><span className="yx-tim-muted">and {uncovered - d.uncovered!.people.length} more</span></li>}
                  </ul>
                )}
              </InlineAlert>
            )}
            {d.covered !== undefined && <p className="yx-tim-muted">{plural(d.covered, 'person', 'people')} covered by {plural(all.length, 'policy', 'policies')}{uncovered > 0 ? ` · ${uncovered} not covered` : ''}</p>}
            <DataTable
              label="Leave policies"
              columns={cols}
              rows={shown}
              getRowId={(r) => r.id}
              rowNoun={['policy', 'policies']}
              onRowClick={(r) => setOpenId(r.id)}
              activeRowId={openId}
              empty={<EmptyState title="No leave policies yet" description="No one gets leave until you add a policy and apply it." action={newPolicy} />}
            />
            {order && (
              <div className="yx-tim-row">
                <span className="yx-tim-muted">Order changed, not saved yet</span>
                <Button onClick={() => setOrder(null)}>Cancel</Button>
                <Button variant="primary" onClick={() => (setTriedOrder(false), setOrderFrom(dateOfIso(d.today)), setOrderSave(true))}>Save order</Button>
              </div>
            )}
            {upcoming && !order && (
              <div className="yx-tim-row">
                <Badge tone="neutral">New order from {isoDay(upcoming.validFrom)}</Badge>
                <span className="yx-tim-muted">{upcoming.policyIds.map((id, i) => `#${i + 1} ${all.find((p) => p.id === id)?.name ?? ''}`).join(' · ')}</span>
              </div>
            )}
            </PoliciesAndBlocks>
            <ConfirmDialog
              open={orderSave}
              onOpenChange={setOrderSave}
              title="Save the new policy order?"
              consequence="People who match more than one policy get the one higher in the order from that date. A per-person override always wins. Earlier months stay as they were."
              confirmLabel={orderFrom ? `Save from ${day(orderFrom)}` : 'Save order'}
              onConfirm={async () => {
                setTriedOrder(true);
                if (!orderFrom || !order) return false;
                await live.onSaveOrder(order, isoOf(orderFrom));
                setOrder(null);
              }}
            >
              <FormField label="Applies from" required error={triedOrder && !orderFrom ? 'Choose the date the new order starts.' : null}>
                <DatePicker value={orderFrom} onChange={setOrderFrom} min={dateOfIso(d.today)} />
              </FormField>
            </ConfirmDialog>
            {openId && (openId === 'new' || policy) && (
              <LivePolicyDrawer key={openId} d={d} policy={policy} live={live} onOpen={setOpenId} onClose={() => setOpenId(null)} />
            )}
          </>
        );
      }}
    </SetupGate>
  );
}

function LivePolicyDrawer({ d, policy, live, onOpen, onClose }: { d: TimeSetup; policy: SetupPolicy | null; live: LiveLeavePolicies; onOpen: (id: string) => void; onClose: () => void }) {
  const types = creditedTypes(d);
  const latest = policy?.versions[0];
  const [name, setName] = useState('');
  const [lines, setLines] = useState<PolicyLine[]>(() => types.map((t) => latest?.lines.find((l) => l.leaveTypeId === t.id) ?? blankLine(t.id)));
  const [from, setFrom] = useState<Date | null>(dateOfIso(d.today));
  const [editing, setEditing] = useState<string | null>(null);
  const [dirty, setDirty] = useState(!policy);
  const [assigning, setAssigning] = useState<{ scopeType: 'tenant' | 'legal_entity' | 'location' | 'grade'; scopeId: string | null; from: Date | null } | null>(null);
  const [triedAssign, setTriedAssign] = useState(false);
  const { busy, error, run } = useRun();
  const errors = [...(!policy && !name.trim() ? [{ fieldId: 'pol-name', message: 'Name the policy.' }] : []), ...(!from ? [{ fieldId: 'pol-from', message: 'Choose the date the entitlements apply from.' }] : [])];
  const saveErrors = useSaveErrors(errors);
  const setLine = (id: string, patch: Partial<PolicyLine>) => {
    setLines((ls) => ls.map((l) => (l.leaveTypeId === id ? { ...l, ...patch } : l)));
    setDirty(true);
  };
  const save = () => {
    if (errors.length) {
      saveErrors.reveal();
      document.getElementById(errors[0].fieldId)?.focus();
      return;
    }
    if (!dirty) return;
    void run('save', async () => {
      let id = policy?.id;
      if (!id) {
        id = ((await live.onCreatePolicy(name.trim())) as { id?: string } | undefined)?.id;
        if (!id) throw new Error('The policy was added. Reload the page to open it.');
      }
      const kept = lines.filter((l) => l.annualDays > 0);
      if (kept.length) await live.onAddVersion(id, { validFrom: isoOf(from!), lines: kept });
      // A new policy stays open so it can be applied; a change closes.
      if (policy) onClose();
      else onOpen(id);
    });
  };
  const scopeOptions = assigning?.scopeType === 'legal_entity' ? d.entities.map((e) => ({ value: e.id, label: e.name })) : assigning?.scopeType === 'grade' ? (d.grades ?? []).map((g) => ({ value: g.id, label: g.name })) : d.locations.map((l) => ({ value: l.id, label: l.name }));
  return (
    <Drawer
      open
      onOpenChange={(o) => !o && onClose()}
      title={policy?.name ?? 'New policy'}
      subtitle={policy ? (policy.assignments.map((a) => a.scopeName).join(', ') || 'Not applied to anyone yet') : undefined}
      size="lg"
      footer={
        <>
          {!dirty && <span className="yx-tim-muted" style={{ flexBasis: 'auto' }}>No changes yet</span>}
          <Button style={{ flexBasis: 'auto' }} onClick={onClose}>Cancel</Button>
          <Button style={{ flexBasis: 'auto' }} variant="primary" loading={busy === 'save'} onClick={save}>{from ? `Save from ${day(from)}` : 'Save'}</Button>
        </>
      }
    >
      <div className="yx-tim-stack">
        <ErrorSummary errors={saveErrors.shownErrors} />
        {error && <InlineAlert tone="danger" title="That did not work">{error}</InlineAlert>}
        {!policy && (
          <FormField id="pol-name" label="Policy name" required error={saveErrors.errorOf('pol-name')}>
            <TextField value={name} onChange={setName} maxLength={100} />
          </FormField>
        )}
        <FormSection title="Entitlements">
          {types.length === 0 ? (
            <p className="yx-tim-muted">No leave types with a yearly balance yet. Add earned, casual and sick leave from Leave types first.</p>
          ) : (
            <ul className="yx-tim-check">
              {lines.map((l) => {
                const t = types.find((x) => x.id === l.leaveTypeId)!;
                return (
                  <li key={l.leaveTypeId}>
                    {editing === l.leaveTypeId ? (
                      <div className="yx-tim-form">
                        <FieldRow>
                          <FormField label={`${t.name}: days a year`} helper="0 leaves it out.">
                            <NumberField value={l.annualDays} onChange={(v) => setLine(l.leaveTypeId, { annualDays: v ?? 0 })} decimals min={0} max={366} />
                          </FormField>
                          <FormField label="Carry forward up to (days)" optional helper="Empty: all of it.">
                            <NumberField value={l.carryForwardMax} onChange={(v) => setLine(l.leaveTypeId, { carryForwardMax: v })} decimals min={0} max={366} />
                          </FormField>
                        </FieldRow>
                        <FormField label="Credited">
                          <Segment label={`${t.name} credited`} value={l.frequency} onChange={(v) => setLine(l.leaveTypeId, { frequency: v })} options={[{ value: 'monthly', label: 'Every month' }, { value: 'yearly', label: 'All at the start of the year' }]} />
                        </FormField>
                        <Checkbox label="Joiners get a share for the part of the year they work" checked={l.proRata} onChange={(v) => setLine(l.leaveTypeId, { proRata: v })} />
                        <span><Button size="sm" onClick={() => setEditing(null)}>Done</Button></span>
                      </div>
                    ) : (
                      <>
                        <span>{t.name} · {l.annualDays > 0 ? `${lineText(l)} · ${carryText(l)}` : 'not given'}</span>
                        <Button size="sm" onClick={() => setEditing(l.leaveTypeId)}>Edit</Button>
                      </>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
          <FormField id="pol-from" label="Applies from" required helper="Changes start on this date; earlier months stay as they were." error={saveErrors.errorOf('pol-from')}>
            <DatePicker value={from} onChange={(v) => { setFrom(v); setDirty(true); }} min={dateOfIso(d.today)} />
          </FormField>
        </FormSection>
        {policy && (
          <FormSection title="Who gets this policy">
            {policy.assignments.length === 0 ? (
              <p className="yx-tim-muted">Not applied to anyone yet. No one gets these entitlements until you apply it.</p>
            ) : (
              <ul className="yx-tim-list">
                {policy.assignments.map((a) => (
                  <li key={a.id}>
                    <span className="yx-tim-list__main">
                      <strong>{a.scopeName}</strong>
                      <span className="yx-tim-muted">from {isoDay(a.validFrom)}</span>
                    </span>
                    {a.removable && (
                      <Button size="sm" loading={busy === a.id} onClick={() => void run(a.id, () => live.onRemoveAssignment(a.id))}>Remove</Button>
                    )}
                  </li>
                ))}
              </ul>
            )}
            <span><Button icon={Plus} onClick={() => (setTriedAssign(false), setAssigning({ scopeType: 'legal_entity', scopeId: null, from: dateOfIso(d.today) }))}>Apply to</Button></span>
          </FormSection>
        )}
        <ConfirmDialog
          open={!!assigning}
          onOpenChange={(o) => !o && setAssigning(null)}
          title={`Apply ${policy?.name ?? 'this policy'}`}
          consequence="When someone matches more than one policy, the one higher in the order on Leave policies wins."
          confirmLabel="Apply"
          onConfirm={async () => {
            setTriedAssign(true);
            if (!assigning || !policy || !assigning.from || (assigning.scopeType !== 'tenant' && !assigning.scopeId)) return false;
            await live.onAssign(policy.id, { scopeType: assigning.scopeType, ...(assigning.scopeType === 'tenant' ? {} : { scopeId: assigning.scopeId! }), validFrom: isoOf(assigning.from) });
          }}
        >
          {assigning && (
            <div className="yx-tim-form">
              <FormField label="Apply to">
                <Segment label="Apply to" value={assigning.scopeType} onChange={(v) => setAssigning({ ...assigning, scopeType: v, scopeId: null })} options={[{ value: 'tenant', label: 'Whole company' }, { value: 'legal_entity', label: 'A legal entity' }, { value: 'location', label: 'A location' }, ...(d.grades?.length ? [{ value: 'grade' as const, label: 'A grade' }] : [])]} />
              </FormField>
              {assigning.scopeType !== 'tenant' && (
                <FormField label={assigning.scopeType === 'legal_entity' ? 'Legal entity' : assigning.scopeType === 'grade' ? 'Grade' : 'Location'} required error={triedAssign && !assigning.scopeId ? 'Choose one.' : null}>
                  <Select value={assigning.scopeId} onChange={(v) => setAssigning({ ...assigning, scopeId: v })} options={scopeOptions} />
                </FormField>
              )}
              <FormField label="From" required error={triedAssign && !assigning.from ? 'Choose the start date.' : null}>
                <DatePicker value={assigning.from} onChange={(v) => setAssigning({ ...assigning, from: v })} min={dateOfIso(d.today)} />
              </FormField>
            </div>
          )}
        </ConfirmDialog>
      </div>
    </Drawer>
  );
}

/* ---------------- TIM-27 live ---------------- */

const LIVE_SECTIONS = { basics: 'Basics', crediting: 'Crediting', counting: 'Counting', rules: 'Rules', yearend: 'Year end', absence: 'Absence & notice' } as const;
const FIELD_SECTION: Record<string, keyof typeof LIVE_SECTIONS> = { 'lt-code': 'basics', 'lt-name': 'basics', 'lt-paid': 'basics', 'lt-paypct': 'basics', 'lt-maxMonth': 'rules', 'lt-maxDays': 'rules', 'lt-encashMax': 'yearend' };
/** "Partially paid" (TIM-27 Basics): one pay step of 1-99 % over the whole year. */
const partPct = (r: LeaveRules) => (r.paySteps?.length === 1 && r.paySteps[0].days >= 366 && r.paySteps[0].percent > 0 && r.paySteps[0].percent < 100 ? r.paySteps[0].percent : null);
const NOTICE_PERIOD_TEXT: Record<string, string> = { no_change: 'allowed', extends_last_day: 'moves the last working day later', sick_and_unpaid_only: 'only sick and unpaid leave' };

function LiveTypeEditor({ live }: { live: LiveLeaveTypeEditor }) {
  const crumbs = (name: string) => <Breadcrumbs items={[{ label: 'Leave types & policies', href: live.policiesHref }, { label: name }]} />;
  return (
    <SetupGate live={live} active="Leave types & policies" header={<PageHeader breadcrumbs={crumbs('Leave type')} title="Leave type" />}>
      {(d) => {
        const row = live.typeId === 'new' ? null : d.types.find((t) => t.id === live.typeId);
        if (row === undefined)
          return (
            <>
              <PageHeader breadcrumbs={crumbs('Leave type')} title="Leave type" />
              <EmptyState title="This leave type is not there" description="It may have been opened from an old link." action={<Button asChild><a href={live.policiesHref}>Back to leave policies</a></Button>} />
            </>
          );
        return <LiveTypeForm key={row?.id ?? 'new'} d={d} row={row} live={live} crumbs={crumbs} />;
      }}
    </SetupGate>
  );
}

function LiveTypeForm({ d, row, live, crumbs }: { d: TimeSetup; row: LeaveTypeRow | null; live: LiveLeaveTypeEditor; crumbs: (name: string) => ReactNode }) {
  const [code, setCode] = useState(row?.code ?? '');
  const [name, setName] = useState(row?.name ?? '');
  const [kind, setKind] = useState<string | null>(row?.kind ?? 'earned');
  const [pay, setPay] = useState(row && !row.paid ? 'unpaid' : row && partPct(row.rules) ? 'part' : 'paid');
  const [colour, setColour] = useState<string | null>(row?.colour ?? 'blue');
  const [active, setActive] = useState(row?.active ?? true);
  const [r, setR] = useState<LeaveRules>(row?.rules ?? DEFAULT_RULES);
  const [payPct, setPayPct] = useState<number | null>(row ? partPct(row.rules) : null);
  const [sec, setSec] = useState<string>('basics');
  const law = row?.statutory ?? null;
  const defaults = d.leaveDefaults ?? {};
  const narrow = useNarrow();
  const { busy, error, run } = useRun();
  const set = <K extends keyof LeaveRules>(k: K, v: LeaveRules[K]) => setR((x) => ({ ...x, [k]: v }));
  const errors = [
    ...(!/^[A-Z][A-Z0-9]{0,7}$/.test(code) ? [{ fieldId: 'lt-code', message: 'Use 1 to 8 capital letters or digits, starting with a letter (EL, CL, SL).' }] : []),
    ...(!name.trim() ? [{ fieldId: 'lt-name', message: 'Name the leave type.' }] : []),
    ...(kind === 'lop' && pay !== 'unpaid' ? [{ fieldId: 'lt-paid', message: 'Leave without pay is unpaid.' }] : []),
    ...(pay === 'part' && (payPct === null || payPct < 1 || payPct > 99) ? [{ fieldId: 'lt-paypct', message: 'Enter a share between 1 and 99%.' }] : []),
    ...(r.maxDaysPerMonth != null && r.maxDays != null && r.maxDays > r.maxDaysPerMonth ? [{ fieldId: 'lt-maxDays', message: `More than the monthly limit of ${num(r.maxDaysPerMonth)} days. A request that big can never be approved.` }] : []),
  ];
  const saveErrors = useSaveErrors(errors);
  const { errorOf } = saveErrors;
  // Policies that give this type today, for the description, Crediting and Year end.
  const inPolicies = row ? d.policies.flatMap((p) => { const l = versionToday(p, d.today)?.lines.find((x) => x.leaveTypeId === row.id); return l ? [{ p, l }] : []; }) : [];
  const save = () => {
    if (errors.length) {
      saveErrors.reveal();
      setSec(FIELD_SECTION[errors[0].fieldId] ?? 'basics');
      requestAnimationFrame(() => document.getElementById(errors[0].fieldId)?.focus());
      return;
    }
    void run('save', async () => {
      // Partially paid is one pay step over the whole year; plain paid drops a step set here (other steps stay).
      const paySteps = pay === 'part' ? [{ days: 366, percent: payPct! }] : pay === 'unpaid' || partPct(r) ? null : r.paySteps ?? null;
      const cashIn = r.encashable ? {} : { encashMaxDays: null, encashMinLeft: null, encashDivisor: null };
      const res = await live.onSaveType(row?.id ?? null, { code, name: name.trim(), kind: kind!, paid: pay !== 'unpaid', colour: colour ?? 'blue', active, rules: { ...(kind === 'lop' ? { ...r, negativeLimit: 0 } : r), paySteps, ...cashIn } });
      const id = (res as { id?: string } | undefined)?.id;
      if (!row && id) live.onAdded?.(id);
    });
  };
  const numField = (k: 'minDays' | 'maxDays' | 'certificateAfterDays' | 'hrApprovalAboveDays', label: string, helper: string) => (
    <FormField id={`lt-${k}`} label={label} optional helper={helper}>
      <NumberField value={r[k]} onChange={(v) => set(k, v)} decimals min={0} max={366} />
    </FormField>
  );
  // Fri to Mon over the next weekend, so the counting rule shows on real dates.
  const fri = dateOfIso(d.today);
  fri.setDate(fri.getDate() + ((5 - fri.getDay() + 7) % 7 || 7));
  const mon = new Date(fri.getFullYear(), fri.getMonth(), fri.getDate() + 3);
  const ex = countLeaveDays({ from: fri, to: mon, holidays: [], weeklyOffDays: [0, 6], sandwich: r.sandwich });
  const title = row?.name ?? 'New leave type';
  if (row && law) {
    // TIM-27 Statutory: the law sets the length and pay; only the colour (and more than the law) is the company's.
    const m = d.maternity;
    const weeks = (n: number) => `${n} weeks`;
    return (
      <>
        <PageHeader
          breadcrumbs={crumbs(title)}
          title={title}
          description={`Statutory · ${law.law}. The law sets the length and pay; you can change only the colour.`}
          status={<Badge tone={row.active ? 'success' : 'neutral'}>{row.active ? 'Active' : 'Not in use'}</Badge>}
          actions={<Button variant="primary" loading={busy === 'save'} onClick={save}>Save colour</Button>}
        />
        <div className="yx-tim-editor">
          <div className="yx-tim-form">
            {error && <InlineAlert tone="danger" title="Not saved">{error}</InlineAlert>}
            <InlineAlert tone="info" title="The law sets these values">
              {row.kind === 'maternity' && m
                ? `${weeks(m.maternityWeeks)} (at most ${m.beforeDeliveryWeeks} before delivery); ${weeks(m.maternityWeeksThirdChild)} for mothers who adopt a baby or have one through surrogacy, and from the 3rd child; ${weeks(m.miscarriageWeeks ?? 6)} after miscarriage; ${weeks(m.tubectomyWeeks ?? 2)} after tubectomy. Eligibility: ${m.eligibilityDaysWorked} days worked in the 12 months before the expected date.`
                : `Up to ${plural(law.days, 'day')}, paid in full.`}
            </InlineAlert>
            <FormSection title="Set by law">
              {/* Read-only text, not inputs: these can't be changed below the law. */}
              <DescriptionList items={[{ label: 'Name', value: row.name }, { label: 'Code', value: row.code }, { label: 'Length', value: law.days % 7 === 0 ? weeks(law.days / 7) : plural(law.days, 'day') }, { label: 'Pay', value: law.paidInFull ? 'Paid, full wages' : 'As the law says' }]} />
            </FormSection>
            <FormSection title="Set by you">
              <FormField label="Colour"><Select value={colour} onChange={setColour} options={COLOURS} /></FormField>
            </FormSection>
          </div>
          <div className="yx-tim-sticky">
            {m && row.kind === 'maternity' && (
              <Card title="Example">
                <p className="yx-tim-muted">Delivery expected {day(new Date(dateOfIso(d.today).getTime() + 70 * 86_400_000))}</p>
                <Kpis items={[{ label: 'Length', value: `${weeks(m.maternityWeeks)}, paid` }]} />
                <p className="yx-tim-note">Starts at most {m.beforeDeliveryWeeks} weeks before the expected date.</p>
              </Card>
            )}
          </div>
        </div>
      </>
    );
  }
  return (
    <>
      <PageHeader
        breadcrumbs={crumbs(title)}
        title={title}
        description={`${pay === 'paid' ? 'Paid' : pay === 'part' ? `Paid at ${payPct ?? '…'}%` : 'Unpaid'} · ${kindText(kind ?? '')}${row ? ` · used in ${plural(inPolicies.length, 'policy', 'policies')}${inPolicies.length ? ` (${inPolicies.map((x) => x.p.name).join('; ')})` : ''}` : ''}.`}
        status={row ? <Badge tone={row.active ? 'success' : 'neutral'}>{row.active ? 'Active' : 'Not in use'}</Badge> : undefined}
        actions={<Button variant="primary" loading={busy === 'save'} onClick={save}>{row ? 'Save' : 'Add leave type'}</Button>}
      />
      <div className="yx-tim-editor">
        <div className="yx-tim-form">
          <ErrorSummary errors={saveErrors.shownErrors} />
          {error && <InlineAlert tone="danger" title="Not saved">{error}</InlineAlert>}
          <Tabs value={sec} onValueChange={setSec}>
            {narrow ? (
              <FormField label="Section">
                <Select value={sec} onChange={(v) => v && setSec(v)} options={Object.entries(LIVE_SECTIONS).map(([value, label]) => ({ value, label }))} />
              </FormField>
            ) : (
              <TabsList aria-label="Sections">
                {Object.entries(LIVE_SECTIONS).map(([s, label]) => <TabsTrigger key={s} value={s}>{label}</TabsTrigger>)}
              </TabsList>
            )}
            <TabsContent value="basics">
              <FormSection title="Basics">
                <FieldRow>
                  <FormField id="lt-name" label="Name" required error={errorOf('lt-name')}><TextField value={name} onChange={setName} maxLength={60} /></FormField>
                  <FormField id="lt-code" label="Code" required helper={row ? 'A code never changes.' : undefined} error={errorOf('lt-code')}>
                    <TextField value={code} onChange={(v) => setCode(v.toUpperCase())} disabled={Boolean(row)} maxLength={8} />
                  </FormField>
                </FieldRow>
                {/* Question: not in the design; the law's minimums apply by kind, so it stays. */}
                <FormField id="lt-kind" label="Kind" required helper={row ? 'A kind never changes.' : 'The law’s minimums apply by kind.'}>
                  <Select value={kind} onChange={setKind} options={KINDS} disabled={Boolean(row)} />
                </FormField>
                <FormField id="lt-paid" label="Pay" error={errorOf('lt-paid')}>
                  <RadioGroup aria-label="Pay" value={pay} onChange={setPay} orientation="horizontal" options={[{ value: 'paid', label: 'Paid' }, { value: 'unpaid', label: 'Unpaid (shows days taken, no balance)' }, { value: 'part', label: 'Partially paid' }]} />
                </FormField>
                {pay === 'part' && (
                  <FormField id="lt-paypct" label="Paid at (% of daily wage)" required error={errorOf('lt-paypct')}>
                    <NumberField value={payPct} min={1} max={99} onChange={setPayPct} />
                  </FormField>
                )}
                <FormField label="Colour"><Select value={colour} onChange={setColour} options={COLOURS} /></FormField>
                {row && <Switch label="In use" description="A type not in use cannot be applied for; its history stays." checked={active} onChange={setActive} />}
              </FormSection>
            </TabsContent>
            <TabsContent value="crediting">
              <FormSection title="Crediting">
                <p className="yx-tim-muted">Each policy credits it its own way. The yearly days are set in the policy.</p>
                {inPolicies.length ? (
                  <ul className="yx-tim-list">{inPolicies.map(({ p, l }) => <li key={p.id}><span className="yx-tim-list__main"><strong>{p.name}</strong><span className="yx-tim-muted">{lineText(l)}</span></span></li>)}</ul>
                ) : (
                  <p className="yx-tim-muted">{row ? 'Not in any policy yet.' : 'Save the type first.'} Add it to a policy in Leave policies.</p>
                )}
              </FormSection>
            </TabsContent>
            <TabsContent value="counting">
              <FormSection title="Counting">
                <FormField label="Weekly offs and holidays inside the leave" helper="For example, a Saturday and Sunday between Friday and Monday leave">
                  <RadioGroup aria-label="Weekly offs and holidays inside the leave" value={r.sandwich} onChange={(v) => set('sandwich', v as LeaveRules['sandwich'])} options={[{ value: 'none', label: 'Never count them' }, { value: 'sandwich', label: 'Count them when they fall between leave days' }, { value: 'always', label: 'Always count them' }]} />
                </FormField>
                <FormField label="Applies to" disabled={r.sandwich === 'none'} helper={r.sandwich === 'none' ? 'Not used when weekly offs and holidays are never counted' : undefined}>
                  <Select value={r.sandwichOn} disabled={r.sandwich === 'none'} onChange={(v) => v && set('sandwichOn', v as LeaveRules['sandwichOn'])} options={[{ value: 'both', label: 'Weekly offs and holidays' }, { value: 'weekly_offs', label: 'Weekly offs only' }, { value: 'holidays', label: 'Holidays only' }]} />
                </FormField>
                <Switch label="Half days (first or second half)" checked={r.halfDays} onChange={(v) => set('halfDays', v)} />
                {r.sandwich === 'sandwich' && <Checkbox label="A half day next to a weekend still counts the weekend" checked={r.sandwichHalfDays} onChange={(v) => set('sandwichHalfDays', v)} />}
              </FormSection>
            </TabsContent>
            <TabsContent value="rules">
              <FormSection title="Rules">
                <FieldRow>
                  <FormField id="lt-notice" label="Apply at least (days ahead)" helper={r.noticeDays !== null ? 'Leave blank to use the company default.' : kind === 'sick' ? 'Blank: no notice (sick leave).' : `Blank: the company default, ${plural(d.noticeDefault ?? 0, 'day')}.`}><NumberField value={r.noticeDays} onChange={(v) => set('noticeDays', v)} min={0} max={90} /></FormField>
                  {(r.noticeDays ?? (kind === 'sick' ? 0 : (d.noticeDefault ?? 0))) > 0 && <FormField label="Shorter notice"><Segment label="Shorter notice" value={r.noticeMode ?? 'block'} onChange={(v) => set('noticeMode', v)} options={[{ value: 'block' as const, label: 'Refuse it' }, { value: 'warn' as const, label: 'Allow and flag to the approver' }]} /></FormField>}
                  {numField('minDays', 'Least days in one request', 'Leave empty for no minimum.')}
                  <FormField id="lt-maxDays" label="Most days in one request" optional helper="Leave empty for no maximum." error={errorOf('lt-maxDays')}>
                    <NumberField value={r.maxDays} onChange={(v) => set('maxDays', v)} decimals min={0} max={366} />
                  </FormField>
                  <FormField id="lt-maxMonth" label="Most days in a month" optional helper="Asked and approved together, half days count as half. Leave empty for no limit.">
                    <NumberField value={r.maxDaysPerMonth ?? null} onChange={(v) => set('maxDaysPerMonth', v)} decimals min={0.5} max={31} />
                  </FormField>
                </FieldRow>
                <FieldRow>
                  {numField('certificateAfterDays', 'Ask for a document when leave is longer than (days)', 'Leave blank to never ask')}
                  <FormField id="lt-negative" label="Balance may go below zero by (days)" helper="0 for never. Future credits repay it first.">
                    <NumberField value={r.negativeLimit} onChange={(v) => set('negativeLimit', v ?? 0)} decimals min={0} max={30} />
                  </FormField>
                </FieldRow>
                {numField('hrApprovalAboveDays', 'HR approves after the manager above (days)', '0: always. Empty: never.')}
                <Checkbox label="Medical: the reason and certificate are private to HR" description="Managers and approvers see only the dates and the certificate’s status." checked={r.medical} onChange={(v) => set('medical', v)} />
              </FormSection>
            </TabsContent>
            <TabsContent value="yearend">
              <FormSection title="Year end">
                {inPolicies.length > 0 && <ul className="yx-tim-list">{inPolicies.map(({ p, l }) => <li key={p.id}><span className="yx-tim-list__main"><strong>{p.name}</strong><span className="yx-tim-muted">{carryText(l)}</span></span></li>)}</ul>}
                <p className="yx-tim-muted">The carry-forward limit is set in each policy.</p>
                <Switch label="Can be cashed in (payroll pays it later)" checked={r.encashable} onChange={(v) => set('encashable', v)} />
                {r.encashable && (
                  <>
                    <FieldRow>
                      <FormField id="lt-encashMax" label="Encash per year in total, up to (days)" optional helper={`Blank: the company limit, ${plural(Number(defaults['leave.encashment.max_days'] ?? 7), 'day')}. Over the carry-forward limit at year end, this much is paid out; the rest lapses.`}>
                        <NumberField value={r.encashMaxDays ?? null} onChange={(v) => set('encashMaxDays', v)} decimals min={0} max={366} />
                      </FormField>
                      <FormField id="lt-encashMin" label="Keep at least (days) after encashing" optional helper={`Blank: the company value, ${plural(Number(defaults['leave.encashment.min_left'] ?? 7), 'day')}.`}>
                        <NumberField value={r.encashMinLeft ?? null} onChange={(v) => set('encashMinLeft', v)} decimals min={0} max={366} />
                      </FormField>
                    </FieldRow>
                    <FormField label="Pay for each day paid out" helper="Monthly pay as payroll pays leave encashment (basic and DA, or gross).">
                      <Select value={r.encashDivisor ? String(r.encashDivisor) : 'company'} onChange={(v) => set('encashDivisor', v === '26' ? 26 : v === '30' ? 30 : null)} options={[{ value: 'company', label: `Company default (monthly pay ÷ ${defaults['leave.encashment.divisor'] ?? '26'})` }, { value: '26', label: 'Monthly pay ÷ 26' }, { value: '30', label: 'Monthly pay ÷ 30' }]} />
                    </FormField>
                    <Switch label="Pay out the balance when someone leaves (in the final settlement)" checked={r.encashAtExit !== false} onChange={(v) => set('encashAtExit', v)} />
                  </>
                )}
              </FormSection>
            </TabsContent>
            <TabsContent value="absence">
              <FormSection title="During long absence">
                <RadioGroup
                  aria-label="Crediting during long absence"
                  value={r.longAbsence ?? 'company'}
                  onChange={(v) => set('longAbsence', v === 'company' ? null : (v as 'pause' | 'continue'))}
                  options={[
                    { value: 'company', label: `Company default (${defaults['leave.long_absence.accrues'] === 'yes' ? 'keep crediting' : 'stop crediting'})` },
                    { value: 'pause', label: 'Stop crediting during a sabbatical or long unpaid leave' },
                    { value: 'continue', label: 'Keep crediting' },
                  ]}
                />
                <p className="yx-tim-note">Maternity leave always counts as service, so crediting continues by law.</p>
              </FormSection>
              <FormSection title="During the notice period">
                <RadioGroup
                  aria-label="During notice"
                  value={r.noticePeriod ?? 'company'}
                  onChange={(v) => set('noticePeriod', v === 'company' ? null : (v as 'allowed' | 'extends' | 'blocked'))}
                  options={[
                    { value: 'company', label: `Company default (${NOTICE_PERIOD_TEXT[defaults['leave.notice_period.leave'] ?? 'no_change'] ?? 'allowed'})` },
                    { value: 'allowed', label: 'Allowed' },
                    { value: 'extends', label: 'Moves the last working day later' },
                    { value: 'blocked', label: 'Not allowed' },
                  ]}
                />
              </FormSection>
            </TabsContent>
          </Tabs>
        </div>
        <div className="yx-tim-sticky">
          <Card title="Live example">
            <div className="yx-tim-stack">
              <p className="yx-tim-muted">Someone applies {day(fri)} – {day(mon)}, Friday to Monday, with Saturday and Sunday off</p>
              <ul className="yx-tim-days">{ex.days.map((x) => <li key={x.date.getTime()}><DayDate date={x.date} /><strong>{x.kind === 'counted' ? '1' : x.kind === 'sandwich' ? '1 (between leave days)' : '0 (off)'}</strong></li>)}</ul>
              <Kpis items={[{ label: 'Days counted', value: ex.total }]} />
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}

/* ---------------- TIM-26 live ---------------- */

const CALENDARS_TEXT = 'People get the holidays of the office they work at, including people sent to another office for a while.';

function LiveHolidays({ live }: { live: LiveHolidayCalendars }) {
  return (
    <SetupGate live={live} active="Holiday calendars" header={<PageHeader title="Holiday calendars" description={CALENDARS_TEXT} />}>
      {(d) => <LiveHolidayTabs d={d} live={live} />}
    </SetupGate>
  );
}

type CalTab = { key: string; name: string; loc?: SetupLocation; cal?: SetupCalendar };
/** A row of the calendar table: a holiday in force, or one waiting in a draft (template or clone). */
type CalRow = HolidayRow & { draft?: boolean; confirm?: boolean };
const inYear = <T extends { on: string }>(rows: T[] | undefined, year: string) => (rows ?? []).filter((h) => h.on.startsWith(`${year}-`));
const WEEKLY_OFF_RULES = [
  { value: 'none', label: 'No extra day off (default)' },
  { value: 'substitute', label: 'Substitute day off' },
  { value: 'comp_off', label: 'Comp-off credit' },
];
const kindLabel = (h: CalRow) => (choosable(h.kind) ? 'Optional' : HOLIDAY_KINDS.find((k) => k.value === h.kind)?.label ?? 'Holiday');

function LiveHolidayTabs({ d, live }: { d: TimeSetup; live: LiveHolidayCalendars }) {
  const year = d.today.slice(0, 4);
  const next = String(Number(year) + 1);
  // One tab per location, then any calendar not tied to one (the company calendar for locations without their own).
  const tabs: CalTab[] = [
    ...d.locations.map((l) => ({ key: l.id, name: l.name, loc: l, cal: d.calendars.find((c) => c.locationId === l.id) })),
    ...d.calendars.filter((c) => !c.locationId || !d.locations.some((l) => l.id === c.locationId)).map((c) => ({ key: c.id, name: c.name, cal: c })),
  ];
  const [tab, setTab] = useState(tabs[0]?.key ?? '');
  const [nextView, setNextView] = useState(false);
  const [cloning, setCloning] = useState(false);
  const cur = tabs.find((t) => t.key === tab);
  const cal = cur?.cal;
  const thisYear = inYear(cal?.holidays, year);
  const nextDrafts = inYear(cal?.drafts, next);
  const nextRows = inYear(cal?.holidays, next);
  const hasNext = nextDrafts.length > 0 || nextRows.length > 0;
  const waiting = cal?.waitingFeedChanges ?? 0;
  const movers = thisYear.filter((h) => ['festival', 'optional', 'restricted'].includes(h.kind)).length;
  const showNext = nextView && !!cal && hasNext;
  return (
    <>
      <PageHeader
        title={showNext ? `${cur!.name} · ${next}` : `Holiday calendars · ${year}`}
        description={CALENDARS_TEXT}
        actions={
          showNext ? (
            <Button onClick={() => setNextView(false)}>Back to {year}</Button>
          ) : cal && thisYear.length > 0 && !hasNext ? (
            <div className="yx-tim-row">
              {waiting > 0 && <span className="yx-tim-muted">Review the feed changes first</span>}
              {/* Never greyed out: with feed changes waiting it does nothing, and the note beside it says why. */}
              <Button variant="primary" icon={Copy} onClick={() => waiting === 0 && setCloning(true)}>Clone {cur!.name} to {next}</Button>
            </div>
          ) : undefined
        }
      />
      {showNext ? (
        <NextYearPanel key={`${cal!.id}-${next}`} d={d} name={cur!.name} cal={cal!} year={next} live={live} />
      ) : tabs.length === 0 ? (
        <EmptyState title="No locations yet" description="Each location gets its own holiday calendar. Add your offices in Settings › Locations first." />
      ) : (
        <>
          {cal && hasNext && (
            <InlineAlert tone="info" title={nextDrafts.length ? `${next} draft created for ${cur!.name}` : `${cur!.name} ${next} calendar published`} actions={<Button size="sm" onClick={() => setNextView(true)}>{nextDrafts.length ? `Open ${next} draft` : `Open ${next} calendar`}</Button>}>
              {nextDrafts.length ? `${plural(nextDrafts.filter((h) => h.confirm).length, 'festival date')} to confirm. Employees see nothing until you publish the ${next} calendar.` : `Employees at ${cur!.name} see the ${next} holidays.`}
            </InlineAlert>
          )}
          <Tabs value={tab} onValueChange={(v) => (setTab(v), setNextView(false))}>
            <TabsList aria-label="Locations">
              {tabs.map((t) => <TabsTrigger key={t.key} value={t.key} count={inYear(t.cal?.holidays, year).length + inYear(t.cal?.drafts, year).length}>{t.name}</TabsTrigger>)}
            </TabsList>
            {tabs.map((t) => (
              <TabsContent key={t.key} value={t.key}>
                <CalendarPanel key={t.cal?.id ?? t.key} live={{ d, t, rows: [...inYear(t.cal?.holidays, year), ...inYear(t.cal?.drafts, year).map((h) => ({ ...h, draft: true }))], live }} />
              </TabsContent>
            ))}
          </Tabs>
        </>
      )}
      <ConfirmDialog
        open={cloning && !!cal}
        onOpenChange={setCloning}
        title={`Clone ${cur?.name ?? ''} calendar to ${next}?`}
        consequence={`Fixed-date holidays move to their ${next} dates. ${plural(movers, 'festival')} with changing dates ${movers === 1 ? 'is' : 'are'} added as drafts for you to confirm. Nothing is visible to employees until you publish.`}
        confirmLabel={`Clone to ${next}`}
        onConfirm={async () => {
          await live.onClone(cal!.id, cur!.name, Number(next));
          setNextView(true);
        }}
      />
    </>
  );
}

/** Next year's calendar: the clone's draft (festival dates to confirm, then publish), or the published days. */
function NextYearPanel({ d, name, cal, year, live }: { d: TimeSetup; name: string; cal: SetupCalendar; year: string; live: LiveHolidayCalendars }) {
  const drafts = inYear(cal.drafts, year);
  const rows: CalRow[] = [...inYear(cal.holidays, year), ...drafts.map((h) => ({ ...h, draft: true }))];
  const toConfirm = drafts.filter((h) => h.confirm).length;
  const [confirming, setConfirming] = useState<{ row: CalRow; date: Date | null } | null>(null);
  const [triedDate, setTriedDate] = useState(false);
  const { busy, error, run } = useRun();
  return (
    <div className="yx-tim-stack">
      {error && <InlineAlert tone="danger" title="That did not work">{error}</InlineAlert>}
      {drafts.length ? (
        <div className="yx-tim-row">
          <Badge tone="neutral">Draft · not published</Badge>
          {toConfirm > 0 && <span className="yx-tim-muted">{plural(toConfirm, 'festival date')} to confirm before you publish</span>}
        </div>
      ) : (
        <div className="yx-tim-row"><Badge tone="success">Published</Badge><span className="yx-tim-muted">Employees at {name} now see the {year} holidays.</span></div>
      )}
      <DataTable
        label={`${name} ${year} holidays`}
        columns={[
          { key: 'name', header: 'Holiday', value: (r: CalRow) => r.name },
          { key: 'date', header: 'Date', type: 'date', value: (r: CalRow) => dateOfIso(r.on), render: (r: CalRow) => <DayDate date={dateOfIso(r.on)} /> },
          { key: 'kind', header: 'Type', type: 'status', value: (r: CalRow) => (r.confirm ? 'Confirm date' : kindLabel(r)), statusTone: (v) => (v === 'Confirm date' ? 'warning' : v === 'Optional' ? 'info' : 'neutral') },
        ]}
        rows={rows}
        getRowId={(r) => r.id}
        defaultSort={{ key: 'date', dir: 'asc' }}
        rowButtons={(r) => (r.confirm ? <Button size="sm" onClick={() => (setTriedDate(false), setConfirming({ row: r, date: dateOfIso(r.on) }))}>Confirm date</Button> : null)}
      />
      {drafts.length > 0 && (
        <div className="yx-tim-row">
          <Button variant="primary" loading={busy === 'publish'} onClick={() => toConfirm === 0 && void run('publish', () => live.onPublish(cal.id, name, Number(year)))}>Publish {name} {year} calendar</Button>
          <span className="yx-tim-muted">{toConfirm > 0 ? `Confirm the ${plural(toConfirm, 'festival date')} first` : 'Employees see these holidays only after you publish'}</span>
        </div>
      )}
      <ConfirmDialog
        open={!!confirming}
        onOpenChange={(o) => !o && setConfirming(null)}
        title={`Confirm the ${year} date of ${confirming?.row.name ?? ''}`}
        consequence={`Check the date in the state's ${year} holiday notification. The draft copied last year's day and month.`}
        confirmLabel="Confirm date"
        onConfirm={async () => {
          setTriedDate(true);
          if (!confirming?.date) return false;
          await live.onConfirmDraft(confirming.row.id, isoOf(confirming.date));
        }}
      >
        {confirming && (
          <FormField label="Date" required error={triedDate && !confirming.date ? `Choose the ${year} date.` : null}>
            <DatePicker value={confirming.date} onChange={(v) => setConfirming({ ...confirming, date: v })} min={dateOfIso(`${year}-01-01` < d.today ? d.today : `${year}-01-01`)} max={dateOfIso(`${year}-12-31`)} />
          </FormField>
        )}
      </ConfirmDialog>
    </div>
  );
}

type LiveCalendarPanelProps = { d: TimeSetup; t: CalTab; rows: CalRow[]; live: LiveHolidayCalendars };

function LiveCalendarPanel({ d, t, rows, live }: LiveCalendarPanelProps) {
  const cal = t.cal;
  const year = d.today.slice(0, 4);
  const state = t.loc ? d.templates?.[t.loc.id] : undefined;
  const [choose, setChoose] = useState<number | null>(cal?.optionalLimit ?? 2);
  const [half, setHalf] = useState<string | null>(cal?.halfDayOpenHalf ?? 'first');
  const [onOff, setOnOff] = useState<string>(cal?.onWeeklyOff ?? 'none');
  const [onMove, setOnMove] = useState<string | null>(cal?.onMove ?? 'share');
  const [hol, setHol] = useState<{ name: string; date: Date | null; kind: string | null; halfDay: boolean } | null>(null);
  const [triedHol, setTriedHol] = useState(false);
  const [moving, setMoving] = useState<{ row: CalRow; date: Date | null } | null>(null);
  const [triedMove, setTriedMove] = useState(false);
  const [removing, setRemoving] = useState<CalRow | null>(null);
  const [templating, setTemplating] = useState(false);
  const { busy, error, run } = useRun();
  const offs = t.loc?.rule.weeklyOffs ?? [];
  const isOff = (iso: string) => offUnder(iso, offs);
  const templateDialog = state && t.loc && (
    <ConfirmDialog
      open={templating}
      onOpenChange={setTemplating}
      title={`Start ${t.name} from the ${state} template?`}
      consequence={`Adds the ${state} public holidays from ${isoDay(d.today)} to 31 Dec ${year}, using the holiday feed's latest dates. Holidays before today are left out, so past attendance does not change. You can edit them before publishing.`}
      confirmLabel="Use template"
      onConfirm={async () => { await live.onTemplate(t.loc!.id, t.name); }}
    />
  );
  const templateButton = state && <Button variant="primary" onClick={() => setTemplating(true)}>Start from the {state} template</Button>;
  if (!cal) {
    return (
      <div className="yx-tim-stack">
        {error && <InlineAlert tone="danger" title="That did not work">{error}</InlineAlert>}
        <EmptyState
          title={`${t.name} has no ${year} calendar`}
          description={state ? `People there see no holidays until you add and publish a calendar. Start from the ${state} template, then edit it before publishing.` : 'People there see no holidays until you add a calendar and its holidays.'}
          action={
            <div className="yx-tim-row">
              {templateButton}
              <Button variant={state ? 'secondary' : 'primary'} loading={busy === 'cal'} onClick={() => void run('cal', () => live.onCreateCalendar({ name: `${t.name} holidays`, locationId: t.loc?.id, optionalLimit: 2 }))}>{state ? 'Add holidays one by one' : `Add a calendar for ${t.name}`}</Button>
            </div>
          }
        />
        {templateDialog}
      </div>
    );
  }
  const drafts = rows.filter((h) => h.draft);
  const optionalCount = rows.filter((h) => choosable(h.kind)).length;
  const optionalOff = rows.filter((h) => choosable(h.kind) && h.on >= d.today && isOff(h.on));
  const dirty = choose !== cal.optionalLimit || half !== cal.halfDayOpenHalf || onOff !== (cal.onWeeklyOff ?? 'none') || (!!cal.locationId && onMove !== (cal.onMove ?? 'share'));
  const onWeeklyOff = rows.filter((h) => isOff(h.on));
  const waiting = cal.waitingFeedChanges ?? 0;
  const cols: TableColumn<CalRow>[] = [
    { key: 'name', header: 'Holiday', value: (h) => `${h.name}${h.halfDay ? ' (half day)' : ''}` },
    {
      key: 'date', header: 'Date', type: 'date', value: (h) => dateOfIso(h.on),
      render: (h) => (
        <span className="yx-tim-row">
          <DayDate date={dateOfIso(h.on)} />
          {h.on >= d.today && daysBetween(d.today, h.on) <= 30 && <DueBadge date={dateOfIso(h.on)} today={dateOfIso(d.today)} />}
        </span>
      ),
    },
    {
      key: 'kind', header: 'Type', type: 'status',
      value: (h) => `${kindLabel(h)}${isOff(h.on) ? ' · on a weekly off' : ''}`,
      statusTone: (v) => (String(v).startsWith('Optional') ? 'info' : 'neutral'),
    },
  ];
  return (
    <div className="yx-tim-stack">
      {error && <InlineAlert tone="danger" title="That did not work">{error}</InlineAlert>}
      {waiting > 0 && (
        <InlineAlert tone="warning" title={`${plural(waiting, 'change')} from the holiday feed ${waiting === 1 ? 'is' : 'are'} waiting`} actions={live.onReviewFeed && <Button size="sm" onClick={live.onReviewFeed}>Review changes</Button>}>
          This calendar keeps the old dates until you accept the changes in Review changes.
        </InlineAlert>
      )}
      <div className="yx-tim-row">
        {drafts.length > 0 ? <Badge tone="neutral">Draft · not published</Badge> : cal.publishedAt ? <Badge tone="success">Published {isoDay(cal.publishedAt.slice(0, 10))}</Badge> : null}
        <Button icon={Plus} onClick={() => (setTriedHol(false), setHol({ name: '', date: null, kind: 'festival', halfDay: false }))}>Add holiday</Button>
      </div>
      {rows.some((h) => h.on < d.today) && <p className="yx-tim-muted">Holidays before today are locked: they are already in attendance records.</p>}
      <div className="yx-tim-editor">
        <DataTable
          cardSummary
          label={`${t.name} holidays`}
          columns={cols}
          rows={rows}
          getRowId={(h) => h.id}
          defaultSort={{ key: 'date', dir: 'asc' }}
          rowActions={(h) =>
            h.on < d.today ? null : (
              <>
                <MenuItem onSelect={() => (setTriedMove(false), setMoving({ row: h, date: dateOfIso(h.on) }))}>Change date</MenuItem>
                <MenuItem destructive onSelect={() => setRemoving(h)}>Remove holiday</MenuItem>
              </>
            )
          }
          empty={<EmptyState compact title="No holidays yet" description={state ? `Add each holiday with Add holiday, or start from the ${state} template.` : 'Add each holiday of the year with Add holiday.'} action={templateButton || undefined} />}
        />
        <div className="yx-tim-stack">
          <Card title="Rules for this calendar">
            <div className="yx-tim-form">
              <FormField label="Holiday on a weekly off" helper={onOff === 'substitute' ? 'People get the next working day off.' : onOff === 'comp_off' ? 'People at this location get a comp-off day to use later.' : undefined}>
                <RadioGroup aria-label="Holiday on a weekly off" value={onOff} onChange={setOnOff} options={WEEKLY_OFF_RULES} />
              </FormField>
              <FormField label="Optional holidays each person chooses" helper={`People choose ${choose ?? 0} of the ${plural(optionalCount, 'optional holiday')} this year.${optionalOff.map((h) => ` ${h.name} falls on a weekly off, so people can't pick it in My leave.`).join('')}`}>
                <NumberField value={choose} onChange={setChoose} min={0} max={20} />
              </FormField>
              {cal.locationId && (
                <FormField label="When someone moves to another office">
                  <Select value={onMove} onChange={setOnMove} options={[{ value: 'share', label: 'Split by months at each office' }, { value: 'reset', label: 'New office calendar from the move' }]} />
                </FormField>
              )}
              {/* Question: not in the design; the calendar's half-day rule is kept from the set-up page. */}
              <FormField label="On a half-day holiday">
                <Select value={half} onChange={setHalf} options={[{ value: 'first', label: 'The morning is worked' }, { value: 'second', label: 'The afternoon is worked' }]} />
              </FormField>
              <div className="yx-tim-row">
                {/* Never greyed out: with nothing changed it does nothing, and the note beside it says so. */}
                <Button variant="primary" loading={busy === 'rules'} onClick={() => dirty && void run('rules', () => live.onUpdateCalendar(cal.id, { name: cal.name, optionalLimit: choose ?? 0, halfDayOpenHalf: half === 'second' ? 'second' : 'first', onWeeklyOff: onOff as 'none' | 'substitute' | 'comp_off', ...(cal.locationId ? { onMove: onMove === 'reset' ? 'reset' : 'share' } : {}) }))}>Save rules</Button>
                {!dirty && <span className="yx-tim-muted">No changes to save</span>}
              </div>
            </div>
          </Card>
          <p className="yx-tim-note">
            {onWeeklyOff.length === 0 ? 'No holiday falls on a weekly off this year.' : `${plural(onWeeklyOff.length, 'holiday')} ${onWeeklyOff.length === 1 ? 'falls' : 'fall'} on a weekly off this year (${onWeeklyOff.map((h) => h.name).join(', ')}).`}
          </p>
        </div>
      </div>
      {drafts.length > 0 && (
        <div className="yx-tim-row">
          <Button variant="primary" loading={busy === 'publish'} onClick={() => void run('publish', () => live.onPublish(cal.id, t.name, Number(year)))}>Publish {t.name} calendar</Button>
          <span className="yx-tim-muted">Employees see these holidays only after you publish</span>
        </div>
      )}
      {templateDialog}
      <ConfirmDialog
        open={!!hol}
        onOpenChange={(o) => !o && setHol(null)}
        title={`Add a holiday to ${t.name}`}
        consequence={`People with leave on ${hol?.date ? day(hol.date) : 'the new date'} get that day back.`}
        confirmLabel="Add holiday"
        onConfirm={async () => {
          setTriedHol(true);
          if (!hol?.name.trim() || !hol.date) return false;
          await live.onAddHoliday(cal.id, { on: isoOf(hol.date), name: hol.name.trim(), kind: hol.kind ?? 'festival', halfDay: choosable(hol.kind) ? false : hol.halfDay });
        }}
      >
        {hol && (
          <div className="yx-tim-form">
            <FormField label="Name" required error={triedHol && !hol.name.trim() ? 'Enter the holiday name.' : null}><TextField value={hol.name} onChange={(v) => setHol({ ...hol, name: v })} maxLength={100} /></FormField>
            <FormField label="Date" required helper="Only today or later: earlier days are already in attendance records." error={triedHol && !hol.date ? 'Choose the date.' : null}>
              <DatePicker value={hol.date} onChange={(v) => setHol({ ...hol, date: v })} min={dateOfIso(d.today)} />
            </FormField>
            {/* Question: the design has an "Optional holiday" tick; the API also knows national, state, festival and restricted. */}
            <FormField label="Type"><Select value={hol.kind} onChange={(v) => setHol({ ...hol, kind: v })} options={HOLIDAY_KINDS} /></FormField>
            {!choosable(hol.kind) && <Checkbox label="Half day" checked={hol.halfDay} onChange={(v) => setHol({ ...hol, halfDay: v })} />}
          </div>
        )}
      </ConfirmDialog>
      <ConfirmDialog
        open={!!moving}
        onOpenChange={(o) => !o && setMoving(null)}
        title={`Change the date of ${moving?.row.name ?? ''}?`}
        consequence={moving ? `${isoDay(moving.row.on)} becomes a working day. People with leave on ${moving.date ? day(moving.date) : 'the new date'} get that day back${moving.row.draft ? ' when you publish' : ''}.` : undefined}
        confirmLabel="Change date"
        onConfirm={async () => {
          setTriedMove(true);
          if (!moving?.date) return false;
          await (moving.row.draft ? live.onConfirmDraft(moving.row.id, isoOf(moving.date)) : live.onChangeHoliday(moving.row.id, isoOf(moving.date)));
        }}
      >
        {moving && (
          <FormField label="Date" required helper="Only today or later, in the same year." error={triedMove && !moving.date ? 'Choose the date.' : null}>
            <DatePicker value={moving.date} onChange={(v) => setMoving({ ...moving, date: v })} min={dateOfIso(d.today)} max={dateOfIso(`${moving.row.on.slice(0, 4)}-12-31`)} />
          </FormField>
        )}
      </ConfirmDialog>
      <ConfirmDialog
        open={!!removing}
        onOpenChange={(o) => !o && setRemoving(null)}
        title={`Remove ${removing?.name ?? ''} from the ${t.name} calendar?`}
        consequence={removing ? (removing.draft ? `${isoDay(removing.on)} leaves the draft. Nothing changes for employees.` : `${isoDay(removing.on)} becomes a working day. Leave already applied for that day is counted again.`) : undefined}
        confirmLabel="Remove holiday"
        destructive
        onConfirm={async () => {
          if (removing) await (removing.draft ? live.onRemoveDraft(removing.id) : live.onRemoveHoliday(removing.id));
        }}
      />
    </div>
  );
}

const daysBetween = (a: string, b: string) => Math.round((dateOfIso(b).getTime() - dateOfIso(a).getTime()) / 86_400_000);

/* ---------------- TIM-29 live ---------------- */

function LiveYearEndWizard({ live }: { live: LiveYearEnd }) {
  const transition = live.mode === 'transition' && live.onYearChangePreview && live.onYearChangeSchedule;
  return (
    <SetupGate live={live} active="Year-end" header={<PageHeader title={transition ? 'Change leave year' : 'Leave year-end'} />}>
      {(d) => (transition ? <LiveTransitionBody d={d} live={live} /> : <LiveYearEndBody d={d} live={live} />)}
    </SetupGate>
  );
}

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const yearKind = (m: number) => (m === 1 ? 'calendar year (Jan–Dec)' : m === 4 ? 'financial year (Apr–Mar)' : `year from ${MONTH_NAMES[m - 1]}`);
const monthShort = (m: number) => MONTH_NAMES[m - 1].slice(0, 3);

/** TIM-29 Transition, live: one legal entity moves to a new leave year with a short year in between (scheduled, audited). */
function LiveTransitionBody({ d, live }: { d: TimeSetup; live: LiveYearEnd }) {
  const [entity, setEntity] = useState<string | null>(d.entities[0]?.id ?? null);
  const [month, setMonth] = useState<string | null>('4');
  const [preview, setPreview] = useState<YearChangePreview | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [q, setQ] = useState('');
  const [c, setC] = useState(false);
  const [posted, setPosted] = useState<{ on: string } | null>(null);
  const narrow = useNarrow(1365);
  const { toast } = useToast();
  useEffect(() => {
    if (!entity || !month) return;
    let stale = false;
    setPreview(null);
    setLoadError(null);
    live.onYearChangePreview!(entity, Number(month)).then(
      (p) => !stale && setPreview(p),
      (e) => !stale && setLoadError(errorText(e)),
    );
    return () => {
      stale = true;
    };
    // Reload on a new entity, month or Try again; the handler changes identity on every render of the page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entity, month, attempt]);
  const entName = d.entities.find((e) => e.id === entity)?.name ?? '';
  const title = entName ? `Change leave year · ${entName}` : 'Change leave year';
  const rows = preview?.rows ?? [];
  const people = new Set(rows.map((r) => r.employeeId)).size;
  const shownRows = rows.filter((r) => r.name.toLowerCase().includes(q.trim().toLowerCase()));
  const nextStart = preview ? dateOfIso(preview.shortEnd) : null;
  if (nextStart) nextStart.setDate(nextStart.getDate() + 1);
  const shortText = preview ? `${isoDay(preview.fromOn)} – ${isoDay(preview.shortEnd)} (${plural(preview.months, 'month')})` : '';
  const scheduled = preview?.scheduled ?? null;
  if (posted || scheduled) {
    const s = scheduled ?? (preview ? { fromOn: preview.fromOn, shortEnd: preview.shortEnd } : null);
    return (
      <>
        <PageHeader title={title} />
        <InlineAlert tone="info" title={posted ? `Leave-year change scheduled on ${isoDay(posted.on)}` : `Leave-year change scheduled for ${entName}`} actions={live.policiesHref && live.onNavigate ? <Button size="sm" onClick={() => live.onNavigate!(live.policiesHref!)}>View leave policies</Button> : undefined}>
          {s ? `${posted ? `${plural(people, 'person', 'people')} at ${entName}` : entName} move${posted && people === 1 ? 's' : ''} to a short year from ${isoDay(s.fromOn)} to ${isoDay(s.shortEnd)}. Leave entries are posted from ${isoDay(s.fromOn)}.` : ''}
        </InlineAlert>
      </>
    );
  }
  type Row = YearChangePreview['rows'][number];
  const outcome = (r: Row) => (
    <span className="yx-tim-row" style={{ flexWrap: 'nowrap' }}>
      <span style={{ whiteSpace: 'nowrap' }}>{num(r.carry)} carried{r.encash > 0 ? ` · ${num(r.encash)} to pay out` : ''}</span>
      {r.lapse > 0 && <Badge tone="warning">{num(r.lapse)} lapse</Badge>}
    </span>
  );
  const name = (r: Row) => <span className="yx-tim-list__main"><strong>{r.name}</strong><span className="yx-tim-muted">{r.type}</span></span>;
  const cols: TableColumn<Row>[] = narrow
    ? [
        { key: 'name', header: 'Employee', value: (r) => r.name, render: name },
        { key: 'sum', header: `Opening + credit = end of short year → ${nextStart ? dayShort(nextStart) : ''}`, value: (r) => r.carry, render: (r) => <span className="yx-tim-row"><span>{num(r.opening)} + {num(r.credit)} = {num(r.atEnd)} →</span>{outcome(r)}</span> },
      ]
    : [
        { key: 'name', header: 'Employee', value: (r) => r.name, render: name },
        { key: 'open', header: `Opening ${preview ? isoDay(preview.fromOn) : ''}`, type: 'number', value: (r) => r.opening, render: (r) => num(r.opening) },
        { key: 'credit', header: 'Short-year credit', type: 'number', optional: true, value: (r) => r.credit, render: (r) => num(r.credit) },
        { key: 'end', header: `Balance ${preview ? isoDay(preview.shortEnd) : ''}`, type: 'number', value: (r) => r.atEnd, render: (r) => num(r.atEnd) },
        { key: 'next', header: `Opening ${nextStart ? day(nextStart) : ''}`, hideable: false, value: (r) => r.carry, render: outcome },
      ];
  const blocked = !entity ? 'Choose the entity in Scope' : loadError ? 'The preview did not load. Open Preview and try again' : !preview ? 'The preview is still loading' : preview.problem ?? undefined;
  const yr = preview ? preview.fromOn.slice(0, 4) : '';
  return (
    <>
      <PageHeader title={title} description={`Move from the ${yearKind(preview?.oldStartMonth ?? 1)} to the ${yearKind(Number(month ?? 4))}, with a short year in between.`} />
      <Stepper
        title={title}
        finishLabel="Post transition"
        finishBlocked={blocked}
        onFinish={() => setC(true)}
        review={{ note: 'Posting schedules the short year. Ledger entries are written as its credits fall due, and its year end applies each policy’s carry-forward limit.' }}
        steps={[
          {
            id: 'scope', title: 'Scope', description: 'Entity and new leave year',
            content: (
              <div className="yx-tim-form">
                <FormField label="Entity" required error={entity ? null : 'Choose the entity.'}><Select value={entity} onChange={setEntity} options={d.entities.map((e) => ({ value: e.id, label: e.name }))} /></FormField>
                <FormField label="New leave year starts in" required><Select value={month} onChange={setMonth} options={MONTH_NAMES.map((m, i) => ({ value: String(i + 1), label: m }))} /></FormField>
                {preview && <DescriptionList items={[{ label: 'Leave year', value: `${yearKind(preview.oldStartMonth)[0].toUpperCase()}${yearKind(preview.oldStartMonth).slice(1)} → ${yearKind(preview.newStartMonth)}, from ${isoDay(preview.fromOn)} (the day after the year end)` }]} />}
                {preview?.problem ? (
                  <InlineAlert tone="warning" title="This change can't be made">{preview.problem}</InlineAlert>
                ) : preview ? (
                  <InlineAlert tone="info" title="A short year is created">{shortText} with entitlements for {plural(preview.months, 'month')}, then the first full year from {nextStart ? day(nextStart) : ''}.</InlineAlert>
                ) : null}
              </div>
            ),
            summary: preview ? `${entName} · ${monthShort(preview.oldStartMonth)}–${monthShort(((preview.oldStartMonth + 10) % 12) + 1)} → ${monthShort(preview.newStartMonth)}–${monthShort(((preview.newStartMonth + 10) % 12) + 1)} from ${isoDay(preview.fromOn)}` : 'Not loaded',
          },
          {
            id: 'preview', title: 'Preview', description: 'Per employee',
            content: loadError ? (
              <InlineAlert tone="danger" title="The preview did not load" actions={<Button size="sm" onClick={() => setAttempt((a) => a + 1)}>Try again</Button>}>{loadError}</InlineAlert>
            ) : !preview ? (
              <div className="yx-tim-stack" role="status" aria-busy="true" aria-label="Loading the preview"><Skeleton height={64} /><Skeleton height={160} /></div>
            ) : preview.problem ? (
              <EmptyState compact title="Nothing to preview" description={preview.problem} />
            ) : rows.length === 0 ? (
              <EmptyState compact title="No one to move" description={`No one at ${entName} has a leave policy with a balance.`} />
            ) : (
              <div className="yx-tim-stack">
                <Kpis items={[{ label: 'People', value: people }, { label: 'Short year', value: shortText }]} />
                <p className="yx-tim-muted">Opening {isoDay(preview.fromOn)} is after the year end before it. Assumes no leave taken; on {isoDay(preview.shortEnd)} each policy’s carry-forward limit applies and the rest is paid out or lapses.</p>
                <DataTable cardSummary label="Short-year preview per employee" columns={cols} rows={shownRows} getRowId={(r) => r.employeeId + r.type} filtered={q !== ''} onClearFilters={() => setQ('')} toolbar={<FilterBar fields={[]} value={[]} onChange={() => {}} search={q} onSearchChange={setQ} searchPlaceholder="Search by name" />} />
              </div>
            ),
            summary: preview && !preview.problem ? `${plural(people, 'person', 'people')} · short year ${shortText}` : 'Not loaded',
          },
        ]}
      />
      <TypeToConfirmDialog
        open={c}
        onOpenChange={setC}
        title="Post leave-year change"
        consequence={preview ? `${plural(people, 'person', 'people')} at ${entName} move to a short year with ${plural(preview.months, 'month')} of entitlements. Ledger entries are posted from ${isoDay(preview.fromOn)}. It can't be undone here.` : ''}
        objectName={`SHORT YEAR ${yr}`}
        confirmLabel="Post entries"
        onConfirm={async () => {
          await live.onYearChangeSchedule!(entity!, Number(month));
          setPosted({ on: d.today });
          toast({ tone: 'success', title: 'Leave-year change scheduled', description: `${entName} moves to a short year from ${isoDay(preview!.fromOn)}.` });
        }}
      />
    </>
  );
}

function LiveYearEndBody({ d, live }: { d: TimeSetup; live: LiveYearEnd }) {
  const [yearEnd, setYearEnd] = useState<Date | null>(dateOfIso(`${Number(d.today.slice(0, 4)) - 1}-12-31`));
  const [preview, setPreview] = useState<YearEndPreview | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [q, setQ] = useState('');
  const [onlyLosing, setOnlyLosing] = useState(false);
  const [c, setC] = useState(false);
  const [posted, setPosted] = useState(false);
  const [ack, setAck] = useState(false);
  const iso = yearEnd ? isoOf(yearEnd) : null;
  useEffect(() => {
    if (!iso) return;
    let stale = false;
    setPreview(null);
    setLoadError(null);
    live.onYearEndPreview(iso).then(
      (p) => !stale && setPreview(p),
      (e) => !stale && setLoadError(errorText(e)),
    );
    return () => {
      stale = true;
    };
    // Reload on a new date or Try again; the handler changes identity on every render of the page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [iso, attempt]);
  const yr = yearEnd ? String(yearEnd.getFullYear()) : '';
  const start = yearEnd ? new Date(yearEnd.getFullYear() - 1, yearEnd.getMonth(), yearEnd.getDate() + 1) : null;
  const title = yr ? `Leave year-end ${yr}` : 'Leave year-end';
  const rows = preview?.rows ?? [];
  const people = new Set(rows.map((r) => r.employeeId)).size;
  const carried = rows.reduce((s, r) => s + r.carry, 0);
  const lapsed = rows.reduce((s, r) => s + r.lapse, 0);
  const paidOut = rows.reduce((s, r) => s + (r.encash ?? 0), 0);
  const losing = rows.filter((r) => r.lapse > 0);
  const shownRows = rows.filter((r) => r.name.toLowerCase().includes(q.trim().toLowerCase()) && (!onlyLosing || r.lapse > 0));
  type Row = YearEndPreview['rows'][number];
  const cols: TableColumn<Row>[] = [
    { key: 'name', header: 'Employee', value: (r) => r.name, render: (r) => <span className="yx-tim-list__main"><strong>{r.name}</strong><span className="yx-tim-muted">{r.type}{r.encashable && r.lapse > 0 ? ' · can be cashed in' : ''}</span></span> },
    {
      key: 'split', header: `Balance ${yearEnd ? dayShort(yearEnd) : ''} → carried`, value: (r) => r.lapse,
      render: (r) => (
        <span className="yx-tim-row">
          <span>{r.balance !== r.carry ? `${num(r.balance)} → ` : ''}{num(r.carry)} carried{r.encash ? ` · ${num(r.encash)} to pay out` : ''}</span>
          {r.lapse > 0 && <Badge tone="warning">{num(r.lapse)} lapse</Badge>}
        </span>
      ),
    },
  ];
  if (posted) {
    return (
      <>
        <PageHeader title={title} />
        <YearEndPosted title="Year end is being posted">
          It runs in the background and is recorded in the audit log. Balances update in a few moments.{paidOut > 0 ? ` ${num(paidOut)} days go to payroll as pay-outs.` : ''}
        </YearEndPosted>
      </>
    );
  }
  // Posted before (by anyone): it is done once per policy and date, so the page says so instead of offering Post.
  if (preview?.posted) {
    return (
      <>
        <PageHeader title={title} />
        <YearEndPosted title={`Year-end ${yr} posted on ${day(new Date(preview.posted.at))}`}>
          {preview.posted.by ? `Posted by ${preview.posted.by}. ` : ''}A year end is posted once. Correct a balance with an adjustment.
        </YearEndPosted>
      </>
    );
  }
  const blocked = !yearEnd
    ? 'Choose the last day of the leave year in Scope'
    : loadError
      ? 'The preview did not load. Open Preview and try again'
      : !preview
        ? 'The preview is still loading'
        : preview.lapses === 0 && !preview.payOuts
          ? 'Nothing lapses or is paid out on that date, so there is nothing to post'
          : (preview.pending?.length ?? 0) > 0 && !ack
            ? `Decide the ${plural(preview.pending!.length, 'pending leave request')} first, or tick "Post anyway" in Scope`
            : undefined;
  const pending = preview?.pending ?? [];
  return (
    <>
      <PageHeader title={title} description={start && yearEnd ? `Carry forward and lapse each person’s leave for ${day(start)} – ${day(yearEnd)}, up to each policy’s limit (never below the legal minimum).` : undefined} />
      <Stepper
        title={title}
        finishLabel="Post year-end"
        finishBlocked={blocked}
        onFinish={() => setC(true)}
        review={{ note: 'Posting writes carry-forward and lapse entries for every person. Entries can be reversed only by new adjustments.' }}
        steps={[
          {
            id: 'scope', title: 'Scope', description: 'Leave year',
            content: (
              <div className="yx-tim-form">
                <FormField label="Last day of the leave year" required error={yearEnd ? null : 'Choose the last day of the leave year.'}>
                  <DatePicker value={yearEnd} onChange={setYearEnd} max={dateOfIso(d.today)} />
                </FormField>
                {start && yearEnd && <DescriptionList items={[{ label: 'Leave year', value: `${day(start)} – ${day(yearEnd)}` }]} />}
                {pending.length > 0 && (
                  <div className="yx-tim-stack">
                    <InlineAlert tone="warning" title={`${plural(pending.length, 'leave request')} from this year ${pending.length === 1 ? 'is' : 'are'} still pending`} actions={live.pendingHref && live.onNavigate ? <Button size="sm" onClick={() => live.onNavigate!(live.pendingHref!)}>Open requests</Button> : undefined}>
                      Decide them before you post, or post anyway and they stay pending in the new year.
                      <ul className="yx-tim-list">{pending.slice(0, 5).map((p) => <li key={p.id}><span>{p.name} · {p.type}</span><span className="yx-tim-muted">{isoDay(p.from)}{p.to !== p.from ? ` – ${isoDay(p.to)}` : ''}</span></li>)}</ul>
                    </InlineAlert>
                    <Checkbox label={`Post anyway: ${pending.length === 1 ? 'this request stays' : `these ${pending.length} requests stay`} pending in the new year`} checked={ack} onChange={setAck} />
                  </div>
                )}
              </div>
            ),
            summary: start && yearEnd ? `${day(start)} – ${day(yearEnd)}` : 'No date chosen',
          },
          {
            id: 'preview', title: 'Preview', description: 'Per employee',
            content: loadError ? (
              <InlineAlert tone="danger" title="The preview did not load" actions={<Button size="sm" onClick={() => setAttempt((a) => a + 1)}>Try again</Button>}>{loadError}</InlineAlert>
            ) : !preview ? (
              <div className="yx-tim-stack" role="status" aria-busy="true" aria-label="Loading the preview"><Skeleton height={64} /><Skeleton height={160} /></div>
            ) : rows.length === 0 ? (
              <EmptyState compact title="Nothing to process" description="No one’s leave year ends on that date." />
            ) : (
              <div className="yx-tim-stack">
                <Kpis items={[{ label: 'People', value: people }, { label: 'Carried forward', value: `${thousands(Number(num(carried)))} days` }, { label: 'Lapse', value: `${thousands(Number(num(lapsed)))} days` }, ...(paidOut > 0 ? [{ label: 'Paid out', value: `${thousands(Number(num(paidOut)))} days`, note: 'Amounts are shown in payroll' }] : [])]} />
                <DataTable
                  cardSummary
                  label="Year-end preview per employee"
                  columns={cols}
                  rows={shownRows}
                  getRowId={(r) => r.employeeId + r.type}
                  filtered={q !== '' || onlyLosing}
                  onClearFilters={() => { setQ(''); setOnlyLosing(false); }}
                  toolbar={
                    <FilterBar fields={[]} value={[]} onChange={() => {}} search={q} onSearchChange={setQ} searchPlaceholder="Search by name">
                      <FilterToggle pressed={onlyLosing} onPressedChange={setOnlyLosing}>
Only people losing days ({losing.length})
</FilterToggle>
                    </FilterBar>
                  }
                />
              </div>
            ),
            summary: preview ? `${plural(people, 'person', 'people')} · ${num(carried)} days carried forward · ${num(lapsed)} days lapse` : 'Not loaded',
          },
        ]}
      />
      <TypeToConfirmDialog
        open={c}
        onOpenChange={setC}
        title={`Post year-end ${yr}`}
        consequence={`${plural(people, 'person', 'people')} · ${num(carried)} days carried forward${paidOut > 0 ? ` · ${num(paidOut)} days paid out in payroll` : ''} · ${num(lapsed)} days lapse. They are not removed later; a correction is a new adjustment.`}
        objectName={`LEAVE YEAR ${yr}`}
        confirmLabel="Post entries"
        onConfirm={async () => {
          await live.onYearEndRun(iso!, ack);
          setPosted(true);
        }}
      />
    </>
  );
}

/* ---------------- TIM-31 live ---------------- */

const hhmm = (m: number) => `${pad2(Math.floor(m / 60))}:${pad2(m % 60)}`;
const minuteOf = (t: string | null) => (t ? Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5)) : null);
const WEEK_DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

function LiveLocationsScreen({ live }: { live: LiveLocations }) {
  return (
    <SetupGate live={live} active="Locations & geofences" header={<PageHeader title="Locations" />}>
      {(d) => <LiveLocationPicker d={d} live={live} />}
    </SetupGate>
  );
}

function LiveLocationPicker({ d, live }: { d: TimeSetup; live: LiveLocations }) {
  const [id, setId] = useState<string | null>(d.locations[0]?.id ?? null);
  const loc = d.locations.find((l) => l.id === id) ?? d.locations[0];
  if (!loc)
    return (
      <>
        <PageHeader title="Locations" />
        <EmptyState title="No locations yet" description="Add your offices and sites in Settings › Locations first." action={<Button asChild><a href={live.settingsHref}>Open Settings › Locations</a></Button>} />
      </>
    );
  return <LiveLocationForm key={loc.id} d={d} loc={loc} live={live} picker={<Select aria-label="Location" value={loc.id} onChange={setId} options={d.locations.map((l) => ({ value: l.id, label: l.name }))} />} />;
}

function LiveLocationForm({ d, loc, live, picker }: { d: TimeSetup; loc: SetupLocation; live: LiveLocations; picker: ReactNode }) {
  const r = loc.rule;
  const [from, setFrom] = useState<Date | null>(dateOfIso(d.today));
  const [mode, setMode] = useState<string>(r.checkIn);
  const [shiftName, setShiftName] = useState(r.shiftName);
  const [start, setStart] = useState<string | null>(hhmm(r.shiftStart));
  const [end, setEnd] = useState<string | null>(hhmm(r.shiftEnd));
  const [grace, setGrace] = useState<number | null>(r.graceMinutes);
  const [offs, setOffs] = useState(r.weeklyOffs);
  const { busy, error, run } = useRun();
  const [ips, setIps] = useState(loc.ipRanges.join('\n'));
  const [ipsTried, setIpsTried] = useState(false);
  // The server checks each line again; its "Line N: …" answer shows on the field too.
  const ipErr = (ipsTried ? ipRangeError(ips) : null) ?? (error?.startsWith('Line ') ? error : null);
  const saveNetworks = () => {
    setIpsTried(true);
    if (ipRangeError(ips)) return void document.getElementById('rl-ips')?.focus();
    void run('ips', () => live.onSetNetworks!(loc.id, ips.split('\n').map((l) => l.trim()).filter(Boolean)));
  };
  const toggle = (wd: number, on: boolean) => setOffs((x) => (on ? [...x.filter((o) => o.weekday !== wd), { weekday: wd }] : x.filter((o) => o.weekday !== wd)));
  const sat = offs.find((o) => o.weekday === 6);
  const errors = [
    ...(!from ? [{ fieldId: 'rl-from', message: 'Choose the date the change starts.' }] : from && isoOf(from) < d.today ? [{ fieldId: 'rl-from', message: 'Changes start today or later.' }] : []),
    ...(!start || !end ? [{ fieldId: 'rl-start', message: 'Give the shift start and end.' }] : start === end ? [{ fieldId: 'rl-start', message: 'The shift ends at a different time from when it starts.' }] : []),
  ];
  const saveErrors = useSaveErrors(errors);
  const save = () => {
    if (errors.length) {
      saveErrors.reveal();
      document.getElementById(errors[0].fieldId)?.focus();
      return;
    }
    void run('save', () => live.onSetRule(loc.id, { validFrom: isoOf(from!), shiftName: shiftName.trim() || 'General', shiftStart: minuteOf(start)!, shiftEnd: minuteOf(end)!, graceMinutes: grace ?? 0, weeklyOffs: offs, checkIn: mode === 'field' ? 'field' : 'restricted' }));
  };
  const field = mode === 'field';
  const g = loc.geofence;
  return (
    <>
      <PageHeader
        breadcrumbs={<Breadcrumbs items={[{ label: 'Locations', href: live.settingsHref }, { label: loc.name }]} />}
        title={loc.name}
        description={`${STATE_TEXT[loc.state] ?? loc.state} · ${loc.timezone}`}
        status={r.checkIn === 'field' ? <Badge tone="info">Field check-in</Badge> : <Badge tone="success">Restricted check-in</Badge>}
        actions={picker}
      />
      <div className="yx-tim-editor">
        {g ? (
          <GeoMap height={300} fences={[{ id: 'site', label: `${loc.name} · ${g.radiusM} m`, x: 160, y: 100, r: g.radiusM / 5 }]} pins={[]} caption={field ? 'Used to label check-ins as at office' : 'Check-ins must be inside this circle or on the office network'} />
        ) : (
          <EmptyState compact title="No check-in point yet" description="Set the point and radius in Settings › Locations." />
        )}
        <div className="yx-tim-form">
          <ErrorSummary errors={saveErrors.shownErrors} />
          {error && <InlineAlert tone="danger" title="Not saved">{error}</InlineAlert>}
          <FormSection title="Check-in mode">
            <RadioGroup aria-label="Check-in mode" value={mode} onChange={setMode} options={[{ value: 'restricted', label: 'Restricted', description: 'Must be inside the point or on the office network' }, { value: 'field', label: 'Field', description: 'Location recorded, not restricted' }]} />
          </FormSection>
          {/* Question: no design shows a location's shift and weekly offs; they stay here, next to its check-in mode. */}
          <FormSection title="Shift and weekly offs">
            {r.starter && <p className="yx-tim-muted">Not set yet: these are the starting values.</p>}
            {loc.upcoming.length > 0 && <p className="yx-tim-muted">A change is waiting from {isoDay(loc.upcoming[0].validFrom!)}: {loc.upcoming[0].shiftName} {clockText(loc.upcoming[0].shiftStart)} to {clockText(loc.upcoming[0].shiftEnd)}.</p>}
            <FieldRow>
              <FormField id="rl-name" label="Shift name"><TextField value={shiftName} onChange={setShiftName} maxLength={60} /></FormField>
              <FormField id="rl-start" label="Starts" required error={saveErrors.errorOf('rl-start')}><TimeField value={start} onChange={setStart} /></FormField>
              <FormField id="rl-end" label="Ends" required helper="Before the start for a night shift."><TimeField value={end} onChange={setEnd} /></FormField>
              <FormField id="rl-grace" label="Grace (minutes)"><NumberField value={grace} onChange={setGrace} min={0} max={120} /></FormField>
            </FieldRow>
            <fieldset className="yx-tim-stack" data-gap="sm">
              <legend className="yx-tim-h3">Weekly offs</legend>
              {WEEK_DAYS.map((w, i) => <Checkbox key={w} label={w} checked={offs.some((o) => o.weekday === i + 1)} onChange={(v) => toggle(i + 1, v)} />)}
              {sat && (
                <Segment
                  label="Which Saturdays"
                  value={sat.nth?.join(',') === '2,4' ? 'alt' : 'all'}
                  onChange={(v) => setOffs((x) => x.map((o) => (o.weekday === 6 ? (v === 'alt' ? { weekday: 6, nth: [2, 4] } : { weekday: 6 }) : o)))}
                  options={[{ value: 'all', label: 'Every Saturday' }, { value: 'alt', label: '2nd and 4th Saturday' }]}
                />
              )}
            </fieldset>
          </FormSection>
          <FormSection title="Allowed points">
            {g ? (
              <ul className="yx-tim-list"><li><span className="yx-tim-list__main"><strong>{loc.name}</strong><span className="yx-tim-muted">{g.lat}, {g.lng} · {g.radiusM} m</span></span></li></ul>
            ) : (
              <p className="yx-tim-muted">No point yet.</p>
            )}
          </FormSection>
          <FormSection title="Office network (web check-in)">
            {live.onSetNetworks ? (
              <>
                <FormField id="rl-ips" label="IP ranges" helper="One range per line, e.g. 10.20.4.0/24" error={ipErr}>
                  <TextArea value={ips} onChange={setIps} rows={3} />
                </FormField>
                <span><Button size="sm" loading={busy === 'ips'} onClick={saveNetworks}>Save office network</Button></span>
              </>
            ) : (
              <p className="yx-tim-muted">{loc.ipRanges.length ? loc.ipRanges.join(', ') : 'No office network yet.'}</p>
            )}
            {/* The point and radius belong to the location record (Settings › Locations), which payroll and people also use. */}
            <span><Button size="sm" asChild><a href={live.settingsHref}>Change the point in Settings › Locations</a></Button></span>
          </FormSection>
          <FormField id="rl-from" label="Changes apply from" required error={saveErrors.errorOf('rl-from')}>
            <DatePicker value={from} onChange={setFrom} min={dateOfIso(d.today)} />
          </FormField>
          <div className="yx-tim-row">
            <Button variant="primary" loading={busy === 'save'} onClick={save}>{from ? `Save from ${day(from)}` : 'Save location'}</Button>
          </div>
        </div>
      </div>
    </>
  );
}

/** Minutes after midnight as "9:30 am". */
function clockText(minute: number): string {
  const m = ((minute % 1440) + 1440) % 1440;
  const h = Math.floor(m / 60);
  return `${h % 12 === 0 ? 12 : h % 12}:${pad2(m % 60)} ${h < 12 ? 'am' : 'pm'}`;
}

/* ---------------- TIM-42 live: public-holiday feeds (provider behind an adapter; provider: to decide) ---------------- */

export interface LiveHolidayFeeds {
  state: LoadState;
  onRetry?: () => void;
  data: HolidayFeeds | null;
  onSwitch: (on: boolean) => Promise<unknown>;
  onAdd: (state: string) => Promise<unknown>;
  onRemove: (id: string) => Promise<unknown>;
  onCheck: () => Promise<{ feeds: number; found: number; failed: number }>;
  onDecide: (accept: string[], ignore: string[]) => Promise<{ accepted: number; ignored: number; leaveReturned: number }>;
  calendarsHref: string;
  onNavigate: (href: string) => void;
}

function LiveHolidayFeedScreen({ live }: { live: LiveHolidayFeeds }) {
  const d = live.data;
  const { toast } = useToast();
  const { busy, error, run } = useRun();
  const [decisions, setDecisions] = useState<Record<string, 'accepted' | 'ignored' | undefined>>({});
  const [adding, setAdding] = useState<string | null | undefined>(undefined);
  const [tried, setTried] = useState(false);
  const [removing, setRemoving] = useState<HolidayFeeds['feeds'][number] | null>(null);
  const [offAsk, setOffAsk] = useState(false);
  const [checked, setChecked] = useState<string | null>(null);
  const changes = d?.changes ?? [];
  const accepted = changes.filter((x) => decisions[x.id] === 'accepted');
  const ignored = changes.filter((x) => decisions[x.id] === 'ignored');
  const undecided = changes.length - accepted.length - ignored.length;
  const subscribed = new Set((d?.feeds ?? []).map((f) => f.state));
  const publish = () => {
    if (undecided > 0) return void toast({ tone: 'warning', title: `Accept or ignore ${undecided === changes.length ? 'each change' : `the ${plural(undecided, 'change')} left`}` });
    void run('publish', async () => {
      const r = await live.onDecide(accepted.map((x) => x.id), ignored.map((x) => x.id));
      setDecisions({});
      toast({ tone: 'success', title: r.accepted ? `Published ${plural(r.accepted, 'change')}${r.leaveReturned ? ` · ${plural(r.leaveReturned, 'leave day')} given back` : ''}` : 'Changes dismissed' });
    });
  };
  return (
    <TimePage active="Holiday calendars">
      <PageHeader
        title="Public-holiday feeds"
        description={d ? `Calendars follow a state feed. Changes wait for your review before employees see them. Feed: ${d.provider === 'dev-fake' ? 'test feed (the provider is still to be decided)' : d.provider}.` : undefined}
        actions={d?.on ? (
          <div className="yx-tim-row">
            <Button icon={Plus} onClick={() => { setTried(false); setAdding(d.states.find((x) => !subscribed.has(x.code))?.code ?? null); }}>Add feed</Button>
            <Button icon={RefreshCw} loading={busy === 'check'} onClick={() => void run('check', async () => { const r = await live.onCheck(); setChecked(r.failed ? `${plural(r.failed, 'feed')} did not answer. Try again later.` : r.found ? `${plural(r.found, 'new change')} to review.` : 'No new changes.'); })}>Check for updates</Button>
          </div>
        ) : undefined}
      />
      <SetupStates state={live.state} onRetry={live.onRetry} what="Holiday feeds">
        {d && (
          <>
            {error && <InlineAlert tone="danger" title="Not done">{error}</InlineAlert>}
            {checked && <InlineAlert tone="info" title="Checked all feeds">{checked}</InlineAlert>}
            <Card title="Subscriptions">
              <div className="yx-tim-stack">
                <Switch label="Use public-holiday feeds" checked={d.on} onChange={(v) => (!v && changes.length > 0 ? setOffAsk(true) : void run('switch', () => live.onSwitch(v)))} />
                {d.on ? (
                  d.feeds.length === 0 ? <p className="yx-tim-muted">No feeds yet. Add the states your offices are in.</p> : (
                    <ul className="yx-tim-list">
                      {d.feeds.map((f) => (
                        <li key={f.id}>
                          <span className="yx-tim-list__main">
                            <strong>India · {f.stateName}</strong>
                            <span className="yx-tim-muted">{f.locations.length ? f.locations.map((l) => l.name).join(', ') : 'No location in this state yet'} · {f.checkedAt ? `last checked ${formatDate(new Date(f.checkedAt))}` : 'first check pending'}</span>
                            {f.locations.filter((l) => !l.hasCalendar).map((l) => <span key={l.id} className="yx-tim-muted">{l.name} · no calendar yet</span>)}
                            {f.checkError && <span className="yx-tim-muted">{f.checkError}</span>}
                          </span>
                          <span className="yx-tim-row">
                            {f.locations.some((l) => !l.hasCalendar) && <Button size="sm" onClick={() => live.onNavigate(live.calendarsHref)}>Start a calendar</Button>}
                            {!f.checkedAt ? <Badge tone="neutral">First check pending</Badge> : f.checkError ? <Badge tone="warning">Did not answer</Badge> : f.waiting ? <Badge tone="neutral">{plural(f.waiting, 'change')} to review</Badge> : <Badge tone="success">Up to date</Badge>}
                            <Button size="sm" onClick={() => setRemoving(f)}>Remove</Button>
                          </span>
                        </li>
                      ))}
                    </ul>
                  )
                ) : (
                  <InlineAlert tone="info" title="Feeds are off" actions={<Button size="sm" onClick={() => live.onNavigate(live.calendarsHref)}>Open holiday calendars</Button>}>Calendars keep their holidays. You add changes by hand in Holiday calendars.</InlineAlert>
                )}
              </div>
            </Card>
            {d.on && changes.length > 0 && (
              <Card title="Changes from the feeds · review before publishing">
                <div className="yx-tim-stack">
                  <ul className="yx-tim-list">
                    {changes.map((ch) => {
                      const dec = decisions[ch.id];
                      return (
                        <li key={ch.id}>
                          <span className="yx-tim-list__main">
                            <strong>{ch.action === 'add' ? `Add ${ch.name}` : `Remove ${ch.name}`} · {isoDay(ch.on)}</strong>
                            <span className="yx-tim-muted">{ch.calendar} calendar</span>
                            {ch.peopleOnLeave > 0 && <span className="yx-tim-muted">{plural(ch.peopleOnLeave, 'person has', 'people have')} leave that day. When you publish, that leave goes back to their balance and they are notified.</span>}
                          </span>
                          <span className="yx-tim-row">
                            {dec ? (
                              <>
                                <Badge tone={dec === 'accepted' ? 'success' : 'neutral'}>{dec === 'accepted' ? 'Accepted' : 'Ignored'}</Badge>
                                <Button size="sm" onClick={() => setDecisions((x) => ({ ...x, [ch.id]: undefined }))}>Undo</Button>
                              </>
                            ) : (
                              <>
                                <Button size="sm" onClick={() => setDecisions((x) => ({ ...x, [ch.id]: 'ignored' }))}>Ignore</Button>
                                <Button size="sm" variant="approve" onClick={() => setDecisions((x) => ({ ...x, [ch.id]: 'accepted' }))}>Accept</Button>
                              </>
                            )}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                  <div className="yx-tim-row">
                    <Button variant="primary" loading={busy === 'publish'} onClick={publish}>{accepted.length > 0 ? `Publish ${plural(accepted.length, 'change')}` : ignored.length > 0 ? `Dismiss ${plural(ignored.length, 'change')}` : 'Publish changes'}</Button>
                    {undecided > 0 && <span className="yx-tim-muted">Accept or ignore {undecided === changes.length ? 'each change' : `the ${plural(undecided, 'change')} left`}</span>}
                  </div>
                </div>
              </Card>
            )}
          </>
        )}
      </SetupStates>
      <ConfirmDialog
        open={!!removing}
        onOpenChange={(o) => !o && setRemoving(null)}
        title={`Remove the ${removing?.stateName ?? ''} feed?`}
        consequence={removing ? `Calendars keep their current holidays.${removing.waiting ? ` The ${plural(removing.waiting, 'waiting change')} ${removing.waiting === 1 ? 'is' : 'are'} not applied.` : ''} New state changes are no longer shown here.` : undefined}
        confirmLabel="Remove feed"
        destructive
        onConfirm={async () => {
          if (removing) await live.onRemove(removing.id);
          setRemoving(null);
        }}
      />
      <ConfirmDialog
        open={offAsk}
        onOpenChange={setOffAsk}
        title="Turn off holiday feeds?"
        consequence={`The ${plural(changes.length, 'waiting change')} won't be added. Add them by hand in Holiday calendars.`}
        confirmLabel="Turn off feeds"
        destructive
        onConfirm={async () => {
          await live.onSwitch(false);
          setOffAsk(false);
        }}
      />
      <ConfirmDialog
        open={adding !== undefined}
        onOpenChange={(o) => !o && setAdding(undefined)}
        title="Add a holiday feed"
        confirmLabel="Add feed"
        onConfirm={async () => {
          setTried(true);
          if (!adding || subscribed.has(adding)) return false;
          await live.onAdd(adding);
          setAdding(undefined);
        }}
      >
        {d && (
          <div className="yx-tim-form">
            <FormField label="Country"><Select value="in" onChange={() => {}} options={[{ value: 'in', label: 'India' }]} /></FormField>
            <FormField label="State" required error={tried && !adding ? 'Choose the state.' : tried && adding && subscribed.has(adding) ? 'Choose a state not already subscribed.' : null}>
              <Select value={adding ?? null} onChange={(v) => setAdding(v)} options={d.states.map((x) => ({ value: x.code, label: x.name, description: subscribed.has(x.code) ? 'Already subscribed' : undefined }))} />
            </FormField>
          </div>
        )}
      </ConfirmDialog>
    </TimePage>
  );
}

/** Loading, could not load and no access for a live set-up page that loads its own data. */
function SetupStates({ state, onRetry, what, children }: { state: LoadState; onRetry?: () => void; what: string; children: ReactNode }) {
  if (state === 'error') return <ErrorState title={`${what} didn't load`} description="Nothing has changed. Try again in a moment." onRetry={onRetry} />;
  if (state === 'no-access') return <NoAccessState grantedBy="your HR admin" what={what.toLowerCase()} />;
  if (state === 'loading') return <div className="yx-tim-stack" role="status" aria-busy="true" aria-label={`Loading ${what.toLowerCase()}`}><Skeleton height={96} /><Skeleton height={160} /></div>;
  return <>{children}</>;
}
