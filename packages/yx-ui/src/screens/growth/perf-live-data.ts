// Live data for the Performance designs (PRF-01 … 06): the API's shapes and how they become the designs' shapes.
// The screens draw exactly what the server worked out (progress, scores, bands); nothing is recalculated here.
import type { ActionItem } from '../../components/dashboard';
import type { CycleStage, GoalPeriod, GoalSummary, KeyResult as ApiKr, LoadState, ReviewSummary } from '../performance/live/types';
import type { Goal, GoalConfidence } from './growth-logic';

export type { LoadState };

/** A goal in a list or map: the summary with its key results and its last check-in (PRF-01 … 03). */
export interface GoalItem extends GoalSummary {
  keyResults: ApiKr[];
  confidence: 'on_track' | 'at_risk' | 'off_track' | null;
  lastCheckIn: string | null;
  /** On the map: the team's department, or the owner's current one. */
  departmentId?: string | null;
}

export const CONFIDENCE: Record<'on_track' | 'at_risk' | 'off_track', GoalConfidence> = { on_track: 'On track', at_risk: 'At risk', off_track: 'Off track' };
const STATUS: Record<GoalSummary['status'], Goal['status']> = { draft: 'Draft', submitted: 'Pending approval', active: 'Approved', done: 'Closed', dropped: 'Closed' };
export const day = (iso: string) => new Date(`${iso.slice(0, 10)}T00:00:00`);

/** The design's goal from the API's: names, statuses and the server's progress as they are. */
export function toGoal(g: GoalItem, period = ''): Goal {
  return {
    id: g.id,
    title: g.title,
    type: g.kind,
    owner: { type: g.ownerType, name: g.owner },
    parentId: g.parentGoalId ?? undefined,
    weight: g.weight,
    period,
    status: STATUS[g.status],
    keyResults: g.keyResults.map((k) => ({ id: k.id, title: k.title, start: k.start, target: k.target, actual: k.current, unit: k.unit ?? '', direction: k.direction === 'down' ? 'decrease' : 'increase', progress: k.progress })),
    confidence: g.confidence ? CONFIDENCE[g.confidence] : undefined,
    lastCheckIn: g.lastCheckIn ? day(g.lastCheckIn) : undefined,
    progress: g.progress,
  };
}

/** GET /performance/home (PRF-01). */
export interface PerfHome {
  persona: 'emp' | 'mgr' | 'hr';
  name: string;
  period: { id: string; name: string; fromOn: string; toOn: string } | null;
  actions: { id: string; type: string; title: string; who: string; due: string | null; href: string; actionLabel?: string }[];
  myGoals: GoalItem[];
  myReview: { id: string; cycle: string; status: ReviewSummary['status']; stage: string; next: ReviewSummary['next']; employee: string; manager: string; stages: CycleStage[] } | null;
  feedback: { id: string; from: string; text: string; at: string; kind: 'praise' | 'suggestion' }[];
  nextOneOnOne: { id: string; with: string; on: string; agenda: number } | null;
  team: { id: string; name: string; role: string; goalProgress: number | null; reviewStage: string; reviewId: string | null; lastOneOnOne: string | null; lastFeedback: string | null }[];
  teamGoals: GoalItem[];
  hr: {
    cycles: { id: string; name: string; status: string; stage: string; eligible: number; done: number; overdue: number }[];
    ratingDistribution: { cycle: string; bands: string[]; rows: { dept: string; counts: number[]; size: number }[] } | null;
    pipsActive: number | null;
    goalsAligned: number | null;
  } | null;
}

export const toActions = (h: PerfHome): ActionItem[] => h.actions.map((a) => ({ id: a.id, type: a.type, title: a.title, who: a.who, due: a.due ? day(a.due) : undefined, kind: 'review', href: a.href, actionLabel: a.actionLabel }));

export type { GoalPeriod };
