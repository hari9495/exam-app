// TIM-43 · Pre-fill from my tools, live: the designed PrefillDrawer (ops.tsx) with the person's own tool connections
// and the API's suggestions for the week. Nothing is saved here: accepted lines go into the timesheet grid, and the week
// is saved through the normal timesheet save. Matching rules ("Manage rules") are not in the API yet (gap).
import { useEffect, useRef, useState } from 'react';
import { Button } from '../../components/button';
import { AiBadge, Badge } from '../../components/display';
import { Drawer } from '../../components/drawer';
import { EmptyState, ErrorState, Skeleton } from '../../components/feedback';
import { NumberField } from '../../components/inputs';
import { useToast } from '../../components/notify';
import { Select } from '../../components/select';
import { Card } from '../../components/shell';
import type { TimesheetLine } from '../../components/timesheet';
import { formatDate } from '../../lib/format';
import { errorText } from '../org/org-kit';
import type { LoadState } from './live/types';

export type ToolProvider = 'calendar' | 'issues' | 'code';
export interface PrefillTools { enabled: boolean; tools: { provider: ToolProvider; label: string; connected: boolean; accountLabel: string | null }[] }
export interface PrefillSuggestions {
  week: string;
  upTo: string;
  lines: { id: string; provider: ToolProvider; date: string; minutes: number; projectId: string | null; activity: string | null; projectHint: string | null; source: string; kind: 'rule' | 'ai' }[];
}
/** The live timesheet's pre-fill: the person's tools and the week's suggestions (only while suggestions are on). */
export interface LivePrefill {
  tools: { state: LoadState; data: PrefillTools | null; onRetry?: () => void };
  suggestions: { state: LoadState; data: PrefillSuggestions | null; onRetry?: () => void };
  onConnect: (provider: ToolProvider) => Promise<unknown>;
  onDisconnect: (provider: ToolProvider) => Promise<unknown>;
}
export interface PrefillProject { id: string; code: string; name: string; billable: boolean; activities: string[] }

type Row = PrefillSuggestions['lines'][number] & { day: number; hours: number; state: 'new' | 'accepted' | 'rejected'; prev?: number | null; created?: boolean };
const localDay = (iso: string) => new Date(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10)));
const WD = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const dayIndex = (week: string, on: string) => Math.round((localDay(on).getTime() - localDay(week).getTime()) / 864e5);
const DAY_EXPECTED = 8;
const SUGG_MAIN = { flexBasis: 'calc(var(--yx-space-16) * 5)' } as const;
const nowrap = { whiteSpace: 'nowrap' } as const;
const NOT_ON = 'Timesheet suggestions from your tools are not set up for your company. Ask HR to turn them on, or fill the week by hand.';

export function LivePrefillDrawer({ open, onOpenChange, live, week, projects, lines, onLinesChange }: { open: boolean; onOpenChange: (o: boolean) => void; live: LivePrefill; week: string; projects: PrefillProject[]; lines: TimesheetLine[]; onLinesChange: (l: TimesheetLine[]) => void }) {
  const { toast } = useToast();
  const tools = live.tools.data;
  const sugg = live.suggestions.data;
  const [rows, setRows] = useState<Row[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState<number | null>(null);
  const [needProject, setNeedProject] = useState<string | null>(null);
  const pickRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    // New suggestions from the server keep the person's choices on rows that are still there.
    setRows((old) => (sugg && sugg.week === week ? sugg.lines.map((l) => old.find((o) => o.id === l.id) ?? { ...l, day: dayIndex(week, l.date), hours: Math.round((l.minutes / 60) * 100) / 100, state: 'new' as const }) : []));
  }, [sugg, week]);
  useEffect(() => {
    if (needProject) pickRef.current?.focus();
  }, [needProject]);

  const connected = new Set((tools?.tools ?? []).filter((t) => t.connected).map((t) => t.provider));
  const visible = rows.filter((r) => connected.has(r.provider));
  const project = (id: string | null) => projects.find((p) => p.id === id);
  const lineFor = (s: Row, ls = lines) => ls.find((l) => l.projectId === s.projectId && (l.taskId ?? null) === (s.activity ?? null));
  const onSheet = (s: Row) => lineFor(s)?.hours[s.day] ?? 0;
  const already = (s: Row) => s.state === 'new' && !!s.projectId && onSheet(s) >= s.hours;
  const patch = (id: string, p: Partial<Row>) => setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...p } : r)));
  const merge = (ls: TimesheetLine[], s: Row): [TimesheetLine[], Partial<Row>] => {
    const l = lineFor(s, ls);
    if (!l) {
      const hours: (number | null)[] = Array(7).fill(null);
      hours[s.day] = s.hours;
      return [[...ls, { id: `sg-${s.id}`, projectId: s.projectId, taskId: s.activity, billable: project(s.projectId)?.billable ?? false, hours }], { state: 'accepted', created: true }];
    }
    return [ls.map((x) => (x.id === l.id ? { ...x, hours: x.hours.map((h, i) => (i === s.day ? s.hours : h)) } : x)), { state: 'accepted', prev: l.hours[s.day], created: false }];
  };
  const accept = (s: Row) => {
    if (!s.projectId) {
      setNeedProject(s.id);
      return;
    }
    const [ls, p] = merge(lines, s);
    onLinesChange(ls);
    patch(s.id, p);
  };
  const fresh = visible.filter((s) => s.state === 'new' && !already(s));
  const acceptAll = () => {
    let ls = lines;
    const doneRows: Record<string, Partial<Row>> = {};
    const ready = fresh.filter((s) => s.projectId);
    ready.forEach((s) => {
      const [next, p] = merge(ls, s);
      ls = next;
      doneRows[s.id] = p;
    });
    onLinesChange(ls);
    setRows((rs) => rs.map((r) => (doneRows[r.id] ? { ...r, ...doneRows[r.id] } : r)));
    const left = fresh.length - ready.length;
    if (left) toast({ title: `${left} ${left === 1 ? 'suggestion needs' : 'suggestions need'} a project first`, tone: 'warning' });
  };
  const undo = (s: Row) => {
    if (s.state === 'accepted') onLinesChange(s.created ? lines.filter((l) => l.id !== `sg-${s.id}`) : lines.map((l) => (l === lineFor(s) ? { ...l, hours: l.hours.map((h, i) => (i === s.day ? (s.prev ?? null) : h)) } : l)));
    patch(s.id, { state: 'new', prev: undefined, created: undefined });
  };
  const dayTotal = (s: Row, hours: number) => Math.round((lines.reduce((a, l) => a + (l === lineFor(s) ? 0 : (l.hours[s.day] ?? 0)), 0) + hours) * 100) / 100;
  const run = async (key: string, fn: () => Promise<unknown>, title: string) => {
    setBusy(key);
    try {
      await fn();
      toast({ title, tone: 'success' });
    } catch (e) {
      toast({ title: errorText(e), tone: 'error' });
    } finally {
      setBusy(null);
    }
  };
  const firstOff = tools?.tools.find((t) => !t.connected);
  const connect = (p: ToolProvider, label: string) => void run(`c:${p}`, () => live.onConnect(p), `${label} connected`);

  const body = () => {
    if (live.tools.state === 'loading' || (!tools && live.tools.state === 'ready')) return <Skeleton height={160} />;
    if (live.tools.state === 'error') return <ErrorState title="We couldn't load your tools." description="Nothing has changed. Try again in a moment." onRetry={live.tools.onRetry} />;
    if (!tools?.enabled) return <EmptyState title="Not set up for your company" description={NOT_ON} action={<Button onClick={() => onOpenChange(false)}>Fill week by hand</Button>} />;
    return (
      <>
        <Card title="Your tools">
          <div className="yx-tim-stack" style={{ gap: 'var(--yx-space-2)' }}>
            <ul className="yx-tim-list">
              {tools.tools.map((t) => (
                <li key={t.provider}>
                  <span className="yx-tim-list__main"><span>{t.label}</span>{t.connected && t.accountLabel && <span className="yx-tim-muted">{t.accountLabel}</span>}</span>
                  {t.connected ? (
                    <span className="yx-tim-row"><Badge tone="success">Connected</Badge><Button size="sm" loading={busy === `d:${t.provider}`} onClick={() => void run(`d:${t.provider}`, () => live.onDisconnect(t.provider), `${t.label} revoked`)}>Revoke</Button></span>
                  ) : (
                    <span className="yx-tim-row"><span className="yx-tim-muted">Not connected</span><Button size="sm" loading={busy === `c:${t.provider}`} onClick={() => connect(t.provider, t.label)}>Connect</Button></span>
                  )}
                </li>
              ))}
            </ul>
            {tools.tools.filter((t) => t.connected && sugg && !sugg.lines.some((l) => l.provider === t.provider)).map((t) => <p key={t.provider} className="yx-tim-note">{t.label} connected. Nothing to match this week.</p>)}
            <p className="yx-tim-note">We read event titles, times and issue status only. Nothing is written back to your tools.</p>
          </div>
        </Card>
        {!connected.size ? (
          <EmptyState
            title="Connect a tool to get suggestions"
            description="We suggest hours for days up to today from your work calendar or issue tracker."
            action={<Button loading={busy === 'c:calendar'} onClick={() => connect('calendar', 'Work calendar')}>Connect work calendar</Button>}
          />
        ) : live.suggestions.state === 'loading' ? (
          <Skeleton height={160} />
        ) : live.suggestions.state === 'error' ? (
          <ErrorState title="We couldn't load suggestions." description="Nothing has changed. Try again in a moment." onRetry={live.suggestions.onRetry} />
        ) : visible.length ? (
          <ul className="yx-tim-list" aria-label="Suggestions">
            {visible.map((r) => {
              const p = project(r.projectId);
              const had = r.projectId ? onSheet(r) : 0;
              const total = editing === r.id ? dayTotal(r, draft ?? 0) : 0;
              const dayName = `${WD[r.day]} ${formatDate(localDay(r.date))}`;
              return (
                <li key={r.id}>
                  <span className="yx-tim-list__main" style={SUGG_MAIN}>
                    <strong>{dayName} · {r.hours} h</strong>
                    {p ? (
                      <span><span style={nowrap}>{p.code}</span> · {r.activity ?? p.name}</span>
                    ) : (
                      <span className="yx-tim-stack" style={{ gap: 'var(--yx-space-1)' }}>
                        <Select
                          ref={needProject === r.id ? pickRef : undefined}
                          aria-label={`Project for ${dayName}, ${r.hours} h`}
                          placeholder="Choose a project"
                          size="sm"
                          value={null}
                          onChange={(v) => { if (!v) return; patch(r.id, { projectId: v, activity: null }); setNeedProject(null); }}
                          options={projects.map((x) => ({ value: x.id, label: `${x.code} · ${x.name}` }))}
                        />
                        {needProject === r.id && <span className="yx-tim-muted" role="alert">Choose a project first{r.projectHint ? `: "${r.projectHint}" is not one of your projects` : ''}.</span>}
                      </span>
                    )}
                    <span className="yx-tim-muted">{r.source}{r.state === 'new' && had > 0 && had < r.hours ? ` · adds ${Math.round((r.hours - had) * 100) / 100} h to the ${had} h already there` : ''} {r.kind === 'ai' ? <AiBadge /> : null}</span>
                    {editing === r.id && (
                      <span className="yx-tim-row">
                        <NumberField aria-label={`Hours for ${dayName}`} value={draft} onChange={setDraft} min={0} max={24} decimals size="sm" />
                        <Button size="sm" onClick={() => setEditing(null)}>Cancel</Button>
                        {/* Never disabled: the reason shows beside it. */}
                        <Button size="sm" variant="primary" onClick={() => { if (!draft || total > 24) return; patch(r.id, { hours: draft }); setEditing(null); }}>Save hours</Button>
                        {!draft ? <span className="yx-tim-muted">Enter the hours first.</span> : total > 24 ? <span className="yx-tim-muted">{WD[r.day]} would be {total} h. A day can have at most 24 h.</span> : total > DAY_EXPECTED ? <Badge tone="warning">{WD[r.day]} would be {total} h</Badge> : null}
                      </span>
                    )}
                  </span>
                  {already(r) ? (
                    <Badge tone="neutral">Already on your timesheet</Badge>
                  ) : r.state === 'new' ? (
                    editing !== r.id && (
                      <span className="yx-tim-row">
                        <Button size="sm" onClick={() => patch(r.id, { state: 'rejected' })}>Reject</Button>
                        <Button size="sm" onClick={() => { setDraft(r.hours); setEditing(r.id); }}>Edit</Button>
                        <Button size="sm" variant="approve" onClick={() => accept(r)}>Accept</Button>
                      </span>
                    )
                  ) : (
                    <span className="yx-tim-row">
                      <Badge tone={r.state === 'accepted' ? 'success' : 'neutral'}>{r.state === 'accepted' ? `Added to ${WD[r.day]} · ${p?.code ?? ''}` : 'Rejected'}</Badge>
                      <Button size="sm" onClick={() => undo(r)}>Undo</Button>
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        ) : (
          <EmptyState
            title="No suggestions for this week"
            description={`Your connected tools had no events or activity we could match to your projects.${firstOff ? ` ${firstOff.label} isn't connected yet.` : ''}`}
            action={
              <>
                <Button onClick={() => onOpenChange(false)}>Fill week by hand</Button>
                {firstOff && <Button loading={busy === `c:${firstOff.provider}`} onClick={() => connect(firstOff.provider, firstOff.label)}>Connect {firstOff.label.toLowerCase()}</Button>}
              </>
            }
          />
        )}
      </>
    );
  };

  return (
    <Drawer
      open={open}
      onOpenChange={onOpenChange}
      title="Pre-fill from my tools"
      subtitle="Suggestions only. You still save and submit the week yourself."
      size="lg"
      footer={
        <>
          <Button onClick={() => onOpenChange(false)}>Back to timesheet</Button>
          {tools?.enabled && fresh.length > 0 && <Button variant="approve" onClick={acceptAll}>Accept all new ({fresh.length})</Button>}
        </>
      }
    >
      <div className="yx-tim-stack">{body()}</div>
    </Drawer>
  );
}
