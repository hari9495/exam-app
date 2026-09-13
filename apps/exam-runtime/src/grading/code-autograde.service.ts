import { forwardRef, Inject, Injectable, Logger } from '@nestjs/common';
import { TenantPrismaService, parseCodeTests, outputsMatch, scoreCodeTests, CodeTestOutcome } from '@exam-platform/shared';
import { PistonClient } from '../code-execution/piston-client';
import { PistonRuntimesService } from '../code-execution/piston-runtimes.service';
import { AttemptSettlementService } from './attempt-settlement.service';

// Auto-grades code answers that carry test cases, AFTER settlement (never inside the settlement
// transaction — running candidate code is a network call). Mirrors what a recruiter's manual grade
// does: write per-answer marks, then finalize the attempt once nothing is left ungraded. Questions
// WITHOUT test cases are untouched and still fall to the manual queue.
@Injectable()
export class CodeAutogradeService {
  private readonly logger = new Logger(CodeAutogradeService.name);
  private readonly superAdmin = { organizationId: null, isSuperAdmin: true };

  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly pistonClient: PistonClient,
    private readonly pistonRuntimes: PistonRuntimesService,
    @Inject(forwardRef(() => AttemptSettlementService)) private readonly settlement: AttemptSettlementService,
  ) {}

  async grade(attemptId: string): Promise<void> {
    const loaded = await this.tenantPrisma.forTenant(this.superAdmin, async (tx) => {
      const attempt = await tx.attempt.findUnique({ where: { id: attemptId } });
      if (!attempt || attempt.status !== 'pending_manual_grade') return null;
      const questionIds: string[] = JSON.parse(attempt.questionOrderJson);
      const questions = await tx.question.findMany({
        where: { id: { in: questionIds }, type: 'code' },
        select: { id: true, marks: true, codeTestsJson: true },
      });
      const answers = await tx.answer.findMany({
        where: { attemptId },
        select: { id: true, questionId: true, answerText: true, codeLanguage: true, marksAwarded: true },
      });
      return { questions, answers };
    });
    if (!loaded) return; // not awaiting grading (already finalized, or no code questions)

    const answerByQ = new Map(loaded.answers.map((a) => [a.questionId, a]));
    const targets = loaded.questions
      .map((q) => ({ q, tests: parseCodeTests(q.codeTestsJson), answer: answerByQ.get(q.id) }))
      .filter((t) => t.tests.length > 0 && t.answer?.answerText?.trim() && t.answer.marksAwarded === null);
    if (targets.length === 0) return; // nothing test-backed to auto-grade; leave the manual queue alone

    for (const { q, tests, answer } of targets) {
      const language = answer!.codeLanguage;
      if (!language) continue; // no language recorded -> can't run it; leave for manual
      const runtime = await this.pistonRuntimes.resolveLanguage(language).catch(() => null);
      if (!runtime) continue; // language no longer available -> manual fallback

      const outcomes: CodeTestOutcome[] = [];
      let runErrors = 0;
      for (const test of tests) {
        try {
          const res = await this.pistonClient.execute({ language, version: runtime.version, code: answer!.answerText as string, stdin: test.stdin });
          const passed = !res.timedOut && !res.compileError && res.exitCode === 0 && outputsMatch(res.stdout, test.expectedStdout);
          outcomes.push({ weight: test.weight, passed });
        } catch (error) {
          runErrors += 1;
          outcomes.push({ weight: test.weight, passed: false });
          this.logger.warn(`Piston run failed for attempt ${attemptId} q ${q.id}: ${(error as Error).message}`);
        }
      }
      // Every run errored -> almost certainly a systemic outage, not a bad submission. Leave the
      // answer ungraded so a recruiter grades it, rather than zeroing the candidate on our failure.
      if (runErrors === tests.length) continue;

      const score = scoreCodeTests(outcomes, q.marks);
      await this.tenantPrisma.forTenant(this.superAdmin, (tx) =>
        tx.answer.update({
          where: { id: answer!.id },
          data: {
            marksAwarded: score.marksAwarded,
            isCorrect: score.allPassed,
            gradingFeedback: `Auto-graded: passed ${score.passed} of ${score.total} test case(s).`,
          },
        }),
      );
    }

    // Finalize if nothing is left ungraded (reuses the manual-grade finalize path — same recompute +
    // status flip + integrity/insight re-run). It throws when manual-only code questions remain
    // ungraded; that's expected — swallow it and let the recruiter finish those.
    try {
      await this.tenantPrisma.forTenant(this.superAdmin, async (tx) => {
        const attempt = await tx.attempt.findUnique({ where: { id: attemptId }, include: { invitation: { include: { exam: true } } } });
        if (!attempt || attempt.status !== 'pending_manual_grade') return;
        await this.settlement.finalizeManualGrade(tx, attempt.invitation.exam, attempt);
      });
    } catch (error) {
      this.logger.debug?.(`Attempt ${attemptId} still has manually-graded code questions pending: ${(error as Error).message}`);
    }
  }
}
