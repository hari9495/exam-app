// Growth kit: reusable building blocks for Performance, Learning and Engage screens that the library lacks.
// Progress ring, goal tree, rating scale, score + band, review stage track, 9-box, eNPS scale, suppressed notice,
// rotating QR tile, skill level, feed post + poll, manager coach card, bias flags, and the area frame helper.
import { useId, useMemo, useState, type DragEvent, type ReactNode } from 'react';
import {
  ArrowLeft,
  BarChart3,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronRight,
  CircleAlert,
  EyeOff,
  Flag,
  Heart,
  Lock,
  MessageSquare,
  MoreHorizontal,
  MoveRight,
  Pin,
  ShieldAlert,
  X,
} from 'lucide-react';
import { DesktopFrame, PhoneFrame, SCREEN_RAIL, type PanelSection } from '../_kit/frames';
import { Button, IconButton, Link } from '../../components/button';
import { Badge, AiBadge, Avatar, type BadgeTone } from '../../components/display';
import { Icon, Text } from '../../components/foundations';
import { InlineAlert } from '../../components/feedback';
import { Menu, MenuContent, MenuItem, MenuLabel, MenuTrigger } from '../../components/menu';
import { RadioGroup } from '../../components/choice';
import { ConfirmDialog } from '../../components/overlay';
import { FormField } from '../../components/field';
import { TextArea } from '../../components/inputs';
import { formatDate } from '../../lib/format';
import { cx } from '../../lib/cx';
import {
  bandFor,
  goalProgress,
  krProgress,
  nineBoxLabel,
  pollPercents,
  qrToken,
  RATING_LABELS,
  type BiasFlag,
  type Goal,
} from './growth-logic';
import './growth-kit.css';

/* ================================================================== Frame helper */

export type Device = 'desktop' | 'phone';
export type Persona = 'emp' | 'mgr' | 'hr' | 'ld' | 'mod' | 'fin';
export type GrowthArea = 'performance' | 'learning' | 'engage';

const PANELS: Record<GrowthArea, { title: string; items: string[]; by: Partial<Record<Persona, string[]>> }> = {
  performance: {
    title: 'Performance',
    items: ['Performance home', 'Goals', 'Reviews & cycles', 'Feedback', '1:1s', 'Calibration & comp review', 'PIPs', 'Skills & competencies'],
    by: { emp: ['Performance home', 'Goals', 'Reviews & cycles', 'Feedback', '1:1s', 'Skills & competencies'], fin: ['Calibration & comp review'] },
  },
  learning: {
    title: 'Learning',
    items: ['My learning', 'Catalogue', 'My tests', 'Sessions', 'Compliance', 'Needs & budgets', 'Skills', 'Course builder'],
    by: {
      emp: ['My learning', 'Catalogue', 'My tests', 'Skills'],
      mgr: ['My learning', 'Catalogue', 'My tests', 'Skills', 'Needs & budgets'],
      fin: ['Needs & budgets'],
    },
  },
  engage: {
    title: 'Engage',
    items: ['Feed', 'Announcements', 'Surveys', 'Recognition', 'Moderation'],
    by: { emp: ['Feed', 'Surveys', 'Recognition'], mgr: ['Feed', 'Surveys', 'Recognition'], hr: ['Feed', 'Announcements', 'Surveys', 'Recognition'] },
  },
};

const EMP_RAIL = ['home', 'time', 'pay', 'performance', 'learning', 'engage', 'helpdesk', 'settings'];

/** Panel links for an area, role-filtered (APX-D §1.2: at most 8 items, only what the persona can reach). */
export function growthPanel(area: GrowthArea, active: string, persona: Persona = 'hr', counts: Record<string, number> = {}): PanelSection[] {
  const p = PANELS[area];
  const items = p.by[persona] ?? p.items;
  return [{ items: items.map((label) => ({ label, active: label === active, count: counts[label] })) }];
}

export interface GrowthFrameProps {
  area: GrowthArea;
  /** Panel item that is current. */
  active: string;
  persona?: Persona;
  device?: Device;
  /** Phone header and tab (M04 canonical map: goals, learning, rewards live under Me; feed under Home). */
  phone?: { tab?: 'home' | 'time' | 'requests' | 'pay' | 'me'; title: string; back?: boolean; actions?: ReactNode; hideTabs?: boolean };
  counts?: Record<string, number>;
  children: ReactNode;
}

/** Desktop (T1–T7) or phone (T8) frame for every growth screen. */
export function GrowthFrame({ area, active, persona = 'hr', device = 'desktop', phone, counts, children }: GrowthFrameProps) {
  if (device === 'phone') {
    return (
      <PhoneFrame
        tab={phone?.tab ?? 'me'}
        title={phone?.title ?? active}
        back={phone?.back ? <IconButton icon={ArrowLeft} label="Back" /> : undefined}
        actions={phone?.actions}
        hideTabs={phone?.hideTabs}
      >
        {children}
      </PhoneFrame>
    );
  }
  const rail = persona === 'emp' ? SCREEN_RAIL.filter((r) => EMP_RAIL.includes(r.id)) : SCREEN_RAIL;
  return (
    <DesktopFrame area={area} panelTitle={PANELS[area].title} panel={growthPanel(area, active, persona, counts)} railItems={rail}>
      {children}
    </DesktopFrame>
  );
}

/* ================================================================== Progress ring */

export interface ProgressRingProps {
  /** 0–100, or null for "not started / nothing to measure". */
  value: number | null;
  /** What the ring measures, for screen readers: "Reduce customer complaints". */
  label: string;
  size?: 'sm' | 'md' | 'lg';
  tone?: 'default' | 'warning' | 'danger' | 'success';
}

const RING = { sm: 32, md: 48, lg: 72 };

/** Key-result / goal progress ring; the percentage is always written inside (never colour only). */
export function ProgressRing({ value, label, size = 'md', tone = 'default' }: ProgressRingProps) {
  const px = RING[size];
  const stroke = size === 'sm' ? 3 : size === 'md' ? 4 : 6;
  const r = (px - stroke) / 2;
  const frac = value == null ? 0 : Math.max(0, Math.min(1, value / 100));
  return (
    <span
      className="yx-progress-ring"
      data-size={size}
      data-tone={tone}
      role="img"
      aria-label={`${label}: ${value == null ? 'not measured yet' : `${value}% complete`}`}
      style={{ width: px, height: px }}
    >
      <svg viewBox={`0 0 ${px} ${px}`} width={px} height={px} aria-hidden="true">
        <circle className="yx-progress-ring__track" cx={px / 2} cy={px / 2} r={r} strokeWidth={stroke} />
        <circle
          className="yx-progress-ring__fill"
          cx={px / 2}
          cy={px / 2}
          r={r}
          strokeWidth={stroke}
          pathLength={1}
          style={{ strokeDasharray: `${frac} 1` }}
          transform={`rotate(-90 ${px / 2} ${px / 2})`}
        />
      </svg>
      <span className="yx-progress-ring__text" aria-hidden="true">
        {value == null ? '—' : `${value}%`}
      </span>
    </span>
  );
}

/* ================================================================== Goal tree */

const confidenceTone = (c?: string): BadgeTone => (c === 'On track' ? 'success' : c === 'At risk' ? 'warning' : c === 'Off track' ? 'danger' : 'neutral');
const ringTone = (c?: string): ProgressRingProps['tone'] => (c === 'At risk' ? 'warning' : c === 'Off track' ? 'danger' : 'default');

export interface GoalTreeProps {
  goals: Goal[];
  /** Root ids; defaults to goals with no parent in the list. */
  roots?: string[];
  defaultExpanded?: string[];
  onOpen?: (goal: Goal) => void;
  onCheckIn?: (goal: Goal) => void;
  /** Hide key results rows (map views). */
  compact?: boolean;
  'aria-label': string;
}

/** Tree / alignment view (M06 §7): parent owned by anyone, a ring per key result, progress calculated (YX-PERF-01). */
export function GoalTree({ goals, roots, defaultExpanded, onOpen, onCheckIn, compact, 'aria-label': ariaLabel }: GoalTreeProps) {
  const ids = new Set(goals.map((g) => g.id));
  const top = roots ?? goals.filter((g) => !g.parentId || !ids.has(g.parentId)).map((g) => g.id);
  const [open, setOpen] = useState<Set<string>>(new Set(defaultExpanded ?? goals.map((g) => g.id)));
  const toggle = (id: string) =>
    setOpen((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const render = (id: string, depth: number): ReactNode => {
    const g = goals.find((x) => x.id === id);
    if (!g) return null;
    const kids = goals.filter((x) => x.parentId === g.id);
    const p = goalProgress(g, goals);
    const expanded = open.has(g.id);
    return (
      <li key={g.id} className="yx-goal-tree__item">
        <div className="yx-goal-tree__row" style={{ paddingInlineStart: `calc(var(--yx-space-6) * ${depth})` }}>
          {kids.length > 0 || (!compact && g.keyResults.length > 0) ? (
            <IconButton icon={expanded ? ChevronDown : ChevronRight} label={expanded ? `Collapse ${g.title}` : `Expand ${g.title}`} aria-expanded={expanded} size="sm" onClick={() => toggle(g.id)} />
          ) : (
            <span className="yx-goal-tree__spacer" />
          )}
          <ProgressRing value={p} label={g.title} size="sm" tone={ringTone(g.confidence)} />
          <div className="yx-goal-tree__main">
            <button type="button" className="yx-goal-tree__title" onClick={() => onOpen?.(g)}>
              {g.title}
            </button>
            <Text size="sm" tone="secondary">
              {g.owner.type === 'company' ? 'Company' : g.owner.type === 'team' ? `Team · ${g.owner.name}` : g.owner.name} · {g.type === 'okr' ? 'OKR' : 'KPI'} · weight {g.weight}% · {g.period}
            </Text>
          </div>
          {g.confidence && <Badge tone={confidenceTone(g.confidence)}>{g.confidence}</Badge>}
          {g.status !== 'Approved' && <Badge tone={g.status === 'Draft' ? 'neutral' : 'info'}>{g.status}</Badge>}
          {onCheckIn && g.owner.type === 'person' && (
            <Button size="sm" onClick={() => onCheckIn(g)}>
              Check in
            </Button>
          )}
        </div>
        {expanded && !compact && g.keyResults.length > 0 && (
          <ul className="yx-goal-tree__krs" aria-label={`Key results of ${g.title}`}>
            {g.keyResults.map((kr) => (
              <li key={kr.id} className="yx-goal-tree__kr" style={{ paddingInlineStart: `calc(var(--yx-space-6) * ${depth + 1} + var(--yx-space-8))` }}>
                <ProgressRing value={krProgress(kr)} label={kr.title} size="sm" />
                <span className="yx-goal-tree__kr-title">{kr.title}</span>
                <Text size="sm" tone="secondary" className="yx-goal-tree__kr-num">
                  {kr.actual} of {kr.target} {kr.unit} (from {kr.start})
                </Text>
              </li>
            ))}
          </ul>
        )}
        {expanded && kids.length > 0 && (
          <ul className="yx-goal-tree__group" aria-label={`Goals aligned to ${g.title}`}>
            {kids.map((k) => render(k.id, depth + 1))}
          </ul>
        )}
      </li>
    );
  };
  return (
    <ul className="yx-goal-tree" aria-label={ariaLabel}>
      {top.map((id) => render(id, 0))}
    </ul>
  );
}

/* ================================================================== Rating scale + score band */

export interface RatingScaleProps {
  value: number | null;
  onChange?: (v: number) => void;
  label: string;
  disabled?: boolean;
  /** Labels per point; default M06 Q3 five labels. */
  labels?: readonly string[];
}

/** 1–5 labelled rating (M06 Q3); the label is always written next to the number. */
export function RatingScale({ value, onChange, label, disabled, labels = RATING_LABELS }: RatingScaleProps) {
  return (
    <RadioGroup
      className="yx-rating-scale"
      aria-label={label}
      orientation="horizontal"
      disabled={disabled}
      value={value == null ? '' : String(value)}
      onChange={(v) => onChange?.(Number(v))}
      options={labels.map((l, i) => ({ value: String(i + 1), label: `${i + 1} · ${l}` }))}
    />
  );
}

/** Final score with its band (YX-PERF-07), or "pending" (YX-PERF-02, never 0). */
export function ScoreBand({ score, pendingText = 'Pending' }: { score: number | null; pendingText?: string }) {
  if (score == null) return <Badge tone="neutral">{pendingText}</Badge>;
  return (
    <span className="yx-score-band">
      <span className="yx-score-band__num">{score.toFixed(2)}</span>
      <Badge tone={score >= 3.5 ? 'success' : score >= 2.5 ? 'info' : 'warning'}>{bandFor(score)}</Badge>
    </span>
  );
}

/* ================================================================== Review stage track */

export interface StageItem {
  id: string;
  label: string;
  owner: string;
  due?: Date;
  state: 'done' | 'current' | 'todo' | 'skipped';
}

/** Read-only review stages (YX-PERF-06): each with owner and deadline; the current stage and next step are named. */
export function StageTrack({ stages, nextStep }: { stages: StageItem[]; nextStep?: ReactNode }) {
  const current = stages.find((s) => s.state === 'current');
  return (
    <div className="yx-stage-track">
      <ol className="yx-stage-track__list" aria-label="Review stages">
        {stages.map((s, i) => (
          <li key={s.id} className="yx-stage-track__step" data-state={s.state} aria-current={s.state === 'current' ? 'step' : undefined}>
            <span className="yx-stage-track__dot" aria-hidden="true">
              {s.state === 'done' ? <Icon icon={Check} /> : i + 1}
            </span>
            <span className="yx-stage-track__label">{s.label}</span>
            <span className="yx-stage-track__meta">
              {s.state === 'done' ? 'Done' : s.state === 'skipped' ? 'Skipped' : s.state === 'current' ? 'Now' : 'To do'} · {s.owner}
              {s.due && s.state !== 'done' && s.state !== 'skipped' ? ` · due ${formatDate(s.due)}` : ''}
            </span>
          </li>
        ))}
      </ol>
      {current && (
        <p className="yx-stage-track__next" role="status">
          <strong>Now:</strong> {current.label} by {current.owner}
          {current.due ? `, due ${formatDate(current.due)}` : ''}. {nextStep && <><strong>Next:</strong> {nextStep}</>}
        </p>
      )}
    </div>
  );
}

/* ================================================================== 9-box */

export interface NineBoxPerson {
  id: string;
  name: string;
  performance: 1 | 2 | 3;
  potential: 1 | 2 | 3;
  /** Protected leave: not counted in any distribution (YX-PERF-21). */
  protectedLeave?: boolean;
}

export interface NineBoxProps {
  people: NineBoxPerson[];
  onMove?: (id: string, performance: number, potential: number, reason: string) => void;
  readOnly?: boolean;
  /** Stories: open the reason dialog for a pending move. */
  defaultPending?: { id: string; performance: number; potential: number };
}

/** Performance × potential grid (M06 Q5, wave 6). Drag or use "Move to"; every move asks for a reason (YX-PERF-08). */
export function NineBox({ people: initial, onMove, readOnly, defaultPending }: NineBoxProps) {
  const [people, setPeople] = useState(initial);
  const [pending, setPending] = useState<{ id: string; performance: number; potential: number } | null>(defaultPending ?? null);
  const [reason, setReason] = useState('');
  const [dragId, setDragId] = useState<string | null>(null);
  const cells: [number, number][] = [];
  for (const pot of [3, 2, 1]) for (const perf of [1, 2, 3]) cells.push([perf, pot]);
  const who = pending ? people.find((p) => p.id === pending.id) : undefined;
  const drop = (e: DragEvent, perf: number, pot: number) => {
    e.preventDefault();
    if (dragId) setPending({ id: dragId, performance: perf, potential: pot });
    setDragId(null);
  };
  return (
    <div className="yx-nine-box">
      <div className="yx-nine-box__axis-y" aria-hidden="true">
        Potential →
      </div>
      <div className="yx-nine-box__grid" role="group" aria-label="9-box: performance across, potential up">
        {[3, 2, 1].map((pot) => (
          <div key={pot} className="yx-nine-box__row">
            {[1, 2, 3].map((perf) => {
              const inCell = people.filter((p) => p.performance === perf && p.potential === pot);
              return (
                <section
                  key={perf}
                  className="yx-nine-box__cell"
                  data-perf={perf}
                  data-pot={pot}
                  aria-label={`${nineBoxLabel(perf, pot)}: ${inCell.length} people`}
                  onDragOver={readOnly ? undefined : (e) => e.preventDefault()}
                  onDrop={readOnly ? undefined : (e) => drop(e, perf, pot)}
                >
                  <div className="yx-nine-box__cell-head">
                    <span className="yx-nine-box__cell-label">{nineBoxLabel(perf, pot)}</span>
                    <span className="yx-nine-box__count">{inCell.length}</span>
                  </div>
                  <ul className="yx-nine-box__people">
                    {inCell.map((p) => (
                      <li
                        key={p.id}
                        className="yx-nine-box__chip"
                        draggable={!readOnly}
                        onDragStart={() => setDragId(p.id)}
                        data-protected={p.protectedLeave || undefined}
                      >
                        <Avatar name={p.name} size={20} />
                        <span className="yx-nine-box__name">{p.name}</span>
                        {p.protectedLeave && <Badge tone="info">Protected</Badge>}
                        {!readOnly && (
                          <Menu>
                            <MenuTrigger asChild>
                              <IconButton icon={MoreHorizontal} label={`Move ${p.name}`} size="sm" />
                            </MenuTrigger>
                            <MenuContent>
                              <MenuLabel>Move to</MenuLabel>
                              {cells
                                .filter(([a, b]) => !(a === p.performance && b === p.potential))
                                .map(([a, b]) => (
                                  <MenuItem key={`${a}-${b}`} icon={MoveRight} onSelect={() => setPending({ id: p.id, performance: a, potential: b })}>
                                    {nineBoxLabel(a, b)}
                                  </MenuItem>
                                ))}
                            </MenuContent>
                          </Menu>
                        )}
                      </li>
                    ))}
                  </ul>
                </section>
              );
            })}
          </div>
        ))}
      </div>
      <div className="yx-nine-box__axis-x" aria-hidden="true">
        Performance →
      </div>
      <ConfirmDialog
        open={pending != null}
        onOpenChange={(o) => {
          if (!o) {
            setPending(null);
            setReason('');
          }
        }}
        title={who && pending ? `Move ${who.name} to ${nineBoxLabel(pending.performance, pending.potential)}?` : 'Move person'}
        consequence="The change is recorded with the before and after position, your reason and your name."
        confirmLabel="Move with reason"
        confirmDisabled={reason.trim().length < 10}
        onConfirm={() => {
          if (!pending) return;
          setPeople((ps) => ps.map((p) => (p.id === pending.id ? { ...p, performance: pending.performance as 1 | 2 | 3, potential: pending.potential as 1 | 2 | 3 } : p)));
          onMove?.(pending.id, pending.performance, pending.potential, reason);
          setPending(null);
          setReason('');
        }}
      >
        <FormField label="Reason" required helper="At least 10 characters. Visible to HR and the calibration group, never to the employee.">
          <TextArea value={reason} onChange={setReason} rows={3} />
        </FormField>
      </ConfirmDialog>
    </div>
  );
}

/* ================================================================== eNPS scale + suppression */

/** eNPS on its −100 … +100 scale, written as a number with promoters / passives / detractors (YX-ENG-05). */
export function EnpsScale({ score, promoters, passives, detractors, previous }: { score: number | null; promoters: number; passives: number; detractors: number; previous?: number }) {
  const n = promoters + passives + detractors;
  if (score == null) return <SuppressedNotice what="eNPS" />;
  const pos = ((score + 100) / 200) * 100;
  return (
    <div className="yx-enps">
      <div className="yx-enps__figure">
        <span className="yx-enps__score">{score > 0 ? `+${score}` : score}</span>
        <Text tone="secondary">eNPS{previous != null ? ` · ${score - previous >= 0 ? 'up' : 'down'} ${Math.abs(score - previous)} from last quarter (${previous > 0 ? '+' : ''}${previous})` : ''}</Text>
      </div>
      <div className="yx-enps__track" role="meter" aria-label="eNPS" aria-valuemin={-100} aria-valuemax={100} aria-valuenow={score} aria-valuetext={`eNPS ${score}, scale −100 to +100`}>
        <span className="yx-enps__zero" aria-hidden="true" />
        <span className="yx-enps__marker" style={{ left: `${pos}%` }} aria-hidden="true" />
      </div>
      <div className="yx-enps__scale" aria-hidden="true">
        <span>−100</span>
        <span>0</span>
        <span>+100</span>
      </div>
      <dl className="yx-enps__split">
        <div>
          <dt>Promoters (9–10)</dt>
          <dd>
            {promoters} · {Math.round((promoters / n) * 100)}%
          </dd>
        </div>
        <div>
          <dt>Passives (7–8)</dt>
          <dd>
            {passives} · {Math.round((passives / n) * 100)}%
          </dd>
        </div>
        <div>
          <dt>Detractors (0–6)</dt>
          <dd>
            {detractors} · {Math.round((detractors / n) * 100)}%
          </dd>
        </div>
      </dl>
    </div>
  );
}

/** Small-group suppression message (P09 / YX-ENG-04): applies to every viewer, including HR. */
export function SuppressedNotice({ what = 'Results', min = 5, count }: { what?: string; min?: number; count?: number }) {
  return (
    <div className="yx-suppressed" role="note">
      <Icon icon={EyeOff} />
      <span>
        <strong>Not enough responses to display.</strong> {what} show only for groups of {min} or more{count != null ? ` (this group has ${count})` : ''}, so no one can be identified.
      </span>
    </div>
  );
}

/* ================================================================== QR tile */

/** Rotating QR for trainer attendance (M07 Q7). Drawn as a code-like pattern from the token; not a scannable standard QR in stories. */
export function QrTile({ sessionId, slot, tick, secondsLeft }: { sessionId: string; slot: number; tick: number; secondsLeft: number }) {
  const token = qrToken(sessionId, slot, tick);
  const N = 25;
  const cells = useMemo(() => {
    const out: [number, number][] = [];
    let h = 0;
    for (const c of token) h = (h * 31 + c.charCodeAt(0)) >>> 0;
    const finder = (x: number, y: number) => {
      for (const [fx, fy] of [[0, 0], [N - 7, 0], [0, N - 7]]) {
        const dx = x - fx;
        const dy = y - fy;
        if (dx >= 0 && dx < 7 && dy >= 0 && dy < 7) return dx === 0 || dy === 0 || dx === 6 || dy === 6 || (dx >= 2 && dx <= 4 && dy >= 2 && dy <= 4) ? 1 : 0;
      }
      return -1;
    };
    for (let y = 0; y < N; y++)
      for (let x = 0; x < N; x++) {
        const f = finder(x, y);
        if (f === 1) out.push([x, y]);
        else if (f === -1) {
          h = (Math.imul(h, 1103515245) + 12345) >>> 0;
          if ((h >>> 16) & 1) out.push([x, y]);
        }
      }
    return out;
  }, [token]);
  return (
    <figure className="yx-qr">
      <svg viewBox={`-2 -2 ${N + 4} ${N + 4}`} className="yx-qr__svg" role="img" aria-label={`Attendance code for slot ${slot}. Code ${token}.`}>
        <rect className="yx-qr__bg" x={-2} y={-2} width={N + 4} height={N + 4} />
        {cells.map(([x, y]) => (
          <rect key={`${x}-${y}`} className="yx-qr__cell" x={x} y={y} width={1} height={1} />
        ))}
      </svg>
      <figcaption className="yx-qr__caption">
        <span>
          Code <span className="yx-qr__code">{token}</span>
        </span>
        <span aria-live="polite">Changes in {secondsLeft} s</span>
      </figcaption>
    </figure>
  );
}

/* ================================================================== Skill level */

/** Level dots 1–5 with the required level marked; words always given (confirmed / pending / not assessed). */
export function SkillLevel({ level, required, max = 5, label }: { level: number | null; required?: number; max?: number; label: string }) {
  const text = level == null ? 'Not assessed' : `Level ${level} of ${max}`;
  const gapText = required != null && level != null && level < required ? `, ${required - level} below required ${required}` : required != null && level != null ? ', meets required' : '';
  return (
    <span className="yx-skill-level" role="img" aria-label={`${label}: ${text}${gapText}`}>
      {Array.from({ length: max }, (_, i) => (
        <span
          key={i}
          className="yx-skill-level__dot"
          data-filled={level != null && i < level ? '' : undefined}
          data-required={required != null && i < required && (level == null || i >= level) ? '' : undefined}
          aria-hidden="true"
        />
      ))}
      <span className="yx-skill-level__text" aria-hidden="true">
        {level == null ? 'Not assessed' : `${level}/${max}`}
        {required != null && level != null && level < required ? ` · needs ${required}` : ''}
      </span>
    </span>
  );
}

/* ================================================================== Feed post + poll */

export interface PollData {
  question: string;
  options: string[];
  votes: number[];
  /** Index voted by the viewer, if any. */
  myVote?: number | null;
  closes?: Date;
  closed?: boolean;
}

/** Poll with an instant result once the viewer votes (M09 §3). */
export function PollBlock({ poll, onVote }: { poll: PollData; onVote?: (i: number) => void }) {
  const [mine, setMine] = useState<number | null>(poll.myVote ?? null);
  const votes = poll.votes.map((v, i) => v + (mine === i && poll.myVote !== i ? 1 : 0));
  const pct = pollPercents(votes);
  const total = votes.reduce((a, v) => a + v, 0);
  const showResults = mine != null || poll.closed;
  const gid = useId();
  return (
    <div className="yx-poll" role="group" aria-labelledby={gid}>
      <p id={gid} className="yx-poll__q">
        <Icon icon={BarChart3} /> {poll.question}
      </p>
      {showResults ? (
        <ul className="yx-poll__results" aria-live="polite">
          {poll.options.map((o, i) => (
            <li key={o} className="yx-poll__result" data-mine={mine === i || undefined}>
              <span className="yx-poll__bar" style={{ width: `${pct[i]}%` }} aria-hidden="true" />
              <span className="yx-poll__opt">
                {o}
                {mine === i && ' (your vote)'}
              </span>
              <span className="yx-poll__pct">{pct[i]}%</span>
            </li>
          ))}
        </ul>
      ) : (
        <div className="yx-poll__options">
          {poll.options.map((o, i) => (
            <Button
              key={o}
              size="sm"
              onClick={() => {
                setMine(i);
                onVote?.(i);
              }}
            >
              {o}
            </Button>
          ))}
        </div>
      )}
      <Text size="sm" tone="secondary">
        {total} votes · {poll.closed ? 'Closed' : poll.closes ? `Closes ${formatDate(poll.closes)}` : 'Open'}
      </Text>
    </div>
  );
}

export type PostType = 'Announcement' | 'Update' | 'Kudos' | 'Celebration' | 'Poll' | 'Event';

export interface FeedPost {
  id: string;
  type: PostType;
  author: string;
  /** "Former employee" when the author has left (YX-ENG-09). */
  authorNote?: string;
  space: string;
  at: Date;
  body: ReactNode;
  pinned?: boolean;
  reactions: number;
  reacted?: boolean;
  comments: number;
  poll?: PollData;
  /** Kudos: value tag and receivers. */
  value?: string;
  to?: string[];
  points?: number;
  event?: { when: string; where: string; going: number };
  ack?: { required: boolean; done?: boolean; due?: Date };
  state?: 'Published' | 'Held' | 'Hidden';
}

const TYPE_TONE: Record<PostType, BadgeTone> = { Announcement: 'info', Update: 'neutral', Kudos: 'success', Celebration: 'success', Poll: 'neutral', Event: 'neutral' };

/** One feed item: author, space, type, body, poll / kudos / event block, reactions, comments, report (M09 §3). */
export function PostCard({ post, now, onAck, onReport }: { post: FeedPost; now: Date; onAck?: () => void; onReport?: () => void }) {
  const [reacted, setReacted] = useState(!!post.reacted);
  const [acked, setAcked] = useState(!!post.ack?.done);
  const mins = Math.round((now.getTime() - post.at.getTime()) / 60000);
  const when = mins < 60 ? `${mins} min ago` : mins < 60 * 24 ? `${Math.round(mins / 60)} h ago` : formatDate(post.at);
  return (
    <article className="yx-post" data-type={post.type} data-pinned={post.pinned || undefined} aria-label={`${post.type} by ${post.author}`}>
      <header className="yx-post__head">
        {post.type === 'Celebration' ? <span className="yx-post__sys" aria-hidden="true"><Icon icon={CalendarDays} /></span> : <Avatar name={post.author} size={40} />}
        <div className="yx-post__who">
          <span className="yx-post__author">
            {post.author}
            {post.authorNote && <Text tone="secondary"> · {post.authorNote}</Text>}
          </span>
          <Text size="sm" tone="secondary">
            {post.space} · {when}
          </Text>
        </div>
        {post.pinned && (
          <Badge tone="neutral">
            <Icon icon={Pin} /> Pinned
          </Badge>
        )}
        <Badge tone={TYPE_TONE[post.type]}>{post.type}</Badge>
        {onReport && (
          <Menu>
            <MenuTrigger asChild>
              <IconButton icon={MoreHorizontal} label="Post actions" size="sm" />
            </MenuTrigger>
            <MenuContent>
              <MenuItem icon={Flag} onSelect={onReport}>
                Report post
              </MenuItem>
            </MenuContent>
          </Menu>
        )}
      </header>
      {post.type === 'Kudos' && post.to && (
        <p className="yx-post__kudos">
          <strong>{post.to.join(', ')}</strong> · <Badge tone="success">{post.value}</Badge>
          {post.points ? <Text tone="secondary"> · {post.points} points</Text> : null}
        </p>
      )}
      <div className="yx-post__body">{post.body}</div>
      {post.poll && <PollBlock poll={post.poll} />}
      {post.event && (
        <p className="yx-post__event">
          <Icon icon={CalendarDays} /> {post.event.when} · {post.event.where} · {post.event.going} going
        </p>
      )}
      {post.ack?.required && (
        <div className="yx-post__ack">
          {acked ? (
            <Badge tone="success">
              <Icon icon={Check} /> You acknowledged this
            </Badge>
          ) : (
            <>
              <Text size="sm">Acknowledgement required{post.ack.due ? ` by ${formatDate(post.ack.due)}` : ''}.</Text>
              <Button
                size="sm"
                onClick={() => {
                  setAcked(true);
                  onAck?.();
                }}
              >
                Acknowledge
              </Button>
            </>
          )}
        </div>
      )}
      <footer className="yx-post__foot">
        <Button size="sm" icon={Heart} aria-pressed={reacted} onClick={() => setReacted((r) => !r)}>
          {reacted ? 'Liked' : 'Like'} · {post.reactions + (reacted && !post.reacted ? 1 : !reacted && post.reacted ? -1 : 0)}
        </Button>
        <Button size="sm" icon={MessageSquare}>
          Comment · {post.comments}
        </Button>
      </footer>
    </article>
  );
}

/* ================================================================== Manager coach card (PRF-16) */

export interface CoachNudge {
  id: string;
  person: string;
  /** Rule-computed signal the manager already has access to (YX-AST-10). */
  signal: string;
  action: string;
}

/** Weekly coach card on manager home: Act / Dismiss per nudge, opt-out link. AI only wrote the wording. */
export function CoachCard({ nudges: initial, weekOf, onAct, optedOut, onOptOut }: { nudges: CoachNudge[]; weekOf: Date; onAct?: (n: CoachNudge) => void; optedOut?: boolean; onOptOut?: () => void }) {
  const [nudges, setNudges] = useState(initial);
  const [acted, setActed] = useState<string[]>([]);
  if (optedOut)
    return (
      <section className="yx-coach" aria-label="Manager coach">
        <header className="yx-coach__head">
          <span className="yx-coach__title">Manager coach</span>
          <AiBadge />
        </header>
        <Text tone="secondary">You turned off coach nudges. Turn them on again in Me › Preferences. HR doesn’t see this choice.</Text>
      </section>
    );
  return (
    <section className="yx-coach" aria-label="Manager coach">
      <header className="yx-coach__head">
        <span className="yx-coach__title">Manager coach · week of {formatDate(weekOf)}</span>
        <AiBadge />
      </header>
      <Text size="sm" tone="secondary">
        Based only on team data you can already see. Nothing changes until you act.
      </Text>
      {nudges.length === 0 ? (
        <p className="yx-coach__empty">No nudges this week. Your 1:1s, feedback and team goals are up to date.</p>
      ) : (
        <ul className="yx-coach__list" aria-live="polite">
          {nudges.map((n) => (
            <li key={n.id} className="yx-coach__item">
              <Avatar name={n.person} size={32} />
              <div className="yx-coach__text">
                <strong>{n.person}</strong>
                <span>{n.signal}</span>
              </div>
              {acted.includes(n.id) ? (
                <Badge tone="info">Opened</Badge>
              ) : (
                <>
                  <Button
                    size="sm"
                    onClick={() => {
                      setActed((a) => [...a, n.id]);
                      onAct?.(n);
                    }}
                  >
                    {n.action}
                  </Button>
                  <IconButton icon={X} label={`Dismiss nudge about ${n.person}`} size="sm" onClick={() => setNudges((xs) => xs.filter((x) => x.id !== n.id))} />
                </>
              )}
            </li>
          ))}
        </ul>
      )}
      <Link href="#coach-optout" onClick={(e) => { e.preventDefault(); onOptOut?.(); }}>
        Turn off coach nudges
      </Link>
    </section>
  );
}

/* ================================================================== Bias flags (PRF-17) */

/** Inline bias flags: suggestions only, Accept or Ignore each; the manager's text and rating stay final (YX-AST-11). */
export function BiasFlagList({ flags, onAccept, onIgnore, decided = {} }: { flags: BiasFlag[]; onAccept?: (f: BiasFlag) => void; onIgnore?: (f: BiasFlag) => void; decided?: Record<string, 'accepted' | 'ignored'> }) {
  if (flags.length === 0)
    return (
      <InlineAlert tone="success" title="No wording to check">
        The bias check found nothing to flag in this text.
      </InlineAlert>
    );
  return (
    <ul className="yx-bias" aria-label="Wording suggestions">
      {flags.map((f) => (
        <li key={f.id} className="yx-bias__item" data-decided={decided[f.id]}>
          <Icon icon={f.kind === 'Rating and text disagree' ? CircleAlert : ShieldAlert} />
          <div className="yx-bias__text">
            <span className="yx-bias__kind">{f.kind}</span>
            <span>
              “<mark className="yx-bias__match">{f.match}</mark>” · {f.suggestion}
            </span>
          </div>
          {decided[f.id] ? (
            <Badge tone={decided[f.id] === 'accepted' ? 'success' : 'neutral'}>{decided[f.id] === 'accepted' ? 'Accepted' : 'Ignored'}</Badge>
          ) : (
            <span className="yx-bias__actions">
              <Button size="sm" onClick={() => onAccept?.(f)}>
                Accept
              </Button>
              <Button size="sm" onClick={() => onIgnore?.(f)}>
                Ignore
              </Button>
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}

/* ================================================================== Small shared bits */

/** "Confidential" marker for ratings, PIPs, comp and pools (P02 class). */
export function ConfidentialTag({ children = 'Confidential' }: { children?: ReactNode }) {
  return (
    <Badge tone="neutral">
      <Icon icon={Lock} /> {children}
    </Badge>
  );
}

/** Two-column page body with a right rail (T3 activity panel), stacking on phones. */
export function SplitLayout({ main, side, className }: { main: ReactNode; side: ReactNode; className?: string }) {
  return (
    <div className={cx('yx-growth-split', className)}>
      <div className="yx-growth-split__main">{main}</div>
      <aside className="yx-growth-split__side">{side}</aside>
    </div>
  );
}
