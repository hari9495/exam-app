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
  };
  const overturned = appeal?.status === 'overturned';
  return { held: appeal?.status === 'open', invalidated: inc.verdict === 'attempt' && !overturned, integrity };
}
