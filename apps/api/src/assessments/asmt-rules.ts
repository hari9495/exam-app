import { createHash } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { SETTINGS, resolveSetting } from '../org-structure/settings-registry';

// Assessments AS-2 (answers 2007, 2008; Settings 6.5): the company's test defaults and the rules built on them.

type Tx = Prisma.TransactionClient;

/** A company setting's value (company scope; the product default when not set). */
export async function companySetting(tx: Tx, org: string, key: string): Promise<string> {
  const def = SETTINGS[key];
  if (!def) throw new Error(`Unknown setting ${key}`);
  const rows = await tx.setting.findMany({ where: { organizationId: org, key } });
  return String(resolveSetting(def, rows.map((r) => ({ id: r.id, scopeType: r.scopeType, scopeId: r.scopeId, value: r.value, validFrom: r.validFrom ? r.validFrom.toISOString().slice(0, 10) : null })), { tenant: org }, null).value);
}

/* ------------------------------------------------------------------ proctoring modes (answer 2007) */

export const PROCTOR_MODES = ['open', 'ai', 'record'] as const;
export type ProctorMode = (typeof PROCTOR_MODES)[number];

/** The test's switches a mode is read from. */
export interface ProctorSwitches {
  enableAntiCheating: boolean;
  webcamProctoringEnabled: boolean;
  webcamAiAnalysisEnabled: boolean;
  screenCaptureEnabled: boolean;
}

/**
 * The named mode of a test's switches: Open (nothing watched), AI-only (camera with AI review, no screen recording) or
 * Record & review (camera with AI review and the screen recorded). Anything else was set switch by switch on the older
 * screen: 'custom', shown as is until someone picks a mode.
 */
export function modeOf(s: ProctorSwitches): ProctorMode | 'custom' {
  if (!s.enableAntiCheating) return 'open';
  if (!s.webcamProctoringEnabled || !s.webcamAiAnalysisEnabled) return 'custom';
  return s.screenCaptureEnabled ? 'record' : 'ai';
}

/** The switches a mode sets (the browser signals all watched again unless the mode is Open). */
export function presetOf(mode: ProctorMode): ProctorSwitches & { disabledProctoringSignals?: string[] } {
  if (mode === 'open') return { enableAntiCheating: false, webcamProctoringEnabled: false, webcamAiAnalysisEnabled: false, screenCaptureEnabled: false };
  return { enableAntiCheating: true, webcamProctoringEnabled: true, webcamAiAnalysisEnabled: true, screenCaptureEnabled: mode === 'record', disabledProctoringSignals: [] };
}

/** True when a new test's payload sets none of the proctoring switches itself (then the company default applies). */
export function namesNoSwitch(dto: Partial<Record<keyof ProctorSwitches | 'webcamRecordOnly' | 'lockdownRequired' | 'disabledProctoringSignals', unknown>>): boolean {
  return ['enableAntiCheating', 'webcamProctoringEnabled', 'webcamAiAnalysisEnabled', 'screenCaptureEnabled', 'webcamRecordOnly', 'lockdownRequired', 'disabledProctoringSignals'].every((k) => dto[k as keyof typeof dto] === undefined);
}

/* ------------------------------------------------------------------ retention (answer 2008) */

export const RETENTION_KEY = 'asmt.retention';
export const RETENTION_MIN_DAYS = 30;
export const RETENTION_MAX_DAYS = 365;

/** A company's retention in days from its setting value, kept inside 30 to 365 (a bad value falls back to 30). */
export function retentionDays(value: string | undefined | null): number {
  const n = Number(value);
  if (!Number.isInteger(n)) return RETENTION_MIN_DAYS;
  return Math.min(RETENTION_MAX_DAYS, Math.max(RETENTION_MIN_DAYS, n));
}

/** The moment before which evidence is past its company's retention. */
export const retentionCutoff = (now: Date, days: number) => new Date(now.getTime() - days * 24 * 60 * 60 * 1000);

/* ------------------------------------------------------------------ approver for big tests (asmt.high_stakes) */

export const HIGH_STAKES_KEY = 'asmt.high_stakes';

/** A test needs a second person's approval when more candidates than the company's number are expected. */
export const needsApproval = (expectedCandidates: number | null | undefined, threshold: number) => (expectedCandidates ?? 0) > threshold;

/**
 * A fingerprint of what candidates would get: the test's settings and its sections with their questions or pools. An
 * approval holds only while the test is unchanged; any change after it asks for approval again.
 */
export function testFingerprint(exam: {
  title: string;
  durationMinutes: number;
  passCriteriaPercent: number;
  expectedCandidates: number | null;
  switches: ProctorSwitches;
  sections: { title: string; weightPercent: number; selectionMode: string; poolSize: number | null; poolDifficulty: string | null; requiredCount: number | null; questionIds: string[]; tagIds: string[] }[];
}): string {
  const sections = [...exam.sections].map((s) => ({ ...s, questionIds: [...s.questionIds].sort(), tagIds: [...s.tagIds].sort() }));
  return createHash('sha256').update(JSON.stringify({ ...exam, sections })).digest('hex');
}

/**
 * Answer 2008 (legal hold), AS-5: evidence of an attempt is kept while its integrity incident is open, while a verdict
 * other than "cleared" may still be appealed, and while an appeal is open. A Prisma filter on rows that belong to an
 * attempt, used inside AND, written as what may go: no incident, or one decided whose appeal is decided or whose window
 * has closed. (AS-2's stand-in, a result held by hand, is not a legal hold: a bulk release lifted it.)
 */
export function notOnHold(now: Date) {
  return {
    attempt: {
      OR: [
        { integrityIncident: { is: null } },
        {
          integrityIncident: {
            is: {
              status: 'decided',
              OR: [
                // The appeal is decided; or there is none and the window has closed (or there never was one).
                { appeal: { is: { status: { not: 'open' } } } },
                { appeal: { is: null }, OR: [{ appealClosesAt: null }, { appealClosesAt: { lte: now } }] },
              ],
            },
          },
        },
      ],
    },
  };
}

/** Each company's retention in days (companies that never set it keep the default, 30). */
export async function retentionByCompany(tx: Tx): Promise<Map<string, number>> {
  const rows = await tx.setting.findMany({ where: { key: RETENTION_KEY, scopeType: 'tenant' }, select: { organizationId: true, value: true } });
  return new Map(rows.map((r) => [r.organizationId, retentionDays(String(r.value))]));
}

/** True when a row's moment is past its company's retention (unknown company: the shortest, 30 days). */
export function pastRetention(at: Date, org: string | null, days: Map<string, number>, now: Date): boolean {
  return at < retentionCutoff(now, (org && days.get(org)) || RETENTION_MIN_DAYS);
}
