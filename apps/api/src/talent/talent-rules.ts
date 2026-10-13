// Recruitment batch AT4 (M10-BUILD-DESIGN §7, §13): pure rules for merge and the retention sweep.

export const RENEWAL_LEAD_DAYS = 30;

export const addMonths = (d: Date, months: number) => {
  const x = new Date(d);
  x.setUTCMonth(x.getUTCMonth() + months);
  return x;
};

export interface RetentionFacts {
  lastActivityAt: Date;
  noticeAt: Date | null;
  onHold: boolean;
  hired: boolean;
  openProcess: boolean;
}

export type RetentionStep = 'anonymised' | 'renewal_sent' | 'skipped_hold' | 'skipped_hired' | 'skipped_open' | null;

/**
 * What the sweep does to one candidate today (rule YX-ATS-53). Nothing until 30 days before the end of the period
 * after the last activity; then one renewal email; at the end, anonymisation. A hold, a hire or an open process
 * always wins (they are reported, never acted on). A renewal is sent once per activity window, so a re-run on the
 * same day does nothing new.
 */
export function retentionStep(f: RetentionFacts, now: Date, months: number): RetentionStep {
  const end = addMonths(f.lastActivityAt, months);
  const noticeFrom = new Date(end.getTime() - RENEWAL_LEAD_DAYS * 86_400_000);
  if (now < noticeFrom) return null;
  if (f.onHold) return 'skipped_hold';
  if (f.hired) return 'skipped_hired';
  if (f.openProcess) return 'skipped_open';
  if (now >= end) return 'anonymised';
  return f.noticeAt && f.noticeAt >= f.lastActivityAt ? null : 'renewal_sent';
}

export type MergeField = 'name' | 'phone' | 'resume';
export type MergeChoice = 'kept' | 'merged';
export const MERGE_FIELDS: readonly MergeField[] = ['name', 'phone', 'resume'];

/** Why a candidate cannot be merged away, or null. */
export function mergeBlock(m: { erasedAt: Date | null; mergedIntoId: string | null; legalHoldAt: Date | null; acceptedOffer: boolean }): string | null {
  if (m.erasedAt) return 'This candidate was erased.';
  if (m.mergedIntoId) return 'This candidate was already merged.';
  if (m.legalHoldAt) return 'This candidate is under legal hold, so it cannot be merged away.';
  if (m.acceptedOffer) return 'This candidate accepted an offer, so it cannot be merged away. Keep this one instead.';
  return null;
}
