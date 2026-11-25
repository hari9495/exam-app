// TIM-32 field-force map on real data: the API's shapes, and how they become the designed screen's rows, visits and map
// drawing (FieldForceScreen in field.tsx renders both the story sample and this).
import type { LoadState } from './live/types';
import type { MapFence, MapPin } from './time-kit';
import { fmt12 } from './time-logic';
import { formatDate } from '../../lib/format';

export type VisitStatus = 'Done' | 'On site' | 'Upcoming' | 'Missed';
export interface FieldVisit { id: string; person: string; place: string; time: string; status: VisitStatus; planned: boolean; detail: string; flagged?: true }
/**
 * `audit`: on duty for a one-off audit, not a sales beat (left out of Beat coverage). `trackingOff`: no trail today (TEAM).
 * Live only: `withdrawnOn` (withdrawn before today), `noConsent` (never agreed), `offMap` (no current position),
 * `flag.kind` (what was flagged).
 */
export interface FieldPerson {
  id: string; name: string; beat: string; audit?: true; reportsTo: string; inAt?: string; km: number | null; shiftStart: string;
  withdrawnAt?: string; withdrawnOn?: string; noConsent?: true; trackingOff?: string; flag?: { at: string; kind?: 'mock' | 'speed' };
  reviewedBy?: string; offMap?: true; x: number; y: number;
}

// ---------------------------------------------------------------- what the API sends (GET /time/field, /time/field/people/:id)

export interface FieldPoint { lat: number; lng: number }
export interface FieldMapPerson {
  id: string; name: string; code: string | null; beat: string; reportsTo: string; today: string;
  /** "HH:MM", the person's local time; null on a weekly off. */
  shiftStart: string | null; inAt: string | null; onDuty: boolean; tracking: boolean;
  consent: 'given' | 'withdrawn' | 'none'; withdrawnAt: string | null; km: number | null;
  last: (FieldPoint & { at: string; accuracyM: number }) | null;
  flag: { at: string; kinds: string[]; count: number } | null;
  reviewed: { at: string; by: string | null } | null;
}
export interface FieldMapVisit {
  id: string; employeeId: string; on: string; place: string; site: (FieldPoint & { radiusM: number }) | null; plannedMinute: number | null; planned: boolean;
  status: 'upcoming' | 'on_site' | 'done' | 'missed'; checkInAt: string | null; checkOutAt: string | null; point: FieldPoint | null;
  inside: boolean | null; distanceM: number | null; outcome: string | null; note: string | null; flags: string[];
}
export interface FieldFence extends FieldPoint { id: string; name: string; radiusM: number }
export interface FieldMap { today: string; scope: 'team' | 'granted'; trackingOff: boolean; retentionDays: number; fences: FieldFence[]; people: FieldMapPerson[]; visits: FieldMapVisit[] }
export interface FieldPersonDay { person: FieldMapPerson; visits: FieldMapVisit[]; trail: (FieldPoint & { at: string; accuracyM: number; flags: string[] })[]; fences: FieldFence[] }

/** The field-force page's data and handlers: the manager's team or HR's scope; the API checks every read again. */
export interface LiveFieldForce {
  state: LoadState;
  onRetry?: () => void;
  data: FieldMap | null;
  /** The person whose drawer is open, and their day (trail and visits) once loaded. */
  openId: string | null;
  onOpen: (employeeId: string | null) => void;
  person: { state: LoadState; data: FieldPersonDay | null };
  onReview: (employeeId: string) => Promise<unknown>;
  /** Where HR turns field tracking on (Settings › Company rules). */
  settingsHref: string;
}

// ---------------------------------------------------------------- mapping

/** "HH:MM" of an instant in India time (the API sends instants; the people are on IST locations today). */
const clock = (iso: string) => new Date(new Date(iso).getTime() + 330 * 60_000).toISOString().slice(11, 16);
const STATUS: Record<FieldMapVisit['status'], VisitStatus> = { upcoming: 'Upcoming', on_site: 'On site', done: 'Done', missed: 'Missed' };
const minuteText = (m: number) => fmt12(`${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`);
const metres = (m: number) => (m < 1000 ? `${m} m` : `${(m / 1000).toFixed(1)} km`);

export function visitRow(x: FieldMapVisit, flagOpen: boolean): FieldVisit {
  const time = x.checkInAt ? `${fmt12(clock(x.checkInAt))}${x.checkOutAt ? ` – ${fmt12(clock(x.checkOutAt))}` : ''}` : x.plannedMinute !== null ? minuteText(x.plannedMinute) : '';
  const mock = x.flags.includes('mock');
  const detail = [
    x.inside === true ? 'Inside site' : x.inside === false ? 'Outside site' : x.checkInAt ? 'Field check-in' : '',
    x.distanceM !== null && x.checkInAt ? metres(x.distanceM) : '',
    mock ? 'Mock location at check-in' : '',
    x.outcome ?? '',
    !x.checkInAt ? (x.note ?? '') : '',
  ].filter(Boolean).join(' · ');
  return { id: x.id, person: x.employeeId, place: x.place, time, status: STATUS[x.status], planned: x.planned, detail, ...(mock && flagOpen ? { flagged: true as const } : {}) };
}

export function personRow(p: FieldMapPerson, at?: { x: number; y: number }): FieldPerson {
  const withdrawnToday = p.withdrawnAt && p.withdrawnAt.slice(0, 10) >= p.today;
  return {
    id: p.id,
    name: p.name,
    beat: p.beat,
    reportsTo: p.reportsTo,
    ...(p.inAt ? { inAt: p.inAt } : {}),
    km: p.km,
    shiftStart: p.shiftStart ?? '',
    ...(p.consent === 'withdrawn' && p.withdrawnAt ? (withdrawnToday ? { withdrawnAt: clock(p.withdrawnAt) } : { withdrawnOn: formatDate(new Date(p.withdrawnAt)) }) : {}),
    ...(p.consent === 'none' ? { noConsent: true as const } : {}),
    ...(!p.tracking ? { trackingOff: 'turned off for this group' } : {}),
    ...(p.flag ? { flag: { at: clock(p.flag.at), kind: p.flag.kinds.includes('mock') ? ('mock' as const) : ('speed' as const) } } : {}),
    ...(p.reviewed ? { reviewedBy: p.reviewed.by ?? 'a manager' } : {}),
    ...(at ? at : { offMap: true as const, x: 0, y: 0 }),
  };
}

/** Lat/lng into the map's 320 × 200 drawing: the points fill it with a margin, north up, same scale both ways. */
export function projector(points: FieldPoint[]): { at: (p: FieldPoint) => { x: number; y: number }; units: (m: number) => number } {
  if (!points.length) return { at: () => ({ x: 160, y: 100 }), units: () => 10 };
  const k = Math.cos((points[0].lat * Math.PI) / 180);
  const xs = points.map((p) => p.lng * k);
  const ys = points.map((p) => p.lat);
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  // Degrees of latitude per drawing unit; at least ~1 km across so one point does not fill the map.
  const span = Math.max((x1 - x0) / 260, (y1 - y0) / 140, 0.01 / 260);
  const cx = (x0 + x1) / 2;
  const cy = (y0 + y1) / 2;
  return { at: (p) => ({ x: Math.round(160 + (p.lng * k - cx) / span), y: Math.round(100 - (p.lat - cy) / span) }), units: (m) => Math.max(6, Math.round(m / 111_195 / span)) };
}

export function fenceDrawing(fences: FieldFence[], at: (p: FieldPoint) => { x: number; y: number }, units: (m: number) => number): MapFence[] {
  return fences.map((f) => ({ id: f.id, label: f.name, ...at(f), r: units(f.radiusM) }));
}

/** The team map: everyone with a current position, and the offices. */
export function teamDrawing(d: FieldMap) {
  const pr = projector([...d.people.flatMap((p) => (p.last ? [p.last] : [])), ...d.fences]);
  return { rows: d.people.map((p) => personRow(p, p.last ? pr.at(p.last) : undefined)), fences: fenceDrawing(d.fences, pr.at, pr.units) };
}

/** One person's day: the duty trail (good readings only), the visits checked in, the office. */
export function trailDrawing(d: FieldPersonDay): { fences: MapFence[]; pins: MapPin[]; trail: [number, number][] } {
  const good = d.trail.filter((p) => !p.flags.some((f) => f === 'accuracy' || f === 'speed' || f === 'mock'));
  const visits = d.visits.filter((x) => x.point);
  const pr = projector([...good, ...visits.map((x) => x.point!), ...d.fences]);
  return {
    fences: fenceDrawing(d.fences, pr.at, pr.units),
    pins: visits.map((x) => ({ id: x.id, label: x.place.split(',')[0], ...pr.at(x.point!), kind: 'visit' as const, tone: x.flags.includes('mock') ? ('warn' as const) : undefined })),
    trail: good.map((p) => { const q = pr.at(p); return [q.x, q.y] as [number, number]; }),
  };
}
