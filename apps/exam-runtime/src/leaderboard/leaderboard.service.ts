import { Injectable } from '@nestjs/common';
import { TenantPrismaService, TenantContext } from '@exam-platform/shared';

export const AUTO_GRADABLE_QUESTION_TYPES = ['single_mcq', 'multi_mcq', 'true_false'];
const TOP_N = 30;

export interface LeaderboardEntry {
  attemptId: string;
  invitationId: string;
  candidateId: string;
  correctCount: number;
  rank: number;
}

export interface RecruiterLeaderboardRow {
  rank: number;
  candidateId: string;
  candidateName: string;
  correctCount: number;
}

export interface CandidateLeaderboardRow {
  rank: number;
  correctCount: number;
  label: string;
  isYou: boolean;
}

export interface CandidateLeaderboardResponse {
  you: { rank: number; correctCount: number } | null;
  top: CandidateLeaderboardRow[];
}

function isAnswerCorrect(correctOptionIds: string[], selectedOptionIds: string[]): boolean {
  const selectedSet = new Set(selectedOptionIds);
  const correctSet = new Set(correctOptionIds);
  return selectedSet.size === correctSet.size && [...selectedSet].every((id) => correctSet.has(id));
}

// The candidate leaderboard is polled by EVERY candidate for the whole exam.
// compute() loads every attempt WITH every answer and recomputes the full
// ranking, so without a cache 1000 candidates = ~33 full-exam recomputes/sec,
// each holding a pooled connection long enough to exhaust the pool and starve
// the exam's own poll/answer requests. A load test at 1000 reproduced exactly
// this. The ranking is identical for all viewers of an exam, so it is computed
// at most once per TTL and shared. See ADO #6828.
const LEADERBOARD_CACHE_TTL_MS = 15_000;

@Injectable()
export class LeaderboardService {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  // Keyed on examId (a globally-unique id owned by one org), so sharing a cached
  // result across viewers of the same exam never crosses a tenant boundary.
  private readonly entriesCache = new Map<string, { at: number; promise: Promise<LeaderboardEntry[]> }>();
  private readonly labelsCache = new Map<string, { at: number; promise: Promise<Map<string, string>> }>();

  // Single-flight TTL memo: concurrent callers within the TTL share ONE in-flight
  // promise (no thundering-herd recompute); a rejection is evicted so failures
  // aren't cached.
  private memo<T>(store: Map<string, { at: number; promise: Promise<T> }>, key: string, factory: () => Promise<T>): Promise<T> {
    const now = Date.now();
    const hit = store.get(key);
    if (hit && now - hit.at < LEADERBOARD_CACHE_TTL_MS) {
      return hit.promise;
    }
    const promise = factory();
    store.set(key, { at: now, promise });
    promise.catch(() => {
      if (store.get(key)?.promise === promise) store.delete(key);
    });
    return promise;
  }

  async compute(context: TenantContext, examId: string): Promise<LeaderboardEntry[]> {
    return this.memo(this.entriesCache, examId, () => this.computeUncached(context, examId));
  }

  private async computeUncached(context: TenantContext, examId: string): Promise<LeaderboardEntry[]> {
    return this.tenantPrisma.forTenant(context, async (tx) => {
      const attempts = await tx.attempt.findMany({ where: { examId }, include: { answers: true } });
      if (attempts.length === 0) {
        return [];
      }

      const allQuestionIds = new Set<string>();
      for (const attempt of attempts) {
        const ids: string[] = JSON.parse(attempt.questionOrderJson);
        ids.forEach((id) => allQuestionIds.add(id));
      }
      // Only auto-gradable questions are fetched — a question id from an attempt's snapshot
      // that isn't in this map (because it's a `code` question) is simply skipped below.
      const questions = await tx.question.findMany({
        where: { id: { in: [...allQuestionIds] }, type: { in: AUTO_GRADABLE_QUESTION_TYPES } },
        include: { options: true },
      });
      const questionsById = new Map(questions.map((question) => [question.id, question]));

      const unranked = attempts.map((attempt) => {
        const questionIds: string[] = JSON.parse(attempt.questionOrderJson);
        const answersByQuestionId = new Map(attempt.answers.map((answer) => [answer.questionId, answer]));
        let correctCount = 0;
        let latestCorrectAnsweredAt: Date | null = null;
        for (const questionId of questionIds) {
          const question = questionsById.get(questionId);
          if (!question) continue;
          const answer = answersByQuestionId.get(questionId);
          if (!answer) continue;
          const selectedOptionIds: string[] = JSON.parse(answer.selectedOptionIdsJson);
          const correctOptionIds = question.options.filter((option) => option.isCorrect).map((option) => option.id);
          if (isAnswerCorrect(correctOptionIds, selectedOptionIds)) {
            correctCount += 1;
            if (!latestCorrectAnsweredAt || answer.answeredAt > latestCorrectAnsweredAt) {
              latestCorrectAnsweredAt = answer.answeredAt;
            }
          }
        }
        return {
          attemptId: attempt.id,
          invitationId: attempt.invitationId,
          candidateId: attempt.candidateId,
          correctCount,
          tieBreakAt: latestCorrectAnsweredAt,
        };
      });

      unranked.sort((a, b) => {
        if (b.correctCount !== a.correctCount) return b.correctCount - a.correctCount;
        const aTime = a.tieBreakAt?.getTime() ?? Infinity;
        const bTime = b.tieBreakAt?.getTime() ?? Infinity;
        return aTime - bTime;
      });

      return unranked.map(({ tieBreakAt: _tieBreakAt, ...entry }, index) => ({ ...entry, rank: index + 1 }));
    });
  }

  async computeRecruiterView(context: TenantContext, examId: string): Promise<RecruiterLeaderboardRow[]> {
    const entries = await this.compute(context, examId);
    const top = entries.slice(0, TOP_N);
    if (top.length === 0) {
      return [];
    }
    return this.tenantPrisma.forTenant(context, async (tx) => {
      const candidates = await tx.candidate.findMany({ where: { id: { in: top.map((entry) => entry.candidateId) } } });
      const nameById = new Map(candidates.map((candidate) => [candidate.id, candidate.name]));
      return top.map((entry) => ({
        rank: entry.rank,
        candidateId: entry.candidateId,
        candidateName: nameById.get(entry.candidateId) ?? 'Unknown',
        correctCount: entry.correctCount,
      }));
    });
  }

  async computeCandidateView(
    context: TenantContext,
    examId: string,
    viewerInvitationId: string,
  ): Promise<CandidateLeaderboardResponse> {
    // Both the rankings and the label map are cached, so a warm poll does ZERO
    // database work and the per-viewer "you"/isYou filtering is pure in-memory.
    const [entries, labelByInvitationId] = await Promise.all([this.compute(context, examId), this.labelMap(context, examId)]);
    const you = entries.find((entry) => entry.invitationId === viewerInvitationId);
    const top = entries.slice(0, TOP_N);

    return {
      you: you ? { rank: you.rank, correctCount: you.correctCount } : null,
      top: top.map((entry) => ({
        rank: entry.rank,
        correctCount: entry.correctCount,
        isYou: entry.invitationId === viewerInvitationId,
        label: entry.invitationId === viewerInvitationId ? 'You' : (labelByInvitationId.get(entry.invitationId) ?? 'Candidate'),
      })),
    };
  }

  private labelMap(context: TenantContext, examId: string): Promise<Map<string, string>> {
    return this.memo(this.labelsCache, examId, () =>
      this.tenantPrisma.forTenant(context, async (tx) => {
        const invitations = await tx.invitation.findMany({ where: { examId }, orderBy: { invitedAt: 'asc' } });
        return new Map(invitations.map((invitation, index) => [invitation.id, `Candidate ${index + 1}`]));
      }),
    );
  }
}
