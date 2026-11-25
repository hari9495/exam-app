import { Prisma } from '@prisma/client';

/** What the candidate sees of an integrity decision on their attempt (PRC-27). */
export interface CandidateIntegrity {
  /** warning | section | attempt (a cleared incident is not shown). */
  verdict: 'warning' | 'section' | 'attempt';
  sectionTitle: string | null;
  /** The reviewer's reason ("Why"). */
  reason: string | null;
  decidedAt: string;
  appealUntil: string | null;
  canAppeal: boolean;
  appeal: { status: 'open' | 'upheld' | 'overturned'; sentAt: string; decidedAt: string | null; reason: string | null } | null;
  /** Answer 2262: what was recorded: the flagged moments and how many frames are kept (never the images). */
  evidence: { moments: { at: string; what: string }[]; cameraFrames: number; screenFrames: number };
}

/** Answer 2262: the stored camera frame (`snapshot`) and screen capture (`screenshot`) of a proctoring event. */
export function framesOf(metadataJson: string | null): { camera: string | null; screen: string | null } {
  try {
    const m = JSON.parse(metadataJson ?? '{}') as { snapshot?: unknown; screenshot?: unknown };
    const s = (v: unknown) => (typeof v === 'string' && v ? v : null);
    return { camera: s(m.snapshot), screen: s(m.screenshot) };
  } catch {
    return { camera: null, screen: null };
  }
}

/**
 * AS-5 (answers 2008, 2012): the candidate's result is held while its integrity incident is undecided and while an
 * appeal is open; an attempt invalidated (and not overturned on appeal) shows the decision, not a score. A verdict other
 * than "cleared" is shown with its appeal window.
 */
export async function integrityState(
  tx: Prisma.TransactionClient,
  attemptId: string,
  now = new Date(),
): Promise<{ held: boolean; invalidated: boolean; integrity: CandidateIntegrity | null }> {
  const inc = await tx.integrityIncident.findUnique({ where: { attemptId }, include: { appeal: true } });
  if (!inc) return { held: false, invalidated: false, integrity: null };
  if (inc.status !== 'decided') return { held: true, invalidated: false, integrity: null };
  if (inc.verdict === 'cleared') return { held: false, invalidated: false, integrity: null };
  const appeal = inc.appeal;
  const events = await tx.proctoringEvent.findMany({ where: { attemptId }, orderBy: { occurredAt: 'asc' }, select: { eventType: true, severity: true, occurredAt: true, metadataJson: true } });
  const frames = events.map((e) => framesOf(e.metadataJson));
  const integrity: CandidateIntegrity = {
    verdict: inc.verdict as CandidateIntegrity['verdict'],
    sectionTitle: inc.sectionTitle,
    reason: inc.reason,
    decidedAt: (inc.confirmedAt ?? inc.decidedAt)!.toISOString(),
    appealUntil: inc.appealClosesAt?.toISOString() ?? null,
    canAppeal: !appeal && inc.appealClosesAt !== null && inc.appealClosesAt > now,
    appeal: appeal
      ? { status: appeal.status as 'open' | 'upheld' | 'overturned', sentAt: appeal.createdAt.toISOString(), decidedAt: appeal.decidedAt?.toISOString() ?? null, reason: appeal.decidedAt ? appeal.reason : null }
      : null,
    evidence: {
      moments: events
        .filter((e) => e.severity === 'medium' || e.severity === 'high')
        .slice(0, 20)
        .map((e) => ({ at: e.occurredAt.toISOString(), what: e.eventType.replace(/_/g, ' ') })),
      cameraFrames: frames.filter((f) => f.camera).length,
      screenFrames: frames.filter((f) => f.screen).length,
    },
  };
  const overturned = appeal?.status === 'overturned';
  return { held: appeal?.status === 'open', invalidated: inc.verdict === 'attempt' && !overturned, integrity };
}
