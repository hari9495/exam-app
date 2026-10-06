// Time kit: reusable pieces the library lacks (M02 §B1–§B5, M04 YX-MOB-05/18).
// ClockCard, AttendanceMonth + legend, DayCardBody, ShiftBar, PunchList, GeoMap, CameraFrame, TimePage, DueBadge.
import { useEffect, useId, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { Clock, Coffee, LogIn, LogOut, MapPin, RotateCw, StickyNote } from 'lucide-react';
import { DesktopFrame, EMPLOYEE_RAIL, type PanelSection } from '../_kit/frames';
import { Button, Link } from '../../components/button';
import { Badge, type BadgeTone } from '../../components/display';
import { InlineAlert, Meter } from '../../components/feedback';
import { TextArea } from '../../components/inputs';
import { formatDate } from '../../lib/format';
import {
  DAY_CODE_LABEL,
  dayWorked,
  evaluateClock,
  lateMarkNumber,
  relativeDue,
  fmt12,
  fmtDuration,
  formatDistance,
  lateMinutes,
  monthSummary,
  nextClockState,
  toHHMM,
  toMin,
  workedMinutes,
  type AttendanceDay,
  type ClockAction,
  type ClockContext,
  type ClockState,
  type DayCode,
  type Punch,
} from './time-logic';
import { AUGUST, LATE_PAYROLL, LOCATIONS, ME, NOW_MIN, OT_ROWS, SEPTEMBER, TODAY, myReports, seesEveryone, timeCounts, timeScope, type TimeUser } from './time-data';
import './time-kit.css';

/* ---------------- frame ---------------- */

export type TimeNav =
  | 'Today' | 'Muster' | 'Exceptions' | 'Roster' | 'Team leave' | 'Block leave' | 'Office days' | 'Leave calendar' | 'Requests' | 'Year-end' | 'Periods' | 'Reports'
  | 'My attendance' | 'My leave' | 'My shifts' | 'My timesheet' | 'My office days'
  | 'Shifts & patterns' | 'Leave types & policies' | 'Holiday calendars' | 'Locations & geofences' | 'Devices & kiosks';

/**
 * Time panel (APX-D §1.2) + the personal "My time" links (Me menu) + settings shortcuts (§3 group 3), by role:
 * an employee sees Today and "My time"; a manager adds the team items; HR, payroll and System Admins also get
 * Year-end, Periods and the Time settings group. Counts default to the data for the viewer (`timeCounts`).
 */
export function timePanel(active?: TimeNav, counts: Partial<Record<TimeNav, number>> = timeCounts(ME), user: TimeUser = ME): PanelSection[] {
  const item = (label: TimeNav) => ({ label, active: label === active, count: counts[label] });
  const scope = timeScope(user);
  const mine: TimeNav[] = ['My attendance', 'My leave', 'My shifts', 'My timesheet', 'My office days'];
  if (scope === 'employee') return [{ items: [item('Today')] }, { label: 'My time', items: mine.map(item) }];
  const team: TimeNav[] = ['Today', 'Muster', 'Exceptions', 'Roster', 'Team leave', 'Block leave', 'Office days', 'Leave calendar', 'Requests', ...(scope === 'admin' ? (['Year-end', 'Periods'] as TimeNav[]) : []), 'Reports'];
  return [
    { items: team.map(item) },
    // HR and payroll admins have no personal "My time" group in the Time area (they reach it from the Me menu).
    ...(seesEveryone(user) ? [] : [{ label: 'My time', items: mine.map(item) }]),
    ...(scope === 'admin' ? [{ label: 'Time settings', items: (['Shifts & patterns', 'Leave types & policies', 'Holiday calendars', 'Locations & geofences', 'Devices & kiosks'] as TimeNav[]).map(item) }] : []),
  ];
}

export interface TimePageProps {
  active?: TimeNav;
  children: ReactNode;
  /** Override the nav counts (default: from the data, scoped to `user`). */
  counts?: Partial<Record<TimeNav, number>>;
  /** Signed-in person (default ME, Divya Raghunathan). HR stories pass HR_ADMIN, payroll stories PAYROLL_ADMIN. */
  user?: TimeUser;
  /** The viewer sees every legal entity (System Admin): the top-bar entity button reads "All entities". */
  allEntities?: boolean;
}

export function TimePage({ active, children, counts, user = ME, allEntities }: TimePageProps) {
  // An employee with no reports and no admin role sees only their own areas in the app rail.
  const ownOnly = timeScope(user) === 'employee' && myReports(user.name).length === 0;
  return (
    <DesktopFrame area="time" panelTitle="Time" panel={timePanel(active, counts ?? timeCounts(user), user)} user={user} allEntities={allEntities} railItems={ownOnly ? EMPLOYEE_RAIL : undefined}>
      {children}
    </DesktopFrame>
  );
}

/**
 * Relative date badge for dates that matter (founder pattern): "in 6 days" / "tomorrow" / "2 days ago".
 * Red when overdue, amber within 7 days, neutral beyond. `prefix` reads e.g. "Expires".
 */
export function DueBadge({ date, today = TODAY, prefix }: { date: Date; today?: Date; prefix?: string }) {
  const r = relativeDue(date, today);
  return <Badge tone={r.tone}>{prefix ? `${prefix} ${r.text}` : r.text.charAt(0).toUpperCase() + r.text.slice(1)}</Badge>;
}

/* ---------------- small pieces ---------------- */

export const SOURCE_LABEL: Record<Punch['source'], string> = {
  web: 'Web',
  mobile: 'Mobile',
  biometric: 'Biometric',
  kiosk: 'Kiosk',
  teams: 'Teams presence',
  desktop: 'Desktop agent',
  field: 'Field visit',
};
const KIND_LABEL: Record<Punch['kind'], string> = { in: 'In', out: 'Out', break_start: 'Break start', break_end: 'Break end' };
/** Sources with no GPS: a fixed reader, kiosk, Teams or desktop agent gets no distance, only the site it is fixed at. */
const NO_VERDICT: Punch['source'][] = ['biometric', 'kiosk', 'teams', 'desktop'];
/** Site name from a punch's place ("Chennai office · Gate 2 reader" → "Chennai office"). */
const siteOf = (where: string) => LOCATIONS.find((l) => where.startsWith(l.name))?.name;
/** Plain verdict wording: "At Chennai office" rather than "Inside geofence" (S9). */
function verdictOf(p: Punch): { label: string; tone: BadgeTone } | null {
  const site = siteOf(p.where);
  if (NO_VERDICT.includes(p.source)) return site ? { label: `At ${site}`, tone: 'success' } : null;
  if (p.verdict === 'inside') return { label: `At ${site ?? 'the office'}${p.distanceM ? ` (${formatDistance(p.distanceM)} from centre)` : ''}`, tone: 'success' };
  if (p.verdict === 'outside') return { label: `Outside the office${p.distanceM ? ` (${formatDistance(p.distanceM)} away)` : ''}`, tone: 'danger' };
  if (p.verdict === 'network') return { label: 'Office network', tone: 'success' };
  return { label: 'Location recorded', tone: 'info' };
}
/** Place text without raw IPs (HR sees them) and with plain device wording. */
const placeText = (p: Punch, showNetwork: boolean) => {
  // "(on duty)" is already said by the day's header and the source chip.
  const where = (showNetwork ? p.where : p.where.split(' · ').filter((x) => !/^IP /.test(x)).join(' · ')).replace(/ \(on duty\)/i, '');
  // Fixed readers and kiosks are named by the place ("Reception kiosk"); their device code is for HR only.
  if (NO_VERDICT.includes(p.source)) {
    // HR sees the code in brackets after the place ("Reception kiosk (KF-MAA-K1)"), not the device type a second time.
    const code = showNetwork ? /KF-[\w-]+/.exec(p.device ?? '')?.[0] : undefined;
    return code ? `${where} (${code})` : where;
  }
  const device = p.device?.replace(' (bound)', ' · approved phone');
  return [where, device].filter(Boolean).join(' · ');
};

export function Kpis({ items }: { items: { label: string; value: ReactNode; note?: ReactNode }[] }) {
  return (
    <dl className="yx-tim-kpis">
      {items.map((k) => (
        <div key={k.label} className="yx-tim-kpis__item">
          <dt>{k.label}</dt>
          <dd>{k.value}</dd>
          {k.note && <dd className="yx-tim-kpis__note">{k.note}</dd>}
        </div>
      ))}
    </dl>
  );
}

/** Today's (or a day's) punches: in / out with source, place, distance and verdict (YX-AT-15). */
export function PunchList({ punches, showMapIndex, showNetwork = false, emptyText = 'No punches yet today.', hideSource = [] }: { punches: Punch[]; showMapIndex?: boolean; /** HR: show raw IP addresses. */ showNetwork?: boolean; emptyText?: string; /** Sources the surrounding header already names (e.g. 'field' on an on-duty day). */ hideSource?: Punch['source'][] }) {
  if (punches.length === 0) return <p className="yx-tim-muted">{emptyText}</p>;
  return (
    <ol className="yx-tim-punches" aria-label="Punches">
      {punches.map((p, i) => {
        const v = verdictOf(p);
        const place = placeText(p, showNetwork);
        // The source once per row: skip the chip when the place already says it ("Reception kiosk", "Teams presence").
        // A source the header already names still gets a chip on every row: the device it came from ("Mobile").
        const source = hideSource.includes(p.source) ? (p.device ? 'Mobile' : null) : SOURCE_LABEL[p.source];
        const showSource = !!source && !place.toLowerCase().includes(source.toLowerCase());
        return (
          <li key={p.id} className="yx-tim-punches__row" data-kind={p.kind}>
            <span className="yx-tim-punches__time">
              {showMapIndex && <span className="yx-tim-punches__pin" aria-hidden="true">{i + 1}</span>}
              <strong>{fmt12(p.time)}</strong> <span className="yx-tim-punches__kind">{KIND_LABEL[p.kind]}</span>
            </span>
            <span className="yx-tim-punches__src">
              {showSource && <Badge tone="neutral">{source}</Badge>}
              {/* Recorded offline and already synced: accepted, so neutral. */}
              {p.offline && <Badge tone="neutral">Synced later</Badge>}
            </span>
            <span className="yx-tim-punches__where">
              {/* Device codes ("KF-MAA-K1") never break at a hyphen. */}
              {place.split(' · ').map((part, j) => (
                <span key={j}>
                  {j > 0 && ' · '}
                  {part.split(/(KF-[\w-]+)/).map((bit, k) => (k % 2 ? <span key={k} className="yx-tim-nowrap">{bit}</span> : bit))}
                </span>
              ))}
            </span>
            <span className="yx-tim-punches__verdict">{v && <Badge tone={v.tone}>{v.label}</Badge>}</span>
          </li>
        );
      })}
    </ol>
  );
}

/**
 * Shift window with worked blocks and breaks (06:00–23:00 scale by default). `parts` draws a split shift as several
 * dashed blocks (07:00–11:00 and 17:00–21:00); worked time after the shift end is shaded as overtime.
 */
export function ShiftBar({ start, end, parts, punches, now, from = 6 * 60, to = 23 * 60, off }: { start: string; end: string; parts?: [string, string][]; punches: Punch[]; now?: number; from?: number; to?: number; /** Holiday or weekly off: no shift is drawn and all worked time is overtime. */ off?: boolean }) {
  const pct = (m: number) => `${Math.min(100, Math.max(0, ((m - from) / (to - from)) * 100))}%`;
  const span = ([a, b]: [string, string]) => {
    const x = toMin(a);
    let y = toMin(b);
    if (y <= x) y += 1440;
    return { a: x, b: y };
  };
  const shiftSpans = (parts?.length ? parts : [[start, end] as [string, string]]).map(span);
  const s = shiftSpans[0].a;
  const e = shiftSpans[shiftSpans.length - 1].b;
  const raw: { a: number; b: number; kind: 'work' | 'break' | 'open' }[] = [];
  const sorted = [...punches].sort((x, y) => toMin(x.time) - toMin(y.time));
  let open: { t: number; kind: 'work' | 'break' } | null = null;
  for (const p of sorted) {
    const t = toMin(p.time);
    if (p.kind === 'in' || p.kind === 'break_end') {
      if (open?.kind === 'break') raw.push({ a: open.t, b: t, kind: 'break' });
      open = { t, kind: 'work' };
    } else if (open) {
      raw.push({ a: open.t, b: t, kind: 'work' });
      open = p.kind === 'break_start' ? { t, kind: 'break' } : null;
    }
  }
  if (open && now !== undefined) raw.push({ a: open.t, b: now, kind: open.kind });
  // A past day with no check-out: an open (hatched) span from the last in to the shift end, not an empty bar.
  else if (open?.kind === 'work') raw.push({ a: open.t, b: Math.max(off ? 0 : e, open.t + 60), kind: 'open' });
  // Worked time past the shift end is overtime (30 min or more, as in overtimeMinutes): split it off so the bar explains the figure.
  // On a holiday or weekly off, every worked minute is overtime.
  const blocks: { a: number; b: number; kind: 'work' | 'break' | 'open' | 'overtime' }[] = raw.flatMap((b) =>
    b.kind === 'work' && off
      ? [{ ...b, kind: 'overtime' as const }]
      : b.kind === 'work' && b.b - e >= 30 ? [...(b.a < e ? [{ ...b, b: e }] : []), { a: Math.max(b.a, e), b: b.b, kind: 'overtime' as const }] : [b],
  );
  const hasWork = blocks.some((b) => b.kind === 'work');
  const hasBreak = blocks.some((b) => b.kind === 'break');
  const noOut = blocks.some((b) => b.kind === 'open');
  const hasOt = blocks.some((b) => b.kind === 'overtime');
  const ticks = [];
  for (let h = Math.ceil(from / 60); h <= Math.floor(to / 60); h += 3) ticks.push(h * 60);
  const said = blocks.filter((b) => b.kind === 'work' || b.kind === 'overtime').map((b) => `${b.kind === 'overtime' ? 'overtime' : 'worked'} ${fmt12(toHHMM(b.a))} to ${fmt12(toHHMM(b.b))}`);
  if (noOut) said.push(`checked in ${fmt12(toHHMM(blocks.find((b) => b.kind === 'open')!.a))}, no check-out`);
  const shiftText = off ? 'No shift' : `Shift ${shiftSpans.map((x) => `${fmt12(toHHMM(x.a))} to ${fmt12(toHHMM(x.b))}`).join(' and ')}`;
  return (
    <div className="yx-tim-shiftbar" role="img" aria-label={`${shiftText}; ${said.join(', ') || 'no time worked yet'}`}>
      <div className="yx-tim-shiftbar__track">
        {!off && shiftSpans.map((x, i) => (
          <span key={i} className="yx-tim-shiftbar__shift" style={{ left: pct(x.a), width: `calc(${pct(x.b)} - ${pct(x.a)})` }} />
        ))}
        {blocks.map((b, i) => (
          <span key={i} className="yx-tim-shiftbar__block" data-kind={b.kind} style={{ left: pct(b.a), width: `calc(${pct(b.b)} - ${pct(b.a)})` }} />
        ))}
        {now !== undefined && <span className="yx-tim-shiftbar__now" style={{ left: pct(now) }} />}
      </div>
      <div className="yx-tim-shiftbar__ticks" aria-hidden="true">
        {ticks.map((t) => (
          <span key={t} style={{ left: pct(t) }} data-edge={t <= from ? 'start' : t >= to ? 'end' : undefined} data-minor={(t / 60) % 6 !== 0 || undefined}>{fmt12(toHHMM(t)).replace(':00', '')}</span>
        ))}
      </div>
      <div className="yx-tim-shiftbar__legend" aria-hidden="true">
        {!off && <span data-kind="shift">Shift</span>}
        {/* Only the segments this bar draws. */}
        {hasWork && <span data-kind="work">Worked</span>}
        {hasBreak && <span data-kind="break">Break</span>}
        {hasOt && <span data-kind="overtime">Overtime</span>}
        {noOut && <span data-kind="open">No check-out</span>}
      </div>
    </div>
  );
}

/* ---------------- map + camera placeholders ---------------- */

export interface MapFence {
  id: string; label: string; x: number; y: number; r: number;
  /** The fence being edited: solid outline and the only one with a resize handle; the others fade back. */
  active?: boolean;
}
export interface MapPin { id: string; label: string; x: number; y: number; kind: 'you' | 'punch' | 'visit' | 'person'; accuracy?: number; tone?: 'ok' | 'bad' | 'warn' | 'field' }

/** Rough label box in drawing units (12 px type): used only to keep two fence labels from printing over each other. */
const labelBox = (text: string, x: number, y: number) => ({ x0: x - text.length * 3.2, x1: x + text.length * 3.2, y0: y - 11, y1: y + 2 });
const overlaps = (a: ReturnType<typeof labelBox>, b: ReturnType<typeof labelBox>) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;

/** Simple SVG map drawing (no tiles): grid, roads, geofence circles, pins, accuracy radius (YX-AT-23). */
export function GeoMap({ fences, pins, trail, caption: rawCaption, height = 200, editable, onRadiusChange, metresPerUnit = 5, radiusMin = 50, radiusMax = 1000 }: {
  fences: MapFence[]; pins: MapPin[]; trail?: [number, number][];
  /** Data, e.g. "Accuracy 18 m"; omit rather than describe the widget. */ caption?: string; height?: number; editable?: boolean;
  /** Editable map: drag the handle, or use the arrow keys on it, to change a fence's drawn radius (map units). */
  onRadiusChange?: (id: string, r: number) => void;
  /** Map scale and the allowed radius in metres, for the slider's spoken value and its limits. */
  metresPerUnit?: number; radiusMin?: number; radiusMax?: number;
}) {
  const clampR = (r: number) => Math.min(radiusMax / metresPerUnit, Math.max(radiusMin / metresPerUnit, r));
  const titleId = useId();
  const svgRef = useRef<SVGSVGElement>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const anyActive = fences.some((f) => f.active);
  // Labels sit above each circle; one that would print over an earlier label moves below its circle.
  const placed: ReturnType<typeof labelBox>[] = [];
  const labelY = fences.map((f) => {
    const above = f.y - f.r - 4;
    const box = labelBox(f.label, f.x, above);
    const y = placed.some((p) => overlaps(p, box)) ? f.y + f.r + 12 : above;
    placed.push(labelBox(f.label, f.x, y));
    return y;
  });
  const toSvg = (e: ReactPointerEvent) => {
    const m = svgRef.current?.getScreenCTM();
    if (!m) return null;
    const pt = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse());
    return { x: pt.x, y: pt.y };
  };
  // Callers still pass "Map preview · …": keep only the data part (S8, R6).
  const stripped = rawCaption?.replace(/^Map preview( · )?/, '');
  const caption = stripped ? stripped.charAt(0).toUpperCase() + stripped.slice(1) : undefined;
  return (
    <figure className="yx-tim-map" data-editable={editable || undefined}>
      {/*
        The 320 × 200 drawing stays whole and centred ('meet'); the background, grid and roads run far past the viewBox
        on every side, so a wide or tall frame shows more map instead of empty bands (S8).
      */}
      <svg ref={svgRef} viewBox="0 0 320 200" style={{ height }} role="img" aria-labelledby={titleId} preserveAspectRatio="xMidYMid meet">
        <title id={titleId}>
          {['Map', ...fences.map((f) => `${f.label} zone`), ...pins.map((p) => p.label)].join('; ')}
        </title>
        <rect className="yx-tim-map__bg" x="-960" y="-600" width="2240" height="1400" />
        {Array.from({ length: 57 }, (_, i) => (
          <line key={`v${i}`} className="yx-tim-map__grid" x1={-960 + i * 40} y1="-600" x2={-960 + i * 40} y2="800" />
        ))}
        {Array.from({ length: 36 }, (_, i) => (
          <line key={`h${i}`} className="yx-tim-map__grid" x1="-960" y1={-600 + i * 40} x2="1280" y2={-600 + i * 40} />
        ))}
        <path className="yx-tim-map__road" d="M-960 390 L0 150 L120 120 L200 130 L320 70 L1280 -380" />
        <path className="yx-tim-map__road" d="M50 -600 L90 0 L110 90 L120 200 L150 800" />
        {fences.map((f, i) => (
          <g key={f.id} data-active={f.active || undefined} data-muted={(anyActive && !f.active) || undefined}>
            <circle className="yx-tim-map__fence" cx={f.x} cy={f.y} r={f.r} />
            <text className="yx-tim-map__label" x={f.x} y={labelY[i]} textAnchor="middle">{f.label}</text>
            {/* One handle, on the fence being edited (or on every fence when none is marked active). */}
            {editable && (f.active || !anyActive) && !onRadiusChange && (
              <circle className="yx-tim-map__handle" cx={f.x + f.r} cy={f.y} r={4} />
            )}
            {editable && (f.active || !anyActive) && onRadiusChange && (
              // Screen readers get metres; a large invisible hit circle makes the handle usable by finger.
              <g
                className="yx-tim-map__knob"
                tabIndex={0}
                role="slider"
                aria-label={`${f.label}: radius`}
                aria-valuenow={Math.round(f.r * metresPerUnit)}
                aria-valuemin={radiusMin}
                aria-valuemax={radiusMax}
                aria-valuetext={`${Math.round(f.r * metresPerUnit)} m`}
                data-dragging={dragging === f.id || undefined}
                onKeyDown={(e: ReactKeyboardEvent) => {
                  const step = e.key === 'ArrowRight' || e.key === 'ArrowUp' ? 2 : e.key === 'ArrowLeft' || e.key === 'ArrowDown' ? -2 : 0;
                  if (!step) return;
                  e.preventDefault();
                  onRadiusChange(f.id, clampR(f.r + step));
                }}
                onPointerDown={(e: ReactPointerEvent) => { e.currentTarget.setPointerCapture?.(e.pointerId); setDragging(f.id); }}
                onPointerMove={(e: ReactPointerEvent) => {
                  if (dragging !== f.id) return;
                  const p = toSvg(e);
                  if (p) onRadiusChange(f.id, clampR(Math.round(Math.hypot(p.x - f.x, p.y - f.y))));
                }}
                onPointerUp={() => setDragging(null)}
                onPointerCancel={() => setDragging(null)}
              >
                <circle className="yx-tim-map__hit" cx={f.x + f.r} cy={f.y} r={20} />
                <circle className="yx-tim-map__handle" cx={f.x + f.r} cy={f.y} r={6} />
              </g>
            )}
          </g>
        ))}
        {trail && trail.length > 1 && <polyline className="yx-tim-map__trail" points={trail.map((p) => p.join(',')).join(' ')} />}
        {pins.map((p, i) => (
          <g key={p.id} className="yx-tim-map__pin" data-kind={p.kind} data-tone={p.tone}>
            {p.accuracy !== undefined && <circle className="yx-tim-map__accuracy" cx={p.x} cy={p.y} r={p.accuracy} />}
            <circle cx={p.x} cy={p.y} r={p.kind === 'you' ? 6 : 8} />
            {p.kind === 'you' && <text className="yx-tim-map__label" x={p.x} y={p.y - 10} textAnchor="middle">{p.label}</text>}
            {p.kind !== 'you' && (
              <text className="yx-tim-map__pinnum" x={p.x} y={p.y + 3} textAnchor="middle">{p.kind === 'person' ? p.label.slice(0, 1) : i + 1 - pins.filter((q) => q.kind === 'you').length}</text>
            )}
          </g>
        ))}
      </svg>
      {caption && (
        <figcaption className="yx-tim-map__caption">
          <MapPin size={14} aria-hidden="true" />
          <span>{caption}</span>
        </figcaption>
      )}
    </figure>
  );
}

export type CameraState = 'ready' | 'captured' | 'denied' | 'later';
/** Placeholder camera frame (no real camera): silhouette (or a square QR guide) + state text. */
export function CameraFrame({ state, stamp, subject = 'face' }: { state: CameraState; stamp?: string; /** 'qr': scanning an ID card QR, so a square guide and no face outline. 'scene': a shop or shelf photo, no face. */ subject?: 'face' | 'qr' | 'scene' }) {
  const qr = subject === 'qr';
  const scene = subject === 'scene';
  const text: Record<CameraState, string> = {
    ready: qr ? 'Camera ready · hold the QR inside the box' : scene ? 'Camera ready · point at the shop' : 'Camera ready · face the camera',
    captured: 'Photo taken',
    denied: 'Camera blocked. Allow camera in phone settings, then retry.',
    later: 'Selfie check-in is not switched on for your company.',
  };
  return (
    <figure className="yx-tim-camera" data-state={state} data-subject={subject}>
      <svg viewBox="0 0 120 120" role="img" aria-label={text[state]}>
        <rect className="yx-tim-camera__bg" x="0" y="0" width="120" height="120" rx="8" />
        {qr ? (
          <rect className="yx-tim-camera__guide" x="25" y="25" width="70" height="70" rx="6" />
        ) : scene ? (
          <>
            <rect className="yx-tim-camera__guide" x="20" y="30" width="80" height="60" rx="4" />
            <line className="yx-tim-camera__guide" x1="20" y1="50" x2="100" y2="50" />
            <line className="yx-tim-camera__guide" x1="20" y1="70" x2="100" y2="70" />
          </>
        ) : (
          <>
            <circle className="yx-tim-camera__head" cx="60" cy="48" r="20" />
            <path className="yx-tim-camera__body" d="M22 112 C26 84 44 74 60 74 C76 74 94 84 98 112 Z" />
            <rect className="yx-tim-camera__guide" x="30" y="16" width="60" height="72" rx="30" />
          </>
        )}
      </svg>
      <figcaption>{text[state]}{stamp ? ` · ${stamp}` : ''}</figcaption>
    </figure>
  );
}

/* ---------------- ClockCard ---------------- */

export interface ClockCardProps {
  /** Minutes since midnight (fixed in stories: TODAY = 9:42 am). */
  now: number;
  /** Seconds shown in the clock face; with `live` the face ticks from here. */
  seconds?: number;
  live?: boolean;
  date: Date;
  shift: { name: string; start: string; end: string; graceMin: number; opensBeforeMin: number };
  state?: ClockState;
  defaultState?: ClockState;
  onStateChange?: (s: ClockState) => void;
  punches?: Punch[];
  defaultPunches?: Punch[];
  /** Policy context for web: office network / geofence, device. */
  inside?: boolean;
  locationName?: string;
  distanceM?: number;
  mode?: 'restricted' | 'field';
  deviceApproved?: boolean;
  /** Source recorded on a new punch. */
  channel?: 'web' | 'mobile';
  /** Where a new punch is recorded, e.g. "Chennai office · IP 10.20.4.17". */
  where?: string;
  /** 'home': compact for the home dashboard, no note box or punch list. */
  variant?: 'card' | 'page' | 'home';
  defaultNoteOpen?: boolean;
  /** Called with a chosen alternative, e.g. "wfh". */
  onAlternative?: (option: string) => void;
  onRegularise?: () => void;
  /** Work mode chosen after an outside prompt (the card then allows clock-in). */
  defaultWorkMode?: 'office' | 'wfh' | 'on_duty';
}

// A break is normal, not a risk: neutral.
const STATE_TONE: Record<ClockState, BadgeTone> = { not_in: 'neutral', working: 'success', break: 'neutral', out: 'info' };

/** Web clock-in / clock-out (M02 §B1). Status, policy checks with a plain reason, punches, hours vs expected. */
export function ClockCard(p: ClockCardProps) {
  const {
    now,
    seconds = 0,
    live,
    date,
    shift,
    inside = true,
    locationName = 'Chennai office',
    distanceM,
    mode = 'restricted',
    deviceApproved = true,
    channel = 'web',
    where = 'Chennai office · IP 10.20.4.17',
    variant = 'card',
    defaultNoteOpen = false,
    onAlternative,
    onRegularise,
    defaultWorkMode = 'office',
  } = p;
  const [stateInner, setStateInner] = useState<ClockState>(p.defaultState ?? 'not_in');
  const state = p.state ?? stateInner;
  const [punchesInner, setPunchesInner] = useState<Punch[]>(p.defaultPunches ?? []);
  const punches = p.punches ?? punchesInner;
  const [noteOpen, setNoteOpen] = useState(defaultNoteOpen);
  const [note, setNote] = useState('');
  const [workMode, setWorkMode] = useState(defaultWorkMode);
  const [tick, setTick] = useState(0);
  const [announce, setAnnounce] = useState('');
  const [rechecked, setRechecked] = useState('');
  const [hrAsked, setHrAsked] = useState(false);

  useEffect(() => {
    if (!live) return;
    const t = window.setInterval(() => setTick((x) => x + 1), 1000);
    return () => window.clearInterval(t);
  }, [live]);

  const totalSec = now * 60 + seconds + tick;
  const nowMin = Math.floor(totalSec / 60);
  const h = Math.floor(nowMin / 60) % 24;
  const face = `${h % 12 === 0 ? 12 : h % 12}:${String(nowMin % 60).padStart(2, '0')}`;
  const secText = String(totalSec % 60).padStart(2, '0');

  const outAt = [...punches].reverse().find((x) => x.kind === 'out')?.time;
  const ctx: ClockContext = {
    state,
    now: nowMin,
    shift,
    inside: inside || workMode !== 'office',
    locationName,
    distanceM,
    mode: workMode === 'office' ? mode : 'field',
    deviceApproved,
    outAt,
  };
  const { actions, block } = evaluateClock(ctx);

  const firstIn = punches.find((x) => x.kind === 'in')?.time;
  const lastBreak = [...punches].reverse().find((x) => x.kind === 'break_start')?.time;
  // A finished day uses the same rule as the day card: the break taken, or 30 min unpaid above 5 h when none was taken.
  const worked = (state === 'out' ? dayWorked(punches)?.worked : undefined) ?? workedMinutes(punches, state === 'working' ? nowMin : undefined);
  const expected = toMin(shift.end) - toMin(shift.start) - 30;
  const short = state === 'out' ? expected - worked : 0;
  const late = firstIn ? lateMinutes(shift.start, firstIn, shift.graceMin) : 0;
  const early = state === 'out' && outAt && toMin(outAt) < toMin(shift.end) - shift.graceMin ? toMin(shift.end) - toMin(outAt) : 0;
  // Not in yet and past grace: say so before the punch, not after (same rule as the day card's late minutes).
  const lateIfNow = state === 'not_in' && nowMin < toMin(shift.end) ? lateMinutes(shift.start, toHHMM(nowMin), shift.graceMin) : 0;
  // Which late mark a clock-in now would be (3 a month are free).
  const sameMonth = ({ date: d }: AttendanceDay) => d.getMonth() === date.getMonth() && d.getFullYear() === date.getFullYear() && d.getDate() < date.getDate();
  const nextMark = SEPTEMBER.filter((d) => sameMonth(d) && (d.lateMin ?? 0) > 0).length + 1;
  const markNote = nextMark === 3 ? ' · last free late mark' : nextMark > 3 ? ' · late penalty applies' : '';
  // WFH / on-duty days already used this month (limit 4 each).
  const usedOf = (code: DayCode) => SEPTEMBER.filter((d) => sameMonth(d) && d.code === code).length;
  const nextPunch = state === 'not_in' ? 'clock-in' : state === 'break' ? 'break end' : 'clock-out';
  const web = channel === 'web';
  const blockTitle = !block ? '' : web && block.code === 'outside' ? `Not on ${locationName} Wi-Fi` : web && block.code === 'device' ? "This computer isn't approved for clock-in" : block.title;

  const status =
    state === 'not_in'
      ? 'Not clocked in'
      : state === 'working'
        ? `Working since ${fmt12(firstIn ?? '09:30')}`
        : state === 'break'
          ? `On break since ${fmt12(lastBreak ?? toHHMM(nowMin))}`
          : `Clocked out at ${fmt12(outAt ?? shift.end)}`;

  const act = (a: ClockAction) => {
    const kind: Punch['kind'] = a === 'clock_in' ? 'in' : a === 'clock_out' ? 'out' : a === 'start_break' ? 'break_start' : 'break_end';
    const next = nextClockState(state, a);
    const punch: Punch = {
      id: `n${punches.length + 1}`,
      kind,
      time: toHHMM(nowMin),
      source: channel,
      where: workMode === 'wfh' ? 'Work from home (recorded, not restricted)' : workMode === 'on_duty' ? 'On duty (recorded, not restricted)' : where,
      verdict: workMode === 'office' ? (channel === 'web' ? 'network' : 'inside') : 'field',
    };
    if (!p.punches) setPunchesInner([...punches, punch]);
    if (!p.state) setStateInner(next);
    p.onStateChange?.(next);
    setAnnounce(`${KIND_LABEL[kind]} recorded at ${fmt12(punch.time)}${note ? ' with a note' : ''}.`);
    setNote('');
  };

  const primary: ClockAction | null = actions.includes('clock_in') ? 'clock_in' : actions.includes('clock_out') ? 'clock_out' : null;
  const breakAct: ClockAction | null = actions.includes('start_break') ? 'start_break' : actions.includes('end_break') ? 'end_break' : null;
  // A note attaches to a punch, so it is offered once today has one.
  const canNote = variant !== 'home' && punches.length > 0 && (primary !== null || breakAct !== null);
  const statusId = useId();

  return (
    <section className="yx-tim-clock" data-variant={variant} data-state={state} aria-labelledby={statusId}>
      <div className="yx-tim-clock__top">
        <div className="yx-tim-clock__face">
          <p className="yx-tim-clock__time">
            <span className="yx-tim-sr">Time now {fmt12(toHHMM(nowMin))}</span>
            <span aria-hidden="true">
              {face}
              <span className="yx-tim-clock__sec">:{secText}</span>
              <span className="yx-tim-clock__ampm">{h < 12 ? 'am' : 'pm'}</span>
            </span>
          </p>
          <p className="yx-tim-muted">{date.toLocaleDateString('en-IN', { weekday: 'long' })}, {formatDate(date)}</p>
        </div>
        <div className="yx-tim-clock__status">
          <Badge tone={STATE_TONE[state]} id={statusId}>{status}</Badge>
          <p className="yx-tim-clock__shift">
            <Clock size={16} aria-hidden="true" /> {shift.name} shift · {fmt12(shift.start)} – {fmt12(shift.end)}
          </p>
          <div className="yx-tim-clock__flags">
            {late > 0 && <Badge tone="warning">Late by {late} min</Badge>}
            {lateIfNow > 0 && <Badge tone="warning">Late by {lateIfNow} min if you clock in now{markNote}</Badge>}
            {firstIn && late === 0 && <Badge tone="success">On time</Badge>}
            {early > 0 && <Badge tone="warning">Left early by {fmtDuration(early)}</Badge>}
            {workMode === 'wfh' && <Badge tone="info">Work from home</Badge>}
            {workMode === 'on_duty' && <Badge tone="info">On duty</Badge>}
          </div>
          {workMode !== 'office' && state === 'not_in' && (
            <p className="yx-tim-row">
              <span className="yx-tim-muted">
                {workMode === 'wfh' ? 'WFH' : 'On duty'} · needs {ME.manager}'s approval · {usedOf(workMode === 'wfh' ? 'WFH' : 'OD')} of 4 used this month
              </span>
              <Button size="sm" onClick={() => setWorkMode('office')}>Change</Button>
            </p>
          )}
        </div>
      </div>

      <Meter
        label="Hours worked today"
        value={Math.min(worked, expected)}
        max={expected}
        // Hours against the day are information, not risk: the bar never turns amber or red.
        warnAt={Infinity}
        dangerAt={Infinity}
        valueText={`${fmtDuration(worked)} of ${fmtDuration(expected)} expected`}
      />
      {/* A few minutes short is normal; a bigger gap gets a plain reason, still neutral. */}
      {short > 10 && <p className="yx-tim-muted">{fmtDuration(short)} short of the expected hours</p>}

      {block && (
        <InlineAlert tone={block.code === 'already_out' ? 'info' : block.code === 'not_started' ? 'info' : 'warning'} title={blockTitle}>
          <p className="yx-tim-clock__reason">{block.message}</p>
          {block.options.length > 0 && (
            <div className="yx-tim-row">
              {block.options.includes('wfh') && (
                <Button size="sm" onClick={() => { setWorkMode('wfh'); onAlternative?.('wfh'); }}>Clock in as WFH</Button>
              )}
              {block.options.includes('on_duty') && (
                <Button size="sm" onClick={() => { setWorkMode('on_duty'); onAlternative?.('on_duty'); }}>Clock in on duty</Button>
              )}
              {block.options.includes('retry') && (
                <Button size="sm" icon={RotateCw} onClick={() => { setRechecked(fmt12(toHHMM(nowMin))); onAlternative?.('retry'); }}>{web && block.code === 'outside' ? 'Check again' : 'Retry location'}</Button>
              )}
              {block.options.includes('ask_hr') && (
                <Button size="sm" disabled={hrAsked} onClick={() => { setHrAsked(true); onAlternative?.('ask_hr'); }}>{hrAsked ? 'Requested' : 'Ask HR to approve'}</Button>
              )}
              {/* The check re-runs against the same policy: still blocked, so say so with the time it ran. */}
              {rechecked && block.options.includes('retry') && <span className="yx-tim-muted">{block.code === 'coarse' ? 'Location still not accurate enough' : web ? `Still not on ${locationName} Wi-Fi` : `Still outside ${locationName}`} · checked {rechecked}</span>}
              {hrAsked && block.options.includes('ask_hr') && <span className="yx-tim-muted">Request sent to HR · {web ? 'this computer' : 'this phone'}</span>}
              {block.options.includes('regularise') && <Button size="sm" onClick={onRegularise}>Regularise today</Button>}
            </div>
          )}
          {block.code === 'outside' && <p className="yx-tim-note">WFH and on-duty days count towards your monthly limits (4 each). Your manager approves them.</p>}
        </InlineAlert>
      )}

      <div className="yx-tim-clock__actions">
        {state === 'not_in' && (
          <Button variant="primary" size="lg" icon={LogIn} disabled={!primary} onClick={() => primary && act(primary)}>Clock in</Button>
        )}
        {(state === 'working' || state === 'break') && (
          <Button variant="primary" size={variant === 'home' ? 'md' : 'lg'} icon={LogOut} disabled={primary !== 'clock_out'} onClick={() => act('clock_out')}>Clock out</Button>
        )}
        {(state === 'working' || state === 'break') && (
          <Button size={variant === 'home' ? 'md' : 'lg'} icon={Coffee} disabled={!breakAct} onClick={() => breakAct && act(breakAct)}>{state === 'break' ? 'End break' : 'Start break'}</Button>
        )}
        {state === 'out' && <Button size="lg" icon={LogIn} disabled>Clock in</Button>}
        {/* A note goes with the next punch, so it is offered only while a punch can be made (R2: bordered button). */}
        {canNote && !noteOpen && <Button size="lg" icon={StickyNote} onClick={() => setNoteOpen(true)}>{note ? 'Edit note' : 'Add note'}</Button>}
        {state === 'break' && primary !== 'clock_out' && <span className="yx-tim-muted">End your break to clock out</span>}
      </div>

      {canNote && noteOpen && (
        <div className="yx-tim-clock__note">
          <label>
            <span>Note for your next punch ({nextPunch})</span>
            <TextArea value={note} onChange={setNote} rows={2} maxLength={200} placeholder="For example: client call ran late" />
          </label>
          <span className="yx-tim-row">
            <Button size="sm" disabled={!note.trim()} onClick={() => setNoteOpen(false)}>Save</Button>
            <Button size="sm" onClick={() => { setNote(''); setNoteOpen(false); }}>Cancel</Button>
            {!note.trim() && <span className="yx-tim-muted">Type a note</span>}
          </span>
        </div>
      )}
      {canNote && !noteOpen && note && <p className="yx-tim-muted">Note saved for your {nextPunch}</p>}

      <div role="status" aria-live="polite" className="yx-tim-sr">{announce}</div>

      {variant !== 'home' && <div className="yx-tim-clock__punches">
        <h3 className="yx-tim-h3">Today's punches</h3>
        <PunchList punches={punches} />
      </div>}

      <div className="yx-tim-clock__foot">
        {variant === 'home' && <Link href="#attendance">Today's punches ({punches.length})</Link>}
        {/*
          Only when there is something to fix: a punch today or the shift has started. Not when clocked out (the alert
          offers "Regularise today"), nor when the alert already gives the next step (device, outside, not started).
        */}
        {state !== 'out' && (punches.length > 0 || nowMin >= toMin(shift.start)) && !block && <Button size="sm" onClick={onRegularise}>Regularise</Button>}
        {variant === 'page' && state === 'not_in' && <span className="yx-tim-muted">Grace {shift.graceMin} min · clock-in opens {fmt12(toHHMM(toMin(shift.start) - shift.opensBeforeMin))}</span>}
      </div>
    </section>
  );
}

/* ---------------- attendance month ---------------- */

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const CODE_TEXT: Partial<Record<DayCode, string>> = { FUT: '', TODAY: 'Today' };
export const codeText = (c: DayCode) => CODE_TEXT[c] ?? c;
/** Short duration for a month cell, one line even in a narrow cell: "45 min", "1 h", "1h45". */
const cellDuration = (m: number) => (m < 60 ? `${m} min` : m % 60 ? `${Math.floor(m / 60)}h${String(m % 60).padStart(2, '0')}` : `${m / 60} h`);

/** Month grid with a status per day as text code + colour; each day opens the day card. */
export function AttendanceMonth({
  month,
  days,
  selected,
  onDayClick,
  compact,
}: {
  month: Date;
  days: AttendanceDay[];
  selected?: Date | null;
  onDayClick?: (d: AttendanceDay) => void;
  compact?: boolean;
}) {
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const lead = (first.getDay() + 6) % 7;
  const cells: (AttendanceDay | null)[] = [...Array.from({ length: lead }, () => null), ...days];
  while (cells.length % 7) cells.push(null);
  const monthName = month.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
  return (
    <div className="yx-tim-month" data-compact={compact || undefined}>
      <table className="yx-tim-month__table" aria-label={`Attendance, ${monthName}`}>
        <thead>
          <tr>
            {WEEKDAYS.map((w) => (
              <th key={w} scope="col">
                {compact ? w.slice(0, 1) :<><span className="yx-tim-month__wd">{w}</span><span className="yx-tim-month__wd1" aria-hidden="true">{w.slice(0, 1)}</span></>}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: cells.length / 7 }, (_, r) => (
            <tr key={r}>
              {cells.slice(r * 7, r * 7 + 7).map((c, i) => (
                <td key={i}>
                  {c && (
                    <button
                      type="button"
                      className="yx-tim-month__day"
                      data-code={c.code}
                      aria-pressed={selected ? c.date.getDate() === selected.getDate() : undefined}
                      aria-label={`${formatDate(c.date)}: ${DAY_CODE_LABEL[c.code]}${c.lateMin ? `, late by ${c.lateMin} minutes` : ''}${c.otMin ? `, ${c.otStatus === 'comp-off' ? 'taken as comp-off' : 'overtime'} ${fmtDuration(c.otMin)}` : ''}${c.note ? `, ${c.note}` : ''}`}
                      onClick={() => onDayClick?.(c)}
                      disabled={c.code === 'FUT'}
                    >
                      <span className="yx-tim-month__num">{c.date.getDate()}</span>
                      <span className="yx-tim-month__code">{codeText(c.code)}</span>
                      {/* Hidden on phones (the legend and KPIs carry them). Overtime taken as comp-off says so. */}
                      {!compact && (c.otMin ?? 0) > 0 && <span className="yx-tim-month__mark" aria-hidden="true" title={c.otStatus === 'comp-off' ? `Comp-off ${cellDuration(c.otMin!)}` : `+${cellDuration(c.otMin!)} OT`}>{c.otStatus === 'comp-off' ? `Comp-off ${cellDuration(c.otMin!)}` : `+${cellDuration(c.otMin!)} OT`}</span>}
                      {!compact && (c.lateMin ?? 0) > 0 && <span className="yx-tim-month__mark" aria-hidden="true">{c.lateMin} min late</span>}
                    </button>
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const LEGEND_ORDER: DayCode[] = ['P', 'L', 'HD', 'A', 'LOP', 'CL', 'EL', 'SL', 'H', 'WO', 'WFH', 'OD', 'R', 'MP'];

/** Legend with counts per code and the month totals. */
export function AttendanceLegend({ days, onFixDay, locked }: { days: AttendanceDay[]; /** Opens the fix (regularise) flow for a day that needs it. */ onFixDay?: (d: AttendanceDay) => void; /** Locked (paid) month: nothing left to fix, so "Days to fix" is not shown. */ locked?: boolean }) {
  const s = monthSummary(days);
  const short = (d: AttendanceDay) => formatDate(d.date).replace(/^0/, '').replace(/ \d{4}$/, '');
  // Today's late check-in is a late mark too (the "Late days" KPI counts it), though its cell reads "Today".
  const legendCount = (c: DayCode) => (s.counts[c] ?? 0) + (c === 'L' ? days.filter((d) => d.code === 'TODAY' && (d.lateMin ?? 0) > 0).length : 0);
  return (
    <div className="yx-tim-legend">
      <Kpis
        items={[
          { label: 'Days present', value: s.present, note: 'incl. WFH, on duty, half days' },
          { label: 'Leave days', value: s.leave },
          { label: 'Unpaid leave days', value: s.lop },
          // An absence in an open month can still be fixed: not unpaid until the month locks.
          ...(s.absent ? [{ label: 'Absent', value: s.absent, note: 'not fixed yet' }] : []),
          { label: 'Late days', value: s.lateMarks, note: '3 allowed a month' },
          { label: 'Overtime', value: s.otMin ? fmtDuration(s.otMin) : 'None', note: 'approved only' },
          ...(s.compOffMin ? [{ label: 'Taken as comp-off', value: fmtDuration(s.compOffMin), note: 'overtime not paid' }] : []),
          ...(locked ? [] : [{
            label: 'Days to fix',
            value: s.toFix.length,
            // The fix buttons sit in this KPI, so they read as its action (not the next one's).
            note: s.toFix.length ? (
              onFixDay ? (
                <span className="yx-tim-row">
                  {s.toFix.map((d) => <Button key={d.date.getTime()} size="sm" onClick={() => onFixDay(d)}>Fix {short(d)}</Button>)}
                </span>
              ) : s.toFix.map(short).join(', ')
            ) : undefined,
          }]),
          ...(s.waiting ? [{ label: 'Waiting for approval', value: s.waiting, note: `${s.waiting === 1 ? 'request' : 'requests'} sent` }] : []),
        ]}
      />
      <ul className="yx-tim-legend__list" aria-label="Legend">
        {/* Only codes that occur this month; a row of zeros adds nothing. */}
        {LEGEND_ORDER.filter((c) => legendCount(c) > 0).map((c) => (
          <li key={c}>
            <span className="yx-tim-legend__chip" data-code={c}>{c}</span> {DAY_CODE_LABEL[c]} <span className="yx-tim-muted">{legendCount(c)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ---------------- day card (TIM-03) ---------------- */

/** The zone drawn on a day's map: the site the punches name (LOCATIONS), or none for home / field punches. */
function dayFence(punches: Punch[]) {
  const site = punches.map((p) => siteOf(p.where)).find(Boolean);
  return LOCATIONS.find((l) => l.name === site);
}

export interface DayCardBodyProps {
  day: AttendanceDay;
  punches: Punch[];
  shift: { name: string; start: string; end: string; graceMin: number };
  locked?: boolean;
  viewer?: 'emp' | 'mgr' | 'hr';
  /** Whose day this is (default ME.name). Manager and HR stories should show a report's day. */
  person?: string;
  /** Who approves a pending regularisation (default: ME.manager for Divya's own days, else ME.name). */
  approver?: string;
  /** The month's days, for "Late mark 2 of 3" (default: the story months, August and September 2026). */
  monthDays?: AttendanceDay[];
  /** Employee: fix the day (or raise a late request); manager: nudge; HR: resolve with a reason. */
  onFix?: () => void;
  /** HR: remind the employee. */
  onRemind?: () => void;
  /** Pending regularisation: open it (employee "View request", manager / HR "Review request"). */
  onViewRequest?: () => void;
  /** Pending regularisation: the employee withdraws it. */
  onWithdraw?: () => void;
  /** Manager / HR: approve pending overtime (green "Approve overtime"). */
  onReviewOvertime?: () => void;
  /** Manager / HR: reject pending overtime; the "Reject" button shows only when this is passed. */
  onRejectOvertime?: () => void;
  /** Manager / HR, holiday or weekly-off overtime: credit comp-off instead of pay; "Give comp-off" shows only when passed. */
  onCompOff?: () => void;
  /**
   * What was just done on this card, so it stops offering the same action: overtime approved, rejected or given as
   * comp-off; the request withdrawn; the exception resolved. Set it after the confirm step succeeds.
   */
  outcome?: { ot?: 'approved' | 'rejected' | 'comp-off'; request?: 'withdrawn'; exception?: 'resolved' };
}

/**
 * The payroll a late request lands in. The current month's run is about to freeze (September freezes 30 Sep) and a late
 * request also needs HR, so it goes to the next month's run: October in the story world. One source for every screen.
 */
export const latePayrollMonth = (today?: Date) => (today ? new Date(today.getFullYear(), today.getMonth() + 1, 1).toLocaleDateString('en-IN', { month: 'long' }) : LATE_PAYROLL);
/** "21 Aug" (no leading zero, no year). */
const shortDate = (d: Date) => formatDate(d).replace(/^0/, '').replace(/ \d{4}$/, '');

/** Legal overtime limit a quarter (the OT review screen, TIM-09, flags rows over it). */
const OT_QUARTER_LIMIT = 75;
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export function DayCardBody({
  day,
  punches,
  shift,
  locked,
  viewer = 'emp',
  person = ME.name,
  approver,
  monthDays,
  onFix,
  onRemind,
  onViewRequest,
  onWithdraw,
  onReviewOvertime,
  onRejectOvertime,
  onCompOff,
  outcome = {},
}: DayCardBodyProps) {
  const monthLong = day.date.toLocaleDateString('en-IN', { month: 'long' });
  const monthYear = day.date.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
  const openPayroll = latePayrollMonth();
  const first = person.split(' ')[0];
  const own = person === ME.name;
  const waitingOn = approver ?? (own ? ME.manager : ME.name);

  // Only a missing punch or an absence needs fixing; a late day with both punches has nothing to fix.
  const resolved = outcome.exception === 'resolved';
  const withdrawn = day.code === 'R' && outcome.request === 'withdrawn';
  // HR resolved a missing check-out: the shift end counts as the out time (as the muster does).
  const outCounted = resolved && punches.length > 0 && !punches.some((p) => p.kind === 'out');
  const dayPunches: Punch[] = outCounted ? [...punches, { ...punches[punches.length - 1], id: 'hr-out', kind: 'out', time: shift.end, offline: false }] : punches;
  // Worked time comes from the punches; with no check-out it is not known (S4). The alert says why, so no note here.
  const dw = dayWorked(dayPunches);
  const open = dayPunches.length > 0 && !dw;
  const workedKpi = open
    ? { label: 'Worked', value: 'Not known' }
    : dw
      ? { label: 'Worked', value: fmtDuration(dw.worked), note: outCounted ? `out set to ${fmt12(shift.end)} by HR` : dw.punchedBreak ? `${fmtDuration(dw.breakMin)} break punched` : dw.breakMin ? `${dw.breakMin} min break deducted (over 5 h)` : undefined }
      : { label: 'Worked', value: day.workedMin ? fmtDuration(day.workedMin) : '—' };
  // Overtime just decided on this card wins over the stored status.
  const otStatus = outcome.ot ?? day.otStatus;
  const otPending = !!day.otMin && otStatus !== 'approved' && otStatus !== 'comp-off' && otStatus !== 'rejected';
  // No punches and no recorded hours: late and overtime are not known, not "No" / "None".
  const noData = punches.length === 0 && !day.workedMin;
  // A holiday or weekly off has no shift: no late mark, and every worked minute is overtime.
  const offDay = day.code === 'H' || day.code === 'WO';
  const otState = otPending ? 'pending approval' : otStatus === 'comp-off' ? 'taken as comp-off' : otStatus === 'rejected' ? 'rejected, not paid' : 'approved';
  const otValue = open || noData ? '—' : day.otMin ? `${fmtDuration(day.otMin)} · ${otState}` : 'None';
  const lateValue = noData || offDay ? '—' : day.lateMin ? `${day.lateMin} min` : 'No';
  // The OT review row for this day (category, pre-approval, quarter hours): the facts the approve decision needs.
  const otRow = OT_ROWS.find((r) => r.person === person && r.date.toDateString() === day.date.toDateString());

  const needsFix = (day.code === 'MP' || day.code === 'A') && !resolved;
  // In a locked month, an unpaid or missing day can still change, through a late request.
  const canLate = locked && !resolved && (day.code === 'MP' || day.code === 'A' || day.code === 'LOP');
  const lateN = day.lateMin ? lateMarkNumber(day, monthDays ?? [...AUGUST, ...SEPTEMBER]) : 0;

  const fence = dayFence(punches);
  const allField = punches.length > 0 && punches.every((p) => p.verdict === 'field');
  const insideN = punches.filter((p) => p.verdict === 'inside' || p.verdict === 'network').length;
  const caption = !fence
    ? 'No office zone · location recorded, not restricted'
    : allField
      ? `${fence.name} · ${DAY_CODE_LABEL[day.code].toLowerCase()}, location recorded`
      : `${fence.name} · ${insideN} of ${plural(punches.length, 'punch', 'punches')} inside the ${formatDistance(fence.radiusM)} zone`;
  // Map scale: the zone circle is FENCE_R px for fence.radiusM metres. Outside pins sit at their real distance
  // (up and to the right), clamped inside the drawing.
  const FENCE_R = 34;
  const outsideAt = (m: number) => {
    const d = Math.min(fence ? (FENCE_R * m) / fence.radiusM : 80, 150);
    return { x: Math.min(150 + d * 0.87, 308), y: Math.max(104 - d * 0.5, 12) };
  };
  const pins: MapPin[] = punches.map((p, i) => ({
    id: p.id,
    label: `${KIND_LABEL[p.kind]} ${fmt12(p.time)}`,
    ...(p.verdict === 'outside' ? outsideAt(p.distanceM ?? 0) : { x: 150 + i * 14, y: 104 - i * 6 }),
    kind: 'punch',
    tone: p.verdict === 'outside' ? 'bad' : p.verdict === 'field' ? 'field' : 'ok',
  }));

  const fixButtons =
    viewer === 'hr' ? (
      <>
        <Button variant="primary" onClick={onFix}>Resolve with reason</Button>
        <Button onClick={onRemind}>Remind employee</Button>
      </>
    ) : viewer === 'mgr' ? (
      <Button variant="primary" onClick={onFix}>Nudge to fix</Button>
    ) : (
      <Button variant="primary" onClick={onFix}>{locked ? `Raise late request for ${shortDate(day.date)}` : 'Fix this day'}</Button>
    );
  // A pending request's note ("Request sent 23 Sep: out was …"): the sent date goes on the request line below, the reason stays up top.
  const sentOn = day.code === 'R' ? /sent (\d{1,2} \w{3})/.exec(day.note ?? '')?.[1] : undefined;
  const reasonText = sentOn ? day.note?.replace(/^.*?sent \d{1,2} \w{3}:?\s*/, '') : day.note;
  const headerNote = reasonText ? reasonText.charAt(0).toUpperCase() + reasonText.slice(1) : undefined;
  // Alert title "Missing check-out · checked in 9:31 am": the label already says what is missing, so the note drops ", no check-out".
  const alertNote = day.note?.replace(/,? no check-(in|out)\.?$/i, '').replace(/^./, (c) => c.toLowerCase());
  // After HR resolves or the request is withdrawn, the header shows the day as it now stands (the code the muster uses).
  const headCode: DayCode = resolved || withdrawn ? 'P' : day.code;
  // "Request sent 23 Sep": how long it has waited; amber once past the approval time.
  const sentDate = sentOn ? new Date(day.date.getFullYear(), ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'].indexOf(sentOn.split(' ')[1]), Number(sentOn.split(' ')[0])) : undefined;
  const sentAge = sentDate ? relativeDue(sentDate, TODAY) : undefined;
  const fixAsk =
    viewer === 'hr' ? 'Resolve it with a reason, or remind the employee.' : viewer === 'mgr' ? `Ask ${first} to regularise it.` : day.code === 'A' ? 'Apply leave for it or regularise it.' : 'Regularise it with your actual out time.';

  return (
    <div className="yx-tim-stack">
      {/* The red alert already names a missing punch, so the header line is skipped then (one message, once). */}
      {!(needsFix && !locked) && (
        <div className="yx-tim-row">
          <span className="yx-tim-legend__chip" data-code={headCode}>{codeText(headCode)}</span>
          <strong>{DAY_CODE_LABEL[headCode]}</strong>
          {resolved ? <Badge tone="success">Resolved by HR</Badge> : headerNote && <span className="yx-tim-muted yx-tim-daynote">{headerNote}</span>}
        </div>
      )}
      {locked && (
        <InlineAlert tone="info" title={`${monthYear} is locked`}>
          <p>
            {viewer === 'hr' ? 'Changes to this day go as a late request.' : 'Changes to this day go as a late request, which HR also approves.'} The effect lands in the {openPayroll} payroll.
          </p>
          {canLate && <div className="yx-tim-row">{fixButtons}</div>}
        </InlineAlert>
      )}
      {needsFix && !locked && (
        <InlineAlert tone="danger" title={alertNote ? `${DAY_CODE_LABEL[day.code]} · ${alertNote}` : DAY_CODE_LABEL[day.code]}>
          <p>Payroll for {monthLong} can't be approved until this day is fixed. {fixAsk}</p>
          <div className="yx-tim-row">{fixButtons}</div>
        </InlineAlert>
      )}
      <Kpis
        items={[
          { label: 'Shift', value: offDay ? `None (${DAY_CODE_LABEL[day.code].toLowerCase()})` : `${shift.name} · ${fmt12(shift.start)} – ${fmt12(shift.end)}` },
          workedKpi,
          { label: 'Late', value: lateValue },
          { label: 'Overtime', value: otValue },
        ]}
      />
      {punches.length > 0 && (
        <>
          <ShiftBar start={shift.start} end={shift.end} punches={dayPunches}now={day.code === 'TODAY' ? NOW_MIN : undefined} off={offDay} />
          <GeoMap fences={fence ? [{ id: fence.id, label: `${fence.name} · ${formatDistance(fence.radiusM)}`, x: 150, y: 104, r: FENCE_R }] : []} pins={pins} caption={caption} height={170} />
        </>
      )}
      {/* On an on-duty day the header says "On duty", so field punches don't repeat it as a chip. */}
      <PunchList punches={punches} showMapIndex showNetwork={viewer === 'hr'} emptyText="No punches on this day." hideSource={day.code === 'OD' ? ['field'] : []} />
      {lateN > 0 && (
        <p className="yx-tim-note">
          {lateN <= 3 ? `Late mark ${lateN} of 3 free this month, so no penalty.` : `Late mark ${lateN} this month: over the 3 free, so a late penalty posts.`}
        </p>
      )}
      {/* Withdrawn: the success alert already says so; offer the next step instead of repeating it. */}
      {withdrawn && viewer === 'emp' && onFix && <div className="yx-tim-row"><Button size="sm" onClick={onFix}>Regularise again</Button></div>}
      {day.code === 'R' && !withdrawn && (
        <div className="yx-tim-row">
          {/* The header already says it is a regularisation; this one line says when it went and who has it. */}
          <span className="yx-tim-muted">{sentOn ? `Request sent ${sentOn} · waiting for ${waitingOn}` : `Waiting for ${waitingOn}`}</span>
          {/* Neutral while within the 3-day approval time, amber after. ponytail: fixed 3 days, read the policy's SLA when one exists. */}
          {sentAge && sentAge.days < 0 && <Badge tone={sentAge.days < -3 ? 'warning' : 'neutral'}>{sentAge.text.charAt(0).toUpperCase() + sentAge.text.slice(1)}</Badge>}
          {/* The buttons wrap together, never one alone. */}
          <span className="yx-tim-row">
            {viewer === 'emp' ? (
              <>
                <Button size="sm" onClick={onViewRequest}>View request</Button>
                <Button size="sm" onClick={onWithdraw}>Withdraw</Button>
              </>
            ) : (
              <Button size="sm" variant="review" onClick={onViewRequest}>Review request</Button>
            )}
          </span>
        </div>
      )}
      {otPending && !open && viewer !== 'emp' && (
        <div className="yx-tim-stack">
          {/* The facts the decision needs, beside the buttons. */}
          {otRow && (
            <p className="yx-tim-muted">
              {/* The header already names a holiday or weekly off; the quarter hours are read against the 75 h legal limit (TIM-09). */}
              {[...(offDay ? [] : [otRow.category === 'Normal' ? 'After shift' : otRow.category]), otRow.preApproved ? 'pre-approved' : 'not pre-approved', `${otRow.quarterHours} of ${OT_QUARTER_LIMIT} h this quarter`].join(' · ').replace(/^./, (c) => c.toUpperCase())}
            </p>
          )}
          <div className="yx-tim-row">
            <Button size="sm" variant="approve" onClick={onReviewOvertime}>Approve overtime</Button>
            {/* Holiday or weekly-off work can be paid or credited as comp-off. */}
            {offDay && onCompOff && <Button size="sm" onClick={onCompOff}>Give comp-off</Button>}
            {onRejectOvertime && <Button size="sm" onClick={onRejectOvertime}>Reject</Button>}
          </div>
        </div>
      )}
    </div>
  );
}
