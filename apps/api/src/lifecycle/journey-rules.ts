// LIFE-1.04 journey maths (M01 §3.5, YX-LC-02 / YX-LC-13): pure functions, no Nest or Prisma.
//   - a task is due on anchor + offset days (negative = before the joining day, fixes U49);
//   - a task waits until every task it depends on is done or skipped;
//   - moving the anchor moves every open or waiting task by the same days; done work never moves;
//   - progress = required tasks finished / required tasks.

export type TaskStatus = 'waiting' | 'open' | 'done' | 'skipped' | 'cancelled';
export interface TaskLike {
  key: string;
  dueOffsetDays: number;
  dependsOn: string[];
  required: boolean;
  status: TaskStatus;
}

const DAY = 86_400_000;

export function addDays(iso: string, n: number): string {
  return new Date(new Date(`${iso}T00:00:00Z`).getTime() + n * DAY).toISOString().slice(0, 10);
}

export function daysBetween(from: string, to: string): number {
  return Math.round((new Date(`${to}T00:00:00Z`).getTime() - new Date(`${from}T00:00:00Z`).getTime()) / DAY);
}

export const dueOn = (anchor: string, offset: number) => addDays(anchor, offset);

const finished = (s: TaskStatus) => s === 'done' || s === 'skipped';

/** The status each unfinished task should have now: open when all its dependencies are finished, else waiting. */
export function openable<T extends TaskLike>(tasks: readonly T[]): Map<string, TaskStatus> {
  const byKey = new Map(tasks.map((t) => [t.key, t]));
  const out = new Map<string, TaskStatus>();
  for (const t of tasks) {
    if (t.status !== 'waiting' && t.status !== 'open') continue;
    const ready = t.dependsOn.every((k) => {
      const d = byKey.get(k);
      return !d || finished(d.status);
    });
    out.set(t.key, ready ? 'open' : 'waiting');
  }
  return out;
}

export function progress(tasks: readonly TaskLike[]): number {
  const req = tasks.filter((t) => t.required && t.status !== 'cancelled');
  if (!req.length) return 100;
  return Math.floor((100 * req.filter((t) => finished(t.status)).length) / req.length);
}

/** Template checks: unique keys, dependencies on earlier tasks only (so no cycles), offsets in range. */
export function checkTemplateTasks(tasks: readonly { key: string; dependsOn: string[]; dueOffsetDays: number }[]): string | null {
  if (!tasks.length) return 'A checklist needs at least one task.';
  if (tasks.length > 80) return 'A checklist can have at most 80 tasks.';
  const seen = new Set<string>();
  for (const t of tasks) {
    if (!/^[a-z][a-z0-9_]{0,39}$/.test(t.key)) return `Task key "${t.key}" must be lower-case letters, digits and _.`;
    if (seen.has(t.key)) return `Two tasks use the key "${t.key}".`;
    for (const d of t.dependsOn) if (!seen.has(d)) return `"${t.key}" can only wait for a task listed above it (not "${d}").`;
    if (!Number.isInteger(t.dueOffsetDays) || t.dueOffsetDays < -90 || t.dueOffsetDays > 180) return `"${t.key}" must be due between 90 days before and 180 days after the day.`;
    seen.add(t.key);
  }
  return null;
}

// ------------------------------------------------------------------------------------------ 6f content steps (§5.7)

const httpsUrl = (u: unknown): string | null => {
  if (typeof u !== 'string' || !u.trim()) return null;
  try {
    const x = new URL(u.trim());
    return x.protocol === 'https:' && u.trim().length <= 500 ? x.toString() : null;
  } catch {
    return null;
  }
};

/** The stored config of a read / watch / survey step, or the problem in plain words. */
export function contentConfig(kind: 'read' | 'watch' | 'survey', cfg: Record<string, unknown>): { config: Record<string, unknown> } | { problem: string } {
  if (kind === 'read') {
    const text = typeof cfg.text === 'string' ? cfg.text.trim() : '';
    const url = httpsUrl(cfg.url);
    if (cfg.url && !url) return { problem: 'needs a link that starts with https://' };
    if (!text && !url) return { problem: 'needs the text to read or a link to it' };
    if (text.length > 4000) return { problem: 'can have at most 4,000 characters of text' };
    return { config: { ...(text ? { text } : {}), ...(url ? { url } : {}) } };
  }
  if (kind === 'watch') {
    const url = httpsUrl(cfg.url);
    if (!url) return { problem: 'needs a link to the video that starts with https://' };
    const minutes = cfg.minutes === undefined || cfg.minutes === null ? null : Number(cfg.minutes);
    if (minutes !== null && !(Number.isInteger(minutes) && minutes >= 1 && minutes <= 180)) return { problem: 'must last between 1 and 180 minutes' };
    return { config: { url, ...(minutes ? { minutes } : {}) } };
  }
  const qs = Array.isArray(cfg.questions) ? cfg.questions.map((q) => (typeof q === 'string' ? q.trim() : '')).filter(Boolean) : [];
  if (!qs.length || qs.length > 5) return { problem: 'needs 1 to 5 statements to rate' };
  if (qs.some((q) => q.length > 200)) return { problem: 'can have at most 200 characters per statement' };
  return { config: { questions: qs } };
}

/** A quick-survey answer: one rating 1–5 per statement and an optional comment. */
export function surveyAnswers(questions: readonly string[], a: Record<string, unknown>): { ratings: number[]; comment?: string } | null {
  const r = a.ratings;
  if (!Array.isArray(r) || r.length !== questions.length || !r.every((x) => Number.isInteger(x) && x >= 1 && x <= 5)) return null;
  const comment = typeof a.comment === 'string' ? a.comment.trim().slice(0, 500) : '';
  return { ratings: r as number[], ...(comment ? { comment } : {}) };
}

/** "Your first 30 days" (§7.6): the person's own open steps by when they fall. */
export function firstThirtyBuckets<T extends { dueOn: string }>(tasks: readonly T[], today: string, joinedOn: string) {
  const week = addDays(today, 7);
  const end = addDays(joinedOn, 30);
  return {
    today: tasks.filter((t) => t.dueOn <= today),
    week: tasks.filter((t) => t.dueOn > today && t.dueOn <= week),
    month: tasks.filter((t) => t.dueOn > week && t.dueOn <= end),
  };
}
